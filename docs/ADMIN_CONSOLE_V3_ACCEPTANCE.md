# 管理控制台 v3：验收、权限切换与回退

更新：2026-09-21。此文是待执行的验收与部署说明，不代表已上线。

## 授权切换的必要条件

控制台迁移 86 新增独立平台身份；迁移 87 移除旧租户派生的平台能力，并收紧 Gateway 写权限。迁移 84、85 已由 Agent runtime 占用。新身份不会根据 `ADMIN_EMAILS`、`system_admin` 或 `tenant_admin` 自动生成。

因此首个超级管理员必须由部署负责人在维护窗口明确初始化。部署前应完成管理员名单审核，确认目标用户存在、状态 active、邮箱已验证。只有名字或旧角色相同不足以确认身份。

生产 API / Worker 使用独立的普通数据库运行角色，迁移使用有能力创建函数所有者与 schema 的账号。`API_DATABASE_ROLE` 表示运行数据库角色名，不是应用内平台角色。如果 API 与迁移共用数据库 owner 登录，PostgreSQL 不能区分 API 与部署人员，也不能提供独立 bootstrap ACL 边界；不能声称配置已满足隔离验收。

## 切换前只读核查

由目标环境负责人执行并记录脱敏结论：

```sql
SELECT version, filename, checksum, executed_at
FROM schema_migrations ORDER BY version;

SELECT current_user, session_user;
SELECT rolname, rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user;

SELECT user_id, role_key, status
FROM tenant_memberships
WHERE role_key IN ('system_admin', 'tenant_admin');
```

最后一份清单是旧租户身份，不是待自动导入的平台管理员列表。由业务负责人逐项核实授权。目标 UUID 不写入公开仓库。

## 部署顺序

使用 `docker-compose.staging.yml`，服务器项目 `/opt/aittco/tapflow`，环境文件 `/opt/aittco/env/tapflow.staging.env`。本次权限切换存在新旧代码不兼容窗口，应暂停 API 和 Worker，禁止旧 API 在撤销旧授权的过程中继续写入。

1. 备份并记录恢复点、当前 image/commit 和迁移清单；准备已核实的 bootstrap 账号。
2. 拉取审核通过的版本并构建镜像。
3. 停止 Worker，再停止 API；前端按维护窗口处理。
4. 用迁移身份运行一次编译后的 `packages/db/dist/cli.js`。运行身份已分离时使用现有 `tapflow-migrator` tools 服务，其读取 `MIGRATION_DATABASE_URL` 和 `API_DATABASE_ROLE`；不要让普通运行角色执行 owner 操作。
5. 在同一维护窗口执行下述一次性初始化；确认结果。
6. 启动 Redis、API、Worker、前端；检查日志与下面的账号验收。

```bash
cd /opt/aittco/tapflow
git fetch --all --prune
git pull --ff-only origin main
docker compose --env-file /opt/aittco/env/tapflow.staging.env -f docker-compose.staging.yml build
docker compose --env-file /opt/aittco/env/tapflow.staging.env -f docker-compose.staging.yml stop tapflow-worker tapflow-api

# 运行与迁移身份已分离的部署使用仓库既有 migrator 服务：
docker compose --env-file /opt/aittco/env/tapflow.staging.env -f docker-compose.staging.yml --profile tools run --rm tapflow-migrator
```

迁移完成后，在经过授权的 migration/table-owner 数据库会话执行：

```sql
SELECT app.bootstrap_platform_super_admin(
  '<reviewed-user-uuid>'::uuid,
  'Reviewed administrator mapping with change-ticket reference',
  'BOOTSTRAP_PLATFORM_SUPER_ADMIN'
);
```

bootstrap 只允许平台 assignment 与 audit 两表均为空时使用，并验证目标 active / email verified。任何拒绝都应先核查原因，不能清空表或删除审计后重试。运行角色不应有该函数的 EXECUTE 权限。不要把 migration 数据库凭据持久注入 API 容器。

```bash
docker compose --env-file /opt/aittco/env/tapflow.staging.env -f docker-compose.staging.yml up -d tapflow-redis tapflow-api tapflow-worker tapflow-frontend
docker compose --env-file /opt/aittco/env/tapflow.staging.env -f docker-compose.staging.yml ps
docker compose --env-file /opt/aittco/env/tapflow.staging.env -f docker-compose.staging.yml logs --tail=100 tapflow-api tapflow-worker
```

现有默认迁移入口 `run --rm tapflow-api node packages/db/dist/cli.js` 只适用于该临时迁移容器明确获得迁移身份的情形。生产镜像不可假定含 TypeScript 源文件，不使用 `npm run db:migrate`。不得因迁移失败继续启动新 Worker。

## 功能与权限验收

| 场景 | 预期结果 |
|---|---|
| 普通用户与团队管理员直接请求所有平台路径 | 403；旧 URL 也不能绕过 |
| 运营 + 工作区 viewer | 能打开模型/线路/巡检；没有因此得到 `flow:run` |
| 运营读取其他工作区普通用户 | 可读取授权元数据；不返回私有提示词、产物正文、密钥 |
| 运营调用积分、支付、凭证、模型发布、平台授权写 API | 403 |
| 运营修改线路 | 只能白名单字段；启用/默认要求当前 revision 的成功测试 |
| 修改执行配置后用旧测试发布 | 拒绝；要求重新测试 |
| 同时降级/封禁最后两个超级管理员 | 至少保留一个有效超级管理员 |
| 撤销授权或禁用用户 | 现有会话失效；下一次敏感请求拒绝 |
| 审计故障注入 | 平台授权、账号状态、积分调整不得成功后丢审计 |
| 同工作区两个用户 | 个人消费只按 billed_user_id；不会重复累计团队消费 |
| 51 条以上用量、21 条以上账单 | 服务端分页完整，无重复、无漏页，筛选进入 URL |
| 一次视频提交、多次 poll、一次结算 | 执行与消费不随 poll 倍增；请求成功不是最终生成成功 |
| 结果未知、未结算与失败释放 | 显示真实独立状态；不猜测退款完成 |
| 改模型名称/价格 | 历史缺失字段标识未知；不伪造旧价格快照 |
| 重复支付通知与退款点击 | 不重复入账；退款原因和处理中状态绑定具体订单 |
| 旧画布、资产、模型发布链 | 稳定 route_key 与 assetId 可用，缺价格仍拒绝免费执行 |

浏览器宽度覆盖 390、768、1024、1440、1920；验证侧栏、表格、键盘导航、菜单关闭、无权页、加载/空/失败状态和返回筛选。合成数据截图不能代替真实登录/生成/入库/结算链路。

## 回退与账号恢复

- 记录兼容新 schema 的已验证回退 image/commit。不能直接回退到重新信任旧 `admin:system` 或邮箱名单的版本。
- 回退 Worker 相关行为前先停 Worker；保持账本不变，不删除平台审计，不重新执行历史生成。
- UI / 查询异常可以关闭对应入口，保留权限修复。线路故障设 inactive，保留历史 route_key。
- 如果所有负责人无法登录，先处理既有邮箱验证/密码重置/账号恢复流程；bootstrap 不是日常找回机制。
- 只有经负责人核实、保留备份和变更记录后才安排数据库层紧急恢复；不提供自动删除授权记录的后门。
- 数据库恢复涉及真实账务回退，必须作为独立的明确批准操作处理。

## 验收记录

最终记录包括：执行版本、迁移 checksum、运行角色核查结果、匿名化测试账号矩阵、测试命令、真实生成结果、分页与统计样例、历史缺失覆盖率、性能测试数据量/机器配置、回退目标。未执行项必须保留为未执行，不用本地构建通过替代上线验收。
