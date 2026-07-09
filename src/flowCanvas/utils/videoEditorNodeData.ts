import type { FlowVideoEditorData } from '../types';

type VideoClip = FlowVideoEditorData['timeline']['clips'][number];
type VideoAudio = FlowVideoEditorData['timeline']['audio'][number];
type VideoSubtitle = FlowVideoEditorData['timeline']['subtitles'][number];
type VideoTransitionOut = NonNullable<VideoClip['transitionOut']>;
type VideoTransform = NonNullable<VideoClip['transform']>;

const TRANSIENT_URL_PATTERN = /(?:blob:|data:|https?:\/\/)/i;
const DIRECTOR_SHOT_MOTIONS = new Set<NonNullable<VideoClip['directorShotMotion']>>([
  'static',
  'dolly',
  'orbit',
  'pan',
  'custom_path',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function cleanString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (TRANSIENT_URL_PATTERN.test(trimmed)) return undefined;
  return trimmed;
}

function finiteNumber(value: unknown, fallback: number, options?: { max?: number; min?: number; round?: boolean }) {
  const raw = Number(value);
  const initial = Number.isFinite(raw) ? raw : fallback;
  const min = options?.min ?? -Infinity;
  const max = options?.max ?? Infinity;
  const clamped = Math.min(max, Math.max(min, initial));
  return options?.round ? Math.round(clamped) : clamped;
}

function nonNegativeMs(value: unknown, fallback = 0) {
  return finiteNumber(value, fallback, { min: 0, round: true });
}

function normalizeTrack(value: unknown, fallback = 1) {
  return Math.trunc(finiteNumber(value, fallback, { min: 0 }));
}

function normalizeVolume(value: unknown, fallback = 1) {
  return finiteNumber(value, fallback, { max: 2, min: 0 });
}

function normalizeAspect(value: unknown): FlowVideoEditorData['aspect'] {
  return value === '9:16' || value === '1:1' ? value : '16:9';
}

function normalizeResolution(value: unknown): FlowVideoEditorData['resolution'] {
  if (value === '1280x720' || value === '720x1280' || value === '1080x1920' || value === '1080x1080') {
    return value;
  }
  return '1920x1080';
}

function normalizeTransitionOut(value: unknown): VideoTransitionOut | undefined {
  if (!isRecord(value)) return undefined;
  const type = cleanString(value.type);
  if (type !== 'fade' && type !== 'crossfade') return undefined;
  return {
    type,
    durationMs: nonNegativeMs(value.durationMs),
  };
}

function normalizeTransform(value: unknown): VideoTransform | undefined {
  if (!isRecord(value)) return undefined;
  const hasTransformValue = ['scale', 'x', 'y', 'rotate'].some((key) => Number.isFinite(Number(value[key])));
  if (!hasTransformValue) return undefined;
  return {
    scale: finiteNumber(value.scale, 1, { min: 0 }),
    x: finiteNumber(value.x, 0),
    y: finiteNumber(value.y, 0),
    rotate: finiteNumber(value.rotate, 0),
  };
}

function normalizeStyle(value: unknown): Record<string, unknown> | undefined {
  if (!isRecord(value)) return undefined;
  const style: Record<string, unknown> = {};
  Object.entries(value).forEach(([key, entryValue]) => {
    if (typeof entryValue === 'string') {
      const safeString = cleanString(entryValue);
      if (safeString) style[key] = safeString;
      return;
    }
    if (typeof entryValue === 'number' && Number.isFinite(entryValue)) {
      style[key] = entryValue;
      return;
    }
    if (typeof entryValue === 'boolean') {
      style[key] = entryValue;
    }
  });
  return Object.keys(style).length ? style : undefined;
}

function normalizeStoryboardShotNo(value: unknown): number | undefined {
  const shotNo = Number(value);
  if (!Number.isFinite(shotNo)) return undefined;
  return Math.max(1, Math.trunc(shotNo));
}

function normalizeDirectorShotMotion(value: unknown): VideoClip['directorShotMotion'] | undefined {
  const motion = cleanString(value);
  return DIRECTOR_SHOT_MOTIONS.has(motion as NonNullable<VideoClip['directorShotMotion']>)
    ? motion as NonNullable<VideoClip['directorShotMotion']>
    : undefined;
}

function normalizeClip(value: unknown, index: number): VideoClip {
  const input = isRecord(value) ? value : {};
  const kind = input.kind === 'video' ? 'video' : 'image';
  const inMs = nonNegativeMs(input.inMs);
  const outMs = Math.max(inMs, nonNegativeMs(input.outMs, kind === 'image' ? 3000 : 4000));
  const transitionOut = normalizeTransitionOut(input.transitionOut);
  const transform = normalizeTransform(input.transform);
  const storyboardShotNo = normalizeStoryboardShotNo(input.storyboardShotNo);
  const directorShotMotion = normalizeDirectorShotMotion(input.directorShotMotion);

  return {
    id: cleanString(input.id) ?? `clip-${index + 1}`,
    assetId: cleanString(input.assetId) ?? `placeholder-${kind}-${index + 1}`,
    kind,
    track: normalizeTrack(input.track),
    startMs: nonNegativeMs(input.startMs),
    inMs,
    outMs,
    speed: finiteNumber(input.speed, 1, { min: 0.01 }),
    ...(typeof input.muted === 'boolean' ? { muted: input.muted } : {}),
    ...(kind === 'video' || typeof input.volume !== 'undefined'
      ? { volume: normalizeVolume(input.volume) }
      : {}),
    ...(transitionOut ? { transitionOut } : {}),
    ...(transform ? { transform } : {}),
    ...(cleanString(input.sourceDirectorNodeId) ? { sourceDirectorNodeId: cleanString(input.sourceDirectorNodeId) } : {}),
    ...(cleanString(input.directorShotId) ? { directorShotId: cleanString(input.directorShotId) } : {}),
    ...(cleanString(input.directorCameraId) ? { directorCameraId: cleanString(input.directorCameraId) } : {}),
    ...(directorShotMotion ? { directorShotMotion } : {}),
    ...(cleanString(input.directorPrompt) ? { directorPrompt: cleanString(input.directorPrompt) } : {}),
    ...(cleanString(input.sourceStoryboardNodeId) ? { sourceStoryboardNodeId: cleanString(input.sourceStoryboardNodeId) } : {}),
    ...(cleanString(input.storyboardCellId) ? { storyboardCellId: cleanString(input.storyboardCellId) } : {}),
    ...(typeof storyboardShotNo === 'number' ? { storyboardShotNo } : {}),
    ...(cleanString(input.storyboardTitle) ? { storyboardTitle: cleanString(input.storyboardTitle) } : {}),
    ...(cleanString(input.storyboardPrompt) ? { storyboardPrompt: cleanString(input.storyboardPrompt) } : {}),
  };
}

function normalizeAudio(value: unknown, index: number): VideoAudio {
  const input = isRecord(value) ? value : {};
  const inMs = nonNegativeMs(input.inMs);
  const outMs = Math.max(inMs, nonNegativeMs(input.outMs, 3000));

  return {
    id: cleanString(input.id) ?? `audio-${index + 1}`,
    assetId: cleanString(input.assetId) ?? `placeholder-audio-${index + 1}`,
    track: normalizeTrack(input.track),
    startMs: nonNegativeMs(input.startMs),
    inMs,
    outMs,
    volume: normalizeVolume(input.volume),
  };
}

function normalizeSubtitle(value: unknown, index: number): VideoSubtitle {
  const input = isRecord(value) ? value : {};
  const startMs = nonNegativeMs(input.startMs);
  const endMs = Math.max(startMs, nonNegativeMs(input.endMs, startMs + 1500));
  const style = normalizeStyle(input.style);
  const storyboardShotNo = normalizeStoryboardShotNo(input.storyboardShotNo);

  return {
    id: cleanString(input.id) ?? `subtitle-${index + 1}`,
    text: cleanString(input.text) ?? '',
    startMs,
    endMs,
    ...(style ? { style } : {}),
    ...(cleanString(input.sourceDirectorNodeId) ? { sourceDirectorNodeId: cleanString(input.sourceDirectorNodeId) } : {}),
    ...(cleanString(input.directorShotId) ? { directorShotId: cleanString(input.directorShotId) } : {}),
    ...(cleanString(input.directorCameraId) ? { directorCameraId: cleanString(input.directorCameraId) } : {}),
    ...(cleanString(input.sourceStoryboardNodeId) ? { sourceStoryboardNodeId: cleanString(input.sourceStoryboardNodeId) } : {}),
    ...(cleanString(input.storyboardCellId) ? { storyboardCellId: cleanString(input.storyboardCellId) } : {}),
    ...(typeof storyboardShotNo === 'number' ? { storyboardShotNo } : {}),
  };
}

export function getVideoClipDurationMs(clip: VideoClip) {
  const rawDuration = Number(clip.outMs) - Number(clip.inMs);
  return Math.max(0, Number.isFinite(rawDuration) ? rawDuration : 0);
}

export function getVideoTimelineClipEndMs(clips: VideoClip[]) {
  return clips.reduce(
    (endMs, clip) => Math.max(endMs, Math.max(0, Number(clip.startMs) || 0) + getVideoClipDurationMs(clip)),
    0,
  );
}

export function getVideoAudioDurationMs(audio: VideoAudio) {
  const rawDuration = Number(audio.outMs) - Number(audio.inMs);
  return Math.max(0, Number.isFinite(rawDuration) ? rawDuration : 0);
}

export function getVideoAudioTimelineEndMs(audio: VideoAudio[]) {
  return audio.reduce(
    (endMs, item) => Math.max(endMs, Math.max(0, Number(item.startMs) || 0) + getVideoAudioDurationMs(item)),
    0,
  );
}

export function getVideoSubtitleTimelineEndMs(subtitles: VideoSubtitle[]) {
  return subtitles.reduce((endMs, subtitle) => Math.max(endMs, Math.max(0, Number(subtitle.endMs) || 0)), 0);
}

export function getVideoTimelineDurationMs(timeline: FlowVideoEditorData['timeline']) {
  return Math.max(
    getVideoTimelineClipEndMs(timeline.clips),
    getVideoAudioTimelineEndMs(timeline.audio),
    getVideoSubtitleTimelineEndMs(timeline.subtitles),
  );
}

export function normalizeVideoEditorData(value?: unknown): FlowVideoEditorData {
  const input = isRecord(value) ? value : {};
  const timeline = isRecord(input.timeline) ? input.timeline : {};
  const clips = Array.isArray(timeline.clips) ? timeline.clips.map(normalizeClip) : [];
  const audio = Array.isArray(timeline.audio) ? timeline.audio.map(normalizeAudio) : [];
  const subtitles = Array.isArray(timeline.subtitles) ? timeline.subtitles.map(normalizeSubtitle) : [];
  const normalizedTimeline = {
    audio,
    clips,
    durationMs: nonNegativeMs(timeline.durationMs),
    subtitles,
  };

  return {
    version: 1,
    aspect: normalizeAspect(input.aspect),
    ...(cleanString(input.exportedAssetId) ? { exportedAssetId: cleanString(input.exportedAssetId) } : {}),
    resolution: normalizeResolution(input.resolution),
    timeline: {
      ...normalizedTimeline,
      durationMs: Math.max(
        normalizedTimeline.durationMs,
        getVideoTimelineDurationMs(normalizedTimeline),
      ),
    },
  };
}
