import { spawn as nodeSpawn } from "node:child_process";
import type { EventEmitter } from "node:events";

import type {
  VideoEditorRenderAudioPlan,
  VideoEditorRenderClipPlan,
  VideoEditorRenderPlan,
  VideoEditorRenderSubtitlePlan,
} from "./video-editor-render-plan.js";

export type VideoEditorFfmpegExecutorErrorCode =
  | "VIDEO_EDITOR_FFMPEG_ASSET_FILE_MISSING"
  | "VIDEO_EDITOR_FFMPEG_FAILED"
  | "VIDEO_EDITOR_FFMPEG_SPAWN_FAILED";

export class VideoEditorFfmpegExecutorError extends Error {
  readonly code: VideoEditorFfmpegExecutorErrorCode;
  readonly stderr: string;

  constructor(code: VideoEditorFfmpegExecutorErrorCode, message: string, options: { stderr?: string } = {}) {
    super(message);
    this.name = "VideoEditorFfmpegExecutorError";
    this.code = code;
    this.stderr = options.stderr ?? "";
  }
}

type SpawnedProcessLike = EventEmitter & {
  stderr?: EventEmitter | null;
};

type SpawnLike = (
  command: string,
  args: string[],
  options: { windowsHide: true },
) => SpawnedProcessLike;

export type BuildVideoEditorFfmpegArgsInput = {
  assetFiles: Record<string, string>;
  outputPath: string;
  plan: VideoEditorRenderPlan;
};

export type RunVideoEditorFfmpegInput = {
  args: string[];
  ffmpegPath?: string;
  spawn?: SpawnLike;
};

export type RunVideoEditorFfmpegResult = {
  exitCode: number;
  stderr: string;
};

function seconds(ms: number): string {
  return (Math.max(0, ms) / 1000).toFixed(3);
}

function sortTimelineItems<T extends { id: string | null; startMs: number; track: number }>(items: T[]): T[] {
  return [...items].sort((left, right) => {
    if (left.track !== right.track) {
      return left.track - right.track;
    }
    if (left.startMs !== right.startMs) {
      return left.startMs - right.startMs;
    }
    return (left.id ?? "").localeCompare(right.id ?? "");
  });
}

function requireAssetFile(assetFiles: Record<string, string>, assetId: string): string {
  const file = assetFiles[assetId]?.trim();
  if (!file) {
    throw new VideoEditorFfmpegExecutorError(
      "VIDEO_EDITOR_FFMPEG_ASSET_FILE_MISSING",
      `Missing local render file for asset ${assetId}`,
    );
  }
  return file;
}

function escapeDrawtext(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\\'")
    .replace(/"/g, "\\\"")
    .replace(/:/g, "\\:")
    .replace(/\[/g, "\\[")
    .replace(/\]/g, "\\]")
    .replace(/\n/g, "\\n");
}

function addClipInputArgs(args: string[], clip: VideoEditorRenderClipPlan, path: string): void {
  if (clip.kind === "image") {
    args.push("-loop", "1", "-t", seconds(clip.effectiveDurationMs), "-i", path);
    return;
  }
  args.push("-ss", seconds(clip.inMs), "-t", seconds(clip.durationMs), "-i", path);
}

function addAudioInputArgs(args: string[], audio: VideoEditorRenderAudioPlan, path: string): void {
  args.push("-ss", seconds(audio.inMs), "-t", seconds(audio.durationMs), "-i", path);
}

function buildClipFilters(input: {
  clips: VideoEditorRenderClipPlan[];
  height: number;
  width: number;
}): string[] {
  const filters: string[] = [];
  input.clips.forEach((clip, index) => {
    filters.push(
      `[${index}:v]scale=${input.width}:${input.height}:force_original_aspect_ratio=decrease,` +
      `pad=${input.width}:${input.height}:(ow-iw)/2:(oh-ih)/2,setsar=1,format=yuv420p[v${index}]`,
    );
    if (clip.muted) {
      return;
    }
  });

  const clipLabels = input.clips.map((_, index) => `[v${index}]`).join("");
  filters.push(`${clipLabels}concat=n=${input.clips.length}:v=1:a=0[vbase]`);
  return filters;
}

function buildSubtitleFilters(subtitles: VideoEditorRenderSubtitlePlan[]): string {
  if (subtitles.length === 0) {
    return "[vbase]copy[vout]";
  }

  let inputLabel = "[vbase]";
  const filters: string[] = [];
  subtitles.forEach((subtitle, index) => {
    const outputLabel = index === subtitles.length - 1 ? "[vout]" : `[vsub${index}]`;
    filters.push(
      `${inputLabel}drawtext=text='${escapeDrawtext(subtitle.text)}':` +
      `x=(w-text_w)/2:y=h-(text_h*2):fontsize=42:fontcolor=white:` +
      `box=1:boxcolor=black@0.45:boxborderw=16:` +
      `enable='between(t,${seconds(subtitle.startMs)},${seconds(subtitle.endMs)})'${outputLabel}`,
    );
    inputLabel = outputLabel;
  });
  return filters.join(";");
}

function buildAudioFilter(input: {
  audio: VideoEditorRenderAudioPlan[];
  audioInputStartIndex: number;
}): string {
  if (input.audio.length === 0) {
    return "anullsrc=channel_layout=stereo:sample_rate=48000[aout]";
  }

  const labels: string[] = [];
  const filters: string[] = [];
  input.audio.forEach((audio, index) => {
    const inputIndex = input.audioInputStartIndex + index;
    const label = `[a${index}]`;
    labels.push(label);
    filters.push(
      `[${inputIndex}:a]volume=${audio.volume.toFixed(3)},adelay=${Math.round(audio.startMs)}|${Math.round(audio.startMs)}${label}`,
    );
  });
  filters.push(`${labels.join("")}amix=inputs=${input.audio.length}:normalize=0[aout]`);
  return filters.join(";");
}

export function buildVideoEditorFfmpegArgs(input: BuildVideoEditorFfmpegArgsInput): string[] {
  const clips = sortTimelineItems(input.plan.clips);
  const audio = sortTimelineItems(input.plan.audio);
  const args = ["-y"];

  for (const clip of clips) {
    addClipInputArgs(args, clip, requireAssetFile(input.assetFiles, clip.assetId));
  }
  for (const item of audio) {
    addAudioInputArgs(args, item, requireAssetFile(input.assetFiles, item.assetId));
  }

  const filterParts = [
    ...buildClipFilters({
      clips,
      height: input.plan.output.height,
      width: input.plan.output.width,
    }),
    buildSubtitleFilters(input.plan.subtitles),
    buildAudioFilter({
      audio,
      audioInputStartIndex: clips.length,
    }),
  ];

  args.push(
    "-filter_complex",
    filterParts.join(";"),
    "-map",
    "[vout]",
    "-map",
    "[aout]",
    "-t",
    seconds(input.plan.output.durationMs),
    input.outputPath,
  );

  return args;
}

function appendStderr(current: string, chunk: unknown): string {
  const next = current + Buffer.from(chunk as Buffer | string).toString("utf8");
  return next.length > 8000 ? next.slice(next.length - 8000) : next;
}

export async function runVideoEditorFfmpeg(input: RunVideoEditorFfmpegInput): Promise<RunVideoEditorFfmpegResult> {
  const ffmpegPath = input.ffmpegPath ?? "ffmpeg";
  const spawn = input.spawn ?? (nodeSpawn as unknown as SpawnLike);

  return new Promise((resolve, reject) => {
    let stderr = "";
    let settled = false;
    const child = spawn(ffmpegPath, input.args, { windowsHide: true });
    child.stderr?.on("data", (chunk) => {
      stderr = appendStderr(stderr, chunk);
    });
    child.on("error", (error: Error) => {
      if (settled) {
        return;
      }
      settled = true;
      reject(new VideoEditorFfmpegExecutorError(
        "VIDEO_EDITOR_FFMPEG_SPAWN_FAILED",
        error.message,
        { stderr },
      ));
    });
    child.on("close", (exitCode: number | null) => {
      if (settled) {
        return;
      }
      settled = true;
      const code = exitCode ?? 1;
      if (code !== 0) {
        reject(new VideoEditorFfmpegExecutorError(
          "VIDEO_EDITOR_FFMPEG_FAILED",
          `FFmpeg exited with code ${code}`,
          { stderr },
        ));
        return;
      }
      resolve({ exitCode: code, stderr });
    });
  });
}
