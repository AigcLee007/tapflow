# TapFlow 邮箱与设备验证设计

日期：2026-07-27
状态：已批准，等待实施计划

## 目标

为 v2 认证链路增加 Brevo 邮箱安全验证：

- 新用户注册后必须完成邮箱验证码验证，验证成功前不签发访问令牌、刷新令牌或登录会话。
- 历史用户的 `email_verified_at` 为空时，在下一次密码登录时完成一次邮箱验证。
- 已验证用户仅在新设备、设备信任过期或异常登录时进行邮箱二次验证。
- 邮箱验证成功后信任当前设备 30 天。
- Brevo API Key 只在 API 服务端使用，不进入前端、数据库、日志或审计 metadata。

本次明确采用前端 `localStorage` 保存可信设备令牌的方案。该方案实现简单，但设备令牌可能在 XSS 场景中被读取。设备令牌不能独立登录，只能在密码验证成功后决定是否跳过邮箱验证码。

## 范围

本次包含：

- v2 注册、登录、验证码验证和重发 API。
- 注册页和登录页内的验证码步骤。
- 验证码挑战与可信设备数据库结构。
- Brevo 事务邮件发送适配器。
- Docker Compose 环境变量注入、环境模板和部署说明。
- API、数据库、前端和构建验证。

本次不包含：

- 短信、TOTP、Passkey 或恢复码。
- 用户可视化的可信设备管理页面。
- GeoIP、国家/城市变化或商业风控服务。
- 将访问令牌和刷新令牌从现有 `localStorage` 迁移到 Cookie。
- 忘记密码或重置密码流程。

## 方案选择

采用服务端可信设备记录配合前端 `localStorage` 随机设备令牌：

- 浏览器只保存高强度随机令牌，不保存密码、验证码、Brevo Key、原始 IP 或原始浏览器指纹。
- 数据库只保存设备令牌的 SHA-256 哈希。
- 服务端仍可让设备记录过期或撤销。
- 原始设备令牌即使被窃取也不能直接换取会话，攻击者仍需通过密码验证。

未采用 HttpOnly Cookie，是用户在了解安全差异后选择了更简单的 `localStorage` 方案。未采用无状态签名设备令牌，因为它难以主动撤销和记录可信设备基线。

## 数据模型

新增迁移 `packages/db/migrations/000042_auth_email_device_verification.sql`。

### `auth_email_challenges`

服务端内部邮箱挑战表，建议字段：

- `id uuid primary key`
- `user_id uuid not null references users(id) on delete cascade`
- `tenant_id uuid references tenants(id) on delete cascade`
- `purpose text not null`，允许 `registration`、`email_verification`、`login_device_verification`
- `reason text not null`，记录未验证邮箱、新设备、信任过期或异常登录
- `challenge_token_hash text not null unique`
- `code_hash text not null`
- `attempts_remaining integer not null default 5`
- `last_sent_at timestamptz not null`
- `expires_at timestamptz not null`
- `consumed_at timestamptz`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

约束确保剩余次数非负，purpose 和 reason 只能使用已知值。索引支持按用户、挑战令牌哈希和有效期查询。

挑战是用户级认证数据。`tenant_id` 记录本次准备进入的工作区；注册和登录验证成功后据此创建租户会话。

### `auth_trusted_devices`

服务端内部可信设备表，建议字段：

- `id uuid primary key`
- `user_id uuid not null references users(id) on delete cascade`
- `token_hash text not null unique`
- `user_agent_fingerprint_hash text`
- `ip_network_hash text`
- `last_seen_at timestamptz not null default now()`
- `trusted_until timestamptz not null`
- `revoked_at timestamptz`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

索引支持按用户、令牌哈希、有效期和撤销状态查询。

可信设备是账户级而不是租户级：同一个用户切换其有权访问的工作区时不应重复验证设备。该表不添加 `tenant_id`，这是对项目多租户表规则的有意例外。表只由预认证服务端代码访问，不提供租户数据 API，也不允许设备令牌绕过用户密码或租户成员权限检查。

## 密码学与指纹

- 验证码为使用密码学安全随机源生成的 6 位数字，有效期 10 分钟。
- 每个挑战最多验证 5 次。次数在数据库事务和行锁内扣减，防止并发重复尝试。
- 验证码哈希使用服务端 `JWT_REFRESH_SECRET` 作为 HMAC 密钥，并加入版本化用途字符串、挑战 ID 和验证码，避免低熵验证码在数据库泄漏后被离线直接枚举。
- 挑战令牌与设备令牌均使用至少 32 字节密码学安全随机值；数据库只存 SHA-256 哈希。
- 浏览器指纹只归类浏览器家族、操作系统家族和设备类型，不包含浏览器版本，避免普通升级频繁触发验证。
- IPv4 使用 `/24` 网段，IPv6 使用 `/56` 网段；数据库只保存网段哈希，不保存新增的原始 IP 数据。

异常登录的判定规则为：可信设备令牌有效时，只有浏览器/操作系统指纹和 IP 网段相对于可信基线同时变化，才强制邮箱验证。只有其中一项变化时允许登录，并更新 `last_seen_at`，但不改变可信基线；下一次验证成功时重建基线。

## API 合约

### 注册

`POST /api/v2/auth/register`

成功创建未验证账户、工作区、成员关系和挑战后返回 HTTP 202：

```json
{
  "status": "verification_required",
  "challengeToken": "opaque-random-token",
  "emailMasked": "a***@example.com",
  "expiresInSeconds": 600,
  "resendAvailableInSeconds": 60,
  "reason": "email_unverified"
}
```

注册阶段不创建 `auth_sessions` 或 `refresh_tokens`。如果 Brevo 发送失败，返回可重试的服务不可用错误，仍不创建登录会话。已经写入的未验证账户可通过使用正确密码登录重新发起邮箱验证。

### 登录

`POST /api/v2/auth/login`

请求在现有字段之外允许可选 `trustedDeviceToken`。服务端始终先验证邮箱、密码和工作区成员关系。

- 邮箱已验证且设备可信、未过期、未撤销、未命中异常规则：返回现有登录令牌响应。
- 邮箱未验证、没有设备令牌、令牌无效或过期，或者命中异常规则：发送验证码并返回 HTTP 202 `verification_required` 响应。
- 邮箱或密码错误继续统一返回 `INVALID_CREDENTIALS`，不透露账户状态。

### 验证邮箱

`POST /api/v2/auth/email/verify`

请求：

```json
{
  "challengeToken": "opaque-random-token",
  "code": "123456"
}
```

服务端在事务中锁定挑战、验证有效期和剩余次数、比较验证码、一次性消费挑战，并在需要时设置 `users.email_verified_at`。随后创建认证会话、刷新令牌和 30 天可信设备记录。

响应在现有登录令牌响应基础上增加原始 `trustedDeviceToken`。该字段只在创建可信设备时返回一次，前端立即集中保存到 `localStorage`，日志和审计不得记录响应内容。

### 重发验证码

`POST /api/v2/auth/email/resend`

请求只包含不可猜测的 `challengeToken`。同一挑战 60 秒内不可重发。重发会生成新验证码、重置 10 分钟有效期和 5 次尝试次数，并使旧验证码立即失效。挑战令牌保持不变，便于前端继续当前步骤。

## 认证服务结构

认证模块拆分为清晰职责：

- `auth.service.ts` 负责编排用户、租户、挑战、设备和会话事务。
- 新的 Brevo 邮件发送器负责构造事务邮件和调用 `https://api.brevo.com/v3/smtp/email`。
- 新的验证安全辅助模块负责验证码、挑战令牌、设备令牌、HMAC/SHA-256 和设备/网段指纹。
- `auth.routes.ts` 负责 Zod 请求解析、HTTP 状态和稳定错误映射。

Brevo 发送器通过接口注入 `AuthService`，数据库集成测试使用内存假发送器，不向 Brevo 发真实邮件。生产使用 Node 内置 `fetch`，设置超时，并只记录不包含请求头、Key、验证码和完整收件地址的错误摘要。

## 前端设计

注册页和登录页继续使用现有认证外壳，不新增主产品路由。

- 初始表单提交后若收到 `verification_required`，同一表单切换为验证码步骤。
- 验证步骤显示脱敏邮箱、6 位验证码输入、确认按钮、重新发送倒计时和返回按钮。
- 注册用户验证成功前不跳转工作区。
- 可信设备正常登录维持现有的邮箱密码直达工作区体验。
- 页面刷新丢失内存中的挑战状态时，用户可重新登录并获得新挑战；不把验证码或挑战令牌长期保存到浏览器。
- `v2AuthClient` 和认证上下文处理鉴权成功与待验证的联合返回类型。
- 可信设备令牌通过集中式认证客户端使用单独的 `localStorage` key 读写，页面组件不直接访问该 key。
- 验证成功后先保存现有访问/刷新令牌与设备令牌，再加载 `/auth/me` 并跳转。

普通退出登录只撤销当前认证会话和刷新令牌，不删除可信设备令牌。设备信任会在 30 天后、浏览器数据被清理后、数据库记录撤销后或异常登录验证后重新建立。

## 错误处理

稳定错误码至少包括：

- `INVALID_CREDENTIALS`
- `EMAIL_ALREADY_REGISTERED`
- `VERIFICATION_REQUIRED`
- `VERIFICATION_INVALID`
- `VERIFICATION_EXPIRED`
- `VERIFICATION_ATTEMPTS_EXHAUSTED`
- `VERIFICATION_RESEND_COOLDOWN`
- `EMAIL_DELIVERY_FAILED`

所有错误使用现有标准错误封装。验证失败不创建会话。Brevo 失败采用 fail-closed 行为：不签发访问令牌、刷新令牌或可信设备令牌。

认证路由继续使用现有 IP 速率限制，并叠加数据库中的 60 秒重发冷却和 5 次验证码尝试上限。挑战消费、尝试次数扣减和会话签发在事务边界内完成，防止同一验证码并发生成多个会话。

## 环境与部署

API 环境增加：

```text
BREVO_API_KEY=<secret>
BREVO_FROM_EMAIL=no-reply@auth.aittco.com
BREVO_FROM_NAME=Art-Aittco
```

更新位置：

- `apps/api/src/config/env.ts`
- `docker-compose.staging.yml` 的 `x-tapflow-env`
- `docs/STAGING_ENV_TEMPLATE.md`

生产模式要求三个变量完整配置，开发和测试允许注入假发送器。仓库文件只记录占位符，不记录真实 Key。

部署遵循现有 Docker Compose v2 顺序：构建镜像，停止 Worker，运行 `node packages/db/dist/cli.js`，再启动 Redis、API、Worker 和 Frontend。迁移必须先于新 API 和 Worker 启动。

## 测试与验收

### 数据库与 API

- 注册返回 202，创建用户、租户、成员和挑战，但不创建会话或刷新令牌。
- 正确验证码标记邮箱已验证、消费挑战、创建会话、刷新令牌和可信设备。
- 错误验证码扣减次数；过期、次数耗尽和已消费挑战不能创建会话。
- 重发冷却生效，新验证码使旧验证码失效。
- 历史 `email_verified_at is null` 用户在密码正确后进入验证步骤。
- 没有、无效、过期或撤销的设备令牌触发验证。
- 有效可信设备且指纹正常时直接登录。
- 仅浏览器/系统指纹变化或仅 IP 网段变化不触发；两者同时变化触发验证。
- Brevo 失败不签发任何认证或设备令牌。
- 原始验证码、设备令牌和 Brevo Key 不出现在数据库敏感字段之外的明文位置、API 日志或审计 metadata。

### 单元与前端

- 验证验证码 HMAC、挑战/设备令牌哈希、浏览器/系统归类、IPv4 `/24` 与 IPv6 `/56` 计算。
- 验证 Brevo URL、请求格式、发件人和错误映射，不断言或打印真实 Key。
- 注册和登录页面能切换验证码步骤、展示重发倒计时、处理稳定错误，并在成功后保存设备令牌和进入工作区。
- 未成功验证时不得设置已认证状态或跳转工作区。

### 命令与人工冒烟

至少执行：

```bash
npm run test --workspace @aigc-flow/api
npm run test --workspace @aigc-flow/db
npm test -- <相关前端测试文件>
npm run build
```

若本地数据库环境缺失，必须报告被跳过的数据库集成测试及原因，并完成不依赖基础设施的单元测试和构建。

部署后使用真实邮箱验证：

1. 新邮箱注册必须先输入邮件验证码才能进入工作区。
2. 同一浏览器在 30 天内再次登录不出现验证码。
3. 清理设备令牌或使用新浏览器时出现验证码。
4. 模拟浏览器/系统和网络同时变化时出现验证码。
5. API、前端和 Worker 日志不包含 Brevo Key、验证码或原始设备令牌。

## 项目记录

实现、验证和部署文档完成后，在同一任务中更新根目录 `PROJECT_RECORD.md`，记录认证行为、迁移、环境变量、验证命令、已知风险和真实邮件冒烟状态。
