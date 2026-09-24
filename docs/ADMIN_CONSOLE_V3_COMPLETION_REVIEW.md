# 管理后台 v3 完成度复核

日期：2026-09-21。对象：`codex/admin-console-v3` 工作区相对 `b2d1e88f` 的未提交实现。

## 结论

**尚未达到已确认计划的完成标准，不建议作为已验收版本上线。** 独立平台身份、权限分层、统一导航、个人/平台查询、线路操作、物理请求遥测和审计页面已有实质实现；仍存在资金流程缺陷、明细展示/筛选错误及未完成的业务闭环。剩余工作不只是最后一轮测试。

本次只审查并维护文档，没有修改业务代码、提交、推送或部署。P1 表示交付前优先修复，P2 表示影响正确性或日常使用、仍需修复。

## 已确认问题

### 1. [P1] 退款失败后可能永久停在处理中——新增回归

位置：`apps/api/src/modules/payments/payments.service.ts:88`、`packages/db/src/wallet-payments.ts:221`。

先提交 refund_pending，再请求供应商。明确拒绝、请求未发出或进程中断时没有完整恢复路径，下一次申请固定返回 PAYMENT_REFUND_IN_PROGRESS。对账也不能普遍恢复：`000049_wallet_payment_ledger_insert.sql:53` 拒绝 refund_pending 接收正常已支付状态 OD。

独立审查用实际两个 service、内存数据库替身和拒绝退款的供应商替身复现：第一次失败后仍 pending，第二次 409，上游仅调用一次。需要持久化退款尝试，区分明确拒绝、受理和结果未知，并提供安全对账恢复；不能简单清状态后盲目重发。

### 2. [P1] 退款期间积分仍可被消费——既有风险未补齐

位置：`packages/db/src/wallet-payments.ts:228`–`237`。

claim 只改订单，没有冻结充值 grant/钱包额度。提交后，`000055_wallet_reserve_qualified_columns.sql:92` 的消费路径仍可选中该 grant。现金退款成功前若发生预留/消费，`000049_wallet_payment_ledger_insert.sql:135` 拒绝回收该 grant，可能形成现金已退、积分无法正常回收。

这是旧实现已有、本轮防重复点击没有解决的竞态。已核对 SQL 和 claim 写入，**未执行真实数据库并发复现**。需要退款申请与额度冻结原子完成，以及确认回收、失败释放和一致锁顺序。

### 3. [P1] 支付成功但审计可丢失——计划承诺未完成

位置：`apps/api/src/modules/payments/payments.routes.ts:31`、`:98`。

业务先完成，再调用 safeRecordAuditLog，失败返回值被忽略；退款上游抛错时，已提交的申请也没有可靠记录操作者和原因。独立审查向实际 Fastify 路由注入审计连接故障，套餐业务替身已修改，接口仍返回 201。

计划要求资金操作采用事务审计或可靠 outbox，这里仍是原 best-effort 模式。支付写服务也尚未像查询服务一样，在事务中携带操作者重新检查平台身份。

### 4. [P1] 账本借贷语义不一致，扣减显示为增加

位置：`apps/api/src/modules/console-query/console-query.service.ts:108`、`src/admin/adminApi.ts:60`、`src/console/ConsoleUserPage.tsx:23`、`src/console/ConsoleRecordsPage.tsx:21`。

新 API 返回原始 amount_credits，没有 direction；详情前端却依赖 direction，默认加 `+`。数据库 settle 为负数，admin_debit 为正数（`000061_wallet_admin_debit.sql:286`）。因此 settle 显示 `+-12`，管理员扣减显示 `+12`；个人账本也直接显示正数扣减。此问题影响金额解释，不直接修改真实余额。

旧摘要有按事件类型规范化方向的逻辑，新分页接口绕过了它。应统一 API 金额/方向契约，用真实账本事件验证，不能用虚构 direction 的 mock 证明正确。

### 5. [P2] 钱包详情与审计页无法查看七天前记录

位置：`src/console/ConsoleUserPage.tsx:10`、`src/admin/PlatformAuditPage.tsx:8`。

两页都未提供日期筛选，后端默认最近七天。后续 cursor 保留同一窗口，八天前的充值/授权变更在页面中不可达；钱包却声称“全部账本”，审计页也未展示限制。

游标会恢复签名中的 from/to/asOf，**仅未显式发送时间窗口不会导致下一页失效**。问题是缺少更早日期入口和覆盖范围说明。

### 6. [P2] 用量的预留/释放筛选查错字段

位置：`apps/api/src/modules/console-query/console-query.service.ts:128`、`src/console/consoleUi.tsx:58`。

页面提供 reserved/released/unbilled，服务统一匹配 status；没有 usage 的合成生成记录 status 为执行状态，billing_status 才是资金状态。运行中且已预留的记录，选择“已预留”后消失；失败已释放同理。应分开执行状态与计费状态过滤。

### 7. [P2] 调用日志状态筛选遗漏物理请求

位置：`src/console/consoleUi.tsx:58`。

调用页使用任务状态 succeeded/failed 等，新物理请求写入 http_succeeded/http_failed/network_error/cancelled，服务精确匹配。筛选失败时 HTTP 500 请求反而消失。需要传输状态选项和历史汇总兼容规则。

### 8. [P2] 用户/来源筛选遗漏 Workbench、Agent 请求

位置：`apps/api/src/modules/console-query/console-query.service.ts:98`。

查询只用 workflow_run 推导用户和来源，忽略新遥测的 actor_user_id/source。没有 workflow_run 的请求即使记录真实发起人和来源，也被用户或来源筛选排除；带筛选的概览同样受影响。应优先使用明确的新字段，再对旧数据保守回退。

### 9. [P2] 上游成功率混入管理测试等流量

位置：`apps/api/src/modules/console-query/console-query.service.ts:209`。

概览统计所有 request 行，没有按 traffic_class 分开；线路测试明确写入 admin_test。查询/UI 也没有对应过滤。频繁测试会改变运营请求数和成功率，未满足“配置测试与用户调用分开统计”的计划要求。

## 仍未完整交付的计划内容

| 范围 | 当前情况 | 所需补齐 |
|---|---|---|
| P3/P4 任务追踪 | 标量详情和同日关联列表 | 节点/任务时间线、同次执行的请求/轮询集合、准确账务关联、经授权的结果入口 |
| P3/P5 诊断数据 | 已写部分追踪字段，查询未完整提供 | 安全错误码、发起/计费身份、request/task/trace 与连接信息，逐层定位失败 |
| P5 运行统计 | 请求数/成功率已有，P95 和流量分类未完成 | 统计口径完善和代表性样本核对 |
| P5 全局线路测试 | 租户线路可从记录取得 tenant；全局线路无当前 tenant 则 ROUTE_TENANT_REQUIRED | 明确 UI 上下文和实际 service 用例，不能概括所有线路均无需工作区 |
| P6 钱包/审计 | 页面已接入，仍有上述正确性问题 | 完整历史入口、规范金额契约、可靠资金审计和退款恢复 |
| P7 异步导出 | 未发现控制台导出 API、专用 worker/队列、job 迁移、页面入口 | 导出链、申请/下载重新鉴权、过期/限流和 CSV 公式防护 |
| P7 性能 | 有索引，没有符合计划规模的基准记录 | 数据量/机器配置/查询计划，以及首屏和概览 P95 实测 |
| P7 验收 | 有待执行说明，缺完整当前版本端到端证据 | 三类身份、两个以上 tenant、多屏幕、真实生成/资产/结算回归 |

这是本次确认的主要缺口，不是对所有外围功能的逐项完成认证。计划复选框未维护为带证据的完成矩阵，不宜给出可靠完成百分比。生产部署属于单独步骤，未部署本身不等于实施缺陷。

## 本次验证

- `npm run build`：通过，有已有构建警告。
- `npm run build --workspace @aigc-flow/api`：通过，含 DB/AI Gateway Core 前置构建。
- API 定向：platform-admin-guards、console-query.schemas、console-query.routes、ai-gateway-permissions，4 文件/102 测试通过。
- UI 定向：ConsoleUserPage、ConsoleRecordsPage、PlatformAuditPage、ConsoleOverviewPage，4 文件/11 测试通过。
- 独立财务审查：wallet-payments 测试 4/4 通过；另以故障注入确认退款卡住、审计丢失。
- 数据库边界测试：1 个非数据库断言通过，4 个真实 DB 测试跳过，不能算数据库验收通过。
- Docker 当前错误：`open //./pipe/dockerDesktopLinuxEngine: The system cannot find the file specified.` 本轮没有恢复基础设施，也没有进行真实 DB 并发或登录浏览器验收。
- `git diff --check` 未检出 whitespace error，仅 CRLF 规范化警告。本轮未运行全仓完整测试。

## 修复顺序

1. 退款持久状态、积分冻结、资金审计、金额方向契约；补失败/并发/真实事件用例。
2. 修复筛选与流量统计、历史查询入口；补前后端贯通测试。
3. 完成任务追踪与异步导出，再做性能和多角色浏览器验收。
4. 将计划逐项标记为已实现、待验证、未实现并关联证据；验收通过后安排独立部署。

## 修复复核（2026-09-21）

本轮已修复上述 1–9 项缺陷：退款 claim 现在有明确拒绝释放、未知结果保留待对账、积分 grant 冻结并从 reserve/admin debit 候选排除；套餐和退款审计与平台事务绑定；账本返回借贷方向；用户钱包和平台审计支持显式时间窗口；usage/calls 筛选使用正确字段；Workbench/Agent 遥测优先使用明确 actor/source；概览把用户请求与 `admin_test` 分开统计。对应回归测试和构建已通过。

计划表中的任务时间线/尝试集合、完整诊断投影、P95、异步导出、性能基准和真实多角色浏览器/数据库并发验收仍未完成，不能将本分支描述为全量验收或已部署版本。

## 复审补充（2026-09-21）

再次复审发现并修复两个边界问题：退款冻结赠额在到期清理函数中仍可能被清零，以及对账器在获取数据库连接失败后会永久保持运行锁。新增 `000094_wallet_expire_excludes_refund_hold.sql`，并修复对账器的异常复位和调度错误记录；支付查询的处理中/取消结果也纳入事务审计。退款相关迁移同时补充了分离数据库角色的动态执行权限。

## 最终复审结果（2026-09-21）

上一节列出的 P1/P2 缺陷已完成代码修复：退款失败恢复与额度冻结、账本方向、历史时间窗口、计费状态/物理状态/流量类型筛选、Workbench/Agent 遥测归属、`asOf` 关联冻结、概览流量分类、旧线路统计口径和对账器异常复位均已核对。最后一个概览文案断言也已同步到当前 UI 契约。

复审还发现一个权限防御缺口：`ai_routes` 与 `ai_model_catalog` 的运营者 UPDATE policy 原先只判断平台角色，没有判断当前事务是否设置了对应 `platform_scope`。新增 `000095_platform_scope_write_policies.sql`，要求 `platform:routes:write`，并补充普通租户事务直接更新允许运营字段的数据库回归用例。

终审随后补齐三个 P2 语义问题：Workbench 的模型/线路关联统一受 `asOf` 快照约束；钱包摘要、到期提示和管理员活跃 grant 数排除退款冻结额度；平台用户详情用独立的 `platform:users:read` 成员只读 policy 跨租户读取成员关系。物理请求的空 actor/source 也改为保留未知，不再错误回退到 workflow 创建者。

本轮验证结果：

- 控制台/平台相关前端定向测试：13 个文件、59 项通过；其中概览、记录、平台审计和个人钱包回归均通过。
- API 平台权限、控制台查询、支付/退款、对账器和旧线路统计定向测试：146 项通过；15 项数据库环境依赖测试跳过。
- DB 钱包定向测试：5 项通过。
- `npm run build`、`git diff --check`：通过。构建警告为已有的 Browserslist、混合动态导入和大 chunk 提示。

仍不能标记为全量验收的部分：任务时间线与同次执行尝试集合、完整诊断字段投影、P95/性能基准、异步导出，以及真实 PostgreSQL 的迁移/RLS/并发验证和三类身份浏览器验收。当前本机 Docker Linux 引擎不可用，因此没有伪造这些环境证据；分支仍未提交、推送或部署。
