import { copyFile, mkdir, rename, rm, stat } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createWriteStream as createStream } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { Pool } from "pg";
import { CredentialVault } from "../packages/ai-gateway-core/src/credential-vault.js";
import { PixelHubVideoAdapter } from "../packages/ai-gateway-core/src/pixelhub-video-adapter.js";
import { pixelHubVideoManifest } from "../packages/ai-gateway-core/src/plugins/manifests/pixelhub-video.js";
import type { ProviderCallContext, VideoGenerationRequest } from "../packages/ai-gateway-core/src/types.js";

export const NODE_WAITING_ROUTE_KEY = "video.pixelhub.gemini-omni-flash";
export type NodeWaitingKind = "text" | "image" | "video";
export type NodeWaitingJob = { kind: NodeWaitingKind; prompt: string };
export const NODE_WAITING_JOBS: NodeWaitingJob[] = [
  { kind: "text", prompt: "A dark writing surface with a calm blinking cursor and restrained fragments of light assembling like text is being composed" },
  { kind: "image", prompt: "Cyan and teal mist with delicate luminous particles gathering into a softly focused image shape" },
  { kind: "video", prompt: "Cinematic frame bands with a precise scanning line passing across them, suggesting a video render in progress" },
];

export function buildNodeWaitingCommand(args: string[]) {
  const generate = args.includes("--generate");
  const confirmed = args.includes("--confirm-generation-cost");
  if (args.some((arg) => !["--generate", "--confirm-generation-cost"].includes(arg))) throw new Error("Unknown command option");
  return { dryRun: !(generate && confirmed) };
}

export function buildNodeWaitingGenerationRequest(job: NodeWaitingJob): VideoGenerationRequest {
  return {
    prompt: job.prompt,
    params: { aspectRatio: "16:9", count: 1, durationSeconds: 4, generateAudio: false, mode: "text_to_video", resolution: "720P" },
    routeKey: NODE_WAITING_ROUTE_KEY,
  } as VideoGenerationRequest;
}

export function getNodeWaitingOutputPaths(kind: NodeWaitingKind) {
  const filename = `${kind}-waiting.mp4`;
  return { temporary: `.codex-tmp/node-waiting-videos/${filename}`, public: `public/node-waiting/${filename}` };
}

const execFileAsync = promisify(execFile);
const MAX_NODE_WAITING_BYTES = 1_500_000;
type FfprobeResult = { format?: { duration?: string; size?: string }; streams?: Array<{ codec_name?: string; codec_type?: string; height?: number; width?: number }> };

export function buildNodeWaitingFfmpegArgs(source: string, target: string) {
  return ["-y", "-i", source, "-map", "0:v:0", "-an", "-vf", "scale=720:720:force_original_aspect_ratio=decrease:force_divisible_by=2", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-movflags", "+faststart", target];
}

export function assertNodeWaitingVideoProbe(probe: FfprobeResult) {
  const video = probe.streams?.find((stream) => stream.codec_type === "video");
  if (!video) throw new Error("Waiting animation must contain a video stream");
  if (video.codec_name !== "h264") throw new Error("Waiting animation video codec must be H.264");
  if (probe.streams?.some((stream) => stream.codec_type === "audio")) throw new Error("Waiting animation must not contain an audio stream");
  if (!video.width || !video.height || Math.max(video.width, video.height) > 720) throw new Error("Waiting animation dimensions must not exceed 720 pixels");
  const duration = Number(probe.format?.duration);
  if (!Number.isFinite(duration) || duration <= 0 || duration > 5) throw new Error("Waiting animation duration must be at most 5 seconds");
  const size = Number(probe.format?.size);
  if (!Number.isFinite(size) || size <= 0 || size > MAX_NODE_WAITING_BYTES) throw new Error("Waiting animation size exceeds the 1.5 MB limit");
}

async function transcodeAndVerifyNodeWaitingVideo(source: string, target: string) {
  await execFileAsync("ffmpeg", buildNodeWaitingFfmpegArgs(source, target));
  const { stdout } = await execFileAsync("ffprobe", ["-v", "error", "-show_entries", "format=duration,size:stream=codec_name,codec_type,width,height", "-of", "json", target]);
  assertNodeWaitingVideoProbe(JSON.parse(stdout) as FfprobeResult);
}

export function redactNodeWaitingError(error: unknown) {
  const value = error as { code?: unknown; message?: unknown; statusCode?: unknown };
  let message = typeof value?.message === "string" ? value.message : "Unknown error";
  message = message.replace(/Bearer\s+[^\s]+/gi, "Bearer [redacted]").replace(/(?:postgres(?:ql)?:\/\/|https?:\/\/)[^\s]+/gi, "[redacted-url]").replace(/(?:DATABASE_URL|CREDENTIAL_MASTER_KEY|API_KEY)\s*=\s*[^\s]+/gi, "$1=[redacted]");
  return { ...(typeof value?.code === "string" ? { code: value.code } : {}), message, ...(typeof value?.statusCode === "number" ? { statusCode: value.statusCode } : {}) };
}

type Route = { auth_tag: Buffer; base_url_override: string | null; connection_base_url: string | null; default_base_url: string | null; encrypted_secret: Buffer; model_key: string | null; nonce: Buffer; provider_key: string; request_config: Record<string, unknown> | null; route_id: string; upstream_model: string | null };

function routeQuery() {
  return `SELECT r.id::text route_id, r.upstream_model, r.base_url_override, r.request_config, p.key provider_key, p.default_base_url, m.model_key, pc.base_url connection_base_url, c.encrypted_secret, c.nonce, c.auth_tag FROM ai_routes r JOIN ai_providers p ON p.id=r.provider_id LEFT JOIN ai_models m ON m.id=r.model_id LEFT JOIN ai_provider_connections pc ON pc.id=r.connection_id JOIN api_credentials c ON c.id=COALESCE(r.credential_id,pc.credential_id) WHERE r.route_key=$1 AND r.tenant_id IS NULL AND r.status='active' AND p.status='active' AND c.status='active' ORDER BY r.priority, r.created_at`;
}
function providerContext(row: Route, apiKey: string): ProviderCallContext {
  const config = pixelHubVideoManifest.routes.find((item) => item.routeKey === NODE_WAITING_ROUTE_KEY)!.requestConfig;
  return { apiKey, baseUrl: row.base_url_override || row.connection_base_url || row.default_base_url || "", modelKey: row.model_key || "gemini-omni-flash", providerKey: row.provider_key, requestConfig: { ...config, ...(row.request_config || {}), capabilities: (row.request_config?.capabilities as Record<string, unknown>) || config.capabilities, upstreamModel: row.upstream_model || "gemini-omni-flash" }, routeId: row.route_id, routeKey: NODE_WAITING_ROUTE_KEY, timeoutMs: 120000 };
}

async function download(url: string, target: string) {
  await mkdir(dirname(target), { recursive: true });
  const partial = `${target}.part`;
  const offset = await stat(partial).then((file) => file.size).catch(() => 0);
  const response = await fetch(url, { headers: offset ? { Range: `bytes=${offset}-` } : {}, signal: AbortSignal.timeout(600000) });
  if (!response.ok && response.status !== 206) throw new Error(`Video download failed with HTTP ${response.status}`);
  if (!response.body) throw new Error("Video download returned no body");
  await pipeline(Readable.fromWeb(response.body as never), createStream(partial, { flags: offset && response.status === 206 ? "a" : "w" }));
  if ((await stat(partial)).size < 1024) throw new Error("Video download returned an unexpectedly small body");
  await rename(partial, target);
}

export async function generateNodeWaitingVideos(args = process.argv.slice(2), environment = process.env) {
  const command = buildNodeWaitingCommand(args);
  if (command.dryRun) {
    process.stdout.write(JSON.stringify({ jobCount: NODE_WAITING_JOBS.length, routeKey: NODE_WAITING_ROUTE_KEY, status: "dry_run" }) + "\n");
    return;
  }
  if (!environment.DATABASE_URL || !environment.CREDENTIAL_MASTER_KEY) throw new Error("DATABASE_URL and CREDENTIAL_MASTER_KEY are required for live generation");
  const pool = new Pool({ connectionString: environment.DATABASE_URL, max: 1 });
  try {
    const result = await pool.query<Route>(routeQuery(), [NODE_WAITING_ROUTE_KEY]);
    if (result.rows.length !== 1) throw new Error(`Expected exactly one active credential-bound ${NODE_WAITING_ROUTE_KEY} route`);
    const row = result.rows[0];
    const apiKey = new CredentialVault({ keyVersion: environment.CREDENTIAL_KEY_VERSION, masterKey: environment.CREDENTIAL_MASTER_KEY }).getSecretForProviderCall({ authTag: row.auth_tag, encryptedSecret: row.encrypted_secret, nonce: row.nonce });
    const adapter = new PixelHubVideoAdapter();
    const context = providerContext(row, apiKey);
    for (const job of NODE_WAITING_JOBS) {
      const paths = getNodeWaitingOutputPaths(job.kind);
      const temporary = resolve(paths.temporary);
      let output = await adapter.generateVideo(context, buildNodeWaitingGenerationRequest(job));
      const taskId = output.providerTaskId;
      const deadline = Date.now() + 1800000;
      while (["waiting_provider", "pending", "running"].includes(output.status)) {
        if (!taskId || Date.now() >= deadline) throw new Error("Provider task did not complete before deadline");
        await new Promise((done) => setTimeout(done, output.pollIntervalMs ?? 12000));
        output = await adapter.pollTask(context, { providerTaskId: taskId });
      }
      const url = output.outputs?.find((asset) => asset.mimeType.startsWith("video/"))?.url;
      if (output.status !== "succeeded" || !url) throw new Error(`Generation failed for ${job.kind}${taskId ? ` (provider task ${taskId})` : ""}`);
      const source = `${temporary}.source.mp4`;
      await download(url, source);
      try {
        await transcodeAndVerifyNodeWaitingVideo(source, temporary);
      } finally {
        await rm(source, { force: true });
      }
      await mkdir(dirname(resolve(paths.public)), { recursive: true });
      await copyFile(temporary, resolve(paths.public));
      process.stdout.write(JSON.stringify({ kind: job.kind, status: "published", path: paths.public }) + "\n");
    }
  } finally {
    await pool.end();
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  generateNodeWaitingVideos().catch((error) => { process.stderr.write(JSON.stringify({ error: redactNodeWaitingError(error), status: "failed" }) + "\n"); process.exitCode = 1; });
}
