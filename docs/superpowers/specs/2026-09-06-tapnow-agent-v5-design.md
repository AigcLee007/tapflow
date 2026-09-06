# TapNow-style Canvas Agent V5 Design

## 1. Goal

将画布 Agent 重构为 TapNow 风格的固定右侧对话工作区：Agent 先理解、追问、给出结构化方案，用户选择并确认后才执行；所有输出使用结构化内容块渲染，支持 Skill、App、附件、文本模型、自动/手动确认、历史会话、进度和结果组。

本设计替换当前 Agent 首屏的信息架构，不继续在旧 Timeline、Composer、PlanCard 和 SkillBar 上叠加兼容层。现有 V2/V3 会话、任务、计费、Skill、资产和画布 API 保留为底层能力，通过统一 Orchestrator 接入。

## 2. Product principles

- 第一轮模糊需求默认只进入理解和追问，不直接生成。
- Agent 输出不是普通 Markdown，而是安全的 `ConversationBlock` 协议。
- 每个可能改变画布、调用 Skill/App、消耗积分或批量执行的动作都经过统一决策门。
- 自动模式只跳过安全范围内的确认；付费、批量和高风险写入仍然遵守策略。
- 画布和资产的权威数据仍在服务端；会话只保存 `assetId`、`nodeId`、引用 ID 和 graph revision。
- 历史回放必须恢复结构化 blocks、用户决策、阶段、能力引用和结果组，而不是只恢复纯文本。
- provider、route、credential、signed URL 和原始 HTML 不进入用户展示层。

## 3. Target window information architecture

Agent 是画布右侧的固定抽屉，不是旧式调试侧栏。桌面宽度为 460–520px，窄屏时切换为全屏抽屉。画布仍然可见并作为上下文背景。

```text
Canvas
└── AgentWindow
    ├── AgentHeader
    │   ├── NewConversation
    │   ├── SessionTitle
    │   ├── HistoryButton
    │   └── CollapseButton
    ├── ConversationStream
    │   ├── UserMessage
    │   ├── AgentUnderstandingBlock
    │   ├── QuestionBlock
    │   ├── ChoiceGridBlock
    │   ├── ComparisonTableBlock
    │   ├── BriefBlock
    │   ├── SkillBlock
    │   ├── AppBlock
    │   ├── ConfirmationBlock
    │   ├── ProgressBlock
    │   └── ResultGroupBlock
    ├── HistoryDrawer
    ├── AttachmentMenu
    ├── ModelPicker
    ├── AgentModeSwitch
    └── Composer
```

### 3.1 Header

- 左上角 `新建对话` 清空当前会话并创建新的 durable session。
- 中间显示可生成、可重命名的当前会话标题。
- 右上角 `聊天记录` 打开历史抽屉。
- 右上角 `收起` 只关闭窗口，不销毁会话。
- 不显示用量统计入口。

### 3.2 History drawer

历史抽屉必须显示新建对话入口、最近会话、按日期分组的旧会话和当前选中状态。打开历史会话时恢复消息、blocks、决策、Brief、能力引用、进度和结果组。

### 3.3 Composer

底部是一个固定的组合输入容器，输入区独立滚动，Composer 不随消息流滚动：

```text
┌────────────────────────────────────────────┐
│ 输入消息、回答 Agent 问题或继续描述任务      │
├────────────────────────────────────────────┤
│ ＋   Agent 自动 / 用户确认             模型 ▾ 发送 │
└────────────────────────────────────────────┘
```

从左到右固定为：`+`、执行模式、文本输入、文本模型选择、发送。移除语音按钮、用量统计和旧版独立模型设置面板。

`+` 菜单向上展开四个入口：

1. 从画布选择：选择一个或多个节点作为本轮引用。
2. 上传附件：上传本地图片、视频、文档等支持的附件。
3. Skill：选择、上传、创建和管理 Skill。
4. App：选择和管理可调用应用。

## 4. Structured conversation output

Agent 不能只返回一段 Markdown。后端 turn response 必须返回安全归一化的 blocks：

```ts
type ConversationBlock =
  | { type: "paragraph"; text: string }
  | { type: "heading"; level: 1 | 2 | 3; text: string }
  | { type: "quote"; text: string }
  | { type: "bullet_list"; items: string[] }
  | { type: "numbered_list"; items: string[] }
  | { type: "choice_grid"; title: string; options: AgentOption[]; selectionMode: "single" | "multiple" }
  | { type: "comparison_table"; columns: string[]; rows: string[][] }
  | { type: "brief_card"; fields: BriefField[]; editable: boolean }
  | { type: "skill_card"; capability: CapabilitySummary }
  | { type: "app_card"; capability: CapabilitySummary }
  | { type: "confirmation_card"; plan: ConfirmationPlan }
  | { type: "progress_card"; steps: ProgressStep[] }
  | { type: "result_group"; results: ResultRef[] }
  | { type: "divider" };
```

每个 block 都有明确的标题层级、字号、间距、语义颜色和动作协议。表格支持横向滚动和窄屏适配；choice grid 支持选中、锁定和修改；Brief 支持字段编辑、退回和确认；确认卡显示执行范围、费用和确认/修改动作；进度卡显示步骤状态；结果组支持选择、预览、继续编辑、生成变体、设置参考和放入画布。

模型输出到界面的链路为：

```text
模型输出
→ Agent Orchestrator 解析意图
→ 生成 ConversationBlock
→ 安全归一化和长度限制
→ Block Renderer
→ 用户产生结构化 Decision
→ 进入下一轮 turn
```

不允许前端用正则从大段文本猜测按钮，也不允许直接渲染原始 HTML。

## 5. Unified conversation state machine

所有 V2/V3/legacy runtime 都通过统一状态机暴露：

```ts
type AgentPhase =
  | "idle"
  | "understanding"
  | "asking"
  | "waiting_for_choice"
  | "drafting_brief"
  | "waiting_for_confirmation"
  | "executing"
  | "presenting_results"
  | "refining"
  | "failed";
```

主要转换：

```text
用户发送
→ understanding
信息不足
→ asking / waiting_for_choice
用户选择
→ 更新 context snapshot
信息完整
→ drafting_brief
Brief 输出
→ waiting_for_confirmation
用户确认
→ executing
任务完成
→ presenting_results
继续编辑
→ refining
```

所有执行入口必须调用统一 policy gate。过期 graph revision、未确认的付费任务、未批准的 Skill/App、高风险画布写入都必须阻断并返回可读的下一步动作。

## 6. Execution modes

`Agent 自动执行`允许读取上下文、追问、整理 Brief、查询能力和执行不收费的低风险规划。扣积分、批量任务、画布写入、外部 App 调用和高风险操作仍由策略决定是否需要确认。

`用户确认模式`下，图片、视频、Skill、App、批量、画布修改和任何积分消耗都必须等待用户确认。

模式选择既影响前端按钮文案，也必须作为服务端 session policy 保存和校验，不能只在浏览器内切换。

## 7. Context, attachments and canvas binding

本轮上下文包含：

```ts
type AgentContextSnapshot = {
  projectId: string | null;
  flowId: string | null;
  selectedNodeIds: string[];
  assetRefs: Array<{ assetId: string; refId: string; label: string }>;
  uploadedAssetIds: string[];
  skillRefs: Array<{ id: string; version: number }>;
  appRefs: string[];
  modelKey: string | null;
  graphRevision: number;
};
```

只保存稳定 ID 和 revision，不保存 base64、blob、长期 signed URL、File 或 Blob。执行前重新验证 revision；stale graph 返回冲突，不覆盖用户的新修改。

## 8. Skill, App and model capabilities

Skill 是方法和流程；App 是 Agent 可以调用的外部能力。二者在 UI 中用不同卡片展示，并在当前 turn 中通过 capability refs 关联。

Skill 需要支持内置列表、搜索、详情、选择、文件上传、文件夹上传、创建、编辑、停用、执行审批、步骤进度和结果回传。App 需要支持连接、权限、启用/停用、输入 schema、调用前确认和结果回传。

模型选择只展示产品模型名，如默认、快速、高质量、长上下文，不暴露 provider、upstream model、route key 或 credential。

## 9. Durable persistence

优先扩展现有 tenant-scoped agent session/turn 表，必要时增加：

- session `mode`、`phase`、`title`。
- turn `blocks_json`、`context_snapshot_json`、`requires_confirmation`、`confirmed_at`、`execution_state`、`graph_revision`。
- decision 表保存问题选择和自由文本。
- capability refs 保存 Skill、App、model 关联。
- result group 保存 asset refs、选择状态和 placed node IDs。

新增字段和表必须有 tenant_id、RLS、索引、幂等键和 replay 支持。Billing 仍由服务端 reserve/settle/refund 管理。

## 10. Component migration boundary

新建 `src/flowCanvas/agent/v5/` 作为唯一首层 UI，包含 Window、Header、ConversationStream、BlockRenderer、HistoryDrawer、AttachmentMenu、ModelPicker、ModeSwitch、Composer、Progress 和 ResultGroup。

现有 `canvasAgentApi`、`useCanvasAgentSessionV2`、Skill API、asset placement、workflow runner、billing adapter 和 canvas draft adapter 可复用。旧 Timeline、PlanCard、SkillBar、旧 Composer、V3 command bar/task sheet 不能继续作为 V5 首层渲染；可在迁移期间作为隐藏兼容适配器或二级调试入口保留。

## 11. Example acceptance flow

以“小黄人图片设计儿童陪伴玩具”为验收任务：

1. Agent 读取画布引用并显示理解卡。
2. Agent 询问目标方向，显示 choice grid。
3. 用户选择陪伴方向，Agent 询问年龄段。
4. Agent 显示 Brief、比较信息和儿童产品 Skill 卡。
5. 用户可以修改 Brief 或确认。
6. 确认卡显示执行范围和预计积分。
7. 确认后显示进度卡，不直接跳到日志。
8. 完成后显示三个结果的 result group。
9. 用户选择结果，继续编辑、生成变体或放入画布。
10. 刷新后历史会话仍保留 blocks、决策、结果和画布关联。

## 12. Delivery phases

1. **Window replacement**：替换右侧窗口、Header、History、Composer、+ 菜单和模型/模式入口。
2. **Protocol and renderer**：实现 ConversationBlock schema、normalizer、所有 block renderer 和动作协议。
3. **State and orchestration**：统一 AgentPhase、decision gate、自动/手动策略和 turn orchestrator。
4. **Capabilities and persistence**：接入 Skill、App、attachments、model refs、durable replay 和 billing policy。
5. **Execution and results**：接入现有 runtime、progress、result group、canvas placement 和 refine loop。
6. **Staging acceptance**：使用真实 PostgreSQL、Redis、S3、billing 和 provider route 做认证浏览器验收，再决定 rollout flags。

## 13. Definition of done

- 首屏完全是 V5 Agent Window，不出现旧 Timeline/Composer/PlanCard 混排。
- 模糊需求第一轮不会直接生成。
- 结构化文本、标题、列表、表格、choice、Brief、Skill、App、确认、进度和结果组均可回放。
- 自动/手动确认模式对服务端执行策略生效。
- `+` 菜单四项可用；历史、新建、模型选择和收起行为符合窗口设计。
- 结果可选择、继续编辑、生成变体和放回画布。
- 所有会话和资产数据使用服务端权威存储，不暴露 secrets，不保存 base64/blob/data URL。
- 前端、API、Worker 和相关数据库测试通过，并完成 staging 真实浏览器验收。
