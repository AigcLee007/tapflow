import { spawn } from "node:child_process";
import { access, mkdir, readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

import { LANDING_FILM_PREFIX, type LandingFilmJob, type LandingViewport } from "./landing-film-prompts.js";

export type LandingFilmCommand = { dryRun: boolean; generationConfirmed: boolean; include: string[]; manifestPath: string; publish: boolean };
export type ApprovedFilm = { chapter: string; durationSeconds: number; startSeconds: number; variant: string; viewport: LandingViewport };
export type ApprovedFilmManifest = { approved: ApprovedFilm[] };
type ProbeResult = { format?: { format_name?: string }; streams?: Array<{ codec_name?: string; codec_type?: string }> };

export function buildLandingFilmObjectKeys(chapter: string, variant: string, viewport: LandingViewport) {
  const base = `${LANDING_FILM_PREFIX}/${chapter}/${variant}/${viewport}`;
  return { master: `${base}/master.mp4`, poster: `${base}/poster.webp`, video: `${base}/loop.mp4` };
}

export function parseLandingFilmCommand(args: string[]): LandingFilmCommand {
  const publish = args.includes("--publish");
  const generationConfirmed = args.includes("--confirm-generation-cost");
  const generate = args.includes("--generate");
  if (generate && !generationConfirmed) throw new Error("Live generation requires --confirm-generation-cost");
  if (publish && !args.some((arg) => arg.startsWith("--approved-manifest="))) throw new Error("Publishing requires --approved-manifest=<local file>");
  const include = args.find((arg) => arg.startsWith("--include="))?.slice("--include=".length).split(",").filter(Boolean) ?? [];
  return { dryRun: !generate && !publish, generationConfirmed, include, manifestPath: args.find((arg) => arg.startsWith("--approved-manifest="))?.slice("--approved-manifest=".length) ?? "", publish };
}

export function selectJobs(jobs: LandingFilmJob[], include: string[]) {
  if (!include.length) return jobs;
  return jobs.filter((job) => include.some((needle) => `${job.chapter}/${job.variant}`.startsWith(needle)));
}

export function selectApprovedFilms(jobs: LandingFilmJob[], manifest: ApprovedFilmManifest) {
  if (!Array.isArray(manifest.approved) || !manifest.approved.length) throw new Error("Approval manifest must select at least one film");
  return manifest.approved.map((approval) => {
    if (approval.durationSeconds < 8 || approval.durationSeconds > 12) throw new Error("Approved loop duration must be between 8 and 12 seconds");
    if (approval.startSeconds < 0) throw new Error("Approved loop start must not be negative");
    const job = jobs.find((candidate) => candidate.chapter === approval.chapter && candidate.variant === approval.variant && candidate.viewport === approval.viewport);
    if (!job) throw new Error(`Approval references an unknown job: ${approval.chapter}/${approval.variant}/${approval.viewport}`);
    return { ...approval, job };
  });
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

async function assertMissingObject(client: S3Client, bucket: string, key: string) {
  try {
    await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
  } catch (error) {
    const status = typeof error === "object" && error && "$metadata" in error ? Number((error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode) : 0;
    if (status === 404 || (error instanceof Error && /NotFound|NoSuchKey/i.test(error.name))) return;
    throw error;
  }
  throw new Error(`Refusing to overwrite existing immutable landing-film object: ${key}`);
}

export async function publishApprovedFilm(options: { bucket: string; client: S3Client; outputDirectory: string; approval: ApprovedFilm; masterPath: string }) {
  const { approval, client, bucket } = options;
  const keys = buildLandingFilmObjectKeys(approval.chapter, approval.variant, approval.viewport);
  const { videoPath, posterPath } = await transcodeApprovedFilm(options.masterPath, options.outputDirectory, approval);
  await assertMissingObject(client, bucket, keys.video);
  await client.send(new PutObjectCommand({ Body: await readFile(videoPath), Bucket: bucket, CacheControl: "public, max-age=31536000, immutable", ContentType: "video/mp4", Key: keys.video }));
  await assertMissingObject(client, bucket, keys.poster);
  await client.send(new PutObjectCommand({ Body: await readFile(posterPath), Bucket: bucket, CacheControl: "public, max-age=31536000, immutable", ContentType: "image/webp", Key: keys.poster }));
  return keys;
}
