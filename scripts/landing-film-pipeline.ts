import { spawn } from "node:child_process";
import { access, mkdir, readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

import { LANDING_FILM_PREFIX, type LandingFilmJob, type LandingViewport } from "./landing-film-prompts.js";

export type LandingFilmCommand = { dryRun: boolean; generationConfirmed: boolean; include: string[]; manifestPath: string; publish: boolean };
export type ApprovedFilm = { chapter: string; durationSeconds: number; startSeconds: number; variant: string; viewport: LandingViewport };
export type ApprovedFilmManifest = { approved: ApprovedFilm[] };

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

export async function transcodeApprovedFilm(inputPath: string, outputDirectory: string, approval: ApprovedFilm) {
  await mkdir(outputDirectory, { recursive: true });
  const loopPath = join(outputDirectory, "loop.mp4");
  const posterPath = join(outputDirectory, "poster.webp");
  await execute("ffmpeg", ["-y", "-ss", String(approval.startSeconds), "-t", String(approval.durationSeconds), "-i", inputPath, "-an", "-c:v", "libx264", "-movflags", "+faststart", "-pix_fmt", "yuv420p", loopPath]);
  await execute("ffmpeg", ["-y", "-ss", String(approval.startSeconds), "-i", loopPath, "-frames:v", "1", "-c:v", "libwebp", posterPath]);
  await Promise.all([access(loopPath), access(posterPath)]);
  return { posterPath, videoPath: loopPath };
}

export async function publishApprovedFilm(options: { bucket: string; client: S3Client; outputDirectory: string; approval: ApprovedFilm; masterPath: string }) {
  const { approval, client, bucket } = options;
  const keys = buildLandingFilmObjectKeys(approval.chapter, approval.variant, approval.viewport);
  const { videoPath, posterPath } = await transcodeApprovedFilm(options.masterPath, options.outputDirectory, approval);
  await client.send(new PutObjectCommand({ Body: await readFile(videoPath), Bucket: bucket, CacheControl: "public, max-age=31536000, immutable", ContentType: "video/mp4", Key: keys.video }));
  await client.send(new PutObjectCommand({ Body: await readFile(posterPath), Bucket: bucket, CacheControl: "public, max-age=31536000, immutable", ContentType: "image/webp", Key: keys.poster }));
  return keys;
}
