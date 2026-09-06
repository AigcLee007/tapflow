# 对话式画布共创 Agent 设计

日期：2026-09-06  
状态：已获用户确认，待实施计划

## 1. 目标

将当前 Canvas Agent 从“右侧聊天/工具面板”升级为 TapNow 风格的对话式共创 Agent：先理解模糊目标，通过少量问题、选项、比较和方案确认与用户共同形成 Brief，再执行 Skill/App/画布操作，并在结果出现后进入连续深化模式。

核心原则：

- 默认先澄清，不默认直接生成或修改。
- Agent 的基本单位是可恢复的任务，而不是一条消息。
- 用户看到结构化信息，不被内部 provider、route、credential、model 细节打扰。
- 任何付费生成、批量操作或大范围画布修改都经过明确确认。
- 执行结果必须可定位、可选择、可继续编辑并可靠写回画布。

## 2. 目标用户流程

```txt
用户提出目标
  -> Agent 复述理解并识别不确定点
  -> 提出 1-3 个关键问题
  -> 用户点击选项或自由回答
  -> Agent 形成设计 Brief 和候选方向
  -> 推荐 Skill / App / 预计步骤 / 费用
  -> 用户确认
  -> Agent 执行并持续更新进度
  -> 结果组、对比和选择
  -> 用户要求变体或修改
  -> Agent 进入连续深化模式
  -> 结果以 assetId/节点形式写回画布
```

示例：用户提供小黄人图片并要求设计儿童陪伴玩具。Agent 第一轮必须先询问年龄、产品形态和陪伴目标；随后给出 2-4 个方向和比较表；确认 Brief 后才生成产品概念图。

## 3. 信息架构

Agent 面板保留在画布右侧，但从 Tab 面板改为任务工作台：

```txt
任务标题 / 菜单 / 收起
任务上下文与参考素材
结构化对话流
当前问题或待确认动作
输入框、引用素材、发送
```

日志、历史、Skill 浏览、模型和费用详情下沉到二级抽屉或任务详情；默认界面只展示任务、问题、决策、进度和结果。

建议桌面宽度 480-560px，窄屏使用全屏抽屉。所有表格、选择卡、Skill/App 卡和结果组必须在窄宽下可读。

## 4. 结构化对话协议

Agent 回复不再只渲染 Markdown，统一为白名单 `ConversationBlock`：

```ts
type ConversationBlock =
  | { type: "heading"; level: 1 | 2 | 3; text: string }
  | { type: "paragraph"; text: string }
  | { type: "question"; id: string; question: string; selectionMode: "single" | "multiple"; options: AgentOption[]; allowFreeform: boolean }
  | { type: "choice_grid"; title?: string; options: AgentOption[] }
  | { type: "comparison_table"; columns: TableColumn[]; rows: TableRow[] }
  | { type: "brief_card"; fields: BriefField[] }
  | { type: "plan_card"; steps: PlanStep[]; estimate?: CostEstimate }
  | { type: "capability_card"; kind: "skill" | "app"; capability: CapabilitySummary }
  | { type: "confirmation"; actions: ConfirmationAction[] }
  | { type: "progress"; steps: ProgressStep[] }
  | { type: "asset_group"; assets: AssetRef[] }
  | { type: "result_group"; results: ResultRef[] }
  | { type: "error"; message: string; retry?: ConfirmationAction };
```

模型只能输出该协议的安全字段，前端不得解释任意 HTML、CSS 或内部运行字段。

## 5. 状态机

将用户协作状态与后台执行状态分离：

```ts
type AgentConversationState =
  | "idle" | "understanding" | "asking" | "waiting_for_choice"
  | "summarizing" | "waiting_for_confirmation" | "executing"
  | "presenting_results" | "refining" | "completed" | "failed";

type AgentExecutionState =
  | "not_started" | "planning" | "awaiting_approval" | "running"
  | "partial_success" | "succeeded" | "failed" | "cancelled";
```

决策边界：信息不足时 `ask_user`；存在多个方向时 `propose_plan`；存在费用或风险时 `wait_confirmation`；确认后才 `execute`；完成后 `present_results`。

每个 Turn 保存 `blocks`、`pendingQuestion`、`proposedPlan`、上下文快照和状态，确保刷新、历史查看与事件重放仍然可读。

## 6. Skill 与 App

Skill 和 App 使用同一套用户可理解的能力卡：名称、彩色图标、用途、输入、输出、步骤、费用和状态。隐藏 provider、route、credential、原始 URL 等内部字段。

示例：

- 🎨 产品概念设计：把参考图片转为产品外观方向
- 🧸 儿童产品设计：检查年龄适配、互动和安全表达
- 📐 工业设计表达：生成正面、侧面、材质和结构视图
- 🎨 图像生成应用：根据确认的 Brief 生成 4 个候选

用户可以接受推荐、替换能力或只使用其中一项；付费能力进入统一确认卡。

## 7. 视觉系统

- 一级标题 20-22px / 700-800；二级标题 15-17px / 700；正文 13-14px；辅助文字 11-12px。
- 蓝色表示进行中，绿色表示完成，橙色表示需要确认或费用，紫色表示 Skill/专业能力，红色表示失败。
- 卡片必须区分任务、上下文、选择、能力、进度、结果和错误用途。
- 选项、表格和结果卡优先使用共享菜单/卡片密度规范，避免大号表单化控件。
- 图标与颜色共同表达状态，不仅依赖颜色。

## 8. 画布协作

- 参考素材卡可定位并选中画布节点。
- 结果组支持对比、选择、设为参考、放到画布、继续编辑和生成变体。
- 画布写回只使用 `assetId` 和节点引用，遵守现有服务器草稿与资产规则。
- 每次执行使用 `AgentContextSnapshot` 保存 selectedNodeIds、assetIds、skillIds、appIds 和 graphRevision，避免上下文漂移和覆盖新编辑。

## 9. 代码边界

保留现有 V2 session、event stream、权限、审批、计费、Asset ID 写回、CanvasAgentOp 和 Skill Run 底层能力。

新增建议目录：

```txt
src/flowCanvas/agent/conversation/
  ConversationBlockRenderer.tsx
  ConversationBlockTypes.ts
  ConversationQuestionCard.tsx
  ConversationChoiceGrid.tsx
  ConversationComparisonTable.tsx
  ConversationBriefCard.tsx
  ConversationCapabilityCard.tsx
  ConversationConfirmationCard.tsx
  ConversationProgressCard.tsx
  ConversationResultGroup.tsx
  ConversationRenderer.test.tsx
```

重点重组 `CanvasAgentWorkspaceShell`、`CanvasAgentPanel`、`CanvasAgentConversationView`、`CanvasAgentComposer`、`CanvasAgentTimeline`、`CanvasAgentPlanCard`、`CanvasAgentResultCard` 和 `CanvasAgentSkillPlan`，而不是再增加一套平行 Agent。

## 10. 分阶段交付

### Phase 1：结构化对话 UI

实现 Block 类型、统一 Renderer、问题/选项/表格/确认卡、持久化与 replay。验收：刷新不丢失，问题可点击回答，窄屏可读。

### Phase 2：协作式规划

实现 `ask_user`、`propose_plan`、`wait_confirmation`、Brief 卡、多轮问题、修改上一步和推荐选项。验收：信息不足时不创建付费 Workflow Run。

### Phase 3：Skill/App 能力卡

实现推荐、替换、步骤、费用、状态、取消、重试和失败恢复。验收：用户能理解能力用途，不暴露内部配置。

### Phase 4：结果组与画布联动

实现结果对比、选择、定位、放置、继续编辑、变体和回退。验收：结果、资产和画布节点保持绑定。

### Phase 5：体验打磨

实现流式更新、折叠、微动画、快捷建议、长任务恢复和移动端抽屉。

## 11. 非目标与约束

- 不复制 TapNow 的品牌、图标或具体视觉资产，只借鉴其结构化协作原则。
- 不恢复旧 InfiniteCanvas 或旧创作入口。
- 不把浏览器本地存储作为 Agent、画布或资产权威来源。
- 不让模型直接决定扣费、写入大范围画布或绕过审批。
- 不在第一阶段同时重做底层 Worker、AI Gateway 和账单架构。

## 12. 验收标准

用户输入一个模糊创作目标后，Agent 能：

1. 复述目标并指出未知信息。
2. 用结构化问题和选项进行至少一轮澄清。
3. 给出可比较的方向和 Brief。
4. 在用户确认前不执行付费生成或大范围画布修改。
5. 展示 Skill/App、步骤、费用和执行进度。
6. 将多个结果组织成可选择的结果组。
7. 支持继续修改、变体和设为参考。
8. 刷新、历史回放和重开项目后仍然保留完整协作过程。
