type PlainObject = Record<string, unknown>;

export type VideoEditorRenderPlanErrorCode =
  | "VIDEO_EDITOR_TIMELINE_EMPTY"
  | "VIDEO_EDITOR_TIMELINE_INVALID"
  | "VIDEO_EDITOR_ASSET_REFERENCE_INVALID";

export class VideoEditorRenderPlanError extends Error {
  readonly code: VideoEditorRenderPlanErrorCode;

  constructor(code: VideoEditorRenderPlanErrorCode, message: string) {
    super(message);
    this.name = "VideoEditorRenderPlanError";
    this.code = code;
  }
}

export type VideoEditorRenderClipPlan = {
  readonly assetId: string;
  readonly durationMs: number;
  readonly effectiveDurationMs: number;
  readonly id: string | null;
  readonly inMs: number;
  readonly kind: "image" | "video";
  readonly muted: boolean;
  readonly outMs: number;
  readonly speed: number;
  readonly startMs: number;
  readonly track: number;
  readonly transitionOut?: {
    readonly durationMs: number;
    readonly type: "fade" | "crossfade";
  };
  readonly volume: number | null;
};

export type VideoEditorRenderAudioPlan = {
  readonly assetId: string;
  readonly durationMs: number;
  readonly id: string | null;
  readonly inMs: number;
  readonly outMs: number;
  readonly startMs: number;
  readonly track: number;
  readonly volume: number;
};

export type VideoEditorRenderSubtitlePlan = {
  readonly endMs: number;
  readonly id: string | null;
  readonly startMs: number;
  readonly text: string;
};

export type VideoEditorRenderPlan = {
  readonly assetIds: string[];
  readonly audio: VideoEditorRenderAudioPlan[];
  readonly clips: VideoEditorRenderClipPlan[];
  readonly output: {
    readonly durationMs: number;
    readonly height: number;
    readonly mimeType: "video/mp4";
    readonly width: number;
  };
  readonly renderer: "ffmpeg";
  readonly subtitles: VideoEditorRenderSubtitlePlan[];
  readonly version: 1;
};

const RESOLUTION_DIMENSIONS: Record<string, { width: number; height: number }> = {
  "1280x720": { width: 1280, height: 720 },
  "1920x1080": { width: 1920, height: 1080 },
  "720x1280": { width: 720, height: 1280 },
  "1080x1920": { width: 1080, height: 1920 },
};

function isPlainObject(value: unknown): value is PlainObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readNonNegativeNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : fallback;
}

function readPositiveNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : fallback;
}

function readTrack(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function readVolume(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : fallback;
}

function normalizeAssetId(value: unknown): string | null {
  const assetId = readString(value);
  if (!assetId) {
    return null;
  }
  const lower = assetId.toLowerCase();
  if (
    lower.startsWith("blob:") ||
    lower.startsWith("data:") ||
    lower.startsWith("http://") ||
    lower.startsWith("https://") ||
    lower.includes(";base64,")
  ) {
    throw new VideoEditorRenderPlanError(
      "VIDEO_EDITOR_ASSET_REFERENCE_INVALID",
      "Video editor render plans require durable asset ids, not transient media references.",
    );
  }
  return assetId;
}

function normalizeResolution(videoEditor: PlainObject): { width: number; height: number } {
  const resolution = readString(videoEditor.resolution);
  if (resolution && RESOLUTION_DIMENSIONS[resolution]) {
    return RESOLUTION_DIMENSIONS[resolution];
  }
  return RESOLUTION_DIMENSIONS["1920x1080"];
}

function normalizeClipKind(value: unknown): "image" | "video" {
  return value === "image" || value === "video" ? value : "video";
}

function normalizeTransitionOut(value: unknown, clipDurationMs: number): VideoEditorRenderClipPlan["transitionOut"] {
  if (!isPlainObject(value)) {
    return undefined;
  }
  const type = value.type === "fade" || value.type === "crossfade" ? value.type : null;
  if (!type) {
    return undefined;
  }
  const durationMs = readNonNegativeNumber(value.durationMs, 0);
  if (durationMs <= 0) {
    return undefined;
  }
  return {
    durationMs: Math.min(Math.round(durationMs), Math.round(clipDurationMs)),
    type,
  };
}

function normalizeClip(item: unknown): VideoEditorRenderClipPlan | null {
  if (!isPlainObject(item)) {
    return null;
  }
  const assetId = normalizeAssetId(item.assetId);
  if (!assetId) {
    return null;
  }

  const inMs = readNonNegativeNumber(item.inMs, 0);
  const outMs = readNonNegativeNumber(item.outMs, 0);
  const durationMs = outMs - inMs;
  const speed = readPositiveNumber(item.speed, 1);
  if (durationMs <= 0) {
    throw new VideoEditorRenderPlanError(
      "VIDEO_EDITOR_TIMELINE_INVALID",
      "Video editor clips must have an outMs value greater than inMs.",
    );
  }

  const transitionOut = normalizeTransitionOut(item.transitionOut, durationMs);
  return {
    assetId,
    durationMs,
    effectiveDurationMs: Math.round(durationMs / speed),
    id: readString(item.id),
    inMs,
    kind: normalizeClipKind(item.kind),
    muted: item.muted === true,
    outMs,
    speed,
    startMs: readNonNegativeNumber(item.startMs, 0),
    track: readTrack(item.track),
    ...(transitionOut ? { transitionOut } : {}),
    volume: typeof item.volume === "number" && Number.isFinite(item.volume) && item.volume >= 0 ? item.volume : null,
  };
}

function normalizeAudio(item: unknown): VideoEditorRenderAudioPlan | null {
  if (!isPlainObject(item)) {
    return null;
  }
  const assetId = normalizeAssetId(item.assetId);
  if (!assetId) {
    return null;
  }

  const inMs = readNonNegativeNumber(item.inMs, 0);
  const outMs = readNonNegativeNumber(item.outMs, 0);
  const durationMs = outMs - inMs;
  if (durationMs <= 0) {
    throw new VideoEditorRenderPlanError(
      "VIDEO_EDITOR_TIMELINE_INVALID",
      "Video editor audio items must have an outMs value greater than inMs.",
    );
  }

  return {
    assetId,
    durationMs,
    id: readString(item.id),
    inMs,
    outMs,
    startMs: readNonNegativeNumber(item.startMs, 0),
    track: readTrack(item.track),
    volume: readVolume(item.volume, 1),
  };
}

function normalizeSubtitle(item: unknown): VideoEditorRenderSubtitlePlan | null {
  if (!isPlainObject(item)) {
    return null;
  }
  const text = typeof item.text === "string" ? item.text : "";
  if (!text.trim()) {
    return null;
  }
  const startMs = readNonNegativeNumber(item.startMs, 0);
  const endMs = readNonNegativeNumber(item.endMs, 0);
  if (endMs <= startMs) {
    return null;
  }
  return {
    endMs,
    id: readString(item.id),
    startMs,
    text,
  };
}

function addAssetId(assetIds: string[], assetId: string): void {
  if (!assetIds.includes(assetId)) {
    assetIds.push(assetId);
  }
}

export function buildVideoEditorRenderPlan(input: unknown): VideoEditorRenderPlan {
  if (!isPlainObject(input)) {
    throw new VideoEditorRenderPlanError(
      "VIDEO_EDITOR_TIMELINE_INVALID",
      "Video editor export metadata must be an object.",
    );
  }
  const timeline = isPlainObject(input.timeline) ? input.timeline : {};
  const clips = Array.isArray(timeline.clips)
    ? timeline.clips.map(normalizeClip).filter((clip): clip is VideoEditorRenderClipPlan => clip !== null)
    : [];
  const audio = Array.isArray(timeline.audio)
    ? timeline.audio.map(normalizeAudio).filter((item): item is VideoEditorRenderAudioPlan => item !== null)
    : [];

  if (clips.length === 0 && audio.length === 0) {
    throw new VideoEditorRenderPlanError(
      "VIDEO_EDITOR_TIMELINE_EMPTY",
      "Video editor exports require at least one asset-backed clip or audio item.",
    );
  }

  const subtitles = Array.isArray(timeline.subtitles)
    ? timeline.subtitles.map(normalizeSubtitle).filter((item): item is VideoEditorRenderSubtitlePlan => item !== null)
    : [];
  const explicitDurationMs = readNonNegativeNumber(timeline.durationMs, 0);
  const clipEndMs = clips.map((clip) => clip.startMs + clip.effectiveDurationMs);
  const audioEndMs = audio.map((item) => item.startMs + item.durationMs);
  const subtitleEndMs = subtitles.map((item) => item.endMs);
  const durationMs = Math.round(Math.max(
    explicitDurationMs,
    ...clipEndMs,
    ...audioEndMs,
    ...subtitleEndMs,
  ));
  const resolution = normalizeResolution(input);
  const assetIds: string[] = [];
  for (const clip of clips) {
    addAssetId(assetIds, clip.assetId);
  }
  for (const item of audio) {
    addAssetId(assetIds, item.assetId);
  }

  return {
    assetIds,
    audio,
    clips,
    output: {
      durationMs,
      height: resolution.height,
      mimeType: "video/mp4",
      width: resolution.width,
    },
    renderer: "ffmpeg",
    subtitles,
    version: 1,
  };
}
