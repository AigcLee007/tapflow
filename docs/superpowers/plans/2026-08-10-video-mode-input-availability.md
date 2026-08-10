# Video Mode Input Availability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让视频节点根据统一媒体输入和当前模型能力严格判定五种生成模式，提供不可用原因、稳定的自动切换、单图/双图首尾帧语义，并在 API 和 AI Gateway 层拒绝非法请求。

**Architecture:** 前端新增纯函数 `videoModeAvailability.ts`，以统一输入投影和 route capabilities 为输入，返回每种模式的输入可用性、模型可用性、原因和推荐模式。`videoReferenceRules.ts` 负责把模式结果投射到持久化参考角色，`VideoNodeComposer` 负责自动切换和一次性提示，`VideoModeMenu` 只渲染判定结果。服务端继续以 `packages/ai-gateway-core` 的视频生成合约为权威校验，API 在计费预留和入队前失败关闭。

**Tech Stack:** React 19, TypeScript, `@xyflow/react`, Vitest, Testing Library, Vite, AI Gateway Core, Fastify API, Worker runtime, Playwright smoke scripts.

---

## 范围与文件地图

**新增文件：**

- `src/flowCanvas/video/videoModeAvailability.ts`：统计去重输入，计算输入矩阵、模型约束、原因码和推荐模式。
- `src/flowCanvas/video/videoModeAvailability.test.ts`：覆盖模式矩阵、文本无关性、模型交集和回退顺序。

**修改文件：**

- `src/flowCanvas/video/videoTypes.ts`
- `src/flowCanvas/video/videoReferenceRules.ts`
- `src/flowCanvas/video/videoReferenceRules.test.ts`
- `src/flowCanvas/video/videoGenerationCapabilities.ts`
- `src/flowCanvas/video/videoGenerationCapabilities.test.ts`
- `src/flowCanvas/video/videoUiCopy.ts`
- `src/flowCanvas/video/VideoModeMenu.tsx`
- `src/flowCanvas/video/VideoModeMenu.test.tsx`
- `src/flowCanvas/video/VideoNodeComposer.tsx`
- `src/flowCanvas/video/VideoNodeComposer.test.tsx`
- `src/flowCanvas/nodes/FlowNodes.tsx`
- `src/flowCanvas/nodes/FlowNodes.agent-metadata.test.tsx`
- `src/flowCanvas/inputs/NodeInputTray.test.tsx`
- `packages/ai-gateway-core/src/video-generation-contract.ts`
- `packages/ai-gateway-core/src/plugins/manifests/pixelhub-video.ts`
- `packages/ai-gateway-core/test/video-generation-contract.test.ts`
- `packages/ai-gateway-core/test/plugin-registry.test.ts`
- `packages/ai-gateway-core/test/pixelhub-video-adapter.test.ts`
- `apps/api/test/workflow-pricing-resolver.test.ts`
- `apps/worker/test/worker.test.ts`
- `scripts/smoke-video-node.ts`
- `scripts/smoke-video-node.test.ts`
- `PROJECT_RECORD.md`

**明确不修改：**

- 不增加数据库 migration、API route、环境变量或生产依赖。
- 不更改 route key、价格、CredentialVault 或计费 reserve/settle/refund 顺序。
- 不写入预览 URL、Blob、File、base64 或临时提示状态到 flow draft。
- 不修改用户已有改动 `src/flowCanvas/flowCanvas.css`；样式使用共享菜单 token 和组件内 utility class。

## Task 1：建立纯模式可用性判定器

**Files:**

- Create: `src/flowCanvas/video/videoModeAvailability.ts`
- Create: `src/flowCanvas/video/videoModeAvailability.test.ts`
- Modify: `src/flowCanvas/video/videoTypes.ts`

- [ ] **Step 1: 增加公共判定类型**

在 `videoTypes.ts` 增加：

```ts
export type VideoModeInputCounts = { text: number; image: number; video: number; audio: number };

export type VideoModeAvailabilityReason =
  | "MEDIA_INPUT_CONNECTED"
  | "IMAGE_COUNT_MUST_EQUAL_ONE"
  | "IMAGE_COUNT_MUST_BE_ONE_OR_TWO"
  | "IMAGE_INPUT_REQUIRED"
  | "MEDIA_INPUT_REQUIRED"
  | "VIDEO_OR_AUDIO_REQUIRES_ALL_REFERENCE"
  | "MODEL_UNSUPPORTED"
  | "MODEL_CONSTRAINT_UNMET";

export type VideoModeAvailabilityItem = {
  enabled: boolean;
  inputAllowed: boolean;
  modelSupported: boolean;
  reason: VideoModeAvailabilityReason | null;
};

export type VideoModeAvailabilityResult = {
  counts: VideoModeInputCounts;
  incompatible: boolean;
  modes: Record<VideoGenerationMode, VideoModeAvailabilityItem>;
  recommendedMode: VideoGenerationMode;
};
```

- [ ] **Step 2: 编写完整输入矩阵的失败测试**

创建 `videoModeAvailability.test.ts`：

```ts
import { describe, expect, test } from "vitest";
import { mergeVideoCapabilities } from "./videoGenerationCapabilities";
import { evaluateVideoModeAvailability, resolveAvailableVideoMode } from "./videoModeAvailability";

const input = (kind: "text" | "image" | "video" | "audio", id: string) => ({ inputKey: `${kind}:${id}`, kind });
const capabilities = mergeVideoCapabilities({
  confirmedByRoute: true,
  maxAudios: 3,
  maxImages: 9,
  maxTotal: 12,
  maxVideos: 3,
  supportedModes: ["text_to_video", "image_to_video", "first_last_frame", "image_reference", "all_reference"],
});
const enabled = (result: ReturnType<typeof evaluateVideoModeAvailability>) =>
  Object.entries(result.modes).filter(([, state]) => state.enabled).map(([mode]) => mode).sort();

describe("video mode availability", () => {
  test.each([
    [[], ["text_to_video"], "text_to_video"],
    [[input("text", "t1")], ["text_to_video"], "text_to_video"],
    [[input("image", "i1")], ["all_reference", "first_last_frame", "image_reference", "image_to_video"], "image_to_video"],
    [[input("image", "i1"), input("image", "i2")], ["all_reference", "first_last_frame", "image_reference"], "image_reference"],
    [[input("image", "i1"), input("image", "i2"), input("image", "i3")], ["all_reference", "image_reference"], "image_reference"],
    [[input("video", "v1")], ["all_reference"], "all_reference"],
    [[input("image", "i1"), input("audio", "a1")], ["all_reference"], "all_reference"],
  ])("maps topology %#", (items, expectedModes, expectedRecommended) => {
    const result = evaluateVideoModeAvailability({ capabilities, items });
    expect(enabled(result)).toEqual([...expectedModes].sort());
    expect(result.recommendedMode).toBe(expectedRecommended);
  });

  test("deduplicates stable keys and ignores text count", () => {
    const result = evaluateVideoModeAvailability({
      capabilities,
      items: [input("text", "t1"), input("text", "t2"), input("image", "i1"), input("image", "i1")],
    });
    expect(result.counts).toEqual({ text: 2, image: 1, video: 0, audio: 0 });
    expect(result.recommendedMode).toBe("image_to_video");
  });

  test("preserves a valid manual mode and uses image reference for two-image fallback", () => {
    const result = evaluateVideoModeAvailability({ capabilities, items: [input("image", "i1"), input("image", "i2")] });
    expect(resolveAvailableVideoMode("all_reference", result)).toEqual({ incompatible: false, mode: "all_reference", switched: false });
    expect(resolveAvailableVideoMode("image_to_video", result)).toEqual({ incompatible: false, mode: "image_reference", switched: true });
  });
});
```

- [ ] **Step 3: 运行测试确认红灯**

Run: `npx vitest --run src/flowCanvas/video/videoModeAvailability.test.ts`

Expected: FAIL，因为模块尚不存在。

- [ ] **Step 4: 实现拓扑、模型交集和回退**

创建 `videoModeAvailability.ts`，实现以下公共契约；模型约束必须检查 min/max images、videos、audios、maxTotal、`requiresVideoOrAudio` 和 `requiresVisualWithAudio`：

```ts
type ModeInput = { inputKey: string; kind: "text" | "image" | "video" | "audio" };

export function countVideoModeInputs(items: ModeInput[]): VideoModeInputCounts;

export function evaluateVideoModeAvailability(input: {
  capabilities: VideoGenerationCapabilities;
  items: ModeInput[];
}): VideoModeAvailabilityResult;

export function resolveAvailableVideoMode(
  currentMode: VideoGenerationMode,
  result: VideoModeAvailabilityResult,
): { incompatible: boolean; mode: VideoGenerationMode; switched: boolean };
```

拓扑分支必须按以下代码实现：

```ts
function inputReason(mode: VideoGenerationMode, counts: VideoModeInputCounts): VideoModeAvailabilityReason | null {
  const mixedReference = counts.video + counts.audio > 0;
  const mediaTotal = counts.image + counts.video + counts.audio;
  if (mixedReference && mode !== "all_reference") return "VIDEO_OR_AUDIO_REQUIRES_ALL_REFERENCE";
  if (mode === "text_to_video") return mediaTotal === 0 ? null : "MEDIA_INPUT_CONNECTED";
  if (mode === "all_reference") return mediaTotal > 0 ? null : "MEDIA_INPUT_REQUIRED";
  if (mode === "image_to_video") return counts.image === 1 ? null : "IMAGE_COUNT_MUST_EQUAL_ONE";
  if (mode === "first_last_frame") return counts.image >= 1 && counts.image <= 2 ? null : "IMAGE_COUNT_MUST_BE_ONE_OR_TWO";
  return counts.image > 0 ? null : "IMAGE_INPUT_REQUIRED";
}

function recommendedMode(counts: VideoModeInputCounts): VideoGenerationMode {
  if (counts.video + counts.audio > 0) return "all_reference";
  if (counts.image === 0) return "text_to_video";
  if (counts.image === 1) return "image_to_video";
  return "image_reference";
}
```

先保留仍然 `enabled` 的当前模式；失效后依次尝试推荐模式、图片参考、首尾帧、全能参考、图生视频、文生视频。如果没有模型支持的候选项，返回输入推荐模式并设置 `incompatible: true`。

- [ ] **Step 5: 运行测试确认绿灯**

Run: `npx vitest --run src/flowCanvas/video/videoModeAvailability.test.ts`

Expected: PASS，完整矩阵、去重、文本无关性和两图默认图片参考通过。

- [ ] **Step 6: 提交判定器**

```bash
git add src/flowCanvas/video/videoTypes.ts src/flowCanvas/video/videoModeAvailability.ts src/flowCanvas/video/videoModeAvailability.test.ts
git commit -m "feat: evaluate video mode input availability"
```

## Task 2：统一自动模式和参考角色规则

**Files:**

- Modify: `src/flowCanvas/video/videoReferenceRules.ts`
- Modify: `src/flowCanvas/video/videoReferenceRules.test.ts`
- Modify: `src/flowCanvas/video/videoGenerationCapabilities.ts`
- Modify: `src/flowCanvas/video/videoGenerationCapabilities.test.ts`

- [ ] **Step 1: 添加模式迁移和首尾帧角色失败测试**

先在 `videoReferenceRules.test.ts` 增加：

```ts
const allModesCapabilities = mergeVideoCapabilities({
  confirmedByRoute: true,
  maxAudios: 3,
  maxImages: 9,
  maxTotal: 12,
  maxVideos: 3,
  modeConstraints: {
    first_last_frame: { maxImages: 2, maxTotal: 2, minImages: 1 },
  },
  supportedModes: ["text_to_video", "image_to_video", "first_last_frame", "image_reference", "all_reference"],
});
```

```ts
test("defaults two images to image reference and preserves manual first-last", () => {
  const images = [reference("image", 0), reference("image", 1)];
  expect(resolveAutomaticVideoMode(allModesCapabilities, images, "image_to_video").mode).toBe("image_reference");
  expect(resolveAutomaticVideoMode(allModesCapabilities, images, "first_last_frame").mode).toBe("first_last_frame");
});

test("normalizes one image as first frame and two images as ordered frames", () => {
  expect(normalizeReferenceRolesForMode([reference("image", 0)], "first_last_frame", "ordered_first_last_frames"))
    .toEqual([expect.objectContaining({ order: 0, role: "first_frame" })]);
  expect(normalizeReferenceRolesForMode([reference("image", 1), reference("image", 0)], "first_last_frame", "ordered_first_last_frames"))
    .toEqual([
      expect.objectContaining({ order: 0, role: "first_frame" }),
      expect.objectContaining({ order: 1, role: "last_frame" }),
    ]);
});
```

在 `videoGenerationCapabilities.test.ts` 增加断言：

```ts
const unsupported = mergeVideoCapabilities({ confirmedByRoute: true, supportedModes: ["text_to_video"] });
const allReference = { ...createDefaultVideoGenerationParams(), mode: "all_reference" as const };
expect(correctVideoGenerationParams(allReference, unsupported).params.mode).toBe("all_reference");
```

- [ ] **Step 2: 运行测试确认红灯**

Run: `npx vitest --run src/flowCanvas/video/videoReferenceRules.test.ts src/flowCanvas/video/videoGenerationCapabilities.test.ts`

Expected: FAIL；现有逻辑将两图 Veo切为首尾帧、要求首尾帧必须两张，并按模型列表改写模式。

- [ ] **Step 3: 让自动模式复用纯判定器**

```ts
export function resolveAutomaticVideoMode(capabilities, references, currentMode): ModeResolution {
  const availability = evaluateVideoModeAvailability({
    capabilities,
    items: references.map((reference) => ({
      inputKey: `${reference.source.kind}:${reference.source.id}`,
      kind: reference.mediaKind,
    })),
  });
  const selection = resolveAvailableVideoMode(currentMode, availability);
  return result(selection.mode, selection.incompatible, references, capabilities);
}
```

- [ ] **Step 4: 允许首尾帧一张或两张图片**

将前端角色校验替换为：

```ts
const firstFrames = images.filter((reference) => reference.role === "first_frame");
const lastFrames = images.filter((reference) => reference.role === "last_frame");
const validSingle = images.length === 1 && firstFrames.length === 1 && lastFrames.length === 0;
const validPair = images.length === 2
  && firstFrames.length === 1
  && lastFrames.length === 1
  && firstFrames[0]!.order < lastFrames[0]!.order;
if (!validSingle && !validPair) addMissingInputIssue(issues);
```

- [ ] **Step 5: 停止 capability 修正器静默替换模式**

删除：

```ts
if (!capabilities.supportedModes.includes(next.mode)) replace("mode", capabilities.supportedModes[0] ?? "text_to_video");
```

比例、清晰度、时长、音频和数量修正保持不变。

- [ ] **Step 6: 运行测试并提交**

Run: `npx vitest --run src/flowCanvas/video/videoReferenceRules.test.ts src/flowCanvas/video/videoGenerationCapabilities.test.ts`

Expected: PASS。

```bash
git add src/flowCanvas/video/videoReferenceRules.ts src/flowCanvas/video/videoReferenceRules.test.ts src/flowCanvas/video/videoGenerationCapabilities.ts src/flowCanvas/video/videoGenerationCapabilities.test.ts
git commit -m "feat: normalize video mode transitions and frame roles"
```

## Task 3：同步 AI Gateway 首尾帧合约和模型清单

**Files:**

- Modify: `packages/ai-gateway-core/src/video-generation-contract.ts`
- Modify: `packages/ai-gateway-core/src/plugins/manifests/pixelhub-video.ts`
- Modify: `packages/ai-gateway-core/test/video-generation-contract.test.ts`
- Modify: `packages/ai-gateway-core/test/plugin-registry.test.ts`
- Modify: `packages/ai-gateway-core/test/pixelhub-video-adapter.test.ts`

- [ ] **Step 1: 编写单首帧、双帧和三帧服务端测试**

在 `video-generation-contract.test.ts` 的 Veo capability 中把 `first_last_frame.minImages` 改为 `1`，增加：

```ts
const startOnly = request({
  inputAssets: [asset("image", "first_frame", 0)],
  params: { ...request().params!, mode: "first_last_frame" },
});
expect(validateVideoGenerationRequest(startOnly, veo)).toEqual([]);

const threeFrames = request({
  inputAssets: [
    asset("image", "first_frame", 0),
    asset("image", "last_frame", 1),
    asset("image", "last_frame", 2),
  ],
  params: { ...request().params!, mode: "first_last_frame" },
});
expect(validateVideoGenerationRequest(threeFrames, veo).map((issue) => issue.code))
  .toContain("VIDEO_MODE_INPUT_REQUIRED");
```

在 `pixelhub-video-adapter.test.ts` 复用已有 `request`、`media` 和 `veoContext`，增加：

```ts
test("maps one Veo first frame without inventing a last frame", async () => {
  const fetchImplementation = vi.fn().mockResolvedValue(new Response(
    JSON.stringify({ task_id: "task-veo-single", status: "queued" }),
    { status: 200 },
  ));
  await new PixelHubVideoAdapter({ fetchImplementation }).generateVideo(veoContext(), {
    ...request,
    params: { ...request.params!, mode: "first_last_frame" },
    inputAssets: [media("image", "first_frame", 0)],
  });
  expect(JSON.parse(String(fetchImplementation.mock.calls[0]?.[1]?.body)).image_urls)
    .toEqual(["https://signed.test/image-0"]);
});
```

- [ ] **Step 2: 运行 AI Gateway 测试确认红灯**

Run:

```bash
npm run test --workspace @aigc-flow/ai-gateway-core -- test/video-generation-contract.test.ts test/pixelhub-video-adapter.test.ts test/plugin-registry.test.ts
```

Expected: FAIL；现有合约和 manifest 要求首尾帧至少两张图片。

- [ ] **Step 3: 修改服务端首尾帧校验**

```ts
if (params.mode === "first_last_frame" && capabilities.referenceSemantics === "ordered_first_last_frames") {
  const images = references.filter((reference) => reference.mediaKind === "image");
  const firstFrames = images.filter((reference) => reference.role === "first_frame");
  const lastFrames = images.filter((reference) => reference.role === "last_frame");
  const validSingle = images.length === 1 && firstFrames.length === 1 && lastFrames.length === 0;
  const validPair = images.length === 2
    && firstFrames.length === 1
    && lastFrames.length === 1
    && firstFrames[0]!.order < lastFrames[0]!.order;
  if (!validSingle && !validPair) {
    issues.push(issue(
      "VIDEO_MODE_INPUT_REQUIRED",
      "inputAssets",
      "First/last-frame mode requires one first frame or an ordered first/last pair.",
    ));
  }
}
```

- [ ] **Step 4: 更新 PixelHub Veo capability**

在 `pixelhub-video.ts` 使用：

```ts
first_last_frame: {
  maxAudios: 0,
  maxImages: 2,
  maxTotal: 2,
  maxVideos: 0,
  minImages: 1,
}
```

同步 `plugin-registry.test.ts` 的发布能力断言；不修改稳定 route key、模型名、价格或 credential binding。

- [ ] **Step 5: 运行 AI Gateway 测试和构建**

```bash
npm run test --workspace @aigc-flow/ai-gateway-core -- test/video-generation-contract.test.ts test/pixelhub-video-adapter.test.ts test/plugin-registry.test.ts
npm run build --workspace @aigc-flow/ai-gateway-core
```

Expected: 两条命令均退出 0，单首帧、双帧顺序、三帧拒绝和 manifest 校验通过。

- [ ] **Step 6: 提交网关合约**

```bash
git add packages/ai-gateway-core/src/video-generation-contract.ts packages/ai-gateway-core/src/plugins/manifests/pixelhub-video.ts packages/ai-gateway-core/test/video-generation-contract.test.ts packages/ai-gateway-core/test/plugin-registry.test.ts packages/ai-gateway-core/test/pixelhub-video-adapter.test.ts
git commit -m "feat: support optional last frame in video contract"
```

## Task 4：实现带原因 Tooltip 的模式菜单

**Files:**

- Modify: `src/flowCanvas/video/videoUiCopy.ts`
- Modify: `src/flowCanvas/video/VideoModeMenu.tsx`
- Modify: `src/flowCanvas/video/VideoModeMenu.test.tsx`

- [ ] **Step 1: 编写禁用原因和可访问交互测试**

在测试文件顶部补充一个只用于测试的 `availabilityFixture`，它必须复用生产判定器而不是复制输入矩阵：

测试文件同时导入 `VideoModeInputCounts`、`evaluateVideoModeAvailability`、`mergeVideoCapabilities` 以及已有的 `VideoModeMenu` 测试依赖。

```ts
const availabilityFixture = (counts: Partial<VideoModeInputCounts> = {}) => {
  const defaults = { text: 0, image: 0, video: 0, audio: 0 };
  const items = (Object.entries({ ...defaults, ...counts }) as Array<["text" | "image" | "video" | "audio", number]>).flatMap(([kind, count]) =>
    Array.from({ length: count }, (_, index) => ({ inputKey: `${kind}:${index}`, kind })),
  );
  return evaluateVideoModeAvailability({
    capabilities: mergeVideoCapabilities({
      confirmedByRoute: true,
      maxAudios: 3,
      maxImages: 9,
      maxTotal: 12,
      maxVideos: 3,
      supportedModes: ["text_to_video", "image_to_video", "first_last_frame", "image_reference", "all_reference"],
    }),
    items,
  });
};
```

```tsx
test("keeps all modes visible and explains an input-disabled mode", () => {
  const onChange = vi.fn();
  render(<VideoModeMenu availability={availabilityFixture({ image: 2 })} onChange={onChange} value="image_reference" />);
  fireEvent.click(screen.getByRole("button", { name: VIDEO_UI_COPY.mode }));
  expect(screen.getAllByRole("menuitemradio")).toHaveLength(5);
  const imageToVideo = screen.getByRole("menuitemradio", { name: /图生视频/ });
  expect(imageToVideo).toHaveAttribute("aria-disabled", "true");
  fireEvent.mouseEnter(imageToVideo);
  expect(screen.getByRole("tooltip").textContent)
    .toBe("当前图片数量为 2 个，图生视频需要 1 个");
  fireEvent.click(imageToVideo);
  expect(onChange).not.toHaveBeenCalled();
});

test("uses 38px shared rows and exposes tooltip on keyboard focus", () => {
  render(<VideoModeMenu availability={availabilityFixture({ image: 3 })} onChange={vi.fn()} value="image_reference" />);
  fireEvent.click(screen.getByRole("button", { name: VIDEO_UI_COPY.mode }));
  const firstLast = screen.getByRole("menuitemradio", { name: /首尾帧/ });
  expect(firstLast.className).toContain("h-[38px]");
  fireEvent.focus(firstLast);
  expect(screen.getByRole("tooltip")).toBeTruthy();
});
```

- [ ] **Step 2: 运行菜单测试确认红灯**

Run: `npx vitest --run src/flowCanvas/video/VideoModeMenu.test.tsx`

Expected: FAIL；现有菜单使用原生 `disabled`、48px 行和 `title`。

- [ ] **Step 3: 增加禁用原因文案格式化函数**

```ts
export function getVideoModeUnavailableMessage(
  reason: VideoModeAvailabilityReason,
  counts: VideoModeInputCounts,
): string {
  if (reason === "MEDIA_INPUT_CONNECTED") return "已连接媒体输入，无法使用纯文生视频";
  if (reason === "IMAGE_COUNT_MUST_EQUAL_ONE") return `当前图片数量为 ${counts.image} 个，图生视频需要 1 个`;
  if (reason === "IMAGE_COUNT_MUST_BE_ONE_OR_TWO") return `当前图片数量为 ${counts.image} 个，首尾帧需要 1～2 个`;
  if (reason === "IMAGE_INPUT_REQUIRED") return "图片参考模式至少需要 1 张图片";
  if (reason === "MEDIA_INPUT_REQUIRED") return "全能参考模式至少需要 1 个媒体输入";
  if (reason === "VIDEO_OR_AUDIO_REQUIRES_ALL_REFERENCE") return "已连接视频或音频，请使用全能参考";
  if (reason === "MODEL_CONSTRAINT_UNMET") return "当前输入不满足所选模型的该模式要求";
  return "当前模型不支持该生成模式";
}
```

- [ ] **Step 4: 使用共享菜单密度和 `aria-disabled`**

`VideoModeMenu` 改为接收 `availability: VideoModeAvailabilityResult`。模式行不使用原生 `disabled`，而是：

```tsx
<div
  aria-checked={selectedOption}
  aria-describedby={reason && activeReasonMode === option.value ? tooltipId : undefined}
  aria-disabled={!state.enabled}
  className={`${MENU_ITEM_CLASS} h-[38px] ${selectedOption ? "bg-white/[0.14]" : ""} ${state.enabled ? "" : "cursor-not-allowed opacity-35"}`.trim()}
  onClick={() => { if (state.enabled) { onChange(option.value); layer.closeLayer(); } }}
  onFocus={() => { if (reason) setActiveReasonMode(option.value); }}
  onMouseEnter={() => { if (reason) setActiveReasonMode(option.value); }}
  onMouseLeave={() => setActiveReasonMode(null)}
  role="menuitemradio"
  tabIndex={0}
>
  <span className="flex h-[30px] w-[30px] items-center justify-center rounded-[9px] bg-white/[0.06]"><ModeIcon aria-hidden size={17} /></span>
  <span className={MENU_ITEM_PRIMARY_CLASS}>{option.label}</span>
</div>
```

当 `activeReasonMode` 存在时，在菜单右侧渲染 `role="tooltip"` 的紧凑 `MenuSurface`，并使用高于节点工具栏的 z-index。Escape 关闭 Tooltip 和菜单，外部点击继续由 `useDismissibleLayer` 处理。

- [ ] **Step 5: 运行菜单与本地化测试**

Run: `npx vitest --run src/flowCanvas/video/VideoModeMenu.test.tsx src/flowCanvas/video/videoCreatorLocalization.test.tsx`

Expected: PASS；五项始终显示，禁用项可悬浮/聚焦但不可选择，38px 密度和中文文案通过。

- [ ] **Step 6: 提交菜单交互**

```bash
git add src/flowCanvas/video/videoUiCopy.ts src/flowCanvas/video/VideoModeMenu.tsx src/flowCanvas/video/VideoModeMenu.test.tsx
git commit -m "feat: explain unavailable video modes"
```

## Task 5：接入 Composer 自动切换和统一角色投影

**Files:**

- Modify: `src/flowCanvas/video/VideoNodeComposer.tsx`
- Modify: `src/flowCanvas/video/VideoNodeComposer.test.tsx`
- Modify: `src/flowCanvas/nodes/FlowNodes.tsx`
- Modify: `src/flowCanvas/nodes/FlowNodes.agent-metadata.test.tsx`
- Modify: `src/flowCanvas/inputs/NodeInputTray.test.tsx`

- [ ] **Step 1: 编写自动切换和单次提示测试**

在现有 `VideoNodeComposer.test.tsx` 的 `usableVideoOption`、`usableVideoCatalog` 工具函数后增加：

同时从 `videoTypes.ts` 引入 `VideoGenerationMode`。

```tsx
const input = (kind: "text" | "image" | "video" | "audio", id: string) => ({
  inputKey: `${kind}:${id}`,
  kind,
  order: 0,
  group: kind,
  kindIndex: 1,
  mentionLabel: kind === "text" ? "" : `${kind}1`,
  previewState: "ready" as const,
  source: "upstream" as const,
  sourceNodeId: id,
  title: id,
});
const catalogWithAllModes = () => usableVideoCatalog([usableVideoOption({
  capabilities: mergeVideoCapabilities({
    confirmedByRoute: true,
    maxAudios: 3,
    maxImages: 9,
    maxTotal: 12,
    maxVideos: 3,
    supportedModes: ["text_to_video", "image_to_video", "first_last_frame", "image_reference", "all_reference"],
  }),
})]);
const videoData = ({ mode }: { mode: VideoGenerationMode }) => ({
  generationPrompt: "generate a short video",
  params: { videoGeneration: { ...createDefaultVideoGenerationParams(), mode } },
});
```

在 `VideoNodeComposer.test.tsx` 增加表驱动用例：

```tsx
test.each([
  [[], "all_reference", "text_to_video", "已切换为文生视频"],
  [[input("image", "i1")], "text_to_video", "image_to_video", "已切换为图生视频"],
  [[input("image", "i1"), input("image", "i2")], "image_to_video", "image_reference", "已切换为图片参考"],
  [[input("image", "i1"), input("image", "i2"), input("image", "i3")], "first_last_frame", "image_reference", "已切换为图片参考"],
  [[input("video", "v1")], "image_reference", "all_reference", "已切换为全能参考"],
])("auto-switches invalid mode %#", async (inputItems, mode, expectedMode, notice) => {
  const onUpdate = vi.fn();
  render(<VideoNodeComposer
    catalog={catalogWithAllModes()}
    data={videoData({ mode })}
    generating={false}
    inputItems={inputItems}
    nodeId="video-1"
    onGenerate={vi.fn()}
    onUpdate={onUpdate}
    selected
  />);
  await waitFor(() => expect(onUpdate).toHaveBeenCalledWith(expect.objectContaining({
    params: expect.objectContaining({ videoGeneration: expect.objectContaining({ mode: expectedMode }) }),
  })));
  expect(screen.getByRole("status").textContent).toContain(notice);
});
```

再增加“当前模式仍可用不切换”和“相同输入签名不重复提示”用例。

- [ ] **Step 2: 编写模型不兼容和首尾帧标签集成测试**

在现有 `createVideoCatalogModel`、`createVideoNodeData`、`StoreBackedVideoNode` fixture 后增加，并通过 store 的 `addNode` 和 `onConnect` 建立真实上游关系：

```tsx
test("keeps model when video input requires unsupported all-reference", async () => {
  const model = createVideoCatalogModel({ id: "text-only", modelKey: "text-only", capabilities: {
    ...createVideoCatalogModel().capabilities,
    supportedModes: ["text_to_video"],
  }});
  videoCatalogMocks.current = { error: null, loading: false, models: [model], retry: vi.fn() };
  const source = useFlowCanvasStore.getState().addNode("video", { x: 0, y: 0 }, { assetId: "asset-video", kind: "video", title: "Source" });
  const target = useFlowCanvasStore.getState().addNode("video", { x: 320, y: 0 }, createVideoNodeData({ modelId: model.id, params: { videoGeneration: { ...createDefaultVideoGenerationParams(), mode: "text_to_video" } } }) as any, { selected: true });
  useFlowCanvasStore.getState().onConnect({ source: source.id, sourceHandle: "out", target: target.id, targetHandle: "in" });
  render(<StoreBackedVideoNode nodeId={target.id} />);
  await waitFor(() => expect((useFlowCanvasStore.getState().nodes.find((node) => node.id === target.id)?.data.params as any)?.videoGeneration?.mode).toBe("all_reference"));
  expect(useFlowCanvasStore.getState().nodes.find((node) => node.id === target.id)?.data.modelId).toBe(model.id);
});

test("shows first and last frame roles for two ordered images", () => {
  const first = useFlowCanvasStore.getState().addNode("image", { x: 0, y: 0 }, { assetId: "asset-first", kind: "image", title: "First" });
  const second = useFlowCanvasStore.getState().addNode("image", { x: 0, y: 240 }, { assetId: "asset-second", kind: "image", title: "Second" });
  const target = useFlowCanvasStore.getState().addNode("video", { x: 320, y: 0 }, createVideoNodeData({ params: { videoGeneration: { ...createDefaultVideoGenerationParams(), mode: "first_last_frame" } } }) as any, { selected: true });
  useFlowCanvasStore.getState().onConnect({ source: first.id, sourceHandle: "out", target: target.id, targetHandle: "in" });
  useFlowCanvasStore.getState().onConnect({ source: second.id, sourceHandle: "out", target: target.id, targetHandle: "in" });
  render(<StoreBackedVideoNode nodeId={target.id} />);
  expect(screen.getByLabelText(/输入角色：首帧/)).toBeTruthy();
  expect(screen.getByLabelText(/输入角色：尾帧/)).toBeTruthy();
});
```

- [ ] **Step 3: 运行集成测试确认红灯**

Run:

```bash
npx vitest --run src/flowCanvas/video/VideoNodeComposer.test.tsx src/flowCanvas/nodes/FlowNodes.agent-metadata.test.tsx src/flowCanvas/inputs/NodeInputTray.test.tsx
```

Expected: FAIL；Composer 尚未计算输入可用性，FlowNodes 也没有把当前角色覆盖到统一输入投影。

- [ ] **Step 4: 在 Composer 中计算模式状态**

从 `videoUiCopy.ts` 或同一 video UI 文案模块导出自动切换提示函数，避免在 Composer 内散落文案：

```ts
export function getVideoModeSwitchMessage(
  counts: VideoModeInputCounts,
  mode: VideoGenerationMode,
): string {
  const labels: Record<VideoGenerationMode, string> = {
    text_to_video: "文生视频",
    image_to_video: "图生视频",
    first_last_frame: "首尾帧",
    image_reference: "图片参考",
    all_reference: "全能参考",
  };
  if (counts.video + counts.audio > 0) return `检测到视频或音频输入，已切换为${labels[mode]}`;
  if (counts.image > 0) return `检测到 ${counts.image} 张图片，已切换为${labels[mode]}`;
  return `已切换为${labels[mode]}`;
}
```

函数参数保留 `mode` 以便未来扩展为其他自动切换目标；当前实现应使用实际切换后的模式生成文案，并由测试覆盖视频/音频、1/2/3+ 张图片及无媒体输入五种路径。

```ts
const effectiveCapabilities = capabilities ?? createSafeDefaultVideoCapabilities();
const modeAvailability = useMemo(() => evaluateVideoModeAvailability({
  capabilities: effectiveCapabilities,
  items: inputItems ?? [],
}), [effectiveCapabilities, inputItems]);
const modeSelection = useMemo(
  () => resolveAvailableVideoMode(params.mode, modeAvailability),
  [modeAvailability, params.mode],
);
const [modeSwitchNotice, setModeSwitchNotice] = useState<string | null>(null);
const appliedModeSwitchRef = useRef<string | null>(null);
```

增加 effect：签名由 `inputKey + kind + oldMode + newMode` 组成；只有 `modeSelection.switched` 且签名变化时调用 `onUpdate`。提示只保存在 React state，不写入节点数据。

```ts
const nextReferences = normalizeReferenceRolesForMode(
  params.referenceInputs,
  modeSelection.mode,
  effectiveCapabilities.referenceSemantics,
);
onUpdate({
  params: {
    ...(data.params ?? {}),
    videoGeneration: { ...params, mode: modeSelection.mode, referenceInputs: nextReferences },
  },
});
setModeSwitchNotice(getVideoModeSwitchMessage(modeAvailability.counts, modeSelection.mode));
```

手动切换使用同一个角色规范化：

```ts
const handleModeChange = (mode: VideoGenerationMode) => setParams({
  ...params,
  mode,
  referenceInputs: normalizeReferenceRolesForMode(
    params.referenceInputs,
    mode,
    effectiveCapabilities.referenceSemantics,
  ),
});
```

菜单调用改为：

```tsx
<VideoModeMenu availability={modeAvailability} disabled={generating} onChange={handleModeChange} value={params.mode} />
```

输入托盘下方显示：

```tsx
{modeSwitchNotice ? <div className="mt-2 text-xs font-bold text-cyan-200" role="status">{modeSwitchNotice}</div> : null}
```

- [ ] **Step 5: 让 FlowNodes 投影使用当前参考角色**

构建 `videoInputItems` 前创建角色映射：

```ts
const roleByInputKey = new Map(videoParams.referenceInputs.map((reference) => [
  `${reference.source.kind}:${reference.source.id}`,
  reference.role,
]));
const seeds: CanvasInputSeed[] = [
  ...upstreamInputRefs.map((item) => ({
    ...item,
    role: roleByInputKey.get(item.inputKey) ?? item.role,
  })),
  ...videoParams.referenceInputs.flatMap((reference) => reference.source.kind === "asset" ? [{
    assetId: reference.source.id,
    inputKey: `asset:${reference.source.id}`,
    kind: reference.mediaKind,
    previewState: "loading" as const,
    role: reference.role,
    source: "asset" as const,
    title: reference.mediaKind === "image" ? "参考图片" : reference.mediaKind === "video" ? "参考视频" : "参考音频",
  }] : []),
];
```

删除或重排输入后调用 `normalizeReferenceRolesForMode`；单图必须成为首帧，双图顺序交换后首尾角色必须交换。

- [ ] **Step 6: 运行集成测试并提交**

```bash
npx vitest --run src/flowCanvas/video/VideoNodeComposer.test.tsx src/flowCanvas/nodes/FlowNodes.agent-metadata.test.tsx src/flowCanvas/inputs/NodeInputTray.test.tsx
git add src/flowCanvas/video/VideoNodeComposer.tsx src/flowCanvas/video/VideoNodeComposer.test.tsx src/flowCanvas/nodes/FlowNodes.tsx src/flowCanvas/nodes/FlowNodes.agent-metadata.test.tsx src/flowCanvas/inputs/NodeInputTray.test.tsx
git commit -m "feat: auto-select video modes from canvas inputs"
```

Expected: 测试退出 0；自动切换、两图默认图片参考、单次提示、保留模型和首尾帧标签通过。

## Task 6：在 API 和 Worker 层失败关闭

**Files:**

- Modify: `apps/api/test/workflow-pricing-resolver.test.ts`
- Modify: `apps/worker/test/worker.test.ts`

- [ ] **Step 1: 增加 API 422 校验测试**

在现有 `workflow-pricing-resolver.test.ts` 增加以下本地 helper，复用已经存在的 `pixelHubCapabilitiesFor`：

```ts
const referenceInput = (mediaKind: "image" | "video" | "audio", role: string, order: number) => ({
  mediaKind,
  order,
  referenceKey: `${mediaKind}-${order}`,
  role,
  source: { kind: "asset", id: `${mediaKind}-${order}` },
});
const videoNode = (mode: string, referenceInputs: unknown[]) => ({
  config: {
    generationPrompt: "test video",
    params: {
      videoGeneration: {
        schemaVersion: 2,
        mode,
        aspectRatio: "16:9",
        resolution: "720P",
        durationSeconds: 4,
        generateAudio: true,
        count: 1,
        referenceInputs,
      },
    },
  },
  id: `video-${mode}`,
  type: "video.generate" as const,
});
const routeContextFor = (modelKey: string) => ({
  capabilities: pixelHubCapabilitiesFor(modelKey),
  modelKey,
  providerKey: "pixelhub",
  routeKey: `video.pixelhub.${modelKey}`,
});
```

```ts
test.each([
  ["text_to_video", "gemini-omni-flash", [referenceInput("image", "reference_image", 0)]],
  ["image_to_video", "gemini-omni-flash", [referenceInput("image", "main_image", 0), referenceInput("image", "main_image", 1)]],
  ["first_last_frame", "veo31-fast", [referenceInput("image", "first_frame", 0), referenceInput("image", "last_frame", 1), referenceInput("image", "last_frame", 2)]],
])("rejects invalid video topology before enqueue: %s", (mode, modelKey, referenceInputs) => {
  expect(() => assertNodeRouteSupportsRuntimeRequest({
    node: videoNode(mode, referenceInputs),
    routeContext: routeContextFor(modelKey),
  })).toThrowError(expect.objectContaining({ statusCode: 422 }));
});
```

测试应保留现有服务调用顺序断言：`assertNodeRouteSupportsRuntimeRequest` 在 workflow/run 插入和 billing reserve 逻辑之前执行；本单元用例只验证该校验函数返回 422。

- [ ] **Step 2: 增加 Worker 角色顺序回归**

Worker 测试通过现有 `__workerTestUtils.buildVideoRequest`，不要引入新的 `buildVideoRequestForTest` helper：

```ts
test("preserves single first frame and ordered first-last pair", () => {
  const buildVideoRequest = (__workerTestUtils as {
    buildVideoRequest: (upstream: ReadonlyMap<string, Record<string, unknown> | null>, config: Record<string, unknown>) => { inputAssets?: Array<Record<string, unknown>> };
  }).buildVideoRequest;
  const config = (referenceInputs: unknown[]) => ({
    params: { videoGeneration: {
      schemaVersion: 2, mode: "first_last_frame", aspectRatio: "16:9", resolution: "720P",
      durationSeconds: 4, generateAudio: true, count: 1, referenceInputs,
    } },
  });
  const one = buildVideoRequest(new Map(), config([{ referenceKey: "first", source: { kind: "asset", id: "image-0" }, mediaKind: "image", role: "first_frame", order: 0 }]));
  const two = buildVideoRequest(new Map(), config([
    { referenceKey: "first", source: { kind: "asset", id: "image-0" }, mediaKind: "image", role: "first_frame", order: 0 },
    { referenceKey: "last", source: { kind: "asset", id: "image-1" }, mediaKind: "image", role: "last_frame", order: 1 },
  ]));
  expect(one.inputAssets?.map((asset) => asset.metadata?.videoReference)).toEqual([
    expect.objectContaining({ order: 0, role: "first_frame" }),
  ]);
  expect(two.inputAssets?.map((asset) => asset.metadata?.videoReference)).toEqual([
    expect.objectContaining({ order: 0, role: "first_frame" }),
    expect.objectContaining({ order: 1, role: "last_frame" }),
  ]);
});
```

- [ ] **Step 3: 运行服务端测试**

```bash
npm run test --workspace @aigc-flow/api -- workflow-pricing-resolver.test.ts
npm run test --workspace @aigc-flow/worker -- worker.test.ts
```

Expected: PASS；API 在 reserve/enqueue 前拒绝非法组合，Worker 保留合法角色和顺序。

- [ ] **Step 4: 仅在测试暴露缺口时补生产代码**

如果 AI Gateway 合约已让 API 测试通过，不修改 API/Worker 生产文件。如果 Worker 可以构建非法请求，则在现有 route capability 路径调用 `validateVideoGenerationRequest`，不得复制前端文案或增加第三套模式矩阵。

- [ ] **Step 5: 提交服务端回归**

```bash
git add apps/api/test/workflow-pricing-resolver.test.ts apps/worker/test/worker.test.ts
git diff --cached --name-only
git commit -m "test: reject invalid video mode inputs server-side"
```

如果实际修改了 `workflow-runs.service.ts` 或 `service.ts`，才把对应生产文件加入暂存区。

## Task 7：真实画布验收、完整验证和项目记录

**Files:**

- Modify: `scripts/smoke-video-node.ts`
- Modify: `scripts/smoke-video-node.test.ts`
- Modify: `PROJECT_RECORD.md`

- [ ] **Step 1: 扩展 smoke 输出契约测试**

```ts
for (const field of [
  "modeAvailabilityNoMedia",
  "modeAvailabilityOneImage",
  "modeAvailabilityTwoImages",
  "modeAvailabilityThreeImages",
  "modeAvailabilityVideoOrAudio",
  "disabledModeTooltipVisible",
  "twoImagesDefaultToImageReference",
  "singleFrameRoleVisible",
  "orderedFrameRolesVisible",
]) expect(source).toContain(field);
```

- [ ] **Step 2: 运行 smoke 契约测试确认红灯**

Run: `npm run test:smoke-video-node`

Expected: FAIL，因为真实浏览器脚本尚未输出新字段。

- [ ] **Step 3: 扩展真实 XYFlow 浏览器场景**

`scripts/smoke-video-node.ts` 必须按顺序验证：

```txt
1. 无媒体：仅文生视频可选。
2. 一张图片：自动图生视频，另外三种参考模式可选。
3. 两张图片：自动图片参考；手动首尾帧后显示首帧/尾帧。
4. 删除尾帧：剩余图片显示首帧，首尾帧仍可用。
5. 三张图片：首尾帧禁用，Tooltip 显示需要 1～2 个。
6. 视频或音频：仅全能参考可用。
7. 当前模型不支持全能参考：模型不变，生成被阻止。
```

桌面使用 `1440x900`，移动端使用 `390x844`；检查 Tooltip 不越出视口、不遮挡模式行。

- [ ] **Step 4: 运行完整相关测试**

```bash
npx vitest --run src/flowCanvas/video/videoModeAvailability.test.ts src/flowCanvas/video/videoReferenceRules.test.ts src/flowCanvas/video/videoGenerationCapabilities.test.ts src/flowCanvas/video/VideoModeMenu.test.tsx src/flowCanvas/video/VideoNodeComposer.test.tsx src/flowCanvas/nodes/FlowNodes.agent-metadata.test.tsx src/flowCanvas/inputs/NodeInputTray.test.tsx
npm run test --workspace @aigc-flow/ai-gateway-core
npm run test --workspace @aigc-flow/api -- workflow-pricing-resolver.test.ts
npm run test --workspace @aigc-flow/worker -- worker.test.ts
npm run test:smoke-video-node
```

Expected: 所有命令退出 0；基础设施缺失导致的 skip 不得描述为端到端通过。

- [ ] **Step 5: 运行构建**

```bash
npm run build --workspace @aigc-flow/ai-gateway-core
npm run build --workspace @aigc-flow/api
npm run build --workspace @aigc-flow/worker
npm run build
```

Expected: 四条命令均退出 0。现有 Vite/Browserslist 警告可记录，新增 TypeScript 或构建错误必须修复。

- [ ] **Step 6: 运行真实浏览器 smoke**

按 `docs/v2-local-development.md` 启动本地 API、Worker 和前端后运行：

```bash
npm run smoke:video-node
```

Expected: JSON `status` 为 `ok`，九个新增布尔字段全部为 `true`。产物不得包含签名 URL、Authorization header 或 provider credential。

- [ ] **Step 7: 更新项目记录并提交**

在 `PROJECT_RECORD.md` 顶部增加 `2026-08-10 - Video Mode Input Availability`，只记录实际完成的代码、通过命令、浏览器结果和已知限制。

```bash
git add scripts/smoke-video-node.ts scripts/smoke-video-node.test.ts PROJECT_RECORD.md
git commit -m "test: verify video mode input availability"
```

- [ ] **Step 8: 最终范围检查**

```bash
git status --short
git diff HEAD~7..HEAD --stat
```

Expected: 仅本计划列出的相关文件被提交；`src/flowCanvas/flowCanvas.css` 和其他用户未跟踪文件保持原样。
