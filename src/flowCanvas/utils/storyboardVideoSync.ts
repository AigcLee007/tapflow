import type { FlowStoryboardData, FlowVideoEditorData } from '../types';
import { normalizeStoryboardData } from './storyboardNodeData';

type VideoClip = FlowVideoEditorData['timeline']['clips'][number];

const DEFAULT_STORYBOARD_IMAGE_DURATION_MS = 3000;

function normalizeVideoEditorData(data?: FlowVideoEditorData): FlowVideoEditorData {
  return {
    version: 1,
    aspect: data?.aspect ?? '16:9',
    ...(data?.exportedAssetId ? { exportedAssetId: data.exportedAssetId } : {}),
    resolution: data?.resolution ?? '1920x1080',
    timeline: {
      audio: Array.isArray(data?.timeline?.audio) ? data.timeline.audio : [],
      clips: Array.isArray(data?.timeline?.clips) ? data.timeline.clips : [],
      durationMs: Math.max(0, Number(data?.timeline?.durationMs) || 0),
      subtitles: Array.isArray(data?.timeline?.subtitles) ? data.timeline.subtitles : [],
    },
  };
}

function getClipDurationMs(clip: VideoClip) {
  const rawDuration = Number(clip.outMs) - Number(clip.inMs);
  return Math.max(0, Number.isFinite(rawDuration) ? rawDuration : 0);
}

function getTimelineClipEndMs(clips: VideoClip[]) {
  return clips.reduce(
    (endMs, clip) => Math.max(endMs, Math.max(0, Number(clip.startMs) || 0) + getClipDurationMs(clip)),
    0,
  );
}

function getSubtitleEndMs(subtitles: FlowVideoEditorData['timeline']['subtitles']) {
  return subtitles.reduce((endMs, subtitle) => Math.max(endMs, Math.max(0, Number(subtitle.endMs) || 0)), 0);
}

function cleanIdSegment(value: string) {
  return value.trim().replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'item';
}

export function buildVideoEditorFromStoryboardAssets(input: {
  sourceStoryboardNodeId: string;
  storyboard: FlowStoryboardData;
  videoEditor?: FlowVideoEditorData;
}): FlowVideoEditorData {
  const sourceStoryboardNodeId = input.sourceStoryboardNodeId.trim();
  const storyboard = normalizeStoryboardData(input.storyboard);
  const videoEditor = normalizeVideoEditorData(input.videoEditor);
  const preservedClips = videoEditor.timeline.clips.filter(
    (clip) => clip.sourceStoryboardNodeId !== sourceStoryboardNodeId,
  );
  const firstStartMs = getTimelineClipEndMs(preservedClips);
  const storyboardClips = storyboard.cells
    .filter((cell) => cell.assetId)
    .map((cell, index): VideoClip => ({
      id: `storyboard-${cleanIdSegment(sourceStoryboardNodeId)}-${cleanIdSegment(cell.id)}`,
      assetId: cell.assetId!,
      kind: 'image',
      track: 1,
      startMs: firstStartMs + index * DEFAULT_STORYBOARD_IMAGE_DURATION_MS,
      inMs: 0,
      outMs: DEFAULT_STORYBOARD_IMAGE_DURATION_MS,
      speed: 1,
      sourceStoryboardNodeId,
      storyboardCellId: cell.id,
      storyboardShotNo: cell.shotNo,
      ...(cell.title ? { storyboardTitle: cell.title } : {}),
      ...(cell.prompt ? { storyboardPrompt: cell.prompt } : {}),
    }));
  const clips = [...preservedClips, ...storyboardClips];

  return {
    ...videoEditor,
    timeline: {
      ...videoEditor.timeline,
      clips,
      durationMs: Math.max(
        videoEditor.timeline.durationMs,
        getTimelineClipEndMs(clips),
        getSubtitleEndMs(videoEditor.timeline.subtitles),
      ),
    },
  };
}
