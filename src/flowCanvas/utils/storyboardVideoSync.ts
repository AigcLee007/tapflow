import type { FlowStoryboardData, FlowVideoEditorData } from '../types';
import { normalizeStoryboardData } from './storyboardNodeData';
import {
  getVideoClipDurationMs,
  getVideoSubtitleTimelineEndMs,
  getVideoTimelineClipEndMs,
  normalizeVideoEditorData,
} from './videoEditorNodeData';

type VideoClip = FlowVideoEditorData['timeline']['clips'][number];
type VideoSubtitle = FlowVideoEditorData['timeline']['subtitles'][number];

const DEFAULT_STORYBOARD_IMAGE_DURATION_MS = 3000;

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
  const preservedSubtitles = videoEditor.timeline.subtitles.filter(
    (subtitle) => subtitle.sourceStoryboardNodeId !== sourceStoryboardNodeId,
  );
  const firstStartMs = getVideoTimelineClipEndMs(preservedClips);
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
  const storyboardSubtitles = storyboardClips
    .map((clip): VideoSubtitle | null => {
      const cell = storyboard.cells.find((candidate) => candidate.id === clip.storyboardCellId);
      if (!cell) return null;
      const text = cell.title?.trim() || cell.prompt?.trim();
      if (!text) return null;
      return {
        id: `storyboard-subtitle-${cleanIdSegment(sourceStoryboardNodeId)}-${cleanIdSegment(cell.id)}`,
        text,
        startMs: clip.startMs,
        endMs: clip.startMs + getVideoClipDurationMs(clip),
        sourceStoryboardNodeId,
        storyboardCellId: cell.id,
        storyboardShotNo: cell.shotNo,
      };
    })
    .filter((subtitle): subtitle is VideoSubtitle => Boolean(subtitle));
  const subtitles = [...preservedSubtitles, ...storyboardSubtitles];

  return {
    ...videoEditor,
    timeline: {
      ...videoEditor.timeline,
      clips,
      subtitles,
      durationMs: Math.max(
        videoEditor.timeline.durationMs,
        getVideoTimelineClipEndMs(clips),
        getVideoSubtitleTimelineEndMs(subtitles),
      ),
    },
  };
}
