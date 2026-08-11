import { createWriteStream } from "node:fs";
import { mkdir, rename, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { Pool } from "pg";
import { S3Client } from "@aws-sdk/client-s3";
import { CredentialVault } from "../packages/ai-gateway-core/src/credential-vault.js";
import { PixelHubVideoAdapter } from "../packages/ai-gateway-core/src/pixelhub-video-adapter.js";
import { pixelHubVideoManifest } from "../packages/ai-gateway-core/src/plugins/manifests/pixelhub-video.js";
import type { ProviderCallContext, VideoGenerationRequest } from "../packages/ai-gateway-core/src/types.js";
import { LANDING_FILM_ROUTE_KEY, makeLandingFilmJobs } from "./landing-film-prompts.js";
import { parseLandingFilmCommand, publishApprovedFilm, readApprovalManifest, selectApprovedFilms, selectJobs } from "./landing-film-pipeline.js";

type Route = { auth_tag: Buffer; base_url_override: string | null; connection_base_url: string | null; default_base_url: string | null; encrypted_secret: Buffer; model_key: string | null; nonce: Buffer; provider_key: string; request_config: Record<string, unknown> | null; route_id: string; upstream_model: string | null };
const root = resolve(".codex-tmp/landing-films/v1");

function redactError(error: unknown) { return error instanceof Error ? error.message.replace(/Bearer\s+[^\s]+/gi, "Bearer [redacted]") : "Unknown error"; }
export function requireLandingFilmTenantId(value: string | undefined) {
  const tenantId = value?.trim();
  if (!tenantId) throw new Error("LANDING_FILM_TENANT_ID is required for live generation");
  return tenantId;
}
export function buildLandingFilmRouteQuery() {
  return "SELECT r.id::text route_id, r.upstream_model, r.base_url_override, r.request_config, p.key provider_key, p.default_base_url, m.model_key, pc.base_url connection_base_url, c.encrypted_secret, c.nonce, c.auth_tag FROM ai_routes r JOIN ai_providers p ON p.id=r.provider_id LEFT JOIN ai_models m ON m.id=r.model_id LEFT JOIN ai_provider_connections pc ON pc.id=r.connection_id JOIN api_credentials c ON c.id=COALESCE(r.credential_id,pc.credential_id) WHERE r.route_key=$1 AND r.tenant_id = $2::uuid AND r.status='active' AND p.status='active' AND c.status='active' ORDER BY r.priority, r.created_at";
}
async function route(pool: Pool, tenantId: string): Promise<Route> {
  const result = await pool.query<Route>(buildLandingFilmRouteQuery(), [LANDING_FILM_ROUTE_KEY, tenantId]);
  if (result.rows.length !== 1) throw new Error(`Expected exactly one active credential-bound ${LANDING_FILM_ROUTE_KEY} route for the configured tenant`);
  return result.rows[0];
}
function context(row: Route, apiKey: string): ProviderCallContext {
  const config = pixelHubVideoManifest.routes.find((item) => item.routeKey === LANDING_FILM_ROUTE_KEY)!.requestConfig;
  return { apiKey, baseUrl: row.base_url_override || row.connection_base_url || row.default_base_url || "", modelKey: row.model_key || "gemini-omni-flash", providerKey: row.provider_key, requestConfig: { ...config, ...(row.request_config || {}), capabilities: (row.request_config?.capabilities as Record<string, unknown>) || config.capabilities, upstreamModel: row.upstream_model || "gemini-omni-flash" }, routeId: row.route_id, routeKey: LANDING_FILM_ROUTE_KEY, timeoutMs: 120000 };
}
export function buildVideoDownloadRequest(url: string, offset: number) {
  return { headers: offset > 0 ? { Range: `bytes=${offset}-` } : {}, url };
}
async function download(url: string, target: string) {
  await mkdir(dirname(target), { recursive: true }); const partial = `${target}.part`; const offset = await stat(partial).then((file) => file.size).catch(() => 0);
  const request = buildVideoDownloadRequest(url, offset);
  const response = await fetch(request.url, { headers: request.headers, signal: AbortSignal.timeout(600000) });
  if (!response.ok && response.status !== 206) throw new Error(`Video download failed with HTTP ${response.status}`);
  if (!response.body) throw new Error("Video download returned no body");
  await pipeline(Readable.fromWeb(response.body as never), createWriteStream(partial, { flags: offset && response.status === 206 ? "a" : "w" }));
  if ((await stat(partial)).size < 1024) throw new Error("Video download returned an unexpectedly small body");
  await rename(partial, target);
}
async function generate() {
  const command = parseLandingFilmCommand(process.argv.slice(2)); const jobs = selectJobs(makeLandingFilmJobs(), command.include);
  if (command.dryRun) { process.stdout.write(JSON.stringify({ jobCount: jobs.length, routeKey: LANDING_FILM_ROUTE_KEY, status: "dry_run" }) + "\n"); return; }
  if (command.publish) {
    const approval = selectApprovedFilms(makeLandingFilmJobs(), await readApprovalManifest(command.manifestPath));
    const bucket = process.env.S3_BUCKET; if (!bucket) throw new Error("S3_BUCKET is required for publishing");
    const client = new S3Client({ region: process.env.S3_REGION, endpoint: process.env.S3_ENDPOINT, forcePathStyle: Boolean(process.env.S3_ENDPOINT), credentials: process.env.S3_ACCESS_KEY_ID ? { accessKeyId: process.env.S3_ACCESS_KEY_ID, secretAccessKey: process.env.S3_SECRET_ACCESS_KEY! } : undefined });
    for (const item of approval) { const base = resolve(root, item.chapter, item.variant, item.viewport); const keys = await publishApprovedFilm({ approval: item, bucket, client, masterPath: resolve(base, "master.mp4"), outputDirectory: base }); process.stdout.write(JSON.stringify({ keys, status: "published" }) + "\n"); }
    return;
  }
  if (!process.env.DATABASE_URL || !process.env.CREDENTIAL_MASTER_KEY) throw new Error("DATABASE_URL and CREDENTIAL_MASTER_KEY are required for live generation");
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
  try { const activeRoute = await route(pool, requireLandingFilmTenantId(process.env.LANDING_FILM_TENANT_ID)); const apiKey = new CredentialVault({ keyVersion: process.env.CREDENTIAL_KEY_VERSION, masterKey: process.env.CREDENTIAL_MASTER_KEY }).getSecretForProviderCall({ authTag: activeRoute.auth_tag, encryptedSecret: activeRoute.encrypted_secret, nonce: activeRoute.nonce }); const adapter = new PixelHubVideoAdapter(); const providerContext = context(activeRoute, apiKey);
    for (const job of jobs) { const output = resolve(root, job.chapter, job.variant, job.viewport, "master.mp4"); let result = await adapter.generateVideo(providerContext, { prompt: job.viewport === "desktop" ? job.desktopPrompt : job.mobilePrompt, params: { aspectRatio: job.aspectRatio, count: 1, durationSeconds: job.durationSeconds, generateAudio: true, mode: "text_to_video", resolution: job.resolution }, routeKey: LANDING_FILM_ROUTE_KEY } as VideoGenerationRequest); const stableTaskId = result.providerTaskId; const deadline = Date.now() + 1800000; while (["waiting_provider", "pending", "running"].includes(result.status)) { if (!stableTaskId || Date.now() >= deadline) throw new Error("Provider task did not complete before deadline"); await new Promise((done) => setTimeout(done, result.pollIntervalMs ?? 12000)); result = await adapter.pollTask(providerContext, { providerTaskId: stableTaskId }); } const url = result.outputs?.find((asset) => asset.mimeType.startsWith("video/"))?.url; if (result.status !== "succeeded" || !url) throw new Error(`Generation failed for ${job.chapter}/${job.variant}/${job.viewport}`); await download(url, output); process.stdout.write(JSON.stringify({ chapter: job.chapter, status: "downloaded", variant: job.variant, viewport: job.viewport }) + "\n"); }
  } finally { await pool.end(); }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  generate().catch((error) => { process.stderr.write(JSON.stringify({ error: redactError(error), status: "failed" }) + "\n"); process.exitCode = 1; });
}
