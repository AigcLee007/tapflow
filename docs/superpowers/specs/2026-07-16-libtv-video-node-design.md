# LibTV 风格视频节点设计规格

状态：待用户审阅
日期：2026-07-16
适用范围：TapFlow v2 无限画布中的 `video` 节点
一期目标：完成 UI 与交互、远程草稿持久化、模型/能力展示和本地预览资源；真实 Seedance、Kling、Veo 等视频 provider adapter 延后到二期。

## 1. 决策摘要

视频节点采用 Liblib/LibTV 的“轻量预览节点 + 选中态宽工作台”结构。未选中时节点只承担画布定位、预览和连线；选中后在节点下方显示 composer，用户在同一工作台完成模式、参考素材、运镜、调色、模型、参数和生成操作。

一期确认的交互规则：

- 五种生成模式：`text_to_video`、`all_reference`、`image_to_video`、`first_last_frame`、`image_reference`。
- 参数包括比例、清晰度、时长、音频和生成数量。清晰度必须提供 `480P`、`720P`、`1080P`、`4K`。
- 运镜库使用大尺寸视口浮层，四列卡片网格，卡片播放独立的静音短视频预览；节点只保存稳定的 `cameraMotionId`。
- 模型选择使用 LibTV 风格的普通滚动列表，不提供搜索框和分组。默认行只显示模型名称与预计耗时；鼠标悬浮或当前选中时才显示模型介绍。
- 同时提供两种调色能力：连接素材身份用的上下文调色盘，以及画面色调用的视觉色调预设。
- 参考、标记、特效、人物库等按钮只有在一期存在真实数据路径时才显示；没有实现路径的能力不以静态假按钮占位。
- 所有弹层支持点击外部关闭、`Escape` 关闭和互斥关闭，并沿用共享菜单密度和 `useDismissibleLayer`。

## 2. 背景与范围

### 2.1 当前问题

当前 `VideoNodeComponent` 位于 `src/flowCanvas/nodes/FlowNodes.tsx`，节点预览和提示词栏已经存在，但模型、首尾帧、高清、点数等内容主要是静态或旧目录驱动：

- 旧目录来自 `src/config/videoModels.ts` 和 `/api/video-models/catalog`，没有与 v2 模型目录的能力、线路和计价统一。
- `params.aspect_ratio`、`params.duration` 和 `batchCount` 是未版本化的散字段，无法可靠表达模式、清晰度、音频、运镜和调色。
- 当前视频请求构造只传 prompt、route 和输入素材，视频参数不会完整传给 worker/provider。
- 生成数量可写入节点，但现有视频计费和执行语义仍按单个结果处理。
- 首尾帧、上传和点数控件不能代表一期必须提供的真实能力。

### 2.2 一期包含

1. 选中态 composer 的布局、视觉层级、展开/收起和键盘交互。
2. 五种模式的选择与模式相关的参考角色槽位。
3. 运镜库的 23 个稳定预设、静音循环预览、海报图、收藏/选择状态和应用行为。
4. LibTV 风格模型列表、模型说明、预计耗时、当前选择和能力不兼容提示。
5. 参数面板、4K 选项、时长滑杆与数字输入、音频开关和数量选择。
6. 上下文调色盘、视觉色调预设和真人验证状态的 UI 与持久化字段。
7. v2 草稿 autosave、旧节点归一化、不可持久化字段清理和 focused tests。
8. 对当前已存在的 mock/local 视频路线保持可用；对没有真实 adapter 的生产模型显示明确的未接入状态，不发起虚假的计费或 provider 请求。

### 2.3 一期不包含

- 新增或接入 Seedance、Kling、Veo、Hailuo 等真实 provider adapter。
- 复制 DramaClaw、Liblib 或其他第三方的代码、视频、海报、商标或受版权约束的素材。
- 服务端视频任务 schema、provider 请求字段、数量计费的最终实现；这些属于二期，但一期必须留下稳定的状态契约和 preflight 边界。
- 将签名 URL、`Blob`、`File`、base64、`data:` 或 `blob:` 写入 flow draft。
- 把模型供应商、内部 route key、credential、base URL 暴露给普通创作者。

## 3. 参考与约束

行为参考：

- [Liblib.tv](https://www.liblib.tv/) 的视频创作工作台：预览节点、宽 composer、模式/模型/参数层级和大浮层选择器。
- [dramaclaw/dramaclaw](https://github.com/dramaclaw/dramaclaw)：运镜卡片、动效预览、模式组织和调色思路。该项目采用 Elastic License 2.0，一期只参考行为，不复制实现或媒体资源。

现有代码约束：

- 节点类型和数据定义：`src/flowCanvas/types.ts`、`src/flowCanvas/nodes/FlowNodes.tsx`。
- v2 运行和计费预检：`src/flowCanvas/runtime/v2WorkflowRunner.ts`、`apps/api/src/modules/workflow-runs/`。
- worker 视频请求：`apps/worker/src/workflow-runtime/service.ts`。
- AI Gateway 请求类型：`packages/ai-gateway-core/src/types.ts`。
- v2 模型目录：`src/services/v2AiModelCatalogApi.ts`。
- 菜单密度和弹层：`src/components/menu/menuStyles.ts`、`src/components/menu/MenuSurface.tsx`、`src/components/menu/MenuSelect.tsx`、`src/components/menu/useDismissibleLayer.ts`、`src/flowCanvas/canvas/menuTokens.ts`。
- 草稿 autosave：`src/flowCanvas/hooks/useRemoteFlowAutosave.ts` 和 `src/flowCanvas/utils/canonicalGraph.ts`。

## 4. 信息架构与布局

### 4.1 未选中节点

- 预览区域保持独立、可拖动和可连线，尺寸由当前比例决定，最小尺寸沿用媒体节点的稳定约束。
- 有输出时显示 asset-backed 视频预览；没有输出时显示中性占位，不渲染假进度或假结果。
- 节点标题、输入/输出 handle 和错误状态保留现有画布语义。
- 不选中时不显示 composer，避免每个视频节点都占用画布空间。

### 4.2 选中态 composer

composer 使用相对节点定位的宽工作台，必要时通过 portal 放到视口层，避免被画布裁剪。区域顺序固定为：

1. 顶部参考入口：`+参考`、已绑定参考缩略图/角色标签，以及只在有实现路径时出现的标记、特效、人物库入口。
2. 模式入口：当前模式名称和模式图标；打开后显示五种模式的说明及所需参考角色。
3. 运镜入口：当前运镜名称或“未选择运镜”；打开大运镜库。
4. 提示词编辑区：多行输入，支持 `@` 引用已绑定素材的可读名称，不写入临时 URL。
5. 底部操作行：模型、模式摘要、参数摘要、上下文调色盘、视觉色调、真人验证、点数、生成按钮。

工作台必须给画布下方内容留下可见空间；在窄视口中可切换为垂直底部面板，但不改变节点的源数据结构。固定尺寸控件使用 `min-height`、`aspect-ratio` 或网格轨道，避免长模型名、加载文案或悬浮图标改变布局。

### 4.3 展开面板

- 模式、模型、参数、调色和真人验证是互斥的紧凑菜单；同时只允许一个菜单层打开。
- 运镜库是独立的大浮层，不嵌套在小菜单中。
- 面板打开时，焦点进入面板的当前项；关闭后焦点返回触发按钮。
- 所有菜单行遵循共享 token：38px 行高、12px 主标签、9px 辅助标签、7px 行间距、30px 图标盒、16px 表面圆角。

## 5. 生成模式与参考素材

### 5.1 模式清单

| 稳定 ID | 中文标签 | 说明 | 默认参考角色 |
| --- | --- | --- | --- |
| `text_to_video` | 文生视频 | 只使用提示词和可选风格设置 | 无 |
| `all_reference` | 全能参考 | 允许人物、场景、物品和视频参考共同参与 | `subject`、`scene`、`prop`、`style` |
| `image_to_video` | 图生视频 | 将一个主图作为画面起点 | `subject` |
| `first_last_frame` | 首尾帧 | 分别绑定首帧和尾帧，保持两帧间的运动连续 | `first_frame`、`last_frame` |
| `image_reference` | 图片参考 | 使用一至多个图片参考，但不承诺首尾帧语义 | `reference` |

模式选择器的每行显示图标、主标签、9px 辅助说明和选中标记。选择模式后：

- 参考槽位按模式重排，并保留已有 asset id；无法映射的旧引用进入“未分配参考”区域，不静默删除。
- 不兼容的运镜、比例、清晰度或音频能力显示为禁用并给出原因；不自动发起生成。
- 模式改变只更新节点数据，autosave 仍由现有远程草稿机制处理。

### 5.2 参考数据规则

参考素材的权威字段继续使用 `referenceAssetItemIds` 和 `referenceOrder`。角色映射存于 `referenceRolesByKey`，值只能是 asset id、上游 node id 或空值。预览层可以读取短期签名 URL，但这些 URL 只能存在于 React 状态或 asset 服务缓存中。

拖入或选择参考时，UI 显示素材名称、类型和角色；失败时保留槽位并显示可重试状态。移除角色不会删除素材库资产，也不会删除其它模式仍在使用的引用。

## 6. 运镜库

### 6.1 交互

点击“运镜”打开视口级浮层：顶部为标题、标签页和关闭按钮，中间为可滚动的四列网格，底部显示当前选择、清除和使用。第一期标签页为“运镜广场”“我的收藏”“我的运镜”；“我的运镜”在没有数据时显示空状态，而不是假卡片。

默认允许按名称筛选运镜；筛选只影响展示，不改变已选 ID。点击卡片选中，悬浮或聚焦时播放静音短预览；离开视口后暂停并回到海报帧。选择“使用”才将 `cameraMotionId` 写入节点，关闭或 `Escape` 不提交未确认选择。

卡片要求：

- 预览区域固定 16:9 或由 manifest 指定的稳定比例，带 WebP 海报和独立 WebM/MP4 预览。
- 视频必须 `muted`、`playsInline`、循环播放，不显示浏览器控制条。
- 提供播放/暂停可见状态和键盘可访问的名称；尊重 `prefers-reduced-motion`，减少动态播放时使用海报帧。
- 不能把第三方网站 iframe 或远程页面当作卡片预览。

### 6.2 一期预设目录

预设 ID 必须稳定，显示名可以随文案调整但不得改变 ID：

`fixed` 固定镜头、`follow` 跟随拍摄、`spiral-up` 盘旋抬升、`spiral-down` 盘旋下降、`tilt-up` 镜头上摇、`tilt-down` 镜头下摇、`pan-left` 镜头左摇、`pan-right` 镜头右摇、`crane-up` 镜头上升、`crane-down` 镜头下降、`truck-left` 镜头左移、`truck-right` 镜头右移、`dolly-in` 镜头前推、`dolly-out` 镜头后移、`zoom-in` 变焦推进、`zoom-out` 变焦拉远、`dolly-zoom` 希区柯克变焦、`orbit` 环绕拍摄、`roll` 滚筒旋转、`fpv` 第一视角、`drone` 无人机拍摄、`aerial` 高空航拍、`handheld` 手持拍摄。

资源放在版本化的本地 manifest 下，例如 `public/video-camera-library/manifest.v1.json`，manifest 至少包含 `id`、`label`、`posterUrl`、`previewUrl`、`durationMs`、`attribution` 和 `version`。资源必须由项目团队自行制作、授权或生成；不得从 DramaClaw/Liblib 直接复制。加载失败的单卡片显示海报和重试，不阻塞整个运镜库。

## 7. 模型选择

### 7.1 视觉与交互

模型菜单为 LibTV 风格的普通滚动列表：无搜索框、无供应商分组、无内部线路分组。每行高度固定为 38px，左侧为 30px 图标盒，中间为模型产品名，右侧可显示 `2min` 等预计耗时和选中勾。

未悬浮、未选中的行只显示产品名和预计耗时；鼠标悬浮、键盘聚焦或当前选中行才展开同一行的模型介绍。介绍最长两行，溢出截断并通过 `aria-describedby` 提供完整文本。列表支持滚动、上下键、`Home`/`End` 和 `Enter` 选择。

普通用户只看到产品模型显示名，例如“Seedance 2.0 Fast”，不显示 provider、`routeKey`、上游模型名、credential 或 base URL。预计耗时是目录返回的展示字段，缺失时隐藏而不是显示猜测值。

### 7.2 目录与能力来源

新组件使用 v2 模型目录 API：`listAiModelCatalog("video")` 和选中模型的 `listAiModelRoutes(modelKey)`。只展示 `status=active`、`modality=video` 且至少有一个可用路线的产品模型。默认路线由 `defaultRouteKey` 解析；路线选择留在服务端和管理员面，不在创作者菜单中暴露。

模型目录的 `capabilities`、路线 `capabilities` 和 `uiSchema` 汇总为下列前端能力契约：

```ts
type VideoGenerationCapabilities = {
  supportedModes: VideoGenerationMode[];
  aspectRatios: string[];
  resolutions: Array<"480P" | "720P" | "1080P" | "4K">;
  duration: { minSeconds: number; maxSeconds: number; stepSeconds: number };
  supportsAudio: boolean;
  maxReferenceCount: number;
  maxCount: number;
  cameraMotionIds: string[];
  visualToneIds: string[];
  supportsHumanReview: boolean;
  estimatedDurationLabel?: string;
};
```

契约缺失时使用安全的 UI 默认值，但生成 preflight 必须把缺失能力视为“不支持”，不能借默认值绕过服务端校验。模型切换后只自动校正当前选择到可用值，并在面板中提示发生了校正。

## 8. 参数面板

参数面板打开后按以下顺序呈现，所有选择都即时写入节点状态：

1. **比例**：`Auto`、`16:9`、`4:3`、`1:1`、`3:4`、`9:16`、`21:9`。`Auto` 不强行改变已有预览尺寸，首次生成时由路线决定。
2. **清晰度**：`480P`、`720P`、`1080P`、`4K`。不可用项显示禁用态和能力原因；4K 是正式选项，不以“高清”替代。
3. **时长**：滑杆和数字秒数输入并列。滑杆使用模型契约的最小值、最大值和步进；数字输入在失焦/回车时钳制到合法范围，并显示秒单位。
4. **音频**：二态开关，文案为“生成音频”。悬浮和聚焦 tooltip 为“为生成的视频添加音频内容”。模型不支持音频时开关禁用并说明原因。
5. **数量**：`1`、`2`、`4`。使用共享菜单样式，不使用当前临时的 `3x` 选项。选中数量只改变预期结果数量，不在一期假装改变服务端计费。

底部摘要按稳定顺序显示当前模式、比例、清晰度、时长、音频状态和数量；摘要可点击打开参数面板。成本来自 v2 路线/计价数据：缺失或为零时显示“未配置”，生成按钮禁用并显示原因，不再使用硬编码 `112`。

## 9. 两类调色盘

### 9.1 上下文调色盘

上下文调色盘表达“谁/什么物体在跨镜头保持一致”。它读取已连接节点和已绑定参考的稳定颜色标签，为 `subject`、`scene`、`prop`、`style` 等角色显示颜色圆点和名称。用户可以改颜色或禁用某个角色，但不会修改源素材本身。状态保存为 `contextPaletteRefs`，只包含角色、asset/node id 和颜色 token。

### 9.2 视觉色调预设

视觉色调表达画面整体色彩，不与上下文身份混用。第一期提供可配置的 preset manifest，例如 `neutral`、`cinematic_teal`、`warm_sunset`、`cool_moonlight`、`monochrome`；每项包含稳定 ID、名称、色块、简短描述和可选 preview token。选择后保存 `visualTone`，不把 CSS 渐变或大段提示词直接写入草稿。

两种调色盘均使用色块、图标和文字标签，不使用难以辨认的纯色小圆点作为唯一信息。没有对应数据时隐藏入口或显示明确空状态，不显示不可提交的装饰面板。

## 10. 真人验证

真人验证是生成前的可选安全确认状态，入口只在路线/租户策略声明 `supportsHumanReview=true` 时出现。状态为：

- `not_required`：当前路线不要求验证，入口不显示。
- `required`：需要验证，按钮显示“完成真人验证”，未完成时生成按钮禁用。
- `verified`：验证完成，显示短时效状态和重新验证入口。
- `expired`：验证过期，回到 required，不清除其它节点参数。

一期只实现状态展示、入口、失败/过期反馈和提交前阻断；实际验证服务由现有安全基础设施或二期接入提供。节点只保存验证引用的不可逆短 token 或状态时间戳，不保存身份证明、原始视频或服务端密钥。

## 11. 规范化节点状态

### 11.1 规范对象

视频新状态统一放在 `params.videoGeneration`，对象版本从 1 开始：

```ts
type VideoGenerationMode =
  | "text_to_video"
  | "all_reference"
  | "image_to_video"
  | "first_last_frame"
  | "image_reference";

type VideoGenerationParamsV1 = {
  schemaVersion: 1;
  mode: VideoGenerationMode;
  aspectRatio: "auto" | "16:9" | "4:3" | "1:1" | "3:4" | "9:16" | "21:9";
  resolution: "480P" | "720P" | "1080P" | "4K";
  durationSeconds: number;
  generateAudio: boolean;
  count: 1 | 2 | 4;
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
```

现有顶层 `modelId`、`routeKey`、`referenceAssetItemIds` 和 `referenceOrder` 继续保留，原因是当前 runtime、历史草稿和 route 解析仍读取这些字段。新组件不得把 provider、上游模型、签名 URL 或临时预览地址塞进 `videoGeneration`。

### 11.2 旧字段归一化

读取节点时执行纯函数 `normalizeVideoGenerationParams(data, catalog)`，该函数必须幂等、无副作用并返回诊断信息：

- 已有 `params.videoGeneration.schemaVersion === 1` 时只做合法性校验和能力降级。
- `params.aspect_ratio` 映射到 `aspectRatio`；`params.duration` 映射到 `durationSeconds`。
- 旧 `params.hd=true` 或 `params.quality` 映射到最接近的清晰度；无法判断时使用 `720P`，并标记“由旧字段推断”。
- `batchCount` 或 `params.n` 映射到 `count`，只接受 1、2、4，其他值钳制为最近合法值。
- 旧的首尾帧标记和 `referenceLabels` 映射到 `mode` 与 `referenceRolesByKey`；无法确认角色时保留为普通 `reference`。
- 现有 `normalizeVideoModelId` 继续处理已知旧模型别名，但规范对象只写规范后的 `modelId`。
- 旧字段不被读取后立即删除；只有用户明确保存或节点迁移时才写入新对象，便于回滚。
- 非法或未知值不触发生成。UI 使用可见的安全回退值并显示“需要重新选择”，避免默默改变用户意图。

## 12. 组件与边界

实现计划应保持以下边界，每个组件只负责一类状态：

- `VideoNodeComponent`：节点预览、handles、选中态挂载和运行状态；不承载菜单细节。
- `VideoNodeComposer`：工作台布局、焦点管理和各选择器的互斥开关。
- `VideoModeMenu`：模式选项和参考角色提示。
- `VideoCameraLibrary`：manifest 加载、四列卡片、预览生命周期、筛选、收藏和确认。
- `VideoModelMenu`：v2 目录加载、滚动列表、悬浮/选中描述和可用状态。
- `VideoParameterPanel`：比例、清晰度、时长、音频、数量的控件与能力校正。
- `VideoPalettePopover`：上下文调色盘和视觉色调预设。
- `VideoHumanReviewControl`：验证状态和生成前阻断。
- `videoGenerationParams.ts`：类型、默认值、旧字段归一化、序列化清理。
- `videoGenerationCapabilities.ts`：目录能力合并、兼容性判断和禁用原因。
- `videoCameraManifest.ts`：manifest schema 校验与资源 URL 白名单。

组件之间只通过规范化 props 和回调通信。菜单实现优先复用 `MenuSurface`、`MenuSelect` 和共享 menu tokens，不新增一套行高或弹层阴影。

## 13. 生成与运行边界

### 13.1 一期行为

- 控件改变只更新节点数据并触发现有 remote autosave。
- 如果选择的是已存在且可运行的 mock/local 视频路线，保留当前 v2 workflow 入口用于 QA；输出仍必须落入 asset 流程。
- 如果产品模型没有真实 video adapter 或路线没有 active pricing，生成按钮显示禁用状态及“真实模型将在下一期接入”，不会调用 `runBackendWorkflow`、不会 reserve credits、不会写入 billing ledger。
- 一期不修改 `VideoGenerationRequest` 的 provider 语义；UI 参数先作为规范化节点数据保留，二期再由 worker 映射到 provider 请求。

### 13.2 二期接口预留

二期将扩展 `VideoGenerationRequest.metadata.videoGeneration`，由 worker 根据 route capability 生成 provider-specific request。服务端必须重新校验模式、比例、清晰度、时长、音频、数量和输入素材角色，不能信任前端。

数量计费采用明确的服务端流程：估算单个结果价格、乘以合法数量、reserve、enqueue、成功后按实际 asset 数 settle、失败 refund。缺失 pricing 返回 `PRICING_NOT_FOUND` 并禁止入队。若 provider 只支持单结果，服务端要么拆分为受控子任务，要么以能力错误拒绝，不能扣一份点数却返回多份结果。

## 14. 状态、错误与恢复

组件必须覆盖以下状态：

- 目录/manifest loading：显示稳定骨架行或海报，不改变 composer 高度。
- 目录/manifest error：显示可重试入口；保留用户已有选择，不自动换成 mock 模型。
- 不兼容选择：控件禁用并说明能力原因；切换模型后给出“已校正”提示。
- 生成中：锁定会影响当前任务契约的控件，保留取消/查看状态入口；不伪造百分比。
- 失败：显示服务端错误码和可读说明；保留参数和参考素材，允许重试。
- 成功：将返回 asset id 写回节点，预览从 asset 服务恢复；多结果使用 `generatedResults` 与 `activeResultIndex`，不写入临时 URL。
- 草稿冲突：沿用现有 409 conflict 流程，提示用户选择服务器版本或保留本地变更，不静默覆盖。

## 15. 可访问性与性能

可访问性要求：

- 模式、模型、参数和运镜卡片使用可识别的 `button`/`menu`/`listbox`/`dialog` 语义；当前项提供 `aria-selected`。
- 所有图标按钮有中文 `aria-label` 和 tooltip；关闭、播放、收藏、清除和使用不能只依赖图形。
- 菜单打开后支持上下键、`Enter`、`Escape`；焦点不可逃逸到被遮挡的画布控件。
- 颜色不能作为唯一状态信息；禁用、错误和验证状态同时使用文字或图标。

性能要求：

- 运镜 manifest 首次打开时懒加载，卡片海报优先，最多四个预览视频同时播放。
- 使用 `IntersectionObserver` 暂停离开视口的预览；关闭浮层立即暂停并释放 media listeners。
- 模型目录按 modality 缓存，切换节点复用缓存；菜单列表支持稳定滚动，不因描述出现而重排。
- 大浮层在画布缩放或窗口改变时使用测量后的固定锚点，不在每一帧触发全量节点渲染。
- `prefers-reduced-motion` 下只显示海报或降低循环频率。

## 16. 测试验收

### 16.1 单元测试

- `normalizeVideoGenerationParams` 覆盖旧字段、未知值、模型别名、幂等性和不写入 URL。
- 能力合并器覆盖缺失能力、模式/清晰度/音频/数量禁用原因和模型切换后的校正。
- manifest schema 覆盖 23 个唯一 ID、资源扩展名、时长上限和坏资源跳过。
- 计价展示覆盖 active pricing、缺失 pricing 显示“未配置”和不调用生成。

### 16.2 组件测试

- 选中/取消选中显示和隐藏 composer；节点尺寸不因 composer 展开改变。
- 模式菜单切换五种模式并保持可映射参考；首尾帧槽位可区分。
- 模型行只在 hover/focus/selected 显示说明，无搜索框、无 provider 文案。
- 参数面板可选择 4K、拖动时长、输入数字、切换音频、选择 1/2/4。
- 运镜库确认、清除、外部点击、Escape、键盘选择和预览暂停行为。
- 两种调色盘互不覆盖字段；真人验证 required 时生成按钮被阻断。
- 所有新状态经过 autosave 后在重新加载草稿时恢复，签名 URL/Blob/data URL 不进入 graph JSON。

### 16.3 浏览器验收

使用 Playwright 在桌面宽屏、窄桌面和移动宽度验证：composer 不遮挡节点、菜单层级正确、运镜四列滚动、模型长描述不撑破行、4K 和数量控件可见。至少保存截图用于视觉回归，但不把截图或临时媒体写入草稿。

## 17. 发布、监控与回滚

发布分为两个可独立回滚的切片：

1. UI/状态切片：新增规范对象、组件和本地 manifest；真实 provider 行为保持不变。
2. provider/计费切片：二期在服务端实现能力校验、请求映射和数量计费后再开放生产路线。

UI 切片应保留一个可关闭的 `videoComposerV2` 功能开关或等价的租户级发布控制。关闭时旧节点仍能通过归一化器显示为可编辑状态，不能丢失顶层 model/route/reference 字段。回滚不删除新字段、不删除静态资源、不回退数据库历史；只停止渲染新 composer 并继续使用安全的旧视图。

监控至少记录目录加载失败、manifest 资源失败、能力校正次数、生成 preflight 拒绝码和草稿冲突次数；日志不得包含 provider secret、签名 URL 或完整 prompt 中的敏感素材内容。

## 18. 验收标准

设计实现被视为完成，必须同时满足：

- 视觉结构与确认的 LibTV 参考一致：轻量视频预览节点、选中态宽 composer、底部模型/模式/参数/成本/生成行和大运镜浮层。
- 五种模式、四档清晰度（含 4K）、比例、时长、音频、1/2/4 数量和两类调色盘均可操作且状态可恢复。
- 运镜库有 23 个独立稳定 ID、真实可播放的项目自有短预览和海报；模型列表无搜索框，说明只在 hover/focus/selected 展示。
- 无功能路径的按钮不出现；无计价或无 adapter 的路线不会生成、扣点或入队。
- 新旧节点均能通过规范化器安全读取，远程草稿不保存临时 URL 或二进制对象。
- 相关单元/组件/浏览器测试通过，`npm run build` 通过；任何基础设施导致的测试缺失必须在交付记录中说明。
