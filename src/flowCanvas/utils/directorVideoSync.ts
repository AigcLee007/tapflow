import type { FlowDirector3dData, FlowVideoEditorData } from '../types';
import { normalizeDirector3dData } from './director3dNodeData';
import {
  getVideoClipDurationMs,
  getVideoSubtitleTimelineEndMs,
  getVideoTimelineClipEndMs,
  normalizeVideoEditorData,
} from './videoEditorNodeData';

type VideoClip = FlowVideoEditorData['timeline']['clips'][number];
type VideoSubtitle = FlowVideoEditorData['timeline']['subtitles'][number];

function cleanIdSegment(value: string) {
  return value.trim().replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'item';
}

export function buildVideoEditorFromDirectorShots(input: {
  director: FlowDirector3dData;
  sourceDirectorNodeId: string;
  videoEditor?: FlowVideoEditorData;
}): FlowVideoEditorData {
  const sourceDirectorNodeId = input.sourceDirectorNodeId.trim();
  const director = normalizeDirector3dData(input.director);
  const videoEditor = normalizeVideoEditorData(input.videoEditor);
  const preservedClips = videoEditor.timeline.clips.filter(
    (clip) => clip.sourceDirectorNodeId !== sourceDirectorNodeId,
  );
  const preservedSubtitles = videoEditor.timeline.subtitles.filter(
    (subtitle) => subtitle.sourceDirectorNodeId !== sourceDirectorNodeId,
  );
  let nextStartMs = getVideoTimelineClipEndMs(preservedClips);

  const directorClips = director.shots
    .map((shot): VideoClip | null => {
      if (!shot.generatedAssetId) return null;
      const durationMs = Math.max(0, Number(shot.durationMs) || 3000);
      const clip: VideoClip = {
        id: `director-${cleanIdSegment(sourceDirectorNodeId)}-${cleanIdSegment(shot.id)}`,
        assetId: shot.generatedAssetId,
        kind: 'image',
        track: 1,
        startMs: nextStartMs,
        inMs: 0,
        outMs: durationMs,
        speed: 1,
        sourceDirectorNodeId,
        directorShotId: shot.id,
        directorCameraId: shot.cameraId,
        directorShotMotion: shot.motion || 'static',
        ...(shot.prompt ? { directorPrompt: shot.prompt } : {}),
      };
      nextStartMs += durationMs;
      return clip;
    })
    .filter((clip): clip is VideoClip => Boolean(clip));

  const clips = [...preservedClips, ...directorClips];
  const directorSubtitles = directorClips
    .map((clip): VideoSubtitle | null => {
      const shot = director.shots.find((candidate) => candidate.id === clip.directorShotId);
      if (!shot) return null;
      const shotIndex = director.shots.findIndex((candidate) => candidate.id === shot.id);
      return {
        id: `director-subtitle-${cleanIdSegment(sourceDirectorNodeId)}-${cleanIdSegment(shot.id)}`,
        text: shot.prompt?.trim() || `镜头 ${shotIndex + 1}`,
        startMs: clip.startMs,
        endMs: clip.startMs + getVideoClipDurationMs(clip),
        sourceDirectorNodeId,
        directorShotId: shot.id,
        directorCameraId: shot.cameraId,
      };
    })
    .filter((subtitle): subtitle is VideoSubtitle => Boolean(subtitle));
  const subtitles = [...preservedSubtitles, ...directorSubtitles];

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
