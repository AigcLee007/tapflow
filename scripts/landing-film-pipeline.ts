import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { access, mkdir, readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

import { LANDING_FILM_PREFIX, type LandingFilmJob, type LandingViewport } from "./landing-film-prompts.js";

export type LandingFilmCommand = { dryRun: boolean; generationConfirmed: boolean; include: string[]; manifestPath: string; publish: boolean; verifyPublic: boolean };
export type ApprovedFilm = { chapter: string; durationSeconds: number; startSeconds: number; variant: string; viewport: LandingViewport };
export type ApprovedFilmManifest = { approved: ApprovedFilm[] };
type ProbeResult = { format?: { format_name?: string }; streams?: Array<{ codec_name?: string; codec_type?: string }> };

export function buildLandingFilmObjectKeys(chapter: string, variant: string, viewport: LandingViewport) {
  const base = `${LANDING_FILM_PREFIX}/${chapter}/${variant}/${viewport}`;
  return { master: `${base}/master.mp4`, poster: `${base}/poster.webp`, video: `${base}/loop.mp4` };
}

export function buildImmutableLandingFilmPutInput(bucket: string, key: string, body: Buffer, contentType: string) {
  return { Body: body, Bucket: bucket, CacheControl: "public, max-age=31536000, immutable", ContentType: contentType, IfNoneMatch: "*", Key: key, Metadata: { sha256: createHash("sha256").update(body).digest("hex") } };
}

export function parseLandingFilmCommand(args: string[]): LandingFilmCommand {
  const publish = args.includes("--publish");
  const verifyPublic = args.includes("--verify-public");
  const generationConfirmed = args.includes("--confirm-generation-cost");
  const generate = args.includes("--generate");
  if (generate && !generationConfirmed) throw new Error("Live generation requires --confirm-generation-cost");
  if ((publish || verifyPublic) && !args.some((arg) => arg.startsWith("--approved-manifest="))) throw new Error("Publishing or public verification requires --approved-manifest=<local file>");
  const include = args.find((arg) => arg.startsWith("--include="))?.slice("--include=".length).split(",").filter(Boolean) ?? [];
  return { dryRun: !generate && !publish && !verifyPublic, generationConfirmed, include, manifestPath: args.find((arg) => arg.startsWith("--approved-manifest="))?.slice("--approved-manifest=".length) ?? "", publish, verifyPublic };
}

export function selectJobs(jobs: LandingFilmJob[], include: string[]) {
  if (!include.length) return jobs;
  return jobs.filter((job) => include.some((needle) => `${job.chapter}/${job.variant}`.startsWith(needle)));
}

export function selectApprovedFilms(jobs: LandingFilmJob[], manifest: ApprovedFilmManifest) {
  if (!Array.isArray(manifest.approved) || !manifest.approved.length) throw new Error("Approval manifest must select at least one film");
  if (manifest.approved.length !== jobs.length) throw new Error("Approval manifest must provide complete coverage for every landing film output");
  const selected = manifest.approved.map((approval) => {
    if (approval.durationSeconds < 8 || approval.durationSeconds > 12) throw new Error("Approved loop duration must be between 8 and 12 seconds");
    if (approval.startSeconds < 0) throw new Error("Approved loop start must not be negative");
    const job = jobs.find((candidate) => candidate.chapter === approval.chapter && candidate.variant === approval.variant && candidate.viewport === approval.viewport);
    if (!job) throw new Error(`Approval references an unknown job: ${approval.chapter}/${approval.variant}/${approval.viewport}`);
    return { ...approval, job };
  });
  const identities = new Set(selected.map((item) => `${item.chapter}/${item.variant}/${item.viewport}`));
  if (identities.size !== selected.length) throw new Error("Approval manifest contains duplicate landing film outputs");
  if (identities.size !== jobs.length) throw new Error("Approval manifest must provide complete coverage for every landing film output");
  return selected;
}

export function requireLandingMediaPublicBaseUrl(value: string | undefined) {
  const baseUrl = value?.trim().replace(/\/+$/, "");
  if (!baseUrl) throw new Error("LANDING_MEDIA_PUBLIC_BASE_URL is required for publishing or public verification");
  let parsed: URL;
  try { parsed = new URL(baseUrl); } catch { throw new Error("LANDING_MEDIA_PUBLIC_BASE_URL must be an absolute http(s) URL"); }
  if (!/^https?:$/.test(parsed.protocol) || parsed.username || parsed.password || parsed.search || parsed.hash) throw new Error("LANDING_MEDIA_PUBLIC_BASE_URL must be a credential-free http(s) URL without query parameters");
  return baseUrl;
}

export function getLandingFilmPublicUrl(baseUrl: string, objectKey: string) {
  const keyPrefix = `${LANDING_FILM_PREFIX}/`;
  if (!objectKey.startsWith(keyPrefix)) throw new Error(`Object key is outside the landing film prefix: ${objectKey}`);
  return `${baseUrl}/${objectKey.slice(keyPrefix.length)}`;
}

export async function verifyPublicLandingFilmObject(baseUrl: string, objectKey: string) {
  const response = await fetch(getLandingFilmPublicUrl(baseUrl, objectKey), { method: "HEAD", signal: AbortSignal.timeout(30000) });
  if (!response.ok || Number(response.headers.get("content-length") || 0) <= 0) throw new Error(`Public landing film object verification failed: ${objectKey}`);
}

export async function readApprovalManifest(path: string): Promise<ApprovedFilmManifest> {
  const resolved = resolve(path);
  return JSON.parse(await readFile(resolved, "utf8")) as ApprovedFilmManifest;
}

async function execute(command: string, args: string[]) {
  await new Promise<void>((resolvePromise, reject) => {
    const child = spawn(command, args, { stdio: "inherit", windowsHide: true });
    child.once("error", reject);
    child.once("exit", (code) => code === 0 ? resolvePromise() : reject(new Error(`${command} exited with ${code}`)));
  });
}

async function probe(path: string): Promise<ProbeResult> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn("ffprobe", ["-v", "error", "-show_format", "-show_streams", "-of", "json", path], { windowsHide: true });
    let stdout = ""; let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += String(chunk); });
    child.stderr.on("data", (chunk) => { stderr += String(chunk); });
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code !== 0) return reject(new Error(`ffprobe failed for ${path}: ${stderr.trim()}`));
      try { resolvePromise(JSON.parse(stdout) as ProbeResult); } catch { reject(new Error(`ffprobe returned invalid JSON for ${path}`)); }
    });
  });
}

async function hasFaststartMoov(path: string) {
  const content = await readFile(path);
  const moov = content.indexOf(Buffer.from("moov", "ascii"));
  const mdat = content.indexOf(Buffer.from("mdat", "ascii"));
  return moov >= 4 && mdat >= 4 && moov < mdat;
}

export function assertLandingFilmProbeResults(video: ProbeResult, poster: ProbeResult, faststart: boolean) {
  const videoFormat = video.format?.format_name?.toLowerCase() ?? "";
  const videoStreams = video.streams ?? [];
  if (!videoFormat.includes("mp4") || !videoStreams.some((stream) => stream.codec_type === "video" && stream.codec_name === "h264")) throw new Error("Encoded loop must be an H.264 MP4");
  if (videoStreams.some((stream) => stream.codec_type === "audio")) throw new Error("Encoded loop must not contain an audio stream");
  if (!faststart) throw new Error("Encoded loop must be faststart-compatible");
  const posterFormat = poster.format?.format_name?.toLowerCase() ?? "";
  if (!posterFormat.includes("webp") || !(poster.streams ?? []).some((stream) => stream.codec_type === "video" && stream.codec_name === "webp")) throw new Error("Poster must be a readable WebP image");
}

export function buildLandingFilmFfmpegArgs(inputPath: string, loopPath: string, posterPath: string, approval: ApprovedFilm) {
  return {
    poster: ["-y", "-ss", String(approval.startSeconds), "-i", loopPath, "-frames:v", "1", "-c:v", "libwebp", posterPath],
    video: ["-y", "-ss", String(approval.startSeconds), "-t", String(approval.durationSeconds), "-i", inputPath, "-an", "-c:v", "libx264", "-movflags", "+faststart", "-pix_fmt", "yuv420p", loopPath],
  };
}

export async function transcodeApprovedFilm(inputPath: string, outputDirectory: string, approval: ApprovedFilm) {
  await mkdir(outputDirectory, { recursive: true });
  const loopPath = join(outputDirectory, "loop.mp4");
  const posterPath = join(outputDirectory, "poster.webp");
  const args = buildLandingFilmFfmpegArgs(inputPath, loopPath, posterPath, approval);
  await execute("ffmpeg", args.video);
  await execute("ffmpeg", args.poster);
  await Promise.all([access(loopPath), access(posterPath)]);
  assertLandingFilmProbeResults(await probe(loopPath), await probe(posterPath), await hasFaststartMoov(loopPath));
  return { posterPath, videoPath: loopPath };
}

export function classifyExistingImmutableObject(expectedHash: string, metadata: Record<string, string> | undefined) {
  if (!metadata) return "missing" as const;
  if (metadata.sha256 === expectedHash) return "already-published" as const;
  throw new Error("Refusing to overwrite mismatched immutable landing-film object");
}

export function isImmutablePreconditionFailure(error: unknown) {
  const status = typeof error === "object" && error && "$metadata" in error ? Number((error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode) : 0;
  return status === 412 || (error instanceof Error && /PreconditionFailed/i.test(error.name));
}

async function existingImmutableObject(client: S3Client, bucket: string, key: string, expectedHash: string) {
  try {
    const response = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return classifyExistingImmutableObject(expectedHash, response.Metadata);
  } catch (error) {
    const status = typeof error === "object" && error && "$metadata" in error ? Number((error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode) : 0;
    if (status === 404 || (error instanceof Error && /NotFound|NoSuchKey/i.test(error.name))) return "missing" as const;
    throw error;
  }
}

async function putImmutableObject(client: S3Client, bucket: string, key: string, body: Buffer, contentType: string) {
  try {
    await client.send(new PutObjectCommand(buildImmutableLandingFilmPutInput(bucket, key, body, contentType)));
  } catch (error) {
    if (isImmutablePreconditionFailure(error)) {
      const expectedHash = createHash("sha256").update(body).digest("hex");
      if (await existingImmutableObject(client, bucket, key, expectedHash) === "already-published") return;
      throw new Error(`Refusing to overwrite mismatched immutable landing-film object: ${key}`);
    }
    throw error;
  }
}

export async function publishApprovedFilm(options: { bucket: string; client: S3Client; outputDirectory: string; approval: ApprovedFilm; masterPath: string }) {
  const { approval, client, bucket } = options;
  const keys = buildLandingFilmObjectKeys(approval.chapter, approval.variant, approval.viewport);
  const { videoPath, posterPath } = await transcodeApprovedFilm(options.masterPath, options.outputDirectory, approval);
  const video = await readFile(videoPath); const poster = await readFile(posterPath);
  const videoHash = createHash("sha256").update(video).digest("hex");
  const posterHash = createHash("sha256").update(poster).digest("hex");
  if (await existingImmutableObject(client, bucket, keys.video, videoHash) === "missing") await putImmutableObject(client, bucket, keys.video, video, "video/mp4");
  if (await existingImmutableObject(client, bucket, keys.poster, posterHash) === "missing") await putImmutableObject(client, bucket, keys.poster, poster, "image/webp");
  return keys;
}
