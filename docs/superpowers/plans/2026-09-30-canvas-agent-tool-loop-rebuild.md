# 画布 Agent 重建方案（方案 B：真正的工具调用循环）

状态：已确认（2026-09-30），下一步阶段 0
对标材料：`C:\Users\Lee Aigc\Desktop\agent`（1-17.png 为 TapNow 一次完整运行，界面以及UI视频.mp4 为界面导览）

## 目标

把画布 agent 的核心换成真正的工具调用循环：模型自己决定先看画布、查素材、查模型参数、提问、写 project.md、提交生成，看完结果再继续。

验收场景：TapNow 截图里的"小王子男童羽绒服淘宝详情页（3 主图 + 5 详情页）"，从头跑一遍，逐条对照下面 8 条行为。

## TapNow 行为清单（验收标准）

1. 先简短复述需求，然后显示可见的工具步骤（"查看画布节点"、"检索素材库"、"查看 seedream-5-pro 参数与契约"），折叠成"已完成 N 个操作"，并显示运行中/思考中/整理中和计时。
2. 在对话里流式输出规划表（3 主图 + 5 详情页，每张写明用途）。
3. 分步问答卡（1/2、2/2）：标签、编号选项、"(推荐)"、选项说明、可直接打字回答或 @ 引用节点/素材、上一题/下一题/提交；提交后折叠成"问 → 答"摘要。
4. 写 project.md（定位、交付清单、执行方式、关键要素状态表 Brief/Look/Cast），能在画布"文件"面板打开；同时写需求文件（req_*.json）。
5. 手动模式下出生成确认卡："图片生成 ~12 Tapies"、任务列表（可展开、可移除）、可改模型/比例/分辨率/数量、取消/确认。
6. 确认后画布上立刻出现带标题的占位节点，再逐个出图；对话里出现带缩略图的结果标签。
7. 多阶段推进：看完结果提出下一个决策（如主推色），建素材文件夹，写 req_main_1..3.json，提交下一批。
8. 输入区：+ 菜单（从画布添加/上传附件/技能/头脑风暴/全部应用）、手动确认/自动生成切换、模型选择（Auto + 列表）、停止按钮、会话自动命名、历史记录、新建对话。

## 诊断结论（为什么要重建）

- 现在的核心 `apps/api/src/modules/agent/runtime/agent-requirement-planner.ts` 只调用一次模型，提示词明确"不调用工具"，一次性输出 JSON，后面是写死的状态机，前端每 2 秒轮询。这个结构做不出 TapNow 的效果。
- 实际路径：`CanvasAgentV6Panel → useAgentV5Session → v5/agentV5Api → canonical runtime`，回复要经过 canonical → v5 → v6 三层转换。
- 阻断性 bug：预发 `AGENT_RUNTIME_ENABLED` 默认 false（503）；决策请求画布版本写死 0（409）；问题列表被当成选项（答案无效）；第一个生图模型被锁到所有步骤；中途自动保存导致卡在"执行中"；重开历史崩溃；新版界面 SSE 按字面量 `"\\n\\n"` 切分。
- 代码里并存 v2/v3/v5/v6/runtime 五代实现和独立的 tapflow-agent。唯一真正的工具循环是 v2 的 `agent-turn-loop.ts`，但不在使用路径上。

## 核心设计

### 1. 新模块，不在旧代码上叠

- 后端新建 `apps/api/src/modules/canvas-agent/`，前端新建 `src/flowCanvas/canvasAgent/`。
- 复用已验证可用的底层：
  - 文本模型：`DatabaseTextGenerationRuntime.streamText`（`packages/ai-gateway-core/src/database-text-runtime.ts:245`）
  - 素材库：`AssetsService`（`apps/api/src/modules/assets/assets.service.ts`）
  - 模型目录与单价：`AgentRunSettingsService`、`AiModelCatalogService.listRoutesForModel`（比例/分辨率以后者为准）
  - 出图与计费：`WorkflowRunsService.createWorkflowRun` + worker；提交时预扣积分，成功结算，失败退款
- 参考 v2 `agent-turn-loop.ts` 的写法，但重写。

### 2. 工具分服务端和浏览器两类

画布自动保存是本地优先（`src/flowCanvas/hooks/useRemoteFlowAutosave.ts`，409 时本地总是覆盖），服务器改草稿会被浏览器覆盖。所以画布操作放在浏览器执行：循环暂停，浏览器执行完把结果发回，循环继续。提问和确认生成用同一套暂停/恢复。

| 工具 | 执行位置 | 作用 | 界面显示 |
|---|---|---|---|
| `canvas_inspect` | 浏览器随消息上送快照，服务端读取 | 画布节点、选中项、已有图片 | 查看当前画布节点与素材统计 |
| `asset_search` / `asset_list_folders` | 服务端 | 查素材库 | 检索素材库中是否有相关素材 |
| `model_list` / `model_contract` | 服务端 | 可用生图模型、比例、分辨率、单价 | 查看 xxx 参数与契约 |
| `file_read` / `file_write` | 服务端 | 读写 project.md、req_*.json | 已编辑 project.md |
| `ask_user` | 暂停等用户 | 分步问答卡 | 问答卡 |
| `propose_generation` | 暂停等用户 | 生成确认卡（任务、参数、预估积分） | 图片生成确认卡 |
| `canvas_generate` | 浏览器 | 建占位节点、运行、等出图 | 画布占位节点逐个出图 |
| `asset_save` | 服务端 | 建项目素材文件夹并存入结果 | 在素材库创建项目资产文件夹 |
| `result_review` | 服务端 | 把生成的图作为图片输入给模型看 | 整理中… |

手动确认模式：`propose_generation` 等用户点确认。自动生成模式：前端自动确认，直接进入 `canvas_generate`。

### 3. 实时流（SSE）

- `POST /api/v2/canvas-agent/sessions/:id/messages`：发消息，返回事件流
- `POST /api/v2/canvas-agent/sessions/:id/resume`：发回答案/确认/画布执行结果，返回事件流
- `POST /api/v2/canvas-agent/sessions/:id/stop`：停止
- 事件：`text_delta`、`status`、`tool_started`、`tool_finished`（中文标题 + 耗时）、`card`、`waiting`、`done`、`error`
- 服务端照 `apps/api/src/modules/workflows/workflow-runs.routes.ts:235` 的写法（心跳、断开时中止模型调用）。前端把 `src/services/v2WorkflowRunsApi.ts:159` 的 `parseSseBuffer` 抽成公共工具复用。

### 4. 数据

- 新表 `canvas_agent_sessions`（标题、模式、文本模型）、`canvas_agent_messages`（含工具调用和结果的完整对话，支持断点续跑）、`canvas_agent_files`（按画布存文件，带版本）。
- 旧 `agent_*` 表不动。
- 逐字增量不入库，只存每一步完成后的完整消息。

### 5. 系统提示词（中文）

先复述需求 → 看画布、素材、模型 → 给交付规划表 → 一次问 2~4 个关键问题（带推荐项）→ 写 project.md → 分批生成（风格候选 → 主图 → 详情页），每批看完结果再推进 → 不声称没做的事已经做了。

## 分阶段实施

在新分支 `canvas-agent-loop` 上开发，每阶段单独提交，做完给用户看效果再进下一阶段。不推送远程，除非用户要求。

### 阶段 0：修网关工具调用（`packages/ai-gateway-core`）

- `types.ts`：消息增加"助手工具调用"和"工具结果"类型。
- `openai-compatible-text-adapter.ts`：chat 与 responses 两种模式都按规范传工具调用和结果；修 responses 模式工具名与参数 ID 不一致（name 用 call_id，参数用 item_id）。
- `aittco-text-relay-adapter.ts`：修 claude 协议同类 ID 问题（block.id 与 `tool-call-{index}`）；gemini 协议带工具时明确报错，不再悄悄丢弃（`:266`）。
- 路由能力标记 `supportsTextStreaming` / `supportsToolCalling`：检查后台路由编辑界面，没有就加开关。
- 验证：流式响应样本单元测试；对 gpt-5.5 路由真实调用一次工具的冒烟脚本（花少量 token，先问用户）。

### 阶段 1：后端工具循环（`apps/api/src/modules/canvas-agent/`）

- 迁移（3 张新表）、仓储、会话接口、SSE 路由、循环、服务端工具、暂停/恢复、停止、每段最多 20 轮工具调用。
- 开关 `CANVAS_AGENT_ENABLED`，默认关。
- 验证：假模型单元测试（提问→恢复、确认→恢复、停止、参数错误、轮数上限）；真模型本地跑验收场景到出确认卡。

### 阶段 2：前端面板（`src/flowCanvas/canvasAgent/`）

- 复用：`agent/v6/workspace/AgentComposer.tsx`、`AgentHeader.tsx`、`AgentHistory.tsx`、`agent/CanvasAgentParameterCard.tsx` 的参数部分、`flowCanvas.css:248` 面板布局。
- 新写：消息流（流式文字 + 可折叠"已完成 N 个操作" + 状态计时）、分步问答卡、生成确认卡、文件卡、结果卡；深色主题，图标用 lucide-react。
- 在 `src/flowCanvas/canvas/AiFlowCanvas.tsx:1163` 用开关 `VITE_CANVAS_AGENT_LOOP` 切换新旧面板，默认关。
- 验证：组件测试（vitest + testing-library）+ 浏览器预览逐条对照截图。

### 阶段 3：画布执行与结果回看

- `canvas_generate`：找空位 → `addNode('image', pos, {title, generationStatus:'generating'})` → 暂停自动保存（`runtime/remoteDraftSaveBarrier.ts`）→ 先保存草稿 → 用图片节点运行按钮的同一套逻辑（`runtime/v2WorkflowRunner.ts`）提交 → 监听出图更新节点 → 回传节点和图片编号。
- 新写画布找空位的布局函数。
- `result_review`：出好的图作为图片输入给模型。
- 顺带修：`flows.service.ts` 的 `saveFlowDraft` 缺行锁；V2 结果等待 `cancelled` / `canceled` 拼写不一致。
- 验证：本地完整跑验收场景（需 api + worker + 数据库 + redis；真实出图扣积分，先问用户）。

### 阶段 4：清理旧代码（需用户单独确认）

- 删除 `src/flowCanvas/agent/` 下 v2/v3/v5/v6/runtime/conversation 和旧面板、后端对应旧版本、`apps/tapflow-agent`、相关环境变量与失效测试。
- 数据库旧表保留；删除走 git，可恢复。

### 阶段 5：验收与模型对比

- 8 条逐条截图对比。
- 同一场景分别用 GPT、Claude、Gemini 跑，比较效果、速度、成本，推荐默认模型。
- 打开开关并更新 `docker-compose.staging.yml`（上预发前先问用户）。

## 风险与未决事项

- gpt-5.5 路由需打开 `supportsToolCalling` 标记，阶段 0 查清配置方式。
- 本地能否完整跑起 api/worker/数据库/redis 未验证；跑不起来则阶段 3 在预发验收。
- 截图未覆盖的环节（如 8 张全部出完后的收尾）按合理方式实现，验收时标出。
- 会花钱的两步都先问用户：阶段 0 冒烟调用、阶段 3 完整出图。

## 进度记录

- [x] 用户确认方案（2026-09-30）
- [x] 阶段 0（2026-10-01）：网关支持工具结果回传（`TextMessage` 增加 `tool` 角色、`toolCalls`、`toolCallId`）；修 OpenAI responses 模式、中转 claude/responses 的工具调用 ID 对不上；responses 模式完成原因改报 `tool_calls`；中转 gemini 协议带工具时明确报错 `TEXT_TOOL_CALLING_UNSUPPORTED_PROTOCOL`；后台文本线路编辑页加"供画布 Agent 使用"开关（写入 `requestConfig.capabilities`）。网关测试 191 通过（新增 7 个，旧代码下均失败），后台页测试 13 通过。真实模型冒烟调用未做，并入阶段 1 的本地验收。
- [ ] 阶段 1
- [ ] 阶段 2
- [ ] 阶段 3
- [ ] 阶段 4（需单独确认）
- [ ] 阶段 5
