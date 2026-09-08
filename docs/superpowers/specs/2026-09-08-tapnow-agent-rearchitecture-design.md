# TapNow Agent 全新架构整改设计

日期：2026-09-08

## 1. 目标与范围

本项目选择“全新 Agent 架构”路线，目标不是继续修补当前 V5 的外观，而是建立达到 TapNow 产品级体验的 Agent 工作区、会话协议、编排流程和结果闭环。

本轮同时覆盖视觉、交互、执行策略和真实浏览器验收，但复用现有 V2 基础设施：认证、tenant/RLS、Flow 草稿与 revision、资产库、Billing、Workflow/Worker、Redis、S3 和 AI Gateway。

不重做整个生产基础设施，不恢复旧 Timeline、旧 Composer、PlanCard、SkillBar 或 legacy Agent 作为主入口。

## 2. 产品原则

- Agent 以画布为上下文，以对话为控制层。
- 模糊需求先理解和追问，不能首轮直接生成。
- 普通文本保持轻量消息流；需要用户操作的内容使用结构化 Block。
- 付费、批量、画布写入、Skill/App 和高风险动作统一经过服务端决策门。
- 会话、画布、资产和账本的权威数据在服务端。
- 实时事件和历史回放必须进入同一个 reducer，恢复完整结构化状态。
- 前端永不接触 provider、route、credential、原始 HTML 或长期 signed URL。

## 3. 总体架构

```text
AgentWorkspace
├── SessionController
├── ConversationStore
├── ConversationRenderer
├── CapabilityController
├── ExecutionPolicy
├── ResultController
└── ReplayController
```

前端建议分层：

```text
src/flowCanvas/agent/
├── workspace/       # 工作区、Header、消息流、Composer、History
├── protocol/        # 类型、normalizer、reducer、Block renderers
├── capabilities/    # 节点、附件、Skill、App、模型引用
├── orchestration/   # 会话、turn、决策和执行控制器
├── results/         # 结果动作与画布放置
└── replay/          # 历史事件和状态恢复
```

服务端按同样职责拆分 `protocol`、`sessions`、`orchestrator`、`decisions`、`capabilities`、`results` 和 `replay`，避免让单一 AgentWindow 或单一 service 同时承担展示、状态、API 和执行逻辑。

## 4. TapNow 视觉与交互规格

### 4.1 工作区

- 桌面端固定右侧 460–520px，画布持续可见。
- 窄屏切换全屏抽屉。
- Header、ConversationStream、Composer 三段独立布局。
- 消息流独立滚动，Composer 固定底部。
- 不使用厚重调试侧栏视觉；降低边框和大面积同质卡片的存在感。

### 4.2 Header

```text
[新建]        当前会话标题        [历史] [收起]
```

标题支持自动生成和重命名，并显示理解中、等待选择、等待确认或执行中等当前阶段。不显示用量统计和调试入口。收起只隐藏窗口，不销毁会话。

### 4.3 消息流与 Block

用户消息靠右、紧凑、弱背景；Agent 普通文本靠左并保持连续内容流。理解、选择、比较、Brief、确认、进度和结果使用不同视觉角色，不能全部套用同一种 `.agent-v5-card`。

必须支持：

- Choice Grid 的选中、锁定和修改；
- Comparison Table 的横向滚动和窄屏适配；
- Brief 的字段编辑、退回和确认；
- Confirmation 的范围、费用、风险、确认和修改；
- Progress 的步骤状态、取消和失败恢复；
- Result Group 的选择、预览、变体、设置参考、继续编辑和放入画布。

### 4.4 Composer

```text
┌──────────────────────────────────────┐
│ 节点引用 / 附件 / Skill / App chips   │
│ 描述任务、回答问题……                   │
│ +   Agent 自动执行   模型 ▾       发送 │
└──────────────────────────────────────┘
```

固定顺序为 `+ → mode → input → model → send`。`+` 菜单包含从画布选择、上传附件、Skill、App 四项；入口带图标、次说明和选中状态。模式文案固定为 `Agent 自动执行` 和 `用户确认`。禁止原生 `<select>`，统一使用共享菜单 tokens、`MenuSurface`、`MenuSelect` 和 `useDismissibleLayer`。

## 5. 会话协议与状态机

状态流：

```text
idle → understanding → asking/waiting_for_choice → drafting_brief
→ waiting_for_confirmation → executing → verifying
→ presenting_results → refining
```

任意活动状态可进入 `failed`，并返回可读的重试、修改、取消或恢复动作。

每轮响应至少包含：

```ts
{
  sessionId, turnId, phase, blocks, contextSnapshot,
  pendingDecision, executionState, graphRevision
}
```

Decision 必须包含 session、turn、graph revision、payload 和 idempotency key。模型输出必须经过意图解析、Block 生成、安全归一化和长度限制；前端不能从 Markdown 或大段文本猜测按钮。

## 6. 执行与数据边界

执行统一为：

```text
estimate → reserve → enqueue/run → observe → delivery verify → settle → present
```

失败统一为：

```text
failed → refund/release → safe error block → retry/revise
```

自动模式只可跳过低风险、无费用、只读或规划类确认；付费、批量、画布写入、Skill/App、图片/视频生成和高风险操作仍由服务端策略决定。

上下文只保存 `nodeId`、`assetId`、`skillId/version`、`appId`、`modelKey` 和 `graphRevision` 等稳定引用，不保存 base64、blob、data URL、File、Blob 或长期 signed URL。

## 7. 分阶段实施

1. **基线与隔离**：冻结现有 V2 API、数据库、计费、Worker 和 AI Gateway 边界，确认新旧 Agent 入口和 feature flags。
2. **协议与状态内核**：建立 Block、Decision、Context Snapshot、normalizer、reducer、replay 和执行策略。
3. **Workspace 重做**：重建工作区、Header、History、Composer、引用 chips 和能力菜单，移除旧主路径混排。
4. **Block Renderer 重做**：分别实现理解、追问、选择、比较、Brief、能力、确认、进度、结果和错误恢复块。
5. **执行与结果闭环**：接入现有 Workflow、Worker、Billing、Skill、App、资产和画布放置能力。
6. **真实验收与灰度**：在 staging 完成认证浏览器验收，再决定启用 runtime flag。

## 8. 验收标准

完整场景：

```text
新建会话 → 选择节点 → 上传附件 → 选择 Skill/App → 选择模型
→ 切换模式 → 提交模糊需求 → 选择方向和年龄段
→ 查看比较与 Brief → 编辑 Brief → 确认费用与范围
→ 执行 → 查看进度 → 查看结果
→ 继续编辑/变体/设置参考/放入画布
→ 打开历史 → 刷新 → 恢复 blocks、决策、进度、结果和画布关联
```

必须验证：

- 首屏无旧 Timeline、Composer、PlanCard、SkillBar；
- 模糊需求不会直接生成；
- stale graph revision 返回 `409`；
- 付费和画布写入无法绕过确认策略；
- 失败能退款或释放预留并提供恢复动作；
- 实时和历史回放状态一致；
- 前端响应不含 secrets、provider 内部字段或长期 URL；
- `npm run build` 和相关前端/API/Worker/DB 测试通过；
- staging 真实 PostgreSQL、Redis、S3、Billing、AI route 和 Worker 验收通过。

## 9. 风险与回滚

- 新 Agent runtime 默认关闭，先在 staging 开启。
- 新架构优先通过适配器复用旧服务，避免双写资产、账本和 Workflow 数据。
- 执行异常时先关闭 runtime flag，不删除历史会话、账本、路线或资产记录。
- 画布写入始终使用 revision CAS，避免新旧 Agent 覆盖用户修改。
