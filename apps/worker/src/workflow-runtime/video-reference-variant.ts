import { execFile as nodeExecFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(nodeExecFile);

export const REFERENCE_VIDEO_MAX_LONG_EDGE = 1280;
export const REFERENCE_VIDEO_MAX_SHORT_EDGE = 720;
export const REFERENCE_VIDEO_TRANSCODE_TIMEOUT_MS = 15 * 60 * 1000;

export type ReferenceVideoSize = {
  height: number;
  width: number;
};

type ExecFileResult = {
  stderr: string;
  stdout: string;
};

type ExecFileLike = (
  command: string,
  args: string[],
  options: { timeout: number; windowsHide: true },
) => Promise<ExecFileResult>;

type ProbeResponse = {
  streams?: Array<{
    codec_type?: unknown;
    height?: unknown;
    width?: unknown;
  }>;
};

function even(value: number): number {
  return Math.max(2, Math.floor(value / 2) * 2);
}

function readPositiveInteger(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

export function isReferenceVideoSizeCompliant(width: number, height: number): boolean {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return false;
  }
  return width >= height
    ? width <= REFERENCE_VIDEO_MAX_LONG_EDGE && height <= REFERENCE_VIDEO_MAX_SHORT_EDGE
    : width <= REFERENCE_VIDEO_MAX_SHORT_EDGE && height <= REFERENCE_VIDEO_MAX_LONG_EDGE;
}

export function resolveReferenceVideoTargetSize(width: number, height: number): ReferenceVideoSize {
  const sourceWidth = readPositiveInteger(width);
  const sourceHeight = readPositiveInteger(height);
  if (!sourceWidth || !sourceHeight) {
    throw new Error("REFERENCE_VIDEO_DIMENSIONS_INVALID");
  }

  const landscape = sourceWidth >= sourceHeight;
  const boxWidth = landscape ? REFERENCE_VIDEO_MAX_LONG_EDGE : REFERENCE_VIDEO_MAX_SHORT_EDGE;
  const boxHeight = landscape ? REFERENCE_VIDEO_MAX_SHORT_EDGE : REFERENCE_VIDEO_MAX_LONG_EDGE;
  const scale = Math.min(boxWidth / sourceWidth, boxHeight / sourceHeight, 1);
  return {
    height: even(sourceHeight * scale),
    width: even(sourceWidth * scale),
  };
}

export function buildReferenceVideoFfmpegArgs(
  inputPath: string,
  outputPath: string,
  target: ReferenceVideoSize,
): string[] {
  return [
    "-y",
    "-i",
    inputPath,
    "-map",
    "0:v:0",
    "-map",
    "0:a?",
    "-vf",
    `scale=${target.width}:${target.height}:force_original_aspect_ratio=decrease`,
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    "23",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-b:a",
    "128k",
    "-movflags",
    "+faststart",
    outputPath,
  ];
}

export async function probeReferenceVideo(
  inputPath: string,
  options: { execFile?: ExecFileLike } = {},
): Promise<ReferenceVideoSize> {
  const execFile = options.execFile ?? (execFileAsync as unknown as ExecFileLike);
  try {
    const result = await execFile("ffprobe", [
      "-v",
      "error",
      "-select_streams",
      "v:0",
      "-show_entries",
      "stream=width,height,codec_type",
      "-of",
      "json",
      inputPath,
    ], { timeout: REFERENCE_VIDEO_TRANSCODE_TIMEOUT_MS, windowsHide: true });
    const body = JSON.parse(result.stdout) as ProbeResponse;
    const stream = body.streams?.find((candidate) => candidate.codec_type === "video") ?? body.streams?.[0];
    const width = readPositiveInteger(stream?.width);
    const height = readPositiveInteger(stream?.height);
    if (!width || !height) {
      throw new Error("REFERENCE_VIDEO_DIMENSIONS_INVALID");
    }
    return { height, width };
  } catch (error) {
    if (error instanceof Error && error.message === "REFERENCE_VIDEO_DIMENSIONS_INVALID") {
      throw error;
    }
    throw new Error("REFERENCE_VIDEO_PROBE_FAILED", { cause: error });
  }
}

export async function transcodeReferenceVideo(
  inputPath: string,
  outputPath: string,
  options: { execFile?: ExecFileLike; target?: ReferenceVideoSize } = {},
): Promise<void> {
  const execFile = options.execFile ?? (execFileAsync as unknown as ExecFileLike);
  const target = options.target ?? resolveReferenceVideoTargetSize(REFERENCE_VIDEO_MAX_LONG_EDGE, REFERENCE_VIDEO_MAX_SHORT_EDGE);
  await execFile(
    "ffmpeg",
    buildReferenceVideoFfmpegArgs(inputPath, outputPath, target),
    { timeout: REFERENCE_VIDEO_TRANSCODE_TIMEOUT_MS, windowsHide: true },
  );
}
