# TapFlow Agent 重建设计规格

日期：2026-09-20

状态：待用户审阅

## 1. 决策结论

TapFlow Agent 采用 **Agent-first 入口、Canvas-first 产物、双轨协作** 的产品形态。

用户从 Agent 输入任务。Agent 负责读取用户明确提供的画布节点、资产和附件，理解目标，识别缺失信息，生成计划，调用模型和工作流，并在执行后验证交付。画布负责保存上下文、展示节点关系、承载生成结果和继续编辑。Agent 与画布始终同时可见，但二者职责不同：Agent 是控制层，画布是可追溯的生产空间。

本次重建只推翻 Agent 的默认 UI、会话状态、协议适配和编排层，不重做认证、租户隔离、Flow 草稿、资产库、Billing、AI Gateway、Redis、Worker 和对象存储。

不再使用“V7”作为新的用户概念。新实现使用稳定职责名称：`AgentWorkspace`、`AgentRuntime`、`AgentTurn`、`AgentCapability`、`AgentResult`。现有 V5/V6 代码只保留为迁移适配器和隐藏兼容入口，不得继续作为默认 Agent 路径。

## 2. 产品目标与非目标

### 2.1 目标

用户完成一次典型任务时，应能经历：

```text
打开 Agent
→ 选择或确认上下文引用
→ Agent 复述目标和约束
→ 回答缺失问题
→ 查看计划、App、模型、数量、费用和写入范围
→ 确认执行
→ 查看真实进度和可恢复错误
→ 预览结果、选择结果、继续编辑或放回画布
→ 刷新后恢复会话、结果、决策和画布关联
```

第一阶段的黄金任务是：

```text
用户选中一张商品图，要求制作两个 9:16 商品视觉方向，
只改变背景，保留包装结构和文字，不生成视频。
```

该任务必须验证引用角色、澄清问题、方案确认、模型和费用确认、批量生成、资产落库、结果选择、结果放回画布、结果修订和会话恢复。

### 2.2 非目标

- 不在第一阶段实现完整影视生产管线、18 种以上节点或复杂多 Agent 协作。
- 不把浏览器 localStorage、IndexedDB、Blob 或 data URL 作为权威数据源。
- 不在前端暴露 provider、upstream model、route key、credential 或长期 signed URL。
- 不继续扩展 Timeline、PlanCard、SkillBar、V5 Window 和旧 Composer 的兼容混排。
- 不修改现有 Billing ledger 的不可变语义，不增加绕过 reserve/settle/refund 的执行路径。

## 3. 用户体验设计

### 3.1 工作区布局

桌面端 Agent 是画布右侧固定工作区，宽度为 460–520px；画布主体持续可见。窄屏（宽度不超过 720px）切换为全屏抽屉。工作区分为 Header、Conversation Stream 和 Composer 三层，消息流独立滚动，Composer 固定在底部。

Header 只显示：新建会话、会话标题、当前阶段、历史、收起。阶段文案使用“理解中、等待补充、等待确认、执行中、校验中、展示结果、需要处理”，不显示调试日志、内部事件名或用量统计。

### 3.2 会话流

普通文字保持连续消息流，不把每段文字都包装成卡片。只有需要用户采取动作时才渲染结构化 Block：

- `understanding`：Agent 对目标、输入、约束和缺失信息的简短复述。
- `question_set`：一次最多 4 个相关问题，支持单选、多选和文本回答。
- `plan`：显示交付物、使用的 App、引用、输出数量、模型、预计费用和写入范围。
- `brief`：可编辑的目标、受众、规格、必须保留项和下一步。
- `confirmation`：明确显示风险、费用、数量、影响范围和确认/修改按钮。
- `progress`：显示真实 Worker 步骤、运行状态、取消、重试和恢复入口。
- `result_group`：显示缩略图、结果状态、来源关系和结果动作。
- `error_recovery`：显示失败原因、已退款/释放状态、重试、修改计划和返回结果入口。

每种 Block 有自己的视觉角色、操作协议和可访问名称。前端不得从 Markdown 或大段文本中猜测按钮。

### 3.3 引用与 Composer

Composer 固定为：

```text
+   自动 / 询问   输入框   模型 / 思考级别   发送
```

`+` 菜单包含：从画布选择、上传附件、Skill、App。菜单使用项目共享 `MenuSurface`、`MenuSelect`、`useDismissibleLayer` 和统一密度 tokens。

引用显示在输入框上方，支持移除和角色标注。角色包括主体、风格、构图、布局、上下文等。输入支持 `@` 指定某个引用的角色，例如“使用 @商品正面图保留包装结构，只使用 @夜景参考图的光线”。

默认模式为“询问”时，任何付费、批量、画布写入、Skill、App 和外部同步动作都必须确认。默认模式为“自动”时，只能自动执行读取、理解、澄清、规划和服务端策略明确允许的低风险动作；高风险动作仍由服务端拦截。

模型菜单只展示产品模型名和思考级别，不展示 provider、route、upstream model 或 credential。首条消息提交后锁定文本模型，允许调整思考级别；更换模型需要新建会话。

### 3.4 结果闭环

结果组中的每个结果必须支持：预览、选择、继续编辑、生成变体、设为参考、放入画布。生成结果先写入 `assets`，再通过 `assetId` 放入画布。源节点保持不变，新节点记录输入节点、会话、轮次、运行和放置关系。

结果修订必须使用“只改什么、保留什么、参考什么”的范围表达。例如：

```text
只修改背景为雨后露营场景。
保留产品位置、包装结构、Logo、文字和比例。
使用 @商品正面图作为结构来源。
```

## 4. 统一会话协议

### 4.1 Context Snapshot

每轮提交只携带稳定引用和版本信息：

```ts
type AgentContextSnapshot = {
  projectId: string | null;
  flowId: string | null;
  graphRevision: number;
  refs: Array<{
    refId: string;
    source: "canvas" | "asset" | "upload";
    nodeId?: string;
    assetId?: string;
    role?: "subject" | "style" | "composition" | "layout" | "context";
    label: string;
  }>;
  skillIds: string[];
  appIds: string[];
  modelKey: string | null;
};
```

不得保存 base64、data URL、blob URL、File、Blob、原始 HTML、provider secret 或长期 signed URL。临时预览地址只能由服务端通过 `assetId` 重新生成。

### 4.2 Block 与 Decision

后端响应统一包含：

```ts
type AgentTurnResponse = {
  sessionId: string;
  turnId: string;
  phase: AgentPhase;
  blocks: ConversationBlock[];
  contextSnapshot: AgentContextSnapshot;
  pendingDecision: AgentDecision | null;
  executionState: "idle" | "queued" | "running" | "verifying" | "completed" | "failed" | "cancelled";
  graphRevision: number;
  resultGroupId?: string;
};
```

`ConversationBlock` 只允许白名单字段，并在进入前端前完成长度、数量、深度和敏感字段归一化。Decision 至少支持：

- `answer_question`
- `edit_brief`
- `approve_plan`
- `revise_plan`
- `result_action`
- `cancel_execution`
- `retry_execution`

每个 Decision 必须绑定 `sessionId`、`turnId`、`graphRevision`、`decisionId` 和幂等键。过期 revision 返回 `409`，不得静默覆盖画布。

### 4.3 状态机

```text
idle
→ understanding
→ waiting_for_input
→ planning
→ waiting_for_confirmation
→ executing
→ verifying
→ presenting_results
→ refining
```

任何活动阶段都可以进入 `failed`、`cancelled` 或 `recoverable_error`。实时事件和历史回放必须通过同一个 reducer，不能维护一套 live state 和另一套 replay state。

## 5. Agent Runtime 架构

### 5.1 前端边界

```text
AgentWorkspace       只负责布局和渲染
ConversationRenderer 只负责 Block 渲染和动作回调
ContextController    负责节点、资产、附件和角色引用
SessionController    负责会话、轮次、历史和模式
RuntimeEventReducer   负责 live/replay 统一状态
ResultController     负责预览、变体、引用和放置
```

UI 组件不得直接调用 Worker、Billing 或画布 mutation API。所有动作先交给 Controller，再由服务端决定是否允许执行。

### 5.2 服务端边界

```text
Agent API
├── session repository
├── context assembler
├── requirement interpreter
├── question planner
├── plan builder
├── capability registry
├── approval policy
├── execution orchestrator
├── result verifier
└── replay projector
```

Agent Runtime 负责决定“是否理解、是否继续追问、是否需要确认、调用哪个能力和何时展示结果”。实际图片、视频、文本和 Skill 执行继续交给现有 Worker、AI Gateway、Billing 和资产服务。

### 5.3 类型化能力

第一阶段只开放以下类型化能力：

```text
canvas.read
canvas.propose_ops
canvas.apply_ops
asset.generate_image
asset.edit_image
workflow.run
skill.run
```

`canvas.propose_ops` 只生成待确认操作；`canvas.apply_ops` 必须经过 graph revision CAS 和服务端策略。后续 App 集成沿用同一 capability registry，不把第三方 API 细节泄露给前端。

## 6. 执行、计费与交付

所有可能产生费用或副作用的任务严格执行：

```text
estimate
→ policy check
→ reserve
→ enqueue / run
→ observe
→ verify delivery
→ settle
→ present
```

失败、取消或交付证据不足时执行现有 refund/release，并向用户展示明确的恢复动作。图片结果必须有有效 `assetId`，视频结果必须有可恢复资产和完成状态，文本结果必须有非空内容；只有 Worker 真实满足交付条件，轮次才能进入 `completed`。

## 7. 持久化与回放

扩展现有 tenant-scoped Agent session/turn/event 表，保存：

- 会话标题、模式、当前阶段和当前 graph revision。
- 每轮 prompt、blocks、context snapshot、pending decision 和 execution state。
- Decision、幂等键、确认时间和确认人。
- Capability refs、workflow run、asset refs、result group 和 placed node IDs。
- 顺序事件、事件序号和 replay cursor。

所有查询必须带 tenant、project、flow 和 session ownership 校验。历史恢复先加载 durable snapshot，再按事件序号补齐；如果出现缺号、scope 不一致或 revision 回退，返回 resync required 并重新获取服务端状态。

## 8. 迁移与回滚

迁移按以下边界执行：

1. 新建 `AgentWorkspace`、协议和 Runtime Controller，不修改旧组件行为。
2. 新建 canonical Agent Runtime API；V5 endpoint 只作为兼容适配器。
3. 默认入口切换为新 Workspace，旧入口隐藏在 debug/rollback flag 后。
4. 新会话使用新协议，旧会话由 adapter 转成安全的 Block 和 Result 引用。
5. staging 通过真实认证、Postgres、Redis、S3、Billing、AI route 和 Worker 验收后，再开放默认 flag。

回滚只需关闭 Agent Runtime flag 或恢复上一版本镜像。不要删除旧会话、资产、账本或 route。Worker 受影响时遵循项目 Docker Compose v2 的部署顺序：先停 worker，再迁移数据库，再启动 Redis/API/worker/frontend。

## 9. 验收标准

### 9.1 产品验收

- 任意普通创作提示不会进入固定的儿童玩具流程。
- 空画布、选中节点、多个节点和上传附件都能正确进入上下文。
- Agent 能区分主体、风格和构图引用。
- 模糊任务先澄清，不直接生成。
- 计划显示交付物、能力、数量、模型、费用和写入范围。
- Ask 模式下付费、批量、Skill、App 和画布写入无法绕过确认。
- 结果先进入资产库，再允许放回画布。
- 结果可预览、选择、变体、继续编辑、设为参考和放置。
- 刷新和重新打开历史后，blocks、决策、进度、结果和画布关联一致。
- 失败、取消、重试、退款和恢复动作可验证。

### 9.2 视觉验收

- 桌面端画布持续可见，Agent 工作区不遮挡核心节点。
- 1440×900 截图中无旧 Timeline、旧 Composer、PlanCard、SkillBar 或调试日志。
- 390×844 截图中 Composer、引用 chips、确认块和结果组可操作。
- 菜单遵循共享密度：38px 行高、12px 主标签、9px 次标签、30px 图标盒。
- 所有菜单支持 outside click、Escape 和互斥关闭。
- 深色工作区不再混入无层级的白色后台卡片。

### 9.3 工程验收

- `npm run build` 通过。
- 前端协议、Workspace、Runtime Controller、API、Worker 和 DB 相关测试通过。
- 完成一次真实 authenticated browser acceptance，而不是只验证 mock component。
- 不暴露 provider secret、credential、内部 route 或长期 signed URL。
- 新增或修改的数据库关系包含 tenant isolation、索引和 RLS。
- `PROJECT_RECORD.md` 记录实现、staging 验收、flag 和回滚方式。

## 10. 风险控制

- Agent Planner 不可用时，普通任务应返回可读错误，不得伪装成成功或落入固定 Demo 流程。
- 模型输出不符合 Block 协议时，由 normalizer 丢弃不安全字段并返回可恢复错误。
- Graph revision 过期时拒绝写入并要求刷新上下文。
- 结果交付证据不足时不能结算 Billing。
- 新 Runtime 默认只在 staging 开启，生产通过 flag 灰度。

本规格不要求恢复旧 Agent 的任何主路径。旧实现的唯一价值是复用已经可靠的资产、账单、工作流和认证基础设施。

## 11. 与现有代码和文档的关系

本规格取代此前以 V5/V6 作为主要产品版本的设计和实现计划。此前文档中关于 V2 认证、tenant/RLS、Flow draft/revision、S3 资产、Billing reserve/settle/refund、Redis、Worker、AI Gateway、结构化 Block、服务端策略门和统一 replay reducer 的边界继续有效；版本命名、默认入口和 V5/V6 双协议方式以本规格为准。

当前 `AgentV6Orchestrator` 使用进程内 `Map` 保存幂等结果和 pending decision。正式实现不得依赖进程内缓存作为权威状态；API 重启、多实例部署、Worker 切换和事件重放后，turn、decision、approval、execution state、idempotency key 和 replay cursor 都必须从数据库恢复。内存缓存只能作为性能优化，不能决定是否执行或是否结算。

### 11.1 Canonical API

新 Agent 只使用以下 canonical V2 API：

```text
POST  /api/v2/agent/sessions
GET   /api/v2/agent/sessions
GET   /api/v2/agent/sessions/:sessionId
GET   /api/v2/agent/sessions/:sessionId/history
GET   /api/v2/agent/sessions/:sessionId/events
GET   /api/v2/agent/sessions/:sessionId/events/stream
POST  /api/v2/agent/sessions/:sessionId/turns
POST  /api/v2/agent/sessions/:sessionId/turns/:turnId/decisions
PATCH /api/v2/agent/sessions/:sessionId/mode
POST  /api/v2/agent/sessions/:sessionId/cancel
```

`/v2-turns`、`/v5-turns`、`/v5-mode`、旧流式路径和 legacy Agent 路由只能作为带 feature flag 的兼容适配器。默认 UI、默认 Hook、默认测试和新会话不得再调用这些版本化入口。兼容适配器必须把旧数据投影到中立的 session/turn/decision/block/result 协议，不能把新协议反向压缩成 V5 固定字段。

### 11.2 权限和决策校验

读取会话和上下文可使用 `flow:read`；执行 Workflow、调用付费能力、运行 Skill/App 和写入画布必须分别经过 `flow:run`、`flow:update`、能力权限和服务端 approval policy。路由层权限不是最终安全边界，Runtime 在执行前必须再次验证 tenant、session、project、flow、turn、block、graph revision、pending decision 和资源所有权。

Decision schema 不接受任意 `snapshot` 或任意嵌套 payload。服务端只接受稳定的 `nodeId`、`assetId`、`refId`、`skillId`、`appId`、`modelKey` 和 `graphRevision`，然后重新读取权威画布和资产状态。任何 base64、blob/data URL、File、Blob、长期 signed URL、provider、credential、Authorization header 或未知引用字段都必须拒绝。

定价、模型、route、能力权限和写入范围必须在 approval policy 中同时校验。缺少定价、定价状态失效、模型/route 不存在、权限不足或 revision 过期时必须 fail closed：不 reserve、不 enqueue、不创建结果节点。

### 11.3 中立持久化模型

新迁移优先扩展现有 tenant-scoped session/turn/event 关系，逐步把 `agent_v5_*` 字段投影到中立字段。不得继续新增 `agent_v7_*`、`agent_v8_*` 等版本后缀表。必要字段包括：

- `agent_sessions`: mode、phase、title、project_id、flow_id、graph_revision、runtime_version。
- `agent_turns`: prompt、blocks_json、context_snapshot_json、pending_decision_json、execution_state、graph_revision、requires_confirmation、idempotency_key。
- `agent_decisions`: session_id、turn_id、block_id、decision_type、payload_json、idempotency_key、confirmed_at、actor_id、result_state。
- `agent_capability_refs`: turn_id、capability_type、capability_id、version、input_refs_json、approval_state。
- `agent_result_groups` / `agent_result_refs`: asset_id、run_id、source_refs_json、placed_node_id、lineage_json、status。
- `agent_events`: tenant_id、session_id、seq、event_type、event_json、replay_cursor。

所有关系必须包含 `tenant_id`、RLS、租户常用查询索引、幂等约束和 replay 所需序号。迁移必须保留旧 session、资产和 billing ledger，不得通过删除历史记录解决版本切换问题。

## 12. 规格自审结果

- 已明确默认产品形态、首阶段黄金任务、UI 层级、canonical API、状态机、权限、计费、数据边界、迁移和回滚。
- 已移除领域特定的“儿童陪伴玩具”验收叙事，改为商品图广告场景；服务端固定 Demo 不属于新协议。
- 已明确 V5/V6 只作为兼容适配器，不能再成为默认 UI、Hook、API 或数据模型。
- 已覆盖实时事件、历史回放、进程重启、多实例、stale revision、pricing fail-closed、真实 asset lineage 和 no-op 控件验收。
- 文档中没有待定占位、模糊的“稍后处理”或未定义的版本入口。
