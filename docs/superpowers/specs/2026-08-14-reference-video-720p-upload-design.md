# 上传时自动生成参考视频 720p 版本

## 背景

全能参考生视频会把参考视频作为 `reference_video` 传给 PixelleLabs H3video。该上游接口拒绝超过 720p 的参考视频。当前上传链路只保存原始视频和宽高元数据，视频生成前直接为原资产创建签名 URL，因此高分辨率上传视频会在上游失败。

## 目标与非目标

### 目标

- 用户上传视频后自动生成一个适合参考生视频的 720p 派生版本。
- 保留原始视频，原始资产仍是资产库中的主文件。
- 生成阶段不执行转码；全能参考链路只在需要时读取已生成的派生版本。
- 不增加用户选择项。派生版本未准备好时，阻止本次生成并给出可理解的等待或失败提示。
- 720p 及以下视频不重复转码，直接使用原视频。
- 转码任务按资产和变体幂等，失败不能导致原资产丢失，也不能产生免费生成或错误扣费。

### 非目标

- 不在浏览器中运行 FFmpeg/WASM。
- 不覆盖、删除或重编码原始上传视频。
- 不为普通视频播放、缩略图或视频编辑导出改变现有变体语义。
- 不在本次工作中改变 H3video 的输出分辨率（仍由模型线路能力决定）。

## 方案

采用现有资产派生版本和 worker 队列模式，新增视频参考变体处理能力。

### 数据模型

使用现有 `asset_variants` 表增加内部变体：

- `variant_key`: `reference-720p`
- `mime_type`: `video/mp4`
- `width`、`height`: 实际输出尺寸
- `size_bytes`: 输出文件大小
- `metadata`: `{ source: "video-reference-variant", maxLongEdge: 1280, maxShortEdge: 720, codec: "h264" }`

只在转码成功并写入对象存储后插入或更新该记录。变体记录不存在表示尚未准备好；不把临时签名 URL、文件内容或 Blob 写入画布草稿。

资产主记录可以增加轻量处理状态元数据（例如 `referenceVideoVariantStatus` 为 `pending`、`ready` 或 `failed`），但不改变主资产的 `available` 语义。若当前 API 已有资产状态扩展约定，应沿用该约定；否则以变体记录是否存在作为成功事实，以状态元数据作为用户提示辅助。

### 上传与转码流程

```text
浏览器直传原视频
  -> complete-upload 将资产置为 available
  -> API 为 video 资产投递幂等的 asset video-variant job
  -> worker 从 S3 读取原视频
  -> ffprobe 读取实际视频流尺寸
  -> 若源视频已落在横屏 1280x720 或竖屏 720x1280 的等比约束框内，记录 ready/跳过转码
  -> 否则 FFmpeg 按横屏 1280x720 或竖屏 720x1280 约束框等比缩放
  -> 写入同资产的 reference-720p 对象和 asset_variants 记录
```

FFmpeg 输出使用兼容性优先参数：H.264、`yuv420p`、`+faststart`，保留可用音频；输出尺寸必须完整落在对应约束框内，并向下取偶数，避免编码器因奇数尺寸失败。转码任务复用现有 worker 的 S3 读写、队列和日志模式，使用固定 job id（例如 `assetId:reference-720p`）保证重复完成回调不会产生多份派生文件。

### 生成前选择规则

在 worker 为视频请求补齐资产 URL 时执行选择：

- `kind !== "video"`：维持现有逻辑。
- 原始视频宽高缺失时：先读取数据库元数据；无法确认尺寸时按高分辨率处理，要求 `reference-720p` 就绪。
- 原始视频已落在横屏 1280x720 或竖屏 720x1280 的等比约束框内：使用原始对象 URL。
- 原始视频超过 720p：仅使用 `reference-720p` 变体 URL，禁止回退到原始 URL。
- 变体不存在且处理状态为 pending：抛出可重试的业务错误 `REFERENCE_VIDEO_VARIANT_PROCESSING`，前端显示“参考视频处理中，请稍后再生成”。
- 变体处理失败：抛出 `REFERENCE_VIDEO_VARIANT_FAILED`，前端提示重新上传；不调用上游。

该检查覆盖资产库上传的视频和工作流上游产生后再次作为参考输入的视频。对于后者，资产持久化完成后同样投递变体任务；在变体准备好前不能作为高分辨率参考视频使用。

### 前端行为

- 上传控件不增加压缩开关、分辨率下拉框或确认弹窗。
- 上传成功后资产仍显示原文件名和原始尺寸；可通过现有资产详情接口读取变体准备状态。
- 视频节点引用尚未就绪的高分辨率视频时，在生成按钮附近显示处理中状态并禁用生成。
- 处理失败显示简短错误和重新上传入口，不展示 FFmpeg 命令或对象存储细节。
- 720p 及以下视频保持现有即时可用体验。

## 错误处理与计费

- 下载原文件、ffprobe 或 FFmpeg 失败：标记派生任务失败，保留原资产，记录不含密钥和签名 URL 的结构化日志。
- 变体任务失败或 pending 时，生成请求在 provider 调用前失败；不 reserve 或不产生新的计费 usage。若现有流程已先 reserve，则必须沿用已有 refund/release 路径。
- 上游仍返回分辨率错误时，保留原始 provider 错误日志用于诊断，但前端显示统一的参考视频兼容性提示。
- 对象存储写入成功而数据库写入失败时，重试使用同一对象 key 和幂等 upsert；不删除主资产。
- 定期清理只允许删除孤立的 `reference-720p` 对象，不得删除原始资产或账本记录。

## 组件边界

- API assets service：上传完成后投递视频变体任务，提供变体状态/查询所需的最小字段。
- Redis/BullMQ：新增或扩展资产视频变体队列，job payload 只包含 `tenantId`、`assetId`、`traceId`。
- Worker video reference variant processor：读取原视频、探测尺寸、调用 FFmpeg、写对象存储和 `asset_variants`。
- Worker workflow runtime：在 `hydrateInputAssetUrls` 中按规则解析原始或 `reference-720p` URL，并在未就绪时抛出业务错误。
- Frontend asset/video input UI：消费状态并禁用不满足前置条件的生成操作，不处理媒体字节。

## 测试与验收

- 处理器单元测试：横屏、竖屏、正好 720p、超过 720p、奇数尺寸、无音频、FFmpeg 失败、幂等重复执行。
- API 测试：视频上传完成会投递任务；图片/音频不投递；重复完成回调不会重复投递或产生重复变体。
- worker runtime 测试：高分辨率使用变体、变体 pending/failed 阻止 provider 调用、低分辨率使用原始 URL、变体 URL 不泄露到持久化草稿或日志。
- 前端测试：pending/failed 文案和生成按钮状态，低分辨率视频不显示等待状态。
- 验证命令：相关 workspace 测试、`npm run build`、`git diff --check`。

验收标准：上传一段超过 720p 的视频后，资产原文件仍可下载；`reference-720p` 变体最终为实际不超过 720p 的 MP4；全能参考生视频请求的 `reference_video` 使用变体且不再触发上游分辨率错误；转码未完成或失败时不会调用上游，也不会产生错误计费。
