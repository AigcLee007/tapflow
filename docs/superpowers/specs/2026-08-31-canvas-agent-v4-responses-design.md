# Canvas Agent V4：服务端安全版 Responses Agent 设计规格

## 1. 目标与非目标

### 目标

Canvas Agent V4 将 Agent 从“一次性结构化规划器”升级为可持续的多轮生产会话。它应当能够理解用户提供的商品实拍图，分析商品主体和视觉特征，规划淘宝主图与详情页套图，生成统一的视觉上下文和逐页提示词，先生成基准图，再批量生成无依赖页面，最后检查并把已验证结果写入画布和资产库。

核心用户体验是：用户只需描述目标并提供参考图，Agent 自己决定分析、规划、生成顺序、批量并发、继续生成和失败修复；每一个有成本或会改变画布的动作都能在执行前预览，用户可以审批、取消、重试或撤销。

### 非目标

- 不把浏览器 localStorage、IndexedDB、base64、Blob URL 或长期签名 URL 作为权威数据源。
- 不让模型直接访问数据库、文件系统、Shell、浏览器、MCP、任意 HTTP 或 Provider 凭证。
- 不把参考项目的客户端 API Key 模式直接复制到 TapFlow。
- 不在没有价格、凭证、模型能力或交付证据时执行付费生成。
- 不恢复旧的 legacy canvas 作为主入口。

## 2. 参考项目吸收与 TapFlow 约束

`CookSleep/gpt_image_playground` 的有效经验是把 Agent 作为 Responses API 的多轮会话，并提供单图生成、批量生成和 `continue_generation` 工具。生成出的图片在下一轮以稳定引用重新注入，模型可以先生成一张基准图，再生成依赖该基准图的页面；批量任务并发执行，失败项可以单独处理。

TapFlow 不复制其客户端持久化和直连 Provider 的做法，而是保留自己的服务端边界：

```text
Responses Agent 会话
        ↓ 仅调用白名单工具
TapFlow Agent Tool Gateway
        ↓
计费 reserve → Workflow Run / Worker → Asset
        ↓
交付验证 → Canvas Draft CAS → Task Event Replay
```

模型看到的是商品安全字段、稳定 assetId、页面计划和有限的图像引用元数据；凭证、上游 URL、原始响应、签名 URL 和图片字节只存在于服务端运行边界。

## 3. 核心状态机

V4 的一个 task 对应一个持久化 Agent 会话和一个画布生产目标。状态必须来自服务端事件，不能从助手文字推断：

```text
draft
  → observing
  → planning
  → preview_ready
  → waiting_for_approval
  → generating_base
  → generating_batch
  → waiting_for_continuation
  → verifying
  → repairing
  → succeeded | partial_success | needs_review | failed | cancelled
```

每次模型响应和工具调用都保存受限的 `agent_task_events`。断线后前端带 `afterSeq` 重放；同一个工具调用使用稳定 idempotency key，重复提交不会重复扣费、重复创建资产或重复写入画布。

## 4. V4 工具协议

模型只可以调用以下命名空间；所有工具均由服务端验证输入、租户、项目、flow、模型、价格和风险。

### 4.1 观察工具

- `canvas.observe`：读取当前画布、选中节点、视口摘要和最近交付结果。
- `reference.inspect`：读取最多 16 个用户已授权参考 asset 的尺寸、类型和安全元数据；不返回原始 URL。这里的 16 个是生成输入引用上限，不等同于画布视口捕获预算；画布/视口视觉捕获仍沿用服务端配置的最多 4 次 bounded capture。
- `product.analyze`：输出商品主体、材质、颜色、结构、不可改变特征和可用视角。

### 4.2 计划工具

- `suite.plan`：输出主图数量、详情页页数、页面顺序、目标尺寸、卖点覆盖和依赖图。
- `visual_bible.create`：生成跨页面共享的主体锁定、色板、光线、背景、字体语气、构图和禁止改动规则。
- `prompt_set.create`：为每一页生成自包含提示词，包含视觉圣经摘要、页面目的、构图、文字安全区、参考图引用和负面约束。

### 4.3 生成工具

- `image.generate_base`：生成一张基准图，要求模型在后续页面中引用其 assetId。
- `image.generate_batch`：并发生成 2 个或以上互不依赖的页面；每个 item 有稳定 `itemId`、prompt、参考 assetId 和输出目标。
- `generation.continue`：只有在已有基准图或上一批结果并需要依赖它们时才能调用，创建下一轮上下文。

### 4.4 画布与控制工具

- `canvas.preview_operations`：返回待审批的节点、边和布局变更，不改变权威草稿。
- `canvas.commit_operations`：审批后用 revision CAS 写入节点、边和 assetId 引用。
- `task.approve`、`task.cancel`、`task.retry_item`、`task.undo`：由产品 UI 调用，不能由模型绕过审批直接调用。

### 4.5 工具结果格式

工具结果只允许产品安全字段：

```ts
type SafeGenerationItem = {
  itemId: string;
  status: "queued" | "running" | "succeeded" | "failed";
  assetId?: string;
  nodeId?: string;
  errorCode?: string;
};
```

禁止字段包括 provider、credential、authorization、route key、上游 URL、签名 URL、响应原文、base64 和二进制数据。

## 5. 淘宝商品套图 Golden Flow

第一条端到端验收流程固定为：

1. 用户上传或选择商品实拍图，并说明类目、目标平台、卖点和不可改变特征。
2. Agent 观察画布和参考图，指出主体数量、视角、背景干扰、清晰度和缺失信息。
3. Agent 规划默认套图，例如 5 张电脑端主图和 8 页详情页；数量、画幅和文案由用户可编辑。
4. Agent 创建视觉圣经：产品外形锁定、材质/颜色、镜头视角、光线、背景色、品牌语气、文字安全区和禁止变更项。
5. Agent 生成每页提示词和依赖图，先请求用户审批，展示预估点数和页面清单。
6. 审批后先生成基准图；成功后把基准图保存为 asset，并注入下一轮引用。
7. 对无相互依赖的页面调用批量生成，服务端并发 reserve/Worker 任务；每个页面独立记录 billing idempotency key。
8. 所有输出落为 assetId，服务端执行主体一致性、尺寸、文本安全区、卖点覆盖和资产归属检查。
9. 失败页面进入 `repairing`，只重试失败 item；成功页面不重复生成或扣费。
10. 用户确认交付后，画布一次性写入页面节点、连线和 assetId；交付报告保留每页提示词、状态和证据。

## 6. 服务端模块边界

### `AgentResponsesSessionService`

管理 Responses 会话、轮次输入输出、稳定引用和分支。它不直接修改画布或余额。

### `AgentToolGateway`

校验工具 schema 和策略，把模型请求转成内部 command；拒绝越权、未知工具和敏感字段。

### `AgentGenerationOrchestrator`

根据工具 command 调用现有 Workflow Run、Worker、计费和资产服务。负责基准图、批量、继续生成、取消和失败修复。

### `AgentDeliveryVerifier`

按 image/text/video modality 验证终态、资产存在、租户/flow lineage、节点落点和必要内容，不接受“Provider 成功”作为交付完成。

### `AgentCanvasCommitter`

把验证通过的结果转换为画布操作集，用 revision CAS、幂等 key 和 inverse patch 提交；冲突返回 409，不静默 rebase。

### `AgentTaskProjector`

把服务端事件投影为前端任务时间线，屏蔽原始模型响应和内部错误细节。

## 7. 数据模型与持久化

复用 `agent_tasks`、`agent_task_events`、`flow_drafts`、`flow_versions`、`assets`、Workflow Run 和 billing ledger。V4 需要在 task output 中保存受限的：

- `conversationId`、`turnId`、`round`。
- `visualBible` 的产品安全摘要和 checksum。
- `suitePlan`、`promptSet`、`dependencyGraph`。
- `generationItems` 的 itemId、状态、assetId、nodeId 和失败 code。
- `appliedCanvas` 的 revision、operationSetId 和 inverse operations。

所有多租户查询带 `tenant_id` 和现有 RLS 上下文；资产只持久化 assetId，临时预览 URL 在读取时生成。

## 8. 审批、计费与错误策略

- 计划、视觉圣经和提示词可以先预览；批量生成、付费调用、覆盖现有节点和大规模画布变更必须审批。
- reserve、settle、refund 和每个 batch item 都使用稳定幂等 key。
- 缺少价格、模型能力、活动凭证或有效 route 时 fail closed，并显示可操作错误。
- Provider 成功但资产写入失败、资产归属不匹配、节点落点失败时，状态为 `needs_review` 或 `partial_success`，不伪造成功。
- 取消在队列前阻止执行；队列后请求 Workflow Run 取消并根据实际状态 settle/refund。
- 重试最多按 item 限制次数；只重试失败或交付证据失效的 item。

## 9. 前端交互

画布右侧任务面板改为真正的会话视图：

- 顶部显示目标、参考图、当前轮次和运行身份。
- 计划区显示主图/详情页数量、依赖图、视觉圣经和逐页提示词。
- 预览区显示每页状态、点数估算、风险和审批按钮。
- 运行区显示基准图、批量队列、每个 item 的进度和失败原因。
- 交付区显示资产缩略图、画布节点、验证证据、单页重试和撤销。

Ghost preview 只用于显示尚未提交的节点和边；生成完成后先进入交付区，用户确认或自动交付策略通过后才写入 flow draft。

## 10. 验收与发布门槛

必须新增以下 Golden Task：

- 一张实拍图生成主图/详情页套图。
- 先生成基准图，再批量生成依赖页面。
- 多轮继续生成后引用上一轮 asset。
- 批量中一页失败，只重试失败页。
- Provider 成功但资产落盘或画布放置失败。
- 刷新、断线、事件重放和任务分支。
- 价格缺失、路线不可用、余额不足和用户取消。
- 视觉圣经中包含提示注入或恶意节点文本。

发布前证据要求：

1. V4 focused tests、API/Worker/DB/AI Gateway tests。
2. 前端 production build、API/Worker build 和 diff check。
3. staging 真实登录、参考图、计费 reserve/settle/refund、Worker、S3、资产库和画布 CAS 验收。
4. 回滚验证：关闭 V4 flags 不删除任务、事件、资产、草稿或 ledger。

## 11. 分阶段实施

### Phase 1：会话与工具协议

实现 Responses session、轮次/引用、工具 schema、事件 projector 和 fail-closed gateway；旧 V3 runtime 保持关闭。

### Phase 2：生成编排

接入基准图、批量、继续生成、计费、Worker、资产和交付验证；完成淘宝套图端到端服务端测试。

### Phase 3：画布交付与 UI

重做任务面板、队列、预览、审批、重试、撤销和画布提交；保留 assetId 权威规则。

### Phase 4：staging 灰度

新增独立的 V4 flags，默认关闭；先只对单租户/测试账号开启。灰度期间 V3 入口保持可回退但不与 V4 共用同一 task；验证 Golden Flow 后再切换默认入口。关闭 V4 flags 时不得删除任务、事件、资产、草稿或 ledger，任何失败都可通过 flags 回滚。

## 12. 明确结论

V4 不再把“模型先规划、服务器随后猜测如何执行”作为主链路。模型通过受限工具持续参与每一轮决策，服务端负责所有真实执行和证据校验，画布负责最终组织和交付。这是吸收参考项目 Agent 能力、同时符合 TapFlow 多租户和计费边界的最小完整重做方案。
