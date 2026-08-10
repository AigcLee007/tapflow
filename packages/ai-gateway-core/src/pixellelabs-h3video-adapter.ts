import { AiGatewayError } from "./errors.js";
import type { ProviderAdapter } from "./provider-adapter.js";
import { readVideoCapabilities, readVideoReferenceMetadata, validateVideoGenerationRequest } from "./video-generation-contract.js";
import type { AssetReferenceInput, PollTaskRequest, ProviderCallContext, ProviderMediaGenerationResult, ProviderTaskResult, VideoGenerationRequest } from "./types.js";

type FetchLike = typeof fetch;
type Task = { taskId: string; status: "queued" | "processing" | "completed" | "failed"; progress: number | null; videoUrl: string | null };
const usage = { inputTokens: null, outputTokens: null, totalTokens: null };
const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};

function readUrl(asset: AssetReferenceInput): string {
  const metadata = record(asset.metadata);
  const url = typeof metadata.signedUrl === "string" ? metadata.signedUrl : typeof metadata.url === "string" ? metadata.url : "";
  if (!url.trim()) throw new AiGatewayError({ code: "REFERENCE_ASSET_NOT_FOUND", message: `Reference ${asset.assetId} has no hydrated URL`, statusCode: 422 });
  return url.trim();
}

function inputs(request: VideoGenerationRequest) {
  const collected = { audio: [] as string[], image: [] as string[], video: [] as string[], mainImage: null as string | null };
  for (const item of [...(request.inputAssets ?? [])].sort((a, b) => (readVideoReferenceMetadata(a)?.order ?? 0) - (readVideoReferenceMetadata(b)?.order ?? 0))) {
    const metadata = readVideoReferenceMetadata(item);
    if (!metadata) continue;
    const url = readUrl(item);
    if (metadata.mediaKind === "image" && metadata.role === "main_image" && !collected.mainImage) collected.mainImage = url;
    collected[metadata.mediaKind].push(url);
  }
  return collected;
}

function parseTask(value: unknown): Task {
  const body = record(value);
  const taskId = typeof body.task_id === "string" ? body.task_id.trim() : typeof body.id === "string" ? body.id.trim() : "";
  const status = String(body.status ?? "");
  if (!taskId || !["queued", "processing", "completed", "failed"].includes(status)) throw new AiGatewayError({ code: "PROVIDER_UNAVAILABLE", message: "PixelleLabs returned an invalid H3video task response", statusCode: 502 });
  const videoUrl = typeof body.video_url === "string" && body.video_url.trim() ? body.video_url.trim() : null;
  if (status === "completed" && !videoUrl) throw new AiGatewayError({ code: "PROVIDER_UNAVAILABLE", message: "Completed H3video task has no video URL", statusCode: 502 });
  return { taskId, status: status as Task["status"], progress: typeof body.progress === "number" ? body.progress : null, videoUrl };
}

function summary(httpStatus: number, task: Task) { return { hasVideoUrl: Boolean(task.videoUrl), httpStatus, progress: task.progress, status: task.status, taskId: task.taskId }; }

export class PixelleLabsH3VideoAdapter implements ProviderAdapter {
  private readonly fetchImplementation: FetchLike;
  constructor(options?: { fetchImplementation?: FetchLike }) { this.fetchImplementation = options?.fetchImplementation ?? fetch; }

  async generateVideo(context: ProviderCallContext, request: VideoGenerationRequest): Promise<ProviderMediaGenerationResult> {
    const capabilities = readVideoCapabilities(context.requestConfig.capabilities);
    if (!capabilities) throw new AiGatewayError({ code: "UNSUPPORTED_VIDEO_MODE", message: "PixelleLabs H3video route capabilities are invalid", statusCode: 422 });
    const issue = validateVideoGenerationRequest(request, capabilities)[0];
    if (issue) throw new AiGatewayError({ code: issue.code, message: issue.message, statusCode: 422 });
    const urls = inputs(request);
    const model = typeof context.requestConfig.upstreamModel === "string" && context.requestConfig.upstreamModel.trim() ? context.requestConfig.upstreamModel.trim() : "H3video-2k";
    const params = request.params!;
    const body: Record<string, unknown> = { model, prompt: request.prompt.trim(), aspect_ratio: params.aspectRatio, resolution: "2K", seconds: "15" };
    if (urls.mainImage) body.image_url = urls.mainImage;
    else if (request.params?.mode === "image_to_video" && urls.image.length) body.image_url = urls.image[0];
    const referenceImages = urls.image.filter((url) => url !== urls.mainImage);
    if (referenceImages.length) body.reference_image_urls = referenceImages;
    if (urls.video.length === 1) body.reference_video = urls.video[0]; else if (urls.video.length > 1) body.reference_videos = urls.video;
    if (urls.audio.length === 1) body.audio_url = urls.audio[0]; else if (urls.audio.length > 1) body.audio_urls = urls.audio;
    const providerRequest = { aspectRatio: body.aspect_ratio, duration: 15, model, referenceCounts: { audios: urls.audio.length, images: urls.image.length, videos: urls.video.length }, resolution: "2K" };
    const response = await this.request(context, "POST", typeof context.requestConfig.requestPath === "string" ? context.requestConfig.requestPath : "/v1/videos", body, providerRequest);
    const task = parseTask(response.body);
    if (task.status === "failed") throw new AiGatewayError({ code: "PROVIDER_UNAVAILABLE", message: "PixelleLabs reported a failed H3video task", providerRequest, providerResponse: summary(response.status, task), statusCode: 502 });
    if (task.status === "completed") return { modelKey: model, outputs: [{ mimeType: "video/mp4", url: task.videoUrl }], providerRequest, providerResponse: summary(response.status, task), status: "succeeded", usage };
    return { modelKey: model, pollIntervalMs: Number(context.requestConfig.pollIntervalMs) || 12000, providerRequest, providerResponse: summary(response.status, task), providerTaskId: task.taskId, providerTaskTimeoutMs: Number(context.requestConfig.providerTaskTimeoutMs) || 1800000, status: "waiting_provider", usage };
  }

  async pollTask(context: ProviderCallContext, request: PollTaskRequest): Promise<ProviderTaskResult> {
    const template = typeof context.requestConfig.pollPathTemplate === "string" ? context.requestConfig.pollPathTemplate : "/v1/videos/{task_id}";
    const response = await this.request(context, "GET", template.replace("{task_id}", encodeURIComponent(request.providerTaskId)));
    const task = parseTask(response.body); const common = { providerRequest: { method: "GET", providerTaskId: request.providerTaskId }, providerResponse: summary(response.status, task), providerTaskId: task.taskId, usage };
    if (task.status === "queued") return { ...common, status: "pending" }; if (task.status === "processing") return { ...common, status: "running" }; if (task.status === "failed") return { ...common, error: { code: "PROVIDER_UNAVAILABLE", message: "PixelleLabs reported a failed H3video task" }, status: "failed" };
    return { ...common, outputs: [{ mimeType: "video/mp4", url: task.videoUrl }], status: "succeeded" };
  }

  private async request(context: ProviderCallContext, method: "GET" | "POST", path: string, body?: Record<string, unknown>, providerRequest?: unknown) {
    const url = `${context.baseUrl.replace(/\/$/, "")}/${path.replace(/^\//, "")}`;
    let response: Response;
    try { response = await this.fetchImplementation(url, { body: body ? JSON.stringify(body) : undefined, headers: { Authorization: `Bearer ${context.apiKey}`, ...(body ? { "Content-Type": "application/json" } : {}) }, method, signal: AbortSignal.timeout(context.timeoutMs) }); }
    catch (error) { throw new AiGatewayError({ code: error instanceof Error && /abort|timeout/i.test(error.name) ? "PROVIDER_TIMEOUT" : "PROVIDER_UNAVAILABLE", message: "PixelleLabs H3video request failed", providerRequest, statusCode: 502 }); }
    const text = await response.text(); let parsed: unknown = null; try { parsed = text ? JSON.parse(text) : null; } catch { throw new AiGatewayError({ code: "PROVIDER_UNAVAILABLE", message: "PixelleLabs returned invalid JSON", providerRequest, statusCode: 502 }); }
    if (!response.ok) { const code = response.status === 400 ? "PROVIDER_BAD_REQUEST" : response.status === 401 || response.status === 403 ? "PROVIDER_AUTH_FAILED" : response.status === 429 ? "PROVIDER_RATE_LIMITED" : "PROVIDER_UNAVAILABLE"; throw new AiGatewayError({ code, message: "PixelleLabs rejected the H3video request", providerRequest, providerResponse: { httpStatus: response.status }, statusCode: response.status }); }
    return { body: parsed, status: response.status };
  }
}
