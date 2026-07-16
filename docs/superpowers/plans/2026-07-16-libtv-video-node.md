# LibTV 风格视频节点 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 TapFlow v2 无限画布中交付 LibTV 风格的视频节点工作台，完成五种模式、模型/能力选择、参数、运镜动画库、两类调色盘、真人验证状态和安全草稿持久化；真实视频 provider adapter 与数量计费不在本计划内。

**Architecture:** 在 src/flowCanvas/video/ 建立纯数据契约、能力合并器和独立 React 选择器，VideoNodeComponent 只保留画布预览、运行状态和 composer 挂载。所有选择写入 params.videoGeneration，同时保留现有顶层 modelId、routeKey、referenceAssetItemIds、referenceOrder。模型目录使用 v2 API；没有 video_generation 能力或 active pricing 的路线在前端 preflight 阶段关闭，因而一期不会误入队或扣点。

**Tech Stack:** Vite、React 19、TypeScript、@xyflow/react、Zustand canvas store、MenuSurface/MenuSelect/useDismissibleLayer、v2 AI model catalog、Vitest、Testing Library、Playwright、Sharp、FFmpeg。

---

## Scope And Invariants

- 真实 Seedance、Kling、Veo、Hailuo provider adapter、worker provider 请求映射和数量 settle 不在一期改动范围内。
- 只支持 video_generation 的路线进入创作者模型列表；video_editor_export 不能当作视频生成模型。
- 节点草稿只保存 asset id、node id、稳定预设 id、颜色 token、模式和数值参数；不保存签名 URL、Blob、File、base64、data: 或 blob:。
- 模型选择器不显示 provider、内部 route key、上游模型名、credential 或 base URL；不增加搜索框或供应商分组。
- 所有菜单复用共享 menu tokens，弹层通过 useDismissibleLayer 处理外部点击、Escape 和互斥关闭。
- 每个提交只暂存本任务文件，保留工作区其它未跟踪内容。

## File Map

### New source files

- src/flowCanvas/video/videoTypes.ts：模式、参数、能力、模型选项、阻断码和调色类型。
- src/flowCanvas/video/videoGenerationParams.ts 与测试：默认值、旧字段归一化、合法性校验、安全序列化。
- src/flowCanvas/video/videoGenerationCapabilities.ts 与测试：能力合并、选择校正、生成阻断。
- src/flowCanvas/video/videoModelCatalog.ts、useVideoGenerationCatalog.ts 与测试：v2 catalog 加载和创作者可见模型映射。
- src/flowCanvas/video/VideoModeMenu.tsx、VideoParameterPanel.tsx、VideoModelMenu.tsx 及对应测试。
- src/flowCanvas/video/VideoReferenceStrip.tsx、VideoPalettePopover.tsx、VideoHumanReviewControl.tsx 及对应测试。
- src/flowCanvas/video/videoCameraManifest.ts、VideoCameraLibrary.tsx 及对应测试。
- src/flowCanvas/video/VideoNodeComposer.tsx 与 VideoNodeComposer.test.tsx、VideoNodeLegacyComposer.tsx、videoComposerFeature.ts。
- src/flowCanvas/video/videoComposerDiagnostics.ts 与测试：脱敏的目录、资源、能力校正和 preflight 诊断事件。
- scripts/generate-video-camera-assets.mjs、scripts/generate-video-camera-assets.test.mjs。
- scripts/smoke-video-node.ts、scripts/smoke-video-node.test.ts。

### Modified source and operations files

- src/flowCanvas/nodes/FlowNodes.tsx：挂载新 composer，保留节点预览和 handles。
- src/flowCanvas/utils/nodeFactory.ts：video 默认参数。
- src/flowCanvas/utils/canonicalGraph.ts 与新测试：新字段保留、运行字段清理。
- src/flowCanvas/hooks/useRemoteFlowAutosave.test.tsx：新字段远程保存回归。
- src/services/v2AiModelCatalogApi.ts：扩展可选 video capability 类型。
- src/vite-env.d.ts、Dockerfile、docker-compose.staging.yml、docs/STAGING_ENV_TEMPLATE.md：VITE_VIDEO_COMPOSER_V2 发布开关。
- src/flowCanvas/utils/promptBarDensity.ts 与测试：composer 宽度/窄屏布局。
- package.json、PROJECT_RECORD.md：资源、smoke 脚本和交付记录。
- public/video-camera-library/manifest.v1.json 与 v1/ 下 23 对自有 WebP/WebM。

二期 provider、worker 和数据库文件在本计划中保持不变；后续扩展 VideoGenerationRequest 和服务端数量计费需要独立规格。

## Task 1: Establish The Video Data Contract

**Files:** videoTypes.ts、videoGenerationParams.ts、对应测试、nodeFactory.ts、canonicalGraph.test.ts、useRemoteFlowAutosave.test.tsx。

- [ ] Step 1: Write failing normalization tests. 覆盖旧 aspect_ratio、duration、hd/quality、n、batchCount、referenceLabels、模型别名和 asset/reference 字段保留；未知值必须设置 requiresUserCorrection。
- [ ] Step 2: Run the red test.

    npm test -- src/flowCanvas/video/videoGenerationParams.test.ts

  Expected: FAIL because the new contract files do not exist.
- [ ] Step 3: Add stable types and defaults. VideoGenerationParamsV1 必须包含以下字段：

    export type VideoGenerationMode =
      | "text_to_video"
      | "all_reference"
      | "image_to_video"
      | "first_last_frame"
      | "image_reference";

    export type VideoResolution = "480P" | "720P" | "1080P" | "4K";
    export type VideoAspectRatio = "auto" | "16:9" | "4:3" | "1:1" | "3:4" | "9:16" | "21:9";
    export type VideoCount = 1 | 2 | 4;

    export type VideoGenerationParamsV1 = {
      schemaVersion: 1;
      mode: VideoGenerationMode;
      aspectRatio: VideoAspectRatio;
      resolution: VideoResolution;
      durationSeconds: number;
      generateAudio: boolean;
      count: VideoCount;
      cameraMotionId: string | null;
      visualTone: string | null;
      contextPaletteRefs: Array<{
        role: string;
        source: { kind: "asset" | "upstream"; id: string };
        colorToken: string;
      }>;
      humanReview: {
        status: "not_required" | "required" | "verified" | "expired";
        verifiedAt?: string;
        verificationRef?: string;
      };
      referenceRolesByKey: Record<string, {
        role: "subject" | "scene" | "prop" | "style" | "first_frame" | "last_frame" | "reference";
        source: { kind: "asset" | "upstream"; id: string };
      } | null>;
    };

  默认值固定为 text_to_video、auto、720P、4 秒、无音频、数量 1、无运镜/色调、空调色引用、not_required。
- [ ] Step 4: Implement normalizeVideoGenerationParams(data) and sanitizeVideoGenerationParams(value). 旧 hd=true 映射 1080P；质量含 4k/1080/480 分别映射相应档位，其它值为 720P；数量 3 向上校正为 4；首尾标签同时出现时设置 first_last_frame；调用现有 normalizeVideoModelId；递归移除 blob:、data: 和签名 URL。函数必须幂等且不修改输入。
- [ ] Step 5: Integrate defaults and draft safety. 在 createFlowNode("video") 中写入 params.videoGeneration = createDefaultVideoGenerationParams()；canonical graph 测试证明新参数保留而 posterUrl、previewUrl、签名 URL 被清理；autosave 测试证明重新加载后 4K、时长、音频、数量恢复。
- [ ] Step 6: Verify and commit.

    npm test -- src/flowCanvas/video/videoGenerationParams.test.ts src/flowCanvas/utils/nodeFactory.test.ts src/flowCanvas/utils/canonicalGraph.test.ts src/flowCanvas/hooks/useRemoteFlowAutosave.test.tsx
    git add src/flowCanvas/video/videoTypes.ts src/flowCanvas/video/videoGenerationParams.ts src/flowCanvas/video/videoGenerationParams.test.ts src/flowCanvas/utils/nodeFactory.ts src/flowCanvas/utils/canonicalGraph.test.ts src/flowCanvas/hooks/useRemoteFlowAutosave.test.tsx
    git commit -m "feat: add video generation state contract"

## Task 2: Map V2 Catalog And Capability Gates

**Files:** videoGenerationCapabilities.ts、videoModelCatalog.ts、useVideoGenerationCatalog.ts 及测试；v2AiModelCatalogApi.ts。

- [ ] Step 1: Write fixtures and red tests. Fixture 必须包含 generation route（supportedVideoWorkflows: ["video_generation"]）、editor-only route（["video_editor_export"]）和无价格 route。断言 editor-only route 不进入模型选项，provider/route key 不在可渲染字段中。
- [ ] Step 2: Run the red tests.

    npm test -- src/flowCanvas/video/videoGenerationCapabilities.test.ts src/flowCanvas/video/videoModelCatalog.test.ts

- [ ] Step 3: Add capability types and safe defaults. 增加 VideoGenerationCapabilities 和阻断码：CATALOG_LOADING、NO_VIDEO_GENERATION_ROUTE、PRICING_NOT_FOUND、UNSUPPORTED_MODE、UNSUPPORTED_ASPECT_RATIO、UNSUPPORTED_RESOLUTION、UNSUPPORTED_AUDIO、UNSUPPORTED_COUNT、HUMAN_REVIEW_REQUIRED。缺失能力时 UI 可编辑默认值为七种比例、四档清晰度、4-8 秒和 1/2/4，但 confirmedByRoute=false。
- [ ] Step 4: Implement capability merge/correction/blocker。mergeVideoCapabilities 只返回新对象；correctVideoGenerationParams 返回校正后的参数与诊断；getVideoGenerationBlocker 依次检查路线、价格、模式、比例、清晰度、音频、数量和真人验证：

    if (option === null) return "NO_VIDEO_GENERATION_ROUTE";
    if (!option.capabilities.confirmedByRoute) return "NO_VIDEO_GENERATION_ROUTE";
    if (option.blocker) return option.blocker;
    if (!option.capabilities.supportedModes.includes(params.mode)) return "UNSUPPORTED_MODE";
    if (!option.capabilities.aspectRatios.includes(params.aspectRatio)) return "UNSUPPORTED_ASPECT_RATIO";
    if (!option.capabilities.resolutions.includes(params.resolution)) return "UNSUPPORTED_RESOLUTION";
    if (!option.capabilities.supportsAudio && params.generateAudio) return "UNSUPPORTED_AUDIO";
    if (params.count > option.capabilities.maxCount) return "UNSUPPORTED_COUNT";
    if (option.capabilities.supportsHumanReview && params.humanReview.status !== "verified") return "HUMAN_REVIEW_REQUIRED";
    return null;

- [ ] Step 5: Implement catalog mapper and hook。toVideoModelOptions 调用 listAiModelCatalog("video") 和 listAiModelRoutes(modelKey)，只返回 active 且含 generation route 的产品模型；描述来自 uiSchema.description 或 capability description，预计耗时来自 estimatedDurationLabel，价格来自 estimated/min charge。hook 缓存同一 modality 请求，返回 models/loading/error/retry，失败不注入 mock。
- [ ] Step 6: Extend API typing and verify。将 AiModelCatalogRoute.capabilities 改为 Record<string, unknown> 与可选 video 字段的交叉类型，保持现有 API URL 测试不变。

    npm test -- src/flowCanvas/video/videoGenerationCapabilities.test.ts src/flowCanvas/video/videoModelCatalog.test.ts src/flowCanvas/video/useVideoGenerationCatalog.test.tsx src/services/v2AiModelCatalogApi.test.ts
    git add src/flowCanvas/video/videoTypes.ts src/flowCanvas/video/videoGenerationCapabilities.ts src/flowCanvas/video/videoGenerationCapabilities.test.ts src/flowCanvas/video/videoModelCatalog.ts src/flowCanvas/video/videoModelCatalog.test.ts src/flowCanvas/video/useVideoGenerationCatalog.ts src/flowCanvas/video/useVideoGenerationCatalog.test.tsx src/services/v2AiModelCatalogApi.ts src/services/v2AiModelCatalogApi.test.ts
    git commit -m "feat: add video model capability catalog"

## Task 3: Build Mode And Parameter Controls

**Files:** VideoModeMenu.tsx、VideoModeMenu.test.tsx、VideoParameterPanel.tsx、VideoParameterPanel.test.tsx。

- [ ] Step 1: Write interaction tests。模式测试断言五行、选中 first_last_frame 后显示首帧/尾帧；参数测试断言 4K、range slider、数字输入、音频 switch tooltip 和数量 1/2/4。
- [ ] Step 2: Run red tests。

    npm test -- src/flowCanvas/video/VideoModeMenu.test.tsx src/flowCanvas/video/VideoParameterPanel.test.tsx

- [ ] Step 3: Implement VideoModeMenu。使用 MenuSurface、共享 menu classes 和 useDismissibleLayer("video-mode-menu")；五行使用 menuitemradio、aria-checked、38px 高度；不支持项 disabled 并显示原因。
- [ ] Step 4: Implement VideoParameterPanel。比例、清晰度、数量使用 MenuSelect；时长使用 range + number；音频使用 role="switch"。输入经过 correctVideoGenerationParams，数字在 blur/Enter 时按 min/max/step 钳制；完整渲染 480P、720P、1080P、4K。
- [ ] Step 5: Verify and commit。

    npm test -- src/flowCanvas/video/VideoModeMenu.test.tsx src/flowCanvas/video/VideoParameterPanel.test.tsx src/components/menu/MenuSelect.test.tsx
    git add src/flowCanvas/video/VideoModeMenu.tsx src/flowCanvas/video/VideoModeMenu.test.tsx src/flowCanvas/video/VideoParameterPanel.tsx src/flowCanvas/video/VideoParameterPanel.test.tsx
    git commit -m "feat: add video mode and parameter controls"

## Task 4: Build The LibTV Model Picker

**Files:** VideoModelMenu.tsx、VideoModelMenu.test.tsx。

- [ ] Step 1: Write red list tests。默认行只显示产品名和 ETA；mouseenter、focus 或 selected 才显示描述；断言无 searchbox、无 provider、无 route key；错误态提供重试且不注入 Mock。
- [ ] Step 2: Run red test。

    npm test -- src/flowCanvas/video/VideoModelMenu.test.tsx

- [ ] Step 3: Implement fixed-density list。Props 为 options/value/loading/error/onRetry/onChange；使用 MenuSurface、role=listbox、role=option、38px 行高、30px 图标盒、12px 主标签、9px 辅助标签。键盘支持上下、Home、End、Enter、Escape；描述最长两行并用 aria-describedby 提供完整文本；loading 使用不改变菜单高度的骨架行，颜色之外同时使用勾选、禁用图标和文字。
- [ ] Step 4: Verify and commit。

    npm test -- src/flowCanvas/video/VideoModelMenu.test.tsx src/flowCanvas/video/videoModelCatalog.test.ts
    git add src/flowCanvas/video/VideoModelMenu.tsx src/flowCanvas/video/VideoModelMenu.test.tsx
    git commit -m "feat: add LibTV video model picker"

## Task 5: Add References, Palettes, And Human Review

**Files:** VideoReferenceStrip.tsx、VideoPalettePopover.tsx、VideoHumanReviewControl.tsx 及对应测试；必要时只扩展 ReferenceSourcePicker.tsx 的 role label prop，保持现有 image callers 不变。

- [ ] Step 1: Write red state tests。断言角色映射不改变 asset order；上下文调色只改 contextPaletteRefs；视觉色调只改 visualTone；真人验证四种状态分别显示/阻断。
- [ ] Step 2: Run red tests。

    npm test -- src/flowCanvas/video/VideoReferenceStrip.test.tsx src/flowCanvas/video/VideoPalettePopover.test.tsx src/flowCanvas/video/VideoHumanReviewControl.test.tsx

- [ ] Step 3: Implement VideoReferenceStrip。复用现有 ReferenceSourcePicker；按模式显示 subject/scene/prop/style/first_frame/last_frame/reference 槽位；选择 asset 更新 referenceAssetItemIds、referenceOrder 和 referenceRolesByKey；移除写入 null，不删除素材资产。
- [ ] Step 4: Implement VideoPalettePopover。上下文盘只编辑 contextPaletteRefs；视觉预设固定为 neutral、cinematic_teal、warm_sunset、cool_moonlight、monochrome；无角色数据时显示空状态。
- [ ] Step 5: Implement VideoHumanReviewControl。not_required 隐藏入口；required/expired 显示完成验证；verified 显示时间和重新验证；不接收身份原始资料或密钥。
- [ ] Step 6: Verify and commit。

    npm test -- src/flowCanvas/video/VideoReferenceStrip.test.tsx src/flowCanvas/video/VideoPalettePopover.test.tsx src/flowCanvas/video/VideoHumanReviewControl.test.tsx src/flowCanvas/nodes/ReferenceSourcePicker.test.tsx
    git add src/flowCanvas/video/VideoReferenceStrip.tsx src/flowCanvas/video/VideoReferenceStrip.test.tsx src/flowCanvas/video/VideoPalettePopover.tsx src/flowCanvas/video/VideoPalettePopover.test.tsx src/flowCanvas/video/VideoHumanReviewControl.tsx src/flowCanvas/video/VideoHumanReviewControl.test.tsx src/flowCanvas/nodes/ReferenceSourcePicker.tsx src/flowCanvas/nodes/ReferenceSourcePicker.test.tsx
    git commit -m "feat: add video references palettes and review state"

## Task 6: Create Original Camera Preview Assets

**Files:** scripts/generate-video-camera-assets.mjs、scripts/generate-video-camera-assets.test.mjs、src/flowCanvas/video/videoCameraManifest.ts、src/flowCanvas/video/videoCameraManifest.test.ts、public/video-camera-library/manifest.v1.json、public/video-camera-library/v1/ 下 CAMERA_IDS 对应的 23 个同名 WebP 和 23 个同名 WebM、package.json。

- [ ] Step 1: Write asset manifest red test。ID 集合严格等于：

    const CAMERA_IDS = [
      "fixed", "follow", "spiral-up", "spiral-down", "tilt-up", "tilt-down",
      "pan-left", "pan-right", "crane-up", "crane-down", "truck-left", "truck-right",
      "dolly-in", "dolly-out", "zoom-in", "zoom-out", "dolly-zoom", "orbit", "roll",
      "fpv", "drone", "aerial", "handheld",
    ];

  每项必须有 WebP poster、WebM preview、中文 label、2000-4000ms、version 1、attribution: "TapFlow original"，并拒绝零字节文件。
- [ ] Step 2: Run the red asset test。

    node --test scripts/generate-video-camera-assets.test.mjs

- [ ] Step 3: Implement deterministic original media generation。使用 root 已有 Sharp 和系统 ffmpeg：绘制 320x180 深色网格、彩色圆柱、道具和光源的原创基准场景；每个 ID 生成 60 帧/24fps/2.5 秒，首帧 WebP，全部帧编码为静音 VP9 WebM。动作 profile 必须覆盖 fixed、follow、spiral up/down、tilt、pan、crane、truck、dolly、zoom、dolly-zoom、orbit、roll、fpv、drone、aerial、handheld；不读取外部网站媒体。
- [ ] Step 4: Add commands and manifest loader。package.json 增加 assets:video-camera 和 test:video-camera-assets；实现 loadVideoCameraManifest、getCameraMotionById 和坏卡片过滤。运行：

    npm run assets:video-camera
    npm run test:video-camera-assets
    npm test -- src/flowCanvas/video/videoCameraManifest.test.ts

- [ ] Step 5: Verify generated assets and commit。

    git diff --check
    git add package.json scripts/generate-video-camera-assets.mjs scripts/generate-video-camera-assets.test.mjs src/flowCanvas/video/videoCameraManifest.ts src/flowCanvas/video/videoCameraManifest.test.ts public/video-camera-library
    git commit -m "feat: add original video camera preview assets"

## Task 7: Build The Camera Library Overlay

**Files:** VideoCameraLibrary.tsx、VideoCameraLibrary.test.tsx。

- [ ] Step 1: Write red interaction tests。选择卡片后只更新临时 state；点击“使用”才回调 cameraMotionId；搜索过滤不改 ID；清除、外部点击、Escape 关闭；关闭时 video pause/currentTime=0。
- [ ] Step 2: Run red test。

    npm test -- src/flowCanvas/video/VideoCameraLibrary.test.tsx

- [ ] Step 3: Implement the overlay。用 createPortal(document.body)、role=dialog、useDismissibleLayer("video-camera-library")；顶部三 tabs，中间桌面四列 CSS grid，底部当前选择/清除/使用；我的收藏只显示本地收藏 ID，我的运镜无数据时显示空状态。卡片 video 必须 muted、playsInline、loop、poster；IntersectionObserver 最多四个同时播放；prefers-reduced-motion 时只显示海报；关闭立即暂停、清理 observer，并把焦点返回运镜触发按钮。
- [ ] Step 4: Verify and commit。

    npm test -- src/flowCanvas/video/VideoCameraLibrary.test.tsx src/flowCanvas/video/videoCameraManifest.test.ts src/components/menu/useDismissibleLayer.test.tsx
    git add src/flowCanvas/video/VideoCameraLibrary.tsx src/flowCanvas/video/VideoCameraLibrary.test.tsx
    git commit -m "feat: add video camera library overlay"

## Task 8: Assemble The Composer And Replace The Toolbar

**Files:** VideoNodeComposer.tsx、VideoNodeLegacyComposer.tsx、videoComposerFeature.ts、对应测试、FlowNodes.tsx、promptBarDensity.ts 及测试。

- [ ] Step 1: Extract current video toolbar unchanged。将现有 video FloatingPromptBar JSX 移入 VideoNodeLegacyComposer，props 固定为 nodeId/data/onUpdate/onGenerate/generating；先挂回旧路径并运行现有 video node tests，保证抽取无行为变化。
- [ ] Step 2: Write composer integration tests。选中才显示 composer；未选中不显示 prompt/model/mode/parameter controls；提示词写入 generationPrompt；打开模型后打开参数会关闭模型层；无真实数据路径的标记/特效/人物库不渲染。
- [ ] Step 3: Implement the composer。顺序固定为参考入口、模式/运镜、提示词、底部模型/参数/调色/验证/成本/生成；每个 compact layer 使用唯一 dismissible key，关闭后焦点返回触发按钮；成本来自 catalog，null/0 显示“未配置”；图标使用 lucide。已有 asset-backed 结果继续从节点预览恢复，多结果沿用 generatedResults 和 activeResultIndex，不把临时 URL 写入 composer state patch。
- [ ] Step 4: Add feature flag and responsive density。videoComposerFeature.ts 导出：

    export const VIDEO_COMPOSER_V2_ENABLED =
      String(import.meta.env.VITE_VIDEO_COMPOSER_V2 ?? "true").toLowerCase() !== "false";

  video prompt bar 使用 clamp(640px, 52vw, 980px)，窄屏改为 stacked，不改变节点尺寸。
- [ ] Step 5: Wire the node branch。VITE_VIDEO_COMPOSER_V2=true 挂载 VideoNodeComposer；false 挂载 VideoNodeLegacyComposer。移除旧 video 组件中的 useVideoModelCatalog、静态首尾帧、高清和硬编码 112 点数 JSX；保留 legacy 文件用于回滚。
- [ ] Step 6: Verify and commit。

    npm test -- src/flowCanvas/video/VideoNodeComposer.test.tsx src/flowCanvas/utils/promptBarDensity.test.ts src/flowCanvas/nodes/FlowNodes.agent-metadata.test.tsx
    npm run build
    git add src/flowCanvas/video/VideoNodeComposer.tsx src/flowCanvas/video/VideoNodeComposer.test.tsx src/flowCanvas/video/VideoNodeLegacyComposer.tsx src/flowCanvas/video/videoComposerFeature.ts src/flowCanvas/nodes/FlowNodes.tsx src/flowCanvas/utils/promptBarDensity.ts src/flowCanvas/utils/promptBarDensity.test.ts
    git commit -m "feat: assemble LibTV video composer"

## Task 9: Gate Generation And Wire Rollout Configuration

**Files:** FlowNodes.tsx、videoGenerationCapabilities.ts 及测试、videoComposerDiagnostics.ts 及测试、canonicalGraph.ts 及测试、vite-env.d.ts、Dockerfile、docker-compose.staging.yml、docs/STAGING_ENV_TEMPLATE.md。

- [ ] Step 1: Write red gate and diagnostics tests。对 editor-only/no-price option 断言 getVideoGenerationBlocker 返回正确 code；渲染节点断言不再出现 112，点击生成不调用 runBackendWorkflow，页面显示“未配置”或未接入文案。诊断测试只允许 catalog_error、manifest_error、capability_corrected、preflight_blocked 事件及 modelId/motionId/errorCode，拒绝 prompt、provider、routeKey、签名 URL 和 secret 字段。
- [ ] Step 2: Run red tests。

    npm test -- src/flowCanvas/video/videoGenerationCapabilities.test.ts src/flowCanvas/video/videoComposerDiagnostics.test.ts src/flowCanvas/nodes/FlowNodes.agent-metadata.test.tsx

- [ ] Step 3: Implement the fail-closed handler and diagnostics boundary。生成前规范化参数并调用 getVideoGenerationBlocker；有 blocker 时写入 errorCode/errorMessage/generationStatus/status、发出脱敏 preflight_blocked 事件并 return；只有无 blocker 才调用现有 v2 runner。catalog/manifest 加载失败和能力校正分别发出对应事件；前端不自行 reserve credits。
- [ ] Step 4: Wire build flag and draft safety。Dockerfile 增加 ARG VITE_VIDEO_COMPOSER_V2=true 和对应 ENV；compose frontend build args 使用 VITE_VIDEO_COMPOSER_V2 默认 true；模板记录关闭开关的回滚命令；canonical graph 保留新参数、清理运行 URL。
- [ ] Step 5: Verify and commit。

    npm test -- src/flowCanvas/video/videoGenerationCapabilities.test.ts src/flowCanvas/video/videoComposerDiagnostics.test.ts src/flowCanvas/nodes/FlowNodes.agent-metadata.test.tsx src/flowCanvas/utils/canonicalGraph.test.ts src/flowCanvas/hooks/useRemoteFlowAutosave.test.tsx
    npm run build
    git add src/flowCanvas/nodes/FlowNodes.tsx src/flowCanvas/video/videoGenerationCapabilities.ts src/flowCanvas/video/videoGenerationCapabilities.test.ts src/flowCanvas/video/videoComposerDiagnostics.ts src/flowCanvas/video/videoComposerDiagnostics.test.ts src/flowCanvas/utils/canonicalGraph.ts src/flowCanvas/utils/canonicalGraph.test.ts src/vite-env.d.ts Dockerfile docker-compose.staging.yml docs/STAGING_ENV_TEMPLATE.md
    git commit -m "feat: gate video generation and expose rollout flag"

## Task 10: Browser Smoke, Project Record, And Release Verification

**Files:** smoke-video-node.ts、测试、package.json、PROJECT_RECORD.md。

- [ ] Step 1: Add smoke contract test。结果类型固定包含 composerVisible、modelMenuNoSearch、cameraGridColumns、resolutionOptions、cameraPresetCount、blockedGenerationDidNotCreateRun；默认 URL 为 http://localhost:5188，截图目录为 output/playwright/video-node。
- [ ] Step 2: Implement Playwright smoke。脚本按现有 smoke-production-studios 模式在 output/playwright/video-node/ 生成 Vite smoke HTML，使用真实 VideoNodeComponent、flow store 和 XYFlow 测试 harness，不需要登录或真实 API；在空闲端口启动/关闭 Vite。桌面 1440x900、窄桌面 1024x768、移动 390x844 验证 composer、无模型搜索、hover 描述、4K、时长、音频、1/2/4、桌面运镜四列和 23 卡片；额外模拟 prefers-reduced-motion 并断言卡片不自动播放；选无 generation route 的模型点击生成后，runBackendWorkflow 调用计数必须为 0；输出 JSON 与截图，并检查长模型名、按钮和相邻控件不重叠。
- [ ] Step 3: Add scripts and run focused smoke。在 package.json 增加 smoke:video-node 和 test:smoke-video-node。

    npm test -- scripts/smoke-video-node.test.ts src/flowCanvas/video/VideoNodeComposer.test.tsx src/flowCanvas/video/VideoCameraLibrary.test.tsx src/flowCanvas/video/VideoModelMenu.test.tsx src/flowCanvas/video/VideoParameterPanel.test.tsx
    npm run smoke:video-node

  本地 API/登录缺失时保留具体 URL、状态码和未完成步骤，不把 smoke 误报为通过。
- [ ] Step 4: Run repository validation。

    npm run test:video-camera-assets
    npm test -- src/flowCanvas/video src/flowCanvas/nodes/FlowNodes.agent-metadata.test.tsx src/flowCanvas/utils/canonicalGraph.test.ts src/flowCanvas/hooks/useRemoteFlowAutosave.test.tsx src/services/v2AiModelCatalogApi.test.ts scripts/smoke-video-node.test.ts
    npm run build

  Expected: listed tests pass and Vite build exits 0；本期未修改 worker/API/database/billing/provider，所以不额外运行后端 workspace suites。
- [ ] Step 5: Verify the affected main flow with local v2 infrastructure。启动 npm run dev:infra、npm run dev:api、npm run dev:worker、npm run dev，在 /projects/:projectId 创建并选中 video 节点，复验新 composer、草稿自动保存和刷新恢复；停止本任务启动的进程，保留截图和具体失败原因。
- [ ] Step 6: Update PROJECT_RECORD.md。记录日期、状态契约、v2 catalog 过滤、五种模式、4K、两类调色盘、23 个自有运镜预览、真实 provider/数量计费二期边界和实际验证结果；失败项写出完整命令与原因。
- [ ] Step 7: Inspect and commit。

    git diff --check
    git status --short
    git diff --stat HEAD~1
    git add scripts/smoke-video-node.ts scripts/smoke-video-node.test.ts package.json PROJECT_RECORD.md
    git commit -m "test: verify LibTV video node workflow"

## Requirement Coverage Review

| 规格要求 | 计划任务 |
| --- | --- |
| 五种模式和参考角色 | Task 1、Task 3、Task 5 |
| 比例、480P/720P/1080P/4K、时长、音频、1/2/4 | Task 1、Task 3 |
| LibTV 模型列表、无搜索、hover/selected 描述 | Task 2、Task 4 |
| v2 catalog、provider 隔离、缺失能力 fail closed | Task 2、Task 9 |
| 23 个运镜 ID、独立 WebM/WebP、四列浮层 | Task 6、Task 7 |
| 上下文调色盘与视觉色调预设 | Task 5 |
| 真人验证状态与生成前阻断 | Task 5、Task 9 |
| params.videoGeneration、旧字段归一化、asset id 持久化 | Task 1、Task 9 |
| 菜单密度、外部点击、Escape、互斥层、键盘 | Task 3、Task 4、Task 7、Task 8 |
| 一期不接真实 provider、不误扣点 | Scope、Task 2、Task 9 |
| loading/error/success、响应式和性能 | Task 2、Task 7、Task 8、Task 10 |
| 脱敏诊断事件和 reduced-motion | Task 7、Task 9、Task 10 |
| 项目记录、构建和浏览器验收 | Task 10 |

## Execution Notes

- 执行时先创建隔离 worktree，再按 Task 1 到 Task 10 顺序推进；每个任务的提交是下一个任务的检查点。
- 需要真实 API、登录或 ffmpeg 时，先运行任务列出的本地准备命令，并在交付记录中保存实际失败原因；不要用静态结果替代浏览器 smoke 的关键断言。
- 任何需要扩展 apps/worker、apps/api、数据库 migration、provider manifest 或 billing 数量语义的需求，都停止在本计划边界并另写二期规格，不在本分支扩大范围。
