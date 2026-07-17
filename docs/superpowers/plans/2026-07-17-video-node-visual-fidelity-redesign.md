# 视频节点视觉还原重做 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 TapFlow 视频节点重做为全中文、接近已确认 DramaClaw/LibTV 参考层级的创作工作台；运镜库使用已取得商业授权的 DramaClaw 原始 MP4。代码与自动化验收在本地收尾，真实视觉截图由部署服务器完成最终验收。

**Architecture:** 保留现有 `params.videoGeneration`、模型目录、草稿持久化和 fail-closed 生成边界，仅重构 `src/flowCanvas/video` 的文案与视觉组件。参数与调色盘使用可测试的图形控件，运镜继续沿用 23 个稳定 ID，并由版本 2 manifest 引用随构建发布的授权 MP4；Playwright 使用独立视口上下文输出六类验收截图。

**Tech Stack:** React 19、TypeScript、Tailwind CSS、Lucide、`@xyflow/react`、Vitest、Testing Library、Vite 静态资源、Playwright CLI、现有 MenuSurface/useDismissibleLayer。

---

## 2026-07-17 基线修订（当前有效）

本节优先于后续同名旧步骤。用户已确认 DramaClaw 23 个运镜 MP4 可用于本产品的商业发布，因此不再执行本计划中任何本地图片/视频生成、FFmpeg 编码或 `imagegen` 步骤。

已完成并经提交验证的范围：

- Task 1 的中文化、乱码修复与模型/参考素材展示清理。
- Task 2-4 的视觉 token、图形化比例与分段参数控件、语义调色盘。
- 部分 Task 6-8 的运镜库、主工作台布局、浮层互斥和窄屏修复。

本轮新增完成的媒体迁移：

- `public/video-camera-library/v2/` 包含 23 个授权 DramaClaw MP4，文件与 `output/reference/dramaclaw/frontend/public/video/camera-presets/` 的 SHA-256 一致。
- manifest 升级到版本 2，仅接受 `v2/<stable-id>.mp4`、`h264` 和 `DramaClaw commercial license` 来源标记。
- 已移除 `assets:video-camera` 与 `test:video-camera-assets` 命令及生成器源码；减少动态效果模式显示相同 MP4 的首帧但不自动播放。

本地实现已收尾：中文/乱码扫描、聚焦回归、生产构建、功能 smoke、授权媒体清单和差异格式检查均已完成。Task 9 的六张截图与人工视觉审查因当前环境无法启动 Chrome/Edge DevTools，交由部署服务器验收；不得重新引入生成器或替换授权 MP4。

## Scope And Invariants

- 创作者可见文案、`aria-label`、tooltip、空状态和错误提示全部使用简体中文；模型正式产品名、`480P/720P/1080P/4K` 和比例数字除外。
- 不修改 `VideoGenerationParamsV1`、23 个 `cameraMotionId`、v2 模型目录、provider、worker、数据库或计费协议。
- 不复制 DramaClaw/LibTV 的代码、品牌或商标。运镜媒体仅可使用已取得商业授权的 23 个 DramaClaw MP4，必须保留 manifest 中的商业授权来源标记；不得热链第三方 URL，不得混入未授权媒体。
- 保持模型能力校正、asset-backed 结果恢复、autosave、诊断脱敏和生成前门禁的现有测试。
- 每个视觉任务必须先有交互/样式回归测试，再实现，再跑真实截图；DOM 数量通过不等于视觉完成。
- 每个提交只暂存当前任务文件；忽略主工作区和其它 worktree 的未跟踪文件。

## File Map

### New files

- `src/flowCanvas/video/videoUiCopy.ts`：中文词典、角色名称、模式名称、色调名称和禁止英文/乱码扫描规则。
- `src/flowCanvas/video/videoUiCopy.test.ts`：词典完整性和源码乱码扫描。
- `src/flowCanvas/video/videoVisualTokens.ts`：视频工作台专用表面、描边、文字、间距和响应式宽度 token。
- `src/flowCanvas/video/VideoSegmentedControl.tsx` 与测试：清晰度、音频、数量通用分段控件。
- `src/flowCanvas/video/VideoAspectRatioGrid.tsx` 与测试：七种比例图形卡。
- `src/flowCanvas/video/videoPalettePresets.ts` 与测试：语义色票、角色中文映射和五种画面色调样本。
- `scripts/smoke-video-node-visual.ts` 与测试：视觉验收脚本和截图契约。

### Modified files

- `src/flowCanvas/video/VideoNodeComposer.tsx` 与测试：主工作台布局、中文摘要、互斥浮层和响应式定位。
- `src/flowCanvas/video/VideoParameterPanel.tsx` 与测试：图形比例、分段清晰度/音频/数量、时长输入。
- `src/flowCanvas/video/VideoPalettePopover.tsx` 与测试：语义色票分组和画面色调样本。
- `src/flowCanvas/video/VideoCameraLibrary.tsx` 与测试：中文模态层、电影感卡片与稳定播放状态。
- `src/flowCanvas/video/VideoReferenceStrip.tsx`、`VideoModeMenu.tsx`、`VideoModelMenu.tsx`、`VideoHumanReviewControl.tsx` 及测试：中文化和统一视觉密度。
- `src/flowCanvas/video/VideoNodeLegacyComposer.tsx`：仅中文化回滚路径，不改变旧交互。
- `public/video-camera-library/manifest.v1.json`：版本 2 的 23 项授权 MP4 manifest，稳定 ID 不变。
- `public/video-camera-library/v2/*.mp4`：从已获授权的 DramaClaw 参考目录逐字节复制的 23 个 H.264 预览文件。
- `scripts/smoke-video-node.ts` 与测试：保留功能 smoke，并使用中文选择器。
- `package.json`：视觉 smoke 命令。
- `PROJECT_RECORD.md`：记录视觉回归、素材来源和实际验收结果。

## Task 1: 建立全中文和编码安全边界

> **状态：已完成，待 Task 10 再次全量扫描。** 已完成中文词典与创建者可见文案修复；不要按本节重复实现，仅在最终扫描发现残留英文或乱码时做最小修正。

**Files:**
- Create: `src/flowCanvas/video/videoUiCopy.ts`
- Create: `src/flowCanvas/video/videoUiCopy.test.ts`
- Modify: `src/flowCanvas/video/VideoReferenceStrip.tsx`
- Modify: `src/flowCanvas/video/VideoModeMenu.tsx`
- Modify: `src/flowCanvas/video/VideoModelMenu.tsx`
- Modify: `src/flowCanvas/video/VideoHumanReviewControl.tsx`
- Modify: `src/flowCanvas/video/VideoNodeLegacyComposer.tsx`
- Test: corresponding `*.test.tsx` files

- [ ] **Step 1: 写入失败的中文完整性测试**

```ts
import { describe, expect, test } from "vitest";
import { VIDEO_UI_COPY, VIDEO_MODE_LABELS, VIDEO_ROLE_LABELS } from "./videoUiCopy";

const MOJIBAKE = /\uFFFD|锛|鏂|妯|棰|杩|缁|閫|绉|浣|鍙/;

describe("videoUiCopy", () => {
  test("provides Chinese creator-facing labels without mojibake", () => {
    const values = [
      ...Object.values(VIDEO_UI_COPY),
      ...Object.values(VIDEO_MODE_LABELS),
      ...Object.values(VIDEO_ROLE_LABELS),
    ];
    expect(values).not.toContain("");
    values.forEach((value) => expect(value).not.toMatch(MOJIBAKE));
  });
});
```

- [ ] **Step 2: 运行红测**

Run: `npm test -- src/flowCanvas/video/videoUiCopy.test.ts`  
Expected: FAIL because `videoUiCopy.ts` does not exist.

- [ ] **Step 3: 创建中文词典**

```ts
export const VIDEO_UI_COPY = {
  cameraLibrary: "运镜库",
  allMotions: "全部运镜",
  favorites: "我的收藏",
  myMotions: "我的运镜",
  searchMotions: "搜索运镜",
  clear: "清除",
  use: "使用",
  chooseModel: "选择模型",
  parameters: "视频参数",
  palette: "调色盘",
  promptPlaceholder: "描述你想生成的视频内容",
  generate: "生成",
  generating: "生成中",
  unconfigured: "未配置",
} as const;

export const VIDEO_ROLE_LABELS = {
  subject: "人物",
  scene: "场景",
  prop: "道具",
  style: "风格",
  first_frame: "首帧",
  last_frame: "尾帧",
  reference: "参考图",
} as const;

export const VIDEO_MODE_LABELS = {
  text_to_video: "文生视频",
  all_reference: "全能参考",
  image_to_video: "图生视频",
  first_last_frame: "首尾帧",
  image_reference: "图片参考",
} as const;
```

- [ ] **Step 4: 替换基础组件中的硬编码英文和乱码**

所有按钮文本和 `aria-label` 从 `videoUiCopy.ts` 读取。测试必须断言：

```ts
expect(screen.getByRole("button", { name: "人物" })).toBeTruthy();
expect(screen.queryByText("Subject")).toBeNull();
expect(screen.getByRole("button", { name: "选择模型" })).toBeTruthy();
expect(document.body.textContent).not.toMatch(MOJIBAKE);
```

- [ ] **Step 5: 运行中文组件测试**

Run:

```bash
npm test -- src/flowCanvas/video/videoUiCopy.test.ts src/flowCanvas/video/VideoReferenceStrip.test.tsx src/flowCanvas/video/VideoModeMenu.test.tsx src/flowCanvas/video/VideoModelMenu.test.tsx src/flowCanvas/video/VideoHumanReviewControl.test.tsx
```

Expected: PASS; no visible English legacy label and no mojibake.

- [ ] **Step 6: 提交**

```bash
git add src/flowCanvas/video/videoUiCopy.ts src/flowCanvas/video/videoUiCopy.test.ts src/flowCanvas/video/VideoReferenceStrip.tsx src/flowCanvas/video/VideoReferenceStrip.test.tsx src/flowCanvas/video/VideoModeMenu.tsx src/flowCanvas/video/VideoModeMenu.test.tsx src/flowCanvas/video/VideoModelMenu.tsx src/flowCanvas/video/VideoModelMenu.test.tsx src/flowCanvas/video/VideoHumanReviewControl.tsx src/flowCanvas/video/VideoHumanReviewControl.test.tsx src/flowCanvas/video/VideoNodeLegacyComposer.tsx
git commit -m "fix: localize video creator controls"
```

## Task 2: 建立视频视觉控件和设计 token

> **状态：已完成，待 Task 10 回归。** 图形比例卡、分段清晰度/音频/数量控件和视觉 token 已存在。

**Files:**
- Create: `src/flowCanvas/video/videoVisualTokens.ts`
- Create: `src/flowCanvas/video/VideoSegmentedControl.tsx`
- Create: `src/flowCanvas/video/VideoSegmentedControl.test.tsx`
- Create: `src/flowCanvas/video/VideoAspectRatioGrid.tsx`
- Create: `src/flowCanvas/video/VideoAspectRatioGrid.test.tsx`

- [ ] **Step 1: 写分段控件和比例卡红测**

```tsx
render(<VideoSegmentedControl ariaLabel="清晰度" onChange={onChange} options={[
  { value: "480P", label: "480P" },
  { value: "720P", label: "720P" },
  { value: "4K", label: "4K", disabled: true, reason: "当前模型不支持 4K" },
]} value="720P" />);
expect(screen.getByRole("radio", { name: "720P" }).getAttribute("aria-checked")).toBe("true");
expect(screen.getByRole("radio", { name: "4K" }).getAttribute("aria-disabled")).toBe("true");

render(<VideoAspectRatioGrid allowed={["auto", "16:9", "9:16"]} onChange={onChange} value="16:9" />);
expect(screen.getByRole("radio", { name: "16:9" })).toHaveAttribute("data-ratio-shape", "landscape");
```

- [ ] **Step 2: 运行红测**

Run: `npm test -- src/flowCanvas/video/VideoSegmentedControl.test.tsx src/flowCanvas/video/VideoAspectRatioGrid.test.tsx`  
Expected: FAIL because both components are missing.

- [ ] **Step 3: 实现视觉 token**

```ts
export const VIDEO_SURFACE_CLASS = "border border-white/10 bg-[#242424] text-white shadow-[0_20px_50px_rgba(0,0,0,0.48)]";
export const VIDEO_PANEL_CLASS = `${VIDEO_SURFACE_CLASS} rounded-[10px]`;
export const VIDEO_CONTROL_CLASS = "h-10 rounded-[8px] border border-white/15 bg-[#2b2b2b] text-[13px] font-semibold text-white/80";
export const VIDEO_SELECTED_CLASS = "border-white/85 bg-white/[0.13] text-white ring-1 ring-white/55";
export const VIDEO_DISABLED_CLASS = "cursor-not-allowed opacity-35";
```

- [ ] **Step 4: 实现可访问的分段控件**

```tsx
type SegmentedOption<T extends string> = {
  value: T;
  label: string;
  disabled?: boolean;
  reason?: string;
};

type Props<T extends string> = {
  ariaLabel: string;
  onChange: (value: T) => void;
  options: Array<SegmentedOption<T>>;
  value: T;
};

export function VideoSegmentedControl<T extends string>({ ariaLabel, onChange, options, value }: Props<T>) {
  return <div aria-label={ariaLabel} className="grid gap-2" role="radiogroup" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
    {options.map((option) => {
      const selected = option.value === value;
      return <button key={option.value} aria-checked={selected} aria-disabled={option.disabled || undefined}
        className={`${VIDEO_CONTROL_CLASS} ${selected ? VIDEO_SELECTED_CLASS : ""} ${option.disabled ? VIDEO_DISABLED_CLASS : ""}`}
        onClick={() => { if (!option.disabled) onChange(option.value); }} role="radio" title={option.reason} type="button">
        {option.label}
      </button>;
    })}
  </div>;
}
```

- [ ] **Step 5: 实现七种比例图形卡**

比例轮廓用 CSS `aspect-ratio` 和稳定盒子实现，不手绘 SVG；卡片顺序固定为自动、16:9、4:3、1:1、3:4、9:16、21:9。禁用项仍渲染并通过 `title` 和辅助文本解释原因。

```tsx
type AspectGridProps = {
  allowed: readonly VideoAspectRatio[];
  onChange: (value: VideoAspectRatio) => void;
  value: VideoAspectRatio;
};

const RATIOS = ["auto", "16:9", "4:3", "1:1", "3:4", "9:16", "21:9"] as const;

export function VideoAspectRatioGrid({ allowed, onChange, value }: AspectGridProps) {
  return <div aria-label="画面比例" className="grid grid-cols-5 gap-2" role="radiogroup">
    {RATIOS.map((ratio) => {
      const disabled = !allowed.includes(ratio);
      return <button key={ratio} aria-checked={ratio === value} aria-disabled={disabled || undefined}
        className={`${VIDEO_CONTROL_CLASS} h-[92px] ${ratio === value ? VIDEO_SELECTED_CLASS : ""} ${disabled ? VIDEO_DISABLED_CLASS : ""}`}
        data-ratio-shape={ratio === "9:16" || ratio === "3:4" ? "portrait" : ratio === "1:1" ? "square" : "landscape"}
        onClick={() => { if (!disabled) onChange(ratio); }} role="radio" type="button">
        <span aria-hidden="true" className="mx-auto block h-5 border-2 border-current" style={{ aspectRatio: ratio === "auto" ? "4 / 3" : ratio.replace(":", " / ") }} />
        <span className="mt-2 block">{ratio === "auto" ? "自动" : ratio}</span>
      </button>;
    })}
  </div>;
}
```

- [ ] **Step 6: 验证并提交**

```bash
npm test -- src/flowCanvas/video/VideoSegmentedControl.test.tsx src/flowCanvas/video/VideoAspectRatioGrid.test.tsx
git add src/flowCanvas/video/videoVisualTokens.ts src/flowCanvas/video/VideoSegmentedControl.tsx src/flowCanvas/video/VideoSegmentedControl.test.tsx src/flowCanvas/video/VideoAspectRatioGrid.tsx src/flowCanvas/video/VideoAspectRatioGrid.test.tsx
git commit -m "feat: add video visual selection controls"
```

## Task 3: 重做参数面板

> **状态：已完成，待 Task 9 截图验收。** 参数面板已使用图形比例、分段清晰度/音频/数量和时长输入；禁止恢复原生下拉选择器。

**Files:**
- Modify: `src/flowCanvas/video/VideoParameterPanel.tsx`
- Modify: `src/flowCanvas/video/VideoParameterPanel.test.tsx`
- Use: `src/flowCanvas/video/VideoAspectRatioGrid.tsx`
- Use: `src/flowCanvas/video/VideoSegmentedControl.tsx`

- [ ] **Step 1: 将现有下拉测试改成目标交互红测**

```tsx
expect(screen.getByRole("radiogroup", { name: "画面比例" })).toBeTruthy();
expect(screen.getByRole("radio", { name: "4K" })).toBeTruthy();
expect(screen.getByRole("radiogroup", { name: "生成音频" })).toBeTruthy();
expect(screen.getByRole("radio", { name: "开启" })).toBeTruthy();
expect(screen.getByRole("radio", { name: "4 个" })).toBeTruthy();
expect(screen.queryByRole("button", { name: /清晰度.*菜单/ })).toBeNull();
```

- [ ] **Step 2: 运行红测**

Run: `npm test -- src/flowCanvas/video/VideoParameterPanel.test.tsx`  
Expected: FAIL because the panel still renders three `MenuSelect` controls.

- [ ] **Step 3: 实现单列分区结构**

```tsx
const resolutionOptions = RESOLUTION_OPTIONS.map(({ label, value: resolution }) => ({
  value: resolution,
  label,
  disabled: !effectiveCapabilities.resolutions.includes(resolution),
  reason: !effectiveCapabilities.resolutions.includes(resolution) ? `当前模型不支持 ${label}` : undefined,
}));
const countOptions = COUNT_OPTIONS.map(({ label, value: count }) => ({
  value: String(count),
  label: `${label} 个`,
  disabled: count > effectiveCapabilities.maxCount,
  reason: count > effectiveCapabilities.maxCount ? `当前模型最多生成 ${effectiveCapabilities.maxCount} 个` : undefined,
}));

return <div className="grid w-[500px] max-w-[calc(100vw-24px)] gap-4 p-4 text-white">
  <ParameterSection title="画面比例">
    <VideoAspectRatioGrid
      allowed={effectiveCapabilities.aspectRatios}
      onChange={(aspectRatio) => applyChange({ ...value, aspectRatio })}
      value={value.aspectRatio}
    />
  </ParameterSection>
  <ParameterSection title="清晰度">
    <VideoSegmentedControl ariaLabel="清晰度" onChange={(resolution) => applyChange({ ...value, resolution })} options={resolutionOptions} value={value.resolution} />
  </ParameterSection>
  <ParameterSection title="视频时长">
    <div className="grid grid-cols-[1fr_72px] items-center gap-3">
      <input aria-label="视频时长滑杆" max={effectiveCapabilities.maxDurationSeconds} min={effectiveCapabilities.minDurationSeconds} step={effectiveCapabilities.durationStepSeconds} type="range" value={value.durationSeconds} />
      <label className="flex items-center gap-1"><input aria-label="视频时长输入" type="number" value={durationInput} /><span>秒</span></label>
    </div>
  </ParameterSection>
  <ParameterSection title="生成音频">
    <VideoSegmentedControl ariaLabel="生成音频" onChange={(audio) => applyChange({ ...value, generateAudio: audio === "on" })} options={[
      { value: "on", label: "开启", disabled: audioUnsupported, reason: audioUnsupported ? "当前模型不支持生成音频" : undefined },
      { value: "off", label: "关闭" },
    ]} value={value.generateAudio ? "on" : "off"} />
  </ParameterSection>
  <ParameterSection title="生成数量">
    <VideoSegmentedControl ariaLabel="生成数量" onChange={(count) => applyChange({ ...value, count: Number(count) as VideoCount })} options={countOptions} value={String(value.count)} />
  </ParameterSection>
</div>;
```

- [ ] **Step 4: 保留能力校正和禁用原因**

比例、清晰度和数量不得通过过滤隐藏不支持项；必须传入 `disabled` 和中文 `reason`。时长仍调用 `correctVideoGenerationParams`，回车只提交一次。未确认线路继续使用安全 2-8 秒默认值，但生成门禁不放宽。

- [ ] **Step 5: 验证数据隔离**

测试依次点击 21:9、4K、开启音频、4 个，并断言每次 `onChange` 只修改对应 `VideoGenerationParamsV1` 字段；禁用项不触发回调。

- [ ] **Step 6: 运行测试和构建**

```bash
npm test -- src/flowCanvas/video/VideoParameterPanel.test.tsx src/flowCanvas/video/videoGenerationCapabilities.test.ts
npm run build
```

Expected: PASS; build only retains existing Browserslist/chunk warnings.

- [ ] **Step 7: 提交**

```bash
git add src/flowCanvas/video/VideoParameterPanel.tsx src/flowCanvas/video/VideoParameterPanel.test.tsx
git commit -m "feat: redesign video parameter panel"
```

## Task 4: 重做语义调色盘和画面色调

> **状态：已完成，待 Task 9 截图验收。** 语义分组和五种画面色调已实现；仅在视觉截图发现层级、文字或色票问题时修正。

**Files:**
- Create: `src/flowCanvas/video/videoPalettePresets.ts`
- Create: `src/flowCanvas/video/videoPalettePresets.test.ts`
- Modify: `src/flowCanvas/video/VideoPalettePopover.tsx`
- Modify: `src/flowCanvas/video/VideoPalettePopover.test.tsx`

- [ ] **Step 1: 写语义分组红测**

```tsx
expect(screen.getByRole("group", { name: "人物颜色" })).toBeTruthy();
expect(screen.getByRole("group", { name: "道具颜色" })).toBeTruthy();
expect(screen.queryByRole("group", { name: "场景颜色" })).toBeNull();
expect(screen.getByRole("radiogroup", { name: "画面色调" })).toBeTruthy();
expect(screen.getByRole("radio", { name: "青橙电影" })).toBeTruthy();
```

- [ ] **Step 2: 创建完整色票和色调数据**

```ts
export const CONTEXT_SWATCHES = [
  { token: "magenta", color: "#f20fd5" }, { token: "cyan", color: "#11d9e8" },
  { token: "lime", color: "#c8f500" }, { token: "orange", color: "#ff6b0a" },
  { token: "violet", color: "#8158ef" }, { token: "green", color: "#12d866" },
  { token: "sky", color: "#20a9f5" }, { token: "yellow", color: "#ffc21a" },
  { token: "purple", color: "#951bd8" }, { token: "mint", color: "#22e5c4" },
  { token: "neon", color: "#34ef16" }, { token: "indigo", color: "#5c6fc4" },
] as const;

export const VISUAL_TONE_PRESETS = [
  { id: "neutral", label: "自然", colors: ["#3d4147", "#a6a8a8", "#d6cbbb"] },
  { id: "cinematic_teal", label: "青橙电影", colors: ["#153e44", "#2b7778", "#df8a52"] },
  { id: "warm_sunset", label: "暖色夕阳", colors: ["#5f2732", "#cc6842", "#f3ba68"] },
  { id: "cool_moonlight", label: "冷调月光", colors: ["#15213d", "#3d5f8c", "#98b9d8"] },
  { id: "monochrome", label: "黑白", colors: ["#191919", "#777", "#ddd"] },
] as const;
```

- [ ] **Step 3: 实现按已绑定角色动态分组**

角色分组只来自 `referenceRolesByKey` 的有效 assignment；一个角色一个分区，标题由 `VIDEO_ROLE_LABELS` 生成。每个色票按钮包含中文名称、双环选中态和勾选图标。

- [ ] **Step 4: 实现带三色色样的画面色调卡**

色调卡使用 `role="radio"`，三段真实色样而非单色方块；点击只更新 `visualTone`。上下文色票点击只更新 `contextPaletteRefs`。

- [ ] **Step 5: 运行测试并提交**

```bash
npm test -- src/flowCanvas/video/videoPalettePresets.test.ts src/flowCanvas/video/VideoPalettePopover.test.tsx
git add src/flowCanvas/video/videoPalettePresets.ts src/flowCanvas/video/videoPalettePresets.test.ts src/flowCanvas/video/VideoPalettePopover.tsx src/flowCanvas/video/VideoPalettePopover.test.tsx
git commit -m "feat: redesign semantic video palettes"
```

## Task 5: 生成原创电影感运镜基准场景

> **状态：已废止，不得执行。** 本节的原创基准图、`imagegen`、Sharp、FFmpeg、WebP/WebM 以及 `v1` 资源生成步骤均由本计划的“2026-07-17 基线修订”替代。唯一有效的媒体来源是已授权的 DramaClaw 原始 MP4；实际迁移记录见基线修订。

**Files:**
- Create: `scripts/assets/video-camera/cinematic-city-master.webp`
- Create: `scripts/assets/video-camera/README.md`
- Modify: `scripts/generate-video-camera-assets.mjs`
- Modify: `scripts/generate-video-camera-assets.test.mjs`
- Regenerate: `public/video-camera-library/manifest.v1.json`
- Regenerate: `public/video-camera-library/v1/*.webp`
- Regenerate: `public/video-camera-library/v1/*.webm`

- [ ] **Step 1: 使用 imagegen 生成原创基准场景**

执行实现时必须调用 `imagegen` skill。使用下列提示生成 1600x900 WebP，不使用用户参考截图作为图像输入：

```text
Original cinematic night city scene for demonstrating camera movement. A single adult performer in a practical futuristic raincoat stands full-body at center on a wet urban street. Strong foreground props on both lower corners, clear midground shop structures, distant architecture and converging street lines, subtle cyan/red practical lights, realistic photographic lighting, sharp readable depth layers, no text, no logos, no trademarks, no known character, wide 16:9, inspection-friendly, not a collage.
```

保存为 `scripts/assets/video-camera/cinematic-city-master.webp`。README 记录提示、生成日期、`TapFlow original` 归属和禁止替换为第三方截图。

- [ ] **Step 2: 写资源质量红测**

```js
assert.equal(metadata.width, 1600);
assert.equal(metadata.height, 900);
assert.ok(metadata.size > 100_000, "cinematic source must not be a tiny placeholder");
assert.equal(manifest.items.length, 23);
for (const item of manifest.items) {
  assert.equal(item.codec, "vp9");
  assert.ok(statSync(resolve(publicRoot, item.poster)).size > 10_000);
  assert.ok(statSync(resolve(publicRoot, item.preview)).size > 25_000);
}
```

- [ ] **Step 3: 用完整 23 项运动 profile 替换几何场景绘制**

生成器读取主图并使用 overscan crop/scale/translate/rotate 生成 60 帧。profile 固定如下，不允许省略 ID：

```js
const PROFILES = {
  fixed: [0, 0, 1.08, 0, 0, 1.08, 0],
  follow: [-24, 0, 1.12, 24, 0, 1.12, 0],
  "spiral-up": [-18, 24, 1.16, 18, -24, 1.08, 2.5],
  "spiral-down": [18, -24, 1.08, -18, 24, 1.16, -2.5],
  "tilt-up": [0, 30, 1.12, 0, -30, 1.12, 0],
  "tilt-down": [0, -30, 1.12, 0, 30, 1.12, 0],
  "pan-left": [36, 0, 1.12, -36, 0, 1.12, 0],
  "pan-right": [-36, 0, 1.12, 36, 0, 1.12, 0],
  "crane-up": [0, 38, 1.14, 0, -42, 1.08, 0],
  "crane-down": [0, -42, 1.08, 0, 38, 1.14, 0],
  "truck-left": [48, 0, 1.18, -48, 0, 1.18, 0],
  "truck-right": [-48, 0, 1.18, 48, 0, 1.18, 0],
  "dolly-in": [0, 0, 1.02, 0, 0, 1.35, 0],
  "dolly-out": [0, 0, 1.35, 0, 0, 1.02, 0],
  "zoom-in": [0, 0, 1.08, 0, 0, 1.42, 0],
  "zoom-out": [0, 0, 1.42, 0, 0, 1.08, 0],
  "dolly-zoom": [0, 0, 1.08, 0, -10, 1.42, 0],
  orbit: [-44, 4, 1.2, 44, -4, 1.2, 0],
  roll: [0, 0, 1.24, 0, 0, 1.24, 8],
  fpv: [-28, 18, 1.18, 32, -20, 1.28, 4],
  drone: [-30, 44, 1.28, 30, -38, 1.1, 0],
  aerial: [0, 54, 1.34, 0, -50, 1.04, 0],
  handheld: [-5, 4, 1.16, 6, -3, 1.18, 1.4],
};
```

- [ ] **Step 4: 生成并验证 23 组媒体**

```bash
npm run assets:video-camera
npm run test:video-camera-assets
npm test -- src/flowCanvas/video/videoCameraManifest.test.ts
```

Expected: 23 non-zero WebP + 23 silent VP9 WebM; manifest IDs unchanged; all labels Chinese.

- [ ] **Step 5: 人工检查代表性动画**

使用浏览器或本地播放器逐项查看 `fixed`、`pan-left`、`dolly-in`、`orbit`、`roll`、`drone`、`handheld`。确认主体始终可见，方向可辨，画面无黑帧、空帧或文本水印。

- [ ] **Step 6: 提交**

```bash
git add scripts/assets/video-camera scripts/generate-video-camera-assets.mjs scripts/generate-video-camera-assets.test.mjs public/video-camera-library
git commit -m "feat: replace camera previews with cinematic motion assets"
```

## Task 6: 重做中文运镜库

> **状态：部分完成，剩余验收。** 保留中文标题、四/三/两列响应式网格、最多四段可见预览和焦点/关闭行为；媒体路径必须使用 `v2/*.mp4`，不再要求 poster、VP9 或 WebM。最终以 Task 9 截图与 Task 10 回归为准。

**Files:**
- Modify: `src/flowCanvas/video/VideoCameraLibrary.tsx`
- Modify: `src/flowCanvas/video/VideoCameraLibrary.test.tsx`
- Modify: `src/flowCanvas/video/videoUiCopy.ts`

- [ ] **Step 1: 写中文模态层和卡片视觉红测**

```tsx
expect(screen.getByRole("dialog", { name: "运镜库" })).toBeTruthy();
expect(screen.getByRole("tab", { name: "全部运镜" })).toBeTruthy();
expect(screen.getByPlaceholderText("搜索运镜")).toBeTruthy();
expect(screen.getByRole("button", { name: "使用" })).toBeTruthy();
expect(screen.queryByText("Camera motion library")).toBeNull();
expect(screen.getAllByTestId("camera-motion-preview")).toHaveLength(23);
```

- [ ] **Step 2: 运行红测**

Run: `npm test -- src/flowCanvas/video/VideoCameraLibrary.test.tsx`  
Expected: FAIL because the dialog and tabs still use English.

- [ ] **Step 3: 实现参考图式模态布局**

标题区只显示“运镜库”和关闭按钮；标签页与搜索位于紧凑工具行；卡片内容只含 16:9 预览、中文名称、收藏按钮和选中勾选；底部固定当前选择、“清除”“使用”。桌面四列、1024px 三列、移动端两列。

- [ ] **Step 4: 增强播放状态**

卡片增加可见播放/暂停状态图标。保留 `muted`、`playsInline`、`loop`、最多四段、IntersectionObserver 和 reduced-motion 海报逻辑；关闭立即暂停并重置所有视频。

- [ ] **Step 5: 运行交互与媒体测试**

```bash
npm test -- src/flowCanvas/video/VideoCameraLibrary.test.tsx src/flowCanvas/video/videoCameraManifest.test.ts src/components/menu/useDismissibleLayer.test.tsx
npm run build
```

- [ ] **Step 6: 提交**

```bash
git add src/flowCanvas/video/VideoCameraLibrary.tsx src/flowCanvas/video/VideoCameraLibrary.test.tsx src/flowCanvas/video/videoUiCopy.ts
git commit -m "feat: redesign Chinese camera motion library"
```

## Task 7: 重组主 Composer 视觉层级

> **状态：部分完成，待 Task 9 截图验收。** 主工作台、中文摘要与移动端定位已有实现；只处理截图揭示的溢出、层级或中文显示问题。

**Files:**
- Modify: `src/flowCanvas/video/VideoNodeComposer.tsx`
- Modify: `src/flowCanvas/video/VideoNodeComposer.test.tsx`
- Modify: `src/flowCanvas/video/VideoReferenceStrip.tsx`
- Modify: `src/flowCanvas/video/VideoReferenceStrip.test.tsx`
- Modify: `src/flowCanvas/video/VideoModelMenu.tsx`
- Modify: `src/flowCanvas/video/VideoModelMenu.test.tsx`

- [ ] **Step 1: 写工作台信息结构红测**

```tsx
expect(screen.getByRole("region", { name: "视频创作工作台" })).toBeTruthy();
expect(screen.getByLabelText("视频提示词").getAttribute("placeholder")).toBe("描述你想生成的视频内容");
expect(screen.getByRole("button", { name: "运镜库" })).toBeTruthy();
expect(screen.getByRole("button", { name: "视频参数" })).toHaveTextContent("16:9 · 720P · 4 秒 · 1 个");
expect(screen.getByRole("button", { name: "生成视频" })).toHaveTextContent("生成");
```

- [ ] **Step 2: 运行红测**

Run: `npm test -- src/flowCanvas/video/VideoNodeComposer.test.tsx`  
Expected: FAIL because current Composer uses old aria labels and compact layout.

- [ ] **Step 3: 实现三段式 Composer**

```tsx
const referenceValue = {
  referenceAssetItemIds: data.referenceAssetItemIds ?? [],
  referenceOrder: data.referenceOrder ?? [],
  videoGeneration: params,
};
const ratioLabel = params.aspectRatio === "auto" ? "自动" : params.aspectRatio;
const requestVerification = () => setParams({
  ...params,
  humanReview: { ...params.humanReview, status: "verified", verifiedAt: new Date().toISOString() },
});

<section aria-label="视频创作工作台" className={`${VIDEO_PANEL_CLASS} absolute left-1/2 top-[calc(100%+14px)] z-40 w-[calc(100vw-24px)] max-w-[1040px] -translate-x-1/2 p-4 md:w-[clamp(720px,58vw,1040px)]`}>
  <div className="flex flex-wrap items-center gap-2">
    <VideoReferenceStrip currentNodeId={nodeId} onChange={updateReference} onUploadReference={() => undefined} value={referenceValue} />
    <VideoModeMenu capabilities={capabilities} onChange={(mode) => setParams({ ...params, mode })} value={params.mode} />
    <button aria-label="运镜库" onClick={() => setCameraOpen(true)} type="button"><Camera size={16} />{selectedMotion?.label ?? "运镜"}</button>
  </div>
  <textarea aria-label="视频提示词" className="mt-3 min-h-[112px] w-full resize-y bg-transparent text-sm outline-none" onChange={(event) => onUpdate({ generationPrompt: event.target.value })} placeholder={VIDEO_UI_COPY.promptPlaceholder} value={data.generationPrompt || ""} />
  <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-white/10 pt-3">
    <button aria-label="选择模型" type="button"><Sparkles size={16} />{option?.label ?? VIDEO_UI_COPY.chooseModel}</button>
    <button aria-label="视频参数" type="button">{`${ratioLabel} · ${params.resolution} · ${params.durationSeconds} 秒 · ${params.count} 个`}</button>
    <VideoPalettePopover onChange={setParams} value={params} />
    <VideoHumanReviewControl onRequestVerification={requestVerification} value={params.humanReview} />
    <span className="ml-auto">{cost > 0 ? `${cost} 点数` : VIDEO_UI_COPY.unconfigured}</span>
    <button aria-label="生成视频" disabled={generating} onClick={onGenerate} type="button">{generating ? VIDEO_UI_COPY.generating : VIDEO_UI_COPY.generate}</button>
  </div>
</section>
```

- [ ] **Step 4: 使用中文摘要替代纯“参数”按钮**

摘要格式固定：`自动 · 720P · 4 秒 · 1 个 · 音频关闭`。窄屏允许换行但不能截断生成按钮。模型名称过长时使用省略号和完整 tooltip。

- [ ] **Step 5: 保持状态和安全逻辑不变**

确认模型切换仍调用 `correctVideoGenerationParams`，能力校正 effect 仍幂等，`onGenerate` 仍由 `FlowNodes` 的 blocker 控制，临时 URL 不写入 patch。

- [ ] **Step 6: 验证互斥浮层和响应式布局**

测试依次打开模型、参数、调色盘，断言同时只存在一个紧凑层；运镜库使用独立 dialog。测试 390px 时 Composer 左右边界在视口内，主按钮不重叠。

- [ ] **Step 7: 运行测试并提交**

```bash
npm test -- src/flowCanvas/video/VideoNodeComposer.test.tsx src/flowCanvas/video/VideoReferenceStrip.test.tsx src/flowCanvas/video/VideoModelMenu.test.tsx src/flowCanvas/video/VideoParameterPanel.test.tsx src/flowCanvas/video/VideoPalettePopover.test.tsx
npm run build
git add src/flowCanvas/video/VideoNodeComposer.tsx src/flowCanvas/video/VideoNodeComposer.test.tsx src/flowCanvas/video/VideoReferenceStrip.tsx src/flowCanvas/video/VideoReferenceStrip.test.tsx src/flowCanvas/video/VideoModelMenu.tsx src/flowCanvas/video/VideoModelMenu.test.tsx
git commit -m "feat: rebuild video creator workbench layout"
```

## Task 8: 统一弹层、焦点和移动端行为

> **状态：部分完成，待 Task 9 浏览器回归。** 互斥浮层、Escape/外部点击关闭、焦点恢复和 1440/1024/390 布局必须由真实浏览器验收确认。

**Files:**
- Modify: `src/flowCanvas/video/VideoNodeComposer.tsx`
- Modify: `src/flowCanvas/video/VideoParameterPanel.tsx`
- Modify: `src/flowCanvas/video/VideoPalettePopover.tsx`
- Modify: `src/flowCanvas/video/VideoCameraLibrary.tsx`
- Test: corresponding component tests

- [ ] **Step 1: 写互斥层和焦点红测**

```tsx
fireEvent.click(screen.getByRole("button", { name: "视频参数" }));
expect(screen.getByRole("dialog", { name: "视频参数" })).toBeTruthy();
fireEvent.click(screen.getByRole("button", { name: "调色盘" }));
expect(screen.queryByRole("dialog", { name: "视频参数" })).toBeNull();
expect(screen.getByRole("dialog", { name: "调色盘" })).toBeTruthy();
fireEvent.keyDown(document, { key: "Escape" });
expect(document.activeElement).toBe(screen.getByRole("button", { name: "调色盘" }));
```

- [ ] **Step 2: 给所有紧凑层使用唯一 dismissible key**

模型、参数、调色盘、真人验证分别使用独立 key，并通过共享层机制互斥。父参数面板打开内部比例/清晰度控件时不得被内部点击关闭。

- [ ] **Step 3: 完成三档响应式约束**

- 1440px：Composer 单行底部摘要；运镜四列。
- 1024px：Composer 宽度不超过视口减 24px；运镜三列。
- 390px：Composer 垂直排列；运镜两列；任何按钮、文本输入和浮层不得越过视口。

- [ ] **Step 4: 运行组件回归**

```bash
npm test -- src/flowCanvas/video src/components/menu/useDismissibleLayer.test.tsx
npm run build
```

- [ ] **Step 5: 提交**

```bash
git add src/flowCanvas/video
git commit -m "fix: unify video workbench layers and responsive layout"
```

## Task 9: 建立截图级视觉验收

> **状态：代码和自动化契约已完成，真实截图交由服务器验收。** `scripts/smoke-video-node-visual.ts` 与契约测试已实现，包含六个独立视口状态、中文/乱码/几何/卡片数量断言和截图输出；当前本地环境的 Chrome/Edge 均无法开放 DevTools 端口，因此不虚报截图结果。

**Files:**
- Create: `scripts/smoke-video-node-visual.ts`
- Create: `scripts/smoke-video-node-visual.test.ts`
- Modify: `scripts/smoke-video-node.ts`
- Modify: `scripts/smoke-video-node.test.ts`
- Modify: `package.json`

- [x] **Step 1: 写视觉 smoke 契约红测**

```ts
expect(VIDEO_NODE_VISUAL_SHOTS).toEqual([
  "composer-default",
  "parameters-open",
  "camera-library-open",
  "palette-open",
  "narrow",
  "mobile",
]);
expect(VIDEO_NODE_VISUAL_OUTPUT_DIR).toBe("output/playwright/video-node-visual");
```

- [x] **Step 2: 为每个视口创建独立浏览器 context**

禁止用 `page.reload()` 在桌面和移动端之间复用 XYFlow transform。每个 context 在 ReactFlow mount 前按 `window.innerWidth` 初始化节点位置，并固定 viewport `{x:0,y:0,zoom:1}`。

- [x] **Step 3: 添加中文和几何断言**

```js
const forbidden = ['Subject', 'Scene', 'Prop', 'Style', 'Camera motion library', 'Favorites', 'Use', 'Clear'];
const bodyText = await page.locator('body').innerText();
if (forbidden.some((text) => bodyText.includes(text))) throw new Error('English video UI remains');
if (/锛|鏂|妯|棰|杩|缁|閫|绉|浣|鍙/.test(bodyText)) throw new Error('Video UI contains mojibake');

const rect = await page.locator('[aria-label="视频创作工作台"]').boundingBox();
if (!rect || rect.x < 0 || rect.x + rect.width > viewport.width) throw new Error('Composer overflow');
```

- [ ] **Step 4: 输出六类真实截图**（阻断：当前环境无法启动 Chrome/Edge DevTools）

```text
output/playwright/video-node-visual/composer-default.png
output/playwright/video-node-visual/parameters-open.png
output/playwright/video-node-visual/camera-library-open.png
output/playwright/video-node-visual/palette-open.png
output/playwright/video-node-visual/narrow.png
output/playwright/video-node-visual/mobile.png
```

运镜截图必须显示 23 张电影感卡中的至少 12 张、桌面四列和中文标题；参数截图必须同时显示七种比例、四档清晰度、时长、音频和数量；调色截图必须显示至少两个语义角色分组和五个画面色调。

- [ ] **Step 5: 运行视觉 smoke**（脚本已实现；本地运行环境阻断在浏览器启动阶段，部署服务器执行）

```bash
npm test -- scripts/smoke-video-node-visual.test.ts scripts/smoke-video-node.test.ts
npm run smoke:video-node
npm run smoke:video-node-visual
```

Expected: both smoke commands exit 0 and report all screenshots.

- [ ] **Step 6: 使用 view_image 逐张人工检查**（等待六张截图生成）

主代理必须读取六张截图并记录：中文完整、信息层级、比例卡形态、色票形态、运镜卡画质、四列网格、按钮不重叠、移动端可见。任何一项不合格都返回相应 UI 任务修复，不能只修改 smoke 断言。

- [ ] **Step 7: 提交**

```bash
git add scripts/smoke-video-node-visual.ts scripts/smoke-video-node-visual.test.ts scripts/smoke-video-node.ts scripts/smoke-video-node.test.ts package.json
git commit -m "test: add video workbench visual acceptance"
```

## Task 10: 最终回归、项目记录和交付审查

> **状态：代码回归已完成，视觉截图交由服务器收口。** 使用 v2 MP4 manifest 和新的视觉 smoke 契约；完整回归中若有与本视频改造无关的历史断言，必须单独记录。

**Files:**
- Modify: `PROJECT_RECORD.md`
- Inspect: all Task 1-9 files

- [x] **Step 1: 运行完整聚焦回归**

```bash
npm test -- src/flowCanvas/video src/flowCanvas/nodes/FlowNodes.agent-metadata.test.tsx src/flowCanvas/utils/canonicalGraph.test.ts src/flowCanvas/hooks/useRemoteFlowAutosave.test.tsx src/services/v2AiModelCatalogApi.test.ts scripts/smoke-video-node.test.ts scripts/smoke-video-node-visual.test.ts
npm run build
```

Expected: 视频和视觉测试全部通过。若历史 panorama `1k`/`1K` 断言仍失败，必须用完整命令和 commit 证据记录为既有问题，不得掩盖新的视频失败。

- [ ] **Step 2: 运行真实浏览器回归并保存输出**（部署服务器执行）

```bash
npm run smoke:video-node
npm run smoke:video-node-visual
```

Expected: desktop/narrow/mobile、参数、运镜和调色盘全部 status ok；被门禁阻断的生成请求计数保持 0。

- [x] **Step 3: 更新项目记录**

`PROJECT_RECORD.md` 必须记录：

- 2026-07-17 视频节点视觉还原改造。
- 全中文和乱码修复范围。
- 参数图形控件、语义调色盘和主工作台布局。
- 已授权 DramaClaw MP4、23 个稳定 ID、H.264 和商业授权来源标记。
- 本地无法生成六张截图的环境说明；部署服务器需补齐六张视觉验收截图与实际结果。
- 真实 provider/worker/数量计费仍属于下一期。

- [x] **Step 4: 检查秘密、远程媒体和未跟踪源码**

```bash
rg -n -i "api[_-]?key|authorization|bearer|x-amz-signature|https?://" src/flowCanvas/video public/video-camera-library scripts/assets/video-camera
git status --short
git diff --check
```

本次检查使用 `-g '!*.test.*'` 排除测试夹具；生产代码只保留本地 smoke 地址、敏感字段名防护正则和本地 `v2/*.mp4`，未发现密钥、签名 URL 或第三方远程媒体。`git diff --check` 通过。

- [ ] **Step 5: 最终代码与视觉双审查**（代码/数据边界已检查；截图人工审查由服务器验收补齐）

先审规格覆盖和数据安全，再审代码质量，最后由主代理重新查看六张截图。Critical/Important 发现全部修复并复审后才允许标记完成。

- [ ] **Step 6: 提交项目记录**

```bash
git add PROJECT_RECORD.md
git commit -m "docs: record video visual fidelity redesign"
```

## Requirement Coverage

| 规格要求 | 实施任务 |
| --- | --- |
| 全中文、无乱码 | Task 1、Task 9 |
| 图形比例、清晰度、时长、音频、数量 | Task 2、Task 3 |
| 人物/场景/道具/风格调色和五种画面色调 | Task 4 |
| 已授权 DramaClaw MP4 运镜预览、23 个稳定 ID | 基线修订；Task 6、Task 10 |
| 中文运镜库、四列网格、播放预算 | Task 6 |
| DramaClaw 式主工作台信息层级 | Task 7 |
| 互斥浮层、焦点和移动端 | Task 8 |
| 六类截图级验收 | Task 9 |
| 数据契约、模型门禁和完整回归 | Task 10 |

## Execution Notes

- 执行时使用现有 worktree `D:\tapnow-flow\.worktrees\video-node-visual-fidelity` 和分支 `codex/video-node-visual-fidelity`。
- 不执行 Task 5 的 `imagegen` 或任何本地媒体生成。媒体仅从 `output/reference/dramaclaw/frontend/public/video/camera-presets/` 逐字节复制到 `public/video-camera-library/v2/`，并校验 23 个文件的 SHA-256。
- 每个任务完成后执行规格审查与代码质量审查；视觉任务额外查看真实截图。
- 不允许为了让 smoke 通过而降低中文、画质、卡片列数或视口可见性断言。
