# Canvas Agent V4 staging 验收清单

V4 默认关闭。仅对测试租户开启 `AGENT_V4_ENABLED=true`、`AGENT_V4_RUNTIME_ENABLED=true`，并同步前端 `VITE_AGENT_V4_ENABLED=true`。

## 发布前

- `git pull --ff-only origin codex/canvas-agent-v3`
- `npm run build`
- `npm run build --workspace @aigc-flow/api`
- `npm run build --workspace @aigc-flow/worker`
- 运行 V4 API/Worker/前端聚焦测试。
- 确认 staging env 已配置真实 priced route、S3、Redis、Postgres；禁止 mock route 作为默认线路。

## Golden Flow

1. 测试账号登录，进入项目主画布。
2. 上传一张商品实拍图，确认画布和 `/assets` 只保存 `assetId`。
3. 发送“生成淘宝主图和详情页套图”，确认 Agent 依次执行观察、商品分析、套图规划、视觉圣经和逐页提示词。
4. 确认计划展示主图/详情页数量、依赖图、预估点数，并停在审批状态。
5. 未审批前确认没有 Workflow Run、账单 reserve 或第三方调用。
6. 审批后确认基准图和批量页面按稳定幂等 key 创建 Workflow Run。
7. 确认 Worker 执行后 task 收到 `delivery_verified`，资产进入 `/assets`，事件和前端不包含 URL、provider、credential 或原始响应。
8. 故意让一个页面失败，只重试失败 item，成功页面不重复生成或扣费。
9. 刷新页面、断开 SSE 后使用 `afterSeq` 重放，确认事件顺序连续且无重复副作用。
10. 通过画布预览确认节点和边，使用 revision CAS 提交；制造 revision 冲突时必须返回 409。

## 失败与回滚

- 缺少价格、余额不足、route 不可用、S3 写入失败时确认 fail-closed，不产生免费执行。
- 取消任务后确认队列前阻止执行，队列后由 Workflow 取消并按实际状态 settle/refund。
- 关闭两个 V4 flag 并重启 API/Worker/frontend；确认历史 task、events、assets、drafts 和 ledger 不被删除。
- 回滚到上一 git commit 前先停止 Worker，迁移保持向后兼容；恢复后检查 V2/V3 路径仍可用。

## 证据记录

记录测试命令、commit、环境 flag、测试租户、taskId、workflowRunId、资产 ID、账单流水和回滚结果。不得记录 API key、签名 URL、Authorization header 或 provider 原始响应。
