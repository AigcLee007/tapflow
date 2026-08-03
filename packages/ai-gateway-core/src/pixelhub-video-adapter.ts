import { AiGatewayError } from "./errors.js";
import type { ProviderAdapter } from "./provider-adapter.js";
import { readVideoCapabilities, readVideoReferenceMetadata, validateVideoGenerationRequest } from "./video-generation-contract.js";
import type { AssetReferenceInput, PollTaskRequest, ProviderCallContext, ProviderMediaGenerationResult, ProviderTaskResult, VideoGenerationRequest } from "./types.js";

type FetchLike = typeof fetch;
type Task = { taskId: string; status: "queued" | "in_progress" | "completed" | "failed"; progress: number | null; videoUrl: string | null };
const usage = { inputTokens: null, outputTokens: null, totalTokens: null };
const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};

function readUrl(asset: AssetReferenceInput): string {
  const metadata = record(asset.metadata);
  const url = typeof metadata.signedUrl === "string" ? metadata.signedUrl : typeof metadata.url === "string" ? metadata.url : "";
  if (!url.trim()) throw new AiGatewayError({ code: "REFERENCE_ASSET_NOT_FOUND", message: `Reference ${asset.assetId} has no hydrated URL`, statusCode: 422 });
  return url.trim();
}
function inputs(request: VideoGenerationRequest) {
  const collected = { audio: [] as string[], image: [] as string[], video: [] as string[] };
  for (const item of [...(request.inputAssets ?? [])].sort((a, b) => (readVideoReferenceMetadata(a)?.order ?? 0) - (readVideoReferenceMetadata(b)?.order ?? 0))) {
    const metadata = readVideoReferenceMetadata(item);
    if (metadata) collected[metadata.mediaKind].push(readUrl(item));
  }
  return collected;
}
function parseTask(value: unknown): Task {
  const body = record(value); const taskId = typeof body.task_id === "string" ? body.task_id.trim() : "";
  const status = body.status;
  if (!taskId || !["queued", "in_progress", "completed", "failed"].includes(String(status))) throw new AiGatewayError({ code: "PIXELHUB_RESPONSE_INVALID", message: "PixelHub returned an invalid task response", statusCode: 502 });
  const videoUrl = typeof body.video_url === "string" && body.video_url.trim() ? body.video_url.trim() : null;
  if (status === "completed" && !videoUrl) throw new AiGatewayError({ code: "PIXELHUB_RESPONSE_INVALID", message: "Completed PixelHub task has no video URL", statusCode: 502 });
  return { taskId, status: status as Task["status"], progress: typeof body.progress === "number" ? body.progress : null, videoUrl };
}
function summary(httpStatus: number, task: Task) { return { hasVideoUrl: Boolean(task.videoUrl), httpStatus, progress: task.progress, status: task.status, taskId: task.taskId }; }

export class PixelHubVideoAdapter implements ProviderAdapter {
  private readonly fetchImplementation: FetchLike;
  constructor(options?: { fetchImplementation?: FetchLike }) { this.fetchImplementation = options?.fetchImplementation ?? fetch; }

  async generateVideo(context: ProviderCallContext, request: VideoGenerationRequest): Promise<ProviderMediaGenerationResult> {
    const capabilities = readVideoCapabilities(context.requestConfig.capabilities);
    if (!capabilities) throw new AiGatewayError({ code: "UNSUPPORTED_VIDEO_MODE", message: "PixelHub route capabilities are invalid", statusCode: 422 });
    const issue = validateVideoGenerationRequest(request, capabilities)[0];
    if (issue) throw new AiGatewayError({ code: issue.code, message: issue.message, statusCode: 422 });
    const params = request.params!; const model = typeof context.requestConfig.upstreamModel === "string" ? context.requestConfig.upstreamModel.trim() : "";
    if (!model) throw new AiGatewayError({ code: "MODEL_REQUIRED", message: "PixelHub upstream model is required", statusCode: 422 });
    const urls = inputs(request); const body: Record<string, unknown> = { aspect_ratio: params.aspectRatio, duration: params.durationSeconds, model, prompt: request.prompt.trim(), resolution: params.resolution.toLowerCase() };
    if (model === "veo31-fast") { if (urls.image.length) body.image_urls = urls.image; }
    else { if (urls.image.length) body.reference_image_urls = urls.image; if (urls.video.length) body.reference_videos = urls.video; if (model === "sora-v3-pro") { body.generate_audio = params.generateAudio; if (urls.audio.length) body.audio_urls = urls.audio; } }
    const providerRequest = { aspectRatio: body.aspect_ratio, duration: body.duration, generateAudio: body.generate_audio ?? "implicit", model, referenceCounts: { audios: urls.audio.length, images: urls.image.length, videos: urls.video.length }, resolution: body.resolution };
    const response = await this.request(context, "POST", typeof context.requestConfig.requestPath === "string" ? context.requestConfig.requestPath : "/v1/videos", body, providerRequest);
    const task = parseTask(response.body);
    if (task.status === "failed") throw new AiGatewayError({ code: "PIXELHUB_TASK_FAILED", message: "PixelHub reported a failed task", providerRequest, providerResponse: summary(response.status, task), statusCode: 502 });
    if (task.status === "completed") return { modelKey: model, outputs: [{ mimeType: "video/mp4", url: task.videoUrl }], providerRequest, providerResponse: summary(response.status, task), status: "succeeded", usage };
    return { modelKey: model, pollIntervalMs: Number(context.requestConfig.pollIntervalMs) || 12000, providerRequest, providerResponse: summary(response.status, task), providerTaskId: task.taskId, providerTaskTimeoutMs: Number(context.requestConfig.providerTaskTimeoutMs) || 1800000, status: "waiting_provider", usage };
  }

  async pollTask(context: ProviderCallContext, request: PollTaskRequest): Promise<ProviderTaskResult> {
    const template = typeof context.requestConfig.pollPathTemplate === "string" ? context.requestConfig.pollPathTemplate : "/v1/videos/{task_id}";
    const response = await this.request(context, "GET", template.replace("{task_id}", encodeURIComponent(request.providerTaskId)));
    const task = parseTask(response.body); const common = { providerRequest: { method: "GET", providerTaskId: request.providerTaskId }, providerResponse: summary(response.status, task), providerTaskId: task.taskId, usage };
    if (task.status === "queued") return { ...common, status: "pending" }; if (task.status === "in_progress") return { ...common, status: "running" }; if (task.status === "failed") return { ...common, error: { code: "PIXELHUB_TASK_FAILED", message: "PixelHub reported a failed task" }, status: "failed" };
    return { ...common, outputs: [{ mimeType: "video/mp4", url: task.videoUrl }], status: "succeeded" };
  }

  private async request(
    context: ProviderCallContext,
    method: "GET" | "POST",
    path: string,
    body?: Record<string, unknown>,
    providerRequest?: unknown,
  ) {
    const url = `${context.baseUrl.replace(/\/$/, "")}/${path.replace(/^\//, "")}`;
    let response: Response;
    try { response = await this.fetchImplementation(url, { body: body ? JSON.stringify(body) : undefined, headers: { Authorization: `Bearer ${context.apiKey}`, ...(body ? { "Content-Type": "application/json" } : {}) }, method, signal: AbortSignal.timeout(context.timeoutMs) }); }
    catch (error) { throw new AiGatewayError({ code: error instanceof Error && /abort|timeout/i.test(error.name) ? "PROVIDER_TIMEOUT" : "PROVIDER_UNAVAILABLE", message: "PixelHub request failed", providerRequest, statusCode: 502 }); }
    const text = await response.text(); let parsed: unknown = null; try { parsed = text ? JSON.parse(text) : null; } catch { throw new AiGatewayError({ code: "PIXELHUB_RESPONSE_INVALID", message: "PixelHub returned invalid JSON", statusCode: 502 }); }
    if (!response.ok) { const code = response.status === 400 ? "PIXELHUB_REQUEST_REJECTED" : response.status === 401 || response.status === 403 ? "PROVIDER_AUTH_FAILED" : response.status === 429 ? "PROVIDER_RATE_LIMITED" : "PROVIDER_UNAVAILABLE"; throw new AiGatewayError({ code, message: "PixelHub rejected the request", providerRequest, providerResponse: { httpStatus: response.status }, statusCode: response.status }); }
    return { body: parsed, status: response.status };
  }
}
