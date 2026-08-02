# Aittco 文本模型接入与画布模型选择器设计

日期：2026-08-02
状态：设计已获用户确认，待规格复核后实施

## 1. 目标与范围

将画布文本节点的可用模型统一切换到 `https://api.aittco.com`，使用同一把服务器端 Bearer Key，接入三种上游协议，并让文本模型下拉框只读取数据库中有效且已配置价格的模型和线路。

本次接入包含 8 个产品模型：

| 厂商 | 产品显示名称 | 实际调用模型 | 协议 | 单次积分 |
| --- | --- | --- | --- | ---: |
| Gemini | Gemini-3.1-pro | `gemini-3.1-pro-preview` | Gemini 原生 | 1 |
| Gemini | Gemini-3.5-flash | `gemini-3.5-flash-preview` | Gemini 原生 | 0.5 |
| GPT | GPT-5.6-sol | `gpt-5.6-sol` | Responses | 2 |
| GPT | GPT-5.6-terra | `gpt-5.6-terra` | Responses | 1 |
| GPT | GPT-5.5 | `gpt-5.5` | Responses | 2 |
| Claude | Claude-Opus-5 | `claude-opus-5` | Messages | 2.5 |
| Claude | Claude-Sonnet-5 | `claude-sonnet-5` | Messages | 1.5 |
| Claude | Claude-Opus-4-8 | `claude-opus-4-8` | Messages | 2 |

旧的 SiphonLab 文本线路在新线路发布时设为 `inactive`，保留历史数据和已保存节点引用，不删除数据库历史记录。

不包含：前端暴露 API Key、浏览器直连中转站、删除历史线路、修改图片或视频模型协议。

## 2. Provider、连接与凭证

使用一个数据库 provider 和一个 Provider Connection：

```txt
provider key: aittco-text-relay
provider kind: aittco-text-relay
base URL: https://api.aittco.com
credential type: bearer
```

API Key 通过现有 CredentialVault/Provider Connections 管理，运行时由服务端解密后注入适配器。仓库中只保存环境变量名称或占位符，不保存真实值。

如果部署需要通过环境变量完成首次初始化，变量只作为服务端 bootstrap 输入，并且必须经过现有凭证写入流程；API 响应、前端目录、节点 JSON、日志和截图都不得包含原始 Key、密文、nonce 或完整 Authorization 头。

## 3. 模型、线路与稳定标识

每个产品模型有一个稳定 `modelKey`，每个模型有一条默认线路。产品模型名称和上游真实模型分离：

```txt
modelKey: gemini-3.1-pro
routeKey: text.gemini-3-1-pro
requestConfig.protocol: gemini
requestConfig.model: gemini-3.1-pro-preview
requestConfig.path: /v1beta/models/{model}:generateContent
```

其余模型采用同样的命名规则：模型 key 使用小写稳定产品 key，线路 key 使用 `text.` 前缀，真实上游模型只放在路由 `requestConfig.model` 中。

所有线路均使用：

```txt
routeLabel: 默认线路
mode: sync
modality: text
```

路由需配置正数价格。插件 manifest 和相关校验由“最小 1 积分”调整为“必须大于 0”，从而支持 `0.5`、`1.5` 和 `2.5`。

## 4. 统一文本适配器

新增并注册 `aittco-text-relay` Provider Adapter。适配器根据路由 `requestConfig.protocol` 分发请求，不改变现有 `openai-compatible` 适配器的行为。

### 4.1 公共行为

- URL 由数据库连接 Base URL 和路由 path 组合。
- 所有请求使用 `Authorization: Bearer <server-side-key>` 和 `Content-Type: application/json`。
- 使用现有超时和 `AiGatewayError` 错误映射机制。
- 对非 2xx、超时、空响应、JSON 结构不符合协议的响应返回可识别的网关错误。
- 保留请求摘要和响应摘要用于诊断，但摘要中不得出现密钥、完整 prompt 或完整供应商响应。
- 统一返回文本内容、可选 usage 和供应商 request id。

### 4.2 Gemini 原生协议

请求地址：

```txt
/v1beta/models/{encodeURIComponent(upstreamModel)}:generateContent
```

请求体使用 `contents[].parts[].text`，系统消息映射到 `systemInstruction`，生成参数映射到 `generationConfig`。响应文本从 `candidates[].content.parts[].text` 拼接，usage 从 `usageMetadata` 提取。

### 4.3 GPT Responses 协议

请求地址：

```txt
/v1/responses
```

请求体使用 `model` 和 `input`，并映射文本节点的消息、temperature 和最大输出 token。响应优先读取 `output_text`，否则遍历 `output[].content[].text`；usage 兼容 `input_tokens`、`output_tokens` 和 `total_tokens`。

### 4.4 Claude Messages 协议

请求地址：

```txt
/v1/messages
```

请求体使用 `model`、`messages`、`system`、`max_tokens` 和可选 `temperature`。响应文本从 `content[].text` 拼接，usage 从 `usage.input_tokens` 和 `usage.output_tokens` 提取。

## 5. 数据库目录与画布下拉框

### 5.1 目录元数据

模型 `uiSchema` 增加用于展示的厂商元数据：

```ts
{
  manufacturer: "Gemini" | "GPT" | "Claude",
  logoKey: "google-gemini" | "openai" | "claude"
}
```

这些字段只用于产品目录和 UI，不用于鉴权或运行时路由选择。后端目录继续只返回租户可见的 active 模型和线路；前端继续过滤缺少正数价格的线路，避免无价格线路被当作可执行选项。

### 5.2 下拉框展示

下拉框按以下固定顺序分组：

```txt
Gemini
GPT
Claude
```

每个分组标题带厂商 Logo，每个模型行显示 Logo、产品显示名称、线路名称和积分。provider key、Base URL、上游实际模型不展示给普通用户。

继续使用现有静态 Logo 资源：

```txt
/google-gemini-icon.svg
/openai-icon.svg
/claude-ai-icon.svg
```

模型选择保存 `modelId`、`modelKey`、`routeId`、`routeKey`。不把 API Key、连接信息或临时 URL 写入节点数据。菜单遵循现有共享菜单密度规范：38px 行高、模型名 12px 粗体、辅助信息 9px、紧凑圆角和高层级 portal。

### 5.3 兼容旧节点

读取旧文本节点时优先按 `routeKey` 查找有效线路，再按 `modelKey` 选择默认线路。旧线路已 inactive 或不存在时，节点显示未配置状态，不自动指向不相关模型；用户重新选择后写入新的稳定字段。

## 6. 管理与发布流程

1. 在 AI Gateway 内注册新的插件 manifest、provider kind、适配器和 8 个模型/线路/价格。
2. 创建或更新 Aittco Provider Connection，并通过 CredentialVault 保存同一把 Key。
3. 发布 manifest 后验证数据库模型目录、线路目录和价格。
4. 将旧 SiphonLab 文本 provider/route 设为 inactive。
5. 使用管理员线路测试接口对三类协议各测试一条线路，再从画布文本节点验证 8 个模型均可选择。

生产部署遵循 `docker-compose.staging.yml` 的 v2 顺序：拉取代码、构建镜像、停止 worker、执行编译后的数据库迁移、启动 Redis/API/worker/frontend，再检查状态和日志。真实 Key 只能在服务器凭证配置中设置。

## 7. 验收与测试

### 后端与网关

- manifest 包含且只发布 8 个目标文本模型；每个模型有默认线路和价格。
- 价格校验接受所有大于 0 的数值，拒绝 0 或负数。
- 适配器测试覆盖 Gemini、GPT Responses、Claude 三种请求路径、请求体、响应解析和 usage。
- 测试非 2xx、超时、空响应、格式错误和错误响应脱敏。
- Provider Adapter Registry 和数据库文本 runtime 能按 `aittco-text-relay` 正确创建适配器。

### API 与目录

- 模型目录只返回 active、text、带有效价格的线路。
- 目录包含 manufacturer/logo 元数据，且不返回凭证或 Base URL。
- 旧 SiphonLab 线路不再作为普通文本节点选项出现。

### 前端

- 下拉框无静态占位模型。
- 分组顺序、Logo、显示名称、线路和积分正确。
- 选择后节点保存正确的 model/route 标识。
- 加载中、加载失败、暂无可用模型状态不黑屏。

### 命令

至少运行：

```bash
npm run build
npm test
npm run test --workspace @aigc-flow/ai-gateway-core
npm run test --workspace @aigc-flow/api
```

如果本地基础设施缺失，记录具体失败命令和已完成的静态/单元验证，不把环境缺失误判为代码通过。

## 8. 风险与回滚

- 任一协议不兼容时，可将对应 route 设为 `inactive`，不删除模型历史记录。
- 适配器异常时先停止 worker 或禁用对应线路，避免生成任务持续占用积分。
- 旧线路保留用于审计和历史节点解析，但不在普通模型目录中展示。
- 不直接回滚或删除账单记录；失败生成遵循现有 reserve/settle/refund 流程。
