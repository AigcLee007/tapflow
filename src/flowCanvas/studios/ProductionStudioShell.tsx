import React, { useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, Box, Camera, Film, Grid3X3, ImagePlus, Layers3, Play, Plus, Trash2, X } from 'lucide-react';
import type { Node } from '@xyflow/react';

import { listAssets, type AssetItem } from '../../assets/assetApi';
import type { FlowDirector3dData, FlowNodeData, FlowVideoEditorData } from '../types';
import { normalizeDirector3dData } from '../utils/director3dNodeData';
import { normalizeStoryboardData, patchStoryboardCell } from '../utils/storyboardNodeData';
import {
  getVideoAudioDurationMs,
  getVideoAudioTimelineEndMs,
  getVideoClipDurationMs,
  getVideoSubtitleTimelineEndMs,
  getVideoTimelineClipEndMs,
  getVideoTimelineDurationMs,
  normalizeVideoEditorData,
} from '../utils/videoEditorNodeData';
import { DirectorDeskThreeViewport } from './DirectorDeskThreeViewport';
import type { ProductionStudioKind } from './productionStudioEvents';

type FlowNode = Node<FlowNodeData>;
type DirectorSelection =
  | { type: 'actor'; id: string }
  | { type: 'camera'; id: string }
  | { type: 'scene'; id: 'background' }
  | { type: 'shot'; id: string };
type DirectorActor = FlowDirector3dData['actors'][number];
type DirectorCamera = FlowDirector3dData['cameras'][number];
type DirectorShot = FlowDirector3dData['shots'][number];
type DirectorCameraSnapshot = NonNullable<DirectorShot['cameraSnapshot']>;
type DirectorVector = [number, number, number];
type DirectorVectorAxis = 0 | 1 | 2;
type DirectorShotMotion = NonNullable<DirectorShot['motion']>;
type VideoEditorAudio = FlowVideoEditorData['timeline']['audio'][number];
type VideoEditorClip = FlowVideoEditorData['timeline']['clips'][number];
type VideoEditorSubtitle = FlowVideoEditorData['timeline']['subtitles'][number];
type VideoEditorTransitionOut = NonNullable<VideoEditorClip['transitionOut']>;

const VIDEO_EDITOR_EXPORT_ROUTE_KEY = 'video.editor.ffmpeg';
const VIDEO_EDITOR_PLACEHOLDER_ASSET_ID_PATTERN = /^placeholder-(?:image|video|audio)-\d+$/i;
const DEFAULT_VIDEO_TRANSITION_DURATION_MS = 500;
const DEFAULT_DIRECTOR_CAMERA_FOCAL_MM = 35;
const DIRECTOR_AXIS_LABELS = ['X', 'Y', 'Z'] as const;
const DIRECTOR_SHOT_MOTION_OPTIONS: Array<{ label: string; value: DirectorShotMotion }> = [
  { label: '固定', value: 'static' },
  { label: '推进', value: 'dolly' },
  { label: '环绕', value: 'orbit' },
  { label: '摇移', value: 'pan' },
  { label: '自定义', value: 'custom_path' },
];

export type StudioCanvasNodeRequest = {
  kind: 'image' | 'video';
  position: { x: number; y: number };
  runAfterCreate?: boolean;
  data: Partial<FlowNodeData>;
};

export type StudioStoryboardSyncRequest = {
  camera: DirectorCamera;
  shot: DirectorShot;
  shotIndex: number;
  sourceDirectorNodeId: string;
  sourceDirectorNodePosition: { x: number; y: number };
};

export type StudioStoryboardVideoSyncRequest = {
  sourceStoryboardNodeId: string;
  sourceStoryboardNodePosition: { x: number; y: number };
  storyboard: NonNullable<FlowNodeData['storyboard']>;
};

interface ProductionStudioShellProps {
  node: FlowNode;
  onClose: () => void;
  onCreateCanvasNodeFromStudio?: (request: StudioCanvasNodeRequest) => void;
  onSyncDirectorShotToStoryboard?: (request: StudioStoryboardSyncRequest) => void;
  onSyncStoryboardToVideoEditor?: (request: StudioStoryboardVideoSyncRequest) => void;
  onUpdateNodeData?: (nodeId: string, patch: Partial<FlowNodeData>) => void;
  studio: ProductionStudioKind;
}

const studioTitleByKind: Record<ProductionStudioKind, string> = {
  storyboard: '故事板',
  director3d: '3D导演台',
  video_editor: '剪辑工程',
};

export const ProductionStudioShell: React.FC<ProductionStudioShellProps> = ({
  node,
  onClose,
  onCreateCanvasNodeFromStudio,
  onSyncDirectorShotToStoryboard,
  onSyncStoryboardToVideoEditor,
  onUpdateNodeData,
  studio,
}) => {
  const title = node.data.title || studioTitleByKind[studio];

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div className="nodrag nopan nowheel" style={overlayStyle}>
      <section
        aria-label={title}
        aria-modal="true"
        role="dialog"
        style={shellStyle}
      >
        <header style={headerStyle}>
          <div style={headerTitleStyle}>
            {studio === 'director3d' ? <Box size={18} /> : studio === 'video_editor' ? <Film size={18} /> : <Grid3X3 size={18} />}
            <span>{title}</span>
          </div>
          <div style={headerMetaStyle}>
            <span>{node.id}</span>
            <button type="button" aria-label="关闭工作台" style={iconButtonStyle} onClick={onClose}>
              <X size={18} />
            </button>
          </div>
        </header>

        {studio === 'director3d' ? (
          <DirectorDeskContent
            data={node.data.director3d}
            nodeId={node.id}
            nodePosition={node.position}
            onCreateCanvasNodeFromStudio={onCreateCanvasNodeFromStudio}
            onSyncDirectorShotToStoryboard={onSyncDirectorShotToStoryboard}
            onUpdateNodeData={onUpdateNodeData}
          />
        ) : studio === 'storyboard' ? (
          <StoryboardContent
            data={node.data.storyboard}
            nodeId={node.id}
            nodePosition={node.position}
            onCreateCanvasNodeFromStudio={onCreateCanvasNodeFromStudio}
            onSyncStoryboardToVideoEditor={onSyncStoryboardToVideoEditor}
            onUpdateNodeData={onUpdateNodeData}
          />
        ) : (
          <VideoEditorContent
            data={node.data.videoEditor}
            nodeId={node.id}
            nodePosition={node.position}
            onCreateCanvasNodeFromStudio={onCreateCanvasNodeFromStudio}
            onUpdateNodeData={onUpdateNodeData}
          />
        )}
      </section>
    </div>
  );
};

function buildDirectorActor(index: number): FlowDirector3dData['actors'][number] {
  const number = index + 1;
  return {
    id: `actor-${number}`,
    name: `角色 ${number}`,
    kind: 'placeholder_humanoid',
    position: [index * 0.8, 0, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
    visible: true,
    locked: false,
  };
}

function buildDirectorCamera(index: number): FlowDirector3dData['cameras'][number] {
  const number = index + 1;
  return {
    id: `camera-${number}`,
    name: `镜头 ${number}`,
    position: [0, 1.8, 5 + index],
    target: [0, 1, 0],
    focalMm: 35,
    durationMs: 3000,
  };
}

function buildDirectorCameraSnapshot(camera: DirectorCamera): DirectorCameraSnapshot {
  return {
    ...(camera.name?.trim() ? { name: camera.name.trim() } : {}),
    position: normalizeDirectorVector(camera.position, [0, 1.8, 5]),
    target: normalizeDirectorVector(camera.target, [0, 1, 0]),
    ...(typeof camera.focalMm === 'number' && Number.isFinite(camera.focalMm) ? { focalMm: camera.focalMm } : {}),
    ...(typeof camera.fov === 'number' && Number.isFinite(camera.fov) ? { fov: camera.fov } : {}),
  };
}

function getShotCameraSnapshot(shot: DirectorShot, camera: DirectorCamera): DirectorCameraSnapshot {
  if (shot.cameraSnapshot) {
    return {
      ...(shot.cameraSnapshot.name?.trim() ? { name: shot.cameraSnapshot.name.trim() } : {}),
      position: normalizeDirectorVector(shot.cameraSnapshot.position, [0, 1.8, 5]),
      target: normalizeDirectorVector(shot.cameraSnapshot.target, [0, 1, 0]),
      ...(typeof shot.cameraSnapshot.focalMm === 'number' && Number.isFinite(shot.cameraSnapshot.focalMm)
        ? { focalMm: shot.cameraSnapshot.focalMm }
        : {}),
      ...(typeof shot.cameraSnapshot.fov === 'number' && Number.isFinite(shot.cameraSnapshot.fov)
        ? { fov: shot.cameraSnapshot.fov }
        : {}),
    };
  }
  return buildDirectorCameraSnapshot(camera);
}

function buildDirectorShot(
  index: number,
  camera: DirectorCamera,
  previousShots: FlowDirector3dData['shots'],
): FlowDirector3dData['shots'][number] {
  const number = index + 1;
  const startMs = previousShots.reduce((sum, shot) => sum + Math.max(0, Number(shot.durationMs) || 0), 0);
  const durationMs = Math.max(0, Number(camera.durationMs) || 3000);
  return {
    id: `shot-${number}`,
    cameraId: camera.id,
    cameraSnapshot: buildDirectorCameraSnapshot(camera),
    startMs,
    durationMs,
    motion: 'static',
    ...(camera.prompt?.trim() ? { prompt: camera.prompt.trim() } : {}),
  };
}

function recalculateDirectorShotStarts(shots: DirectorShot[]): DirectorShot[] {
  let startMs = 0;
  return shots.map((shot) => {
    const durationMs = Math.max(0, Number(shot.durationMs) || 0);
    const nextShot = { ...shot, durationMs, startMs };
    startMs += durationMs;
    return nextShot;
  });
}

function finiteNumberFromInput(value: string, fallback: number, options?: { max?: number; min?: number }) {
  if (value.trim() === '') return fallback;
  const next = Number(value);
  if (!Number.isFinite(next)) return fallback;
  const min = options?.min ?? -Infinity;
  const max = options?.max ?? Infinity;
  return Math.min(max, Math.max(min, next));
}

function normalizeDirectorVector(value: unknown, fallback: DirectorVector): DirectorVector {
  if (!Array.isArray(value)) return fallback;
  return DIRECTOR_AXIS_LABELS.map((_, index) => {
    const axisValue = Number(value[index]);
    return Number.isFinite(axisValue) ? axisValue : fallback[index];
  }) as DirectorVector;
}

function patchDirectorVectorAxis(
  value: unknown,
  axis: DirectorVectorAxis,
  rawValue: string,
  fallback: DirectorVector,
  options?: { max?: number; min?: number },
): DirectorVector {
  const next = normalizeDirectorVector(value, fallback);
  next[axis] = finiteNumberFromInput(rawValue, next[axis], options);
  return next;
}

function getDirectorCameraFocalMm(camera: DirectorCamera) {
  return Number.isFinite(Number(camera.focalMm)) ? Number(camera.focalMm) : DEFAULT_DIRECTOR_CAMERA_FOCAL_MM;
}

function getShotDurationSeconds(shot: DirectorShot) {
  const durationMs = Number(shot.durationMs);
  return Math.max(0, Number.isFinite(durationMs) ? Math.round(durationMs / 100) / 10 : 0);
}

function durationMsFromSecondsInput(value: string, fallbackDurationMs: number) {
  const fallbackSeconds = Math.max(0, Number(fallbackDurationMs) || 0) / 1000;
  return Math.round(finiteNumberFromInput(value, fallbackSeconds, { min: 0 }) * 1000);
}

function normalizeDirectorShotMotion(value: unknown): DirectorShotMotion {
  return DIRECTOR_SHOT_MOTION_OPTIONS.some((option) => option.value === value)
    ? (value as DirectorShotMotion)
    : 'static';
}

function getClipTransitionDurationSeconds(transitionOut?: VideoEditorTransitionOut) {
  const durationMs = Number(transitionOut?.durationMs);
  return Math.max(0, Number.isFinite(durationMs) ? Math.round(durationMs / 100) / 10 : 0);
}

function getClipVolume(clip: VideoEditorClip) {
  const volume = Number(clip.volume);
  return Number.isFinite(volume) && volume >= 0 ? volume : 1;
}

function buildVideoTransitionOut(type: string, durationMs: number): VideoEditorTransitionOut | undefined {
  if (type !== 'fade' && type !== 'crossfade') return undefined;
  return {
    durationMs: Math.max(0, Math.round(durationMs)),
    type,
  };
}

function buildVideoClip(
  kind: 'image' | 'video',
  clips: FlowVideoEditorData['timeline']['clips'],
): FlowVideoEditorData['timeline']['clips'][number] {
  const number = clips.length + 1;
  const durationMs = kind === 'image' ? 3000 : 4000;
  return {
    id: `clip-${number}`,
    assetId: `placeholder-${kind}-${number}`,
    kind,
    track: 1,
    startMs: getVideoTimelineClipEndMs(clips),
    inMs: 0,
    outMs: durationMs,
    speed: 1,
    ...(kind === 'video' ? { volume: 1 } : {}),
  };
}

function buildVideoSubtitle(
  subtitles: FlowVideoEditorData['timeline']['subtitles'],
): FlowVideoEditorData['timeline']['subtitles'][number] {
  const number = subtitles.length + 1;
  const previousEndMs = subtitles.reduce(
    (endMs, subtitle) => Math.max(endMs, Math.max(0, Number(subtitle.endMs) || 0)),
    0,
  );
  return {
    id: `subtitle-${number}`,
    text: `字幕 ${number}`,
    startMs: previousEndMs,
    endMs: previousEndMs + 1500,
  };
}

function buildVideoAudio(
  audio: FlowVideoEditorData['timeline']['audio'],
): VideoEditorAudio {
  const number = audio.length + 1;
  return {
    id: `audio-${number}`,
    assetId: `placeholder-audio-${number}`,
    track: 1,
    startMs: getVideoAudioTimelineEndMs(audio),
    inMs: 0,
    outMs: 3000,
    volume: 1,
  };
}

function getVideoEditorExportBlockReason(videoEditor: FlowVideoEditorData): string | null {
  const assetIds = [
    ...videoEditor.timeline.clips.map((clip) => clip.assetId.trim()),
    ...videoEditor.timeline.audio.map((item) => item.assetId.trim()),
  ].filter(Boolean);

  if (assetIds.length === 0) {
    return '请先添加素材片段或音频';
  }
  if (assetIds.some((assetId) => VIDEO_EDITOR_PLACEHOLDER_ASSET_ID_PATTERN.test(assetId))) {
    return '请先绑定素材库资产';
  }
  return null;
}

function DirectorDeskContent({
  data,
  nodeId,
  nodePosition,
  onCreateCanvasNodeFromStudio,
  onSyncDirectorShotToStoryboard,
  onUpdateNodeData,
}: {
  data?: FlowDirector3dData;
  nodeId: string;
  nodePosition: { x: number; y: number };
  onCreateCanvasNodeFromStudio?: (request: StudioCanvasNodeRequest) => void;
  onSyncDirectorShotToStoryboard?: (request: StudioStoryboardSyncRequest) => void;
  onUpdateNodeData?: (nodeId: string, patch: Partial<FlowNodeData>) => void;
}) {
  const director = normalizeDirector3dData(data);
  const actors = director.actors;
  const cameras = director.cameras;
  const shots = director.shots;
  const [selected, setSelected] = useState<DirectorSelection | null>(null);
  const updateDirector = (nextDirector: FlowDirector3dData) => {
    onUpdateNodeData?.(nodeId, { director3d: normalizeDirector3dData(nextDirector) });
  };
  const addActor = () => updateDirector({ ...director, actors: [...actors, buildDirectorActor(actors.length)] });
  const addCamera = () => updateDirector({ ...director, cameras: [...cameras, buildDirectorCamera(cameras.length)] });
  const captureShot = () => {
    const fallbackCamera = cameras[0] ? null : buildDirectorCamera(0);
    const nextCameras = fallbackCamera ? [fallbackCamera] : cameras;
    const shotCamera = selected?.type === 'camera'
      ? nextCameras.find((camera) => camera.id === selected.id) ?? nextCameras[0]
      : nextCameras[0];
    const nextShot = buildDirectorShot(shots.length, shotCamera, shots);
    updateDirector({
      ...director,
      cameras: nextCameras,
      shots: [...shots, nextShot],
    });
    setSelected({ type: 'shot', id: nextShot.id });
  };
  const patchActor = (actorId: string, patch: Partial<DirectorActor>) => {
    updateDirector({
      ...director,
      actors: actors.map((actor) => (actor.id === actorId ? { ...actor, ...patch } : actor)),
    });
  };
  const patchCamera = (cameraId: string, patch: Partial<DirectorCamera>) => {
    updateDirector({
      ...director,
      cameras: cameras.map((camera) => (camera.id === cameraId ? { ...camera, ...patch } : camera)),
    });
  };
  const patchShot = (shotId: string, patch: Partial<DirectorShot>) => {
    updateDirector({
      ...director,
      shots: recalculateDirectorShotStarts(shots.map((shot) => (shot.id === shotId ? { ...shot, ...patch } : shot))),
    });
  };
  const selectedActor = selected?.type === 'actor' ? actors.find((actor) => actor.id === selected.id) ?? null : null;
  const selectedCamera = selected?.type === 'camera' ? cameras.find((camera) => camera.id === selected.id) ?? null : null;
  const selectedShot = selected?.type === 'shot' ? shots.find((shot) => shot.id === selected.id) ?? null : null;
  const selectedSceneBackground = selected?.type === 'scene' && selected.id === 'background';
  const selectedImageAssetTarget = selectedActor || selectedSceneBackground ? selected : null;
  const [actorAssetCandidates, setActorAssetCandidates] = useState<AssetItem[]>([]);
  const [actorAssetCandidatesError, setActorAssetCandidatesError] = useState<string | null>(null);
  const [actorAssetCandidatesLoading, setActorAssetCandidatesLoading] = useState(false);
  useEffect(() => {
    if (!selectedImageAssetTarget) {
      setActorAssetCandidates([]);
      setActorAssetCandidatesError(null);
      setActorAssetCandidatesLoading(false);
      return;
    }

    let cancelled = false;
    setActorAssetCandidatesLoading(true);
    setActorAssetCandidatesError(null);
    listAssets({
      includePreviewUrls: false,
      kind: 'image',
      page: 1,
      pageSize: 6,
    })
      .then((response) => {
        if (cancelled) return;
        setActorAssetCandidates((response.items || []).filter((asset) => asset.kind === 'image'));
      })
      .catch(() => {
        if (cancelled) return;
        setActorAssetCandidates([]);
        setActorAssetCandidatesError('素材加载失败');
      })
      .finally(() => {
        if (!cancelled) setActorAssetCandidatesLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedImageAssetTarget?.id, selectedImageAssetTarget?.type]);
  const selectedShotIndex = selectedShot ? shots.findIndex((shot) => shot.id === selectedShot.id) : -1;
  const targetShot = selectedShot ?? shots[0] ?? null;
  const targetShotIndex = targetShot ? Math.max(0, shots.findIndex((shot) => shot.id === targetShot.id)) : -1;
  const targetCamera = targetShot
    ? cameras.find((camera) => camera.id === targetShot.cameraId) ?? cameras[0] ?? null
    : null;
  const canMoveSelectedShotBackward = Boolean(selectedShot && selectedShotIndex > 0);
  const canMoveSelectedShotForward = Boolean(selectedShot && selectedShotIndex >= 0 && selectedShotIndex < shots.length - 1);
  const moveSelectedShot = (offset: -1 | 1) => {
    if (!selectedShot || selectedShotIndex < 0) return;
    const nextIndex = selectedShotIndex + offset;
    if (nextIndex < 0 || nextIndex >= shots.length) return;
    const nextShots = [...shots];
    const [movedShot] = nextShots.splice(selectedShotIndex, 1);
    nextShots.splice(nextIndex, 0, movedShot);
    updateDirector({ ...director, shots: recalculateDirectorShotStarts(nextShots) });
  };
  const deleteSelectedShot = () => {
    if (!selectedShot) return;
    const nextShots = recalculateDirectorShotStarts(shots.filter((shot) => shot.id !== selectedShot.id));
    updateDirector({ ...director, shots: nextShots });
    const nextSelection = nextShots[Math.min(selectedShotIndex, nextShots.length - 1)] ?? null;
    setSelected(nextSelection ? { type: 'shot', id: nextSelection.id } : null);
  };
  const patchScene = (patch: Partial<FlowDirector3dData['scene']>) => {
    updateDirector({
      ...director,
      scene: {
        ...director.scene,
        ...patch,
      },
    });
  };
  const bindSelectedActorAsset = (assetId: string) => {
    if (!selectedActor) return;
    patchActor(selectedActor.id, { assetId, kind: 'image_plane' });
  };
  const bindSceneBackgroundAsset = (assetId: string) => {
    patchScene({ backgroundAssetId: assetId });
  };
  const synthesizeShotToCanvas = () => {
    if (!targetShot || !targetCamera) return;
    const shotNumber = targetShotIndex + 1;
    const cameraSnapshot = getShotCameraSnapshot(targetShot, targetCamera);
    const prompt =
      targetShot.prompt ||
      targetCamera.prompt ||
      `基于 ${cameraSnapshot.name || targetCamera.name || `镜头 ${shotNumber}`} 生成导演台镜头画面`;
    onCreateCanvasNodeFromStudio?.({
      kind: 'image',
      position: {
        x: nodePosition.x + 420,
        y: nodePosition.y + 40,
      },
      runAfterCreate: true,
      data: {
        title: `镜头 ${shotNumber} 生成图`,
        generationMode: 'standard',
        generationPrompt: prompt,
        params: {
          director3d: {
            sourceDirectorNodeId: nodeId,
            cameraId: targetCamera.id,
            shotId: targetShot.id,
            camera: {
              ...(cameraSnapshot.name ? { name: cameraSnapshot.name } : { name: targetCamera.name }),
              position: cameraSnapshot.position,
              target: cameraSnapshot.target,
              ...(typeof cameraSnapshot.focalMm === 'number' ? { focalMm: cameraSnapshot.focalMm } : {}),
              ...(typeof cameraSnapshot.fov === 'number' ? { fov: cameraSnapshot.fov } : {}),
            },
            durationMs: targetShot.durationMs,
            motion: targetShot.motion || 'static',
            prompt,
            startMs: targetShot.startMs,
          },
        },
      },
    });
  };
  const syncShotToStoryboard = () => {
    if (!targetShot || !targetCamera) return;
    onSyncDirectorShotToStoryboard?.({
      camera: {
        ...targetCamera,
        ...getShotCameraSnapshot(targetShot, targetCamera),
      },
      shot: targetShot,
      shotIndex: targetShotIndex,
      sourceDirectorNodeId: nodeId,
      sourceDirectorNodePosition: nodePosition,
    });
  };

  return (
    <div style={directorLayoutStyle}>
      <aside style={panelStyle}>
        <PanelTitle icon={<Layers3 size={15} />} title="场景对象" />
        <div style={listStyle}>
          <StudioSelectableListItem
            ariaLabel="选择对象 场景背景"
            label="场景背景"
            meta={director.scene.backgroundAssetId ? '已绑定' : '未绑定'}
            onClick={() => setSelected({ type: 'scene', id: 'background' })}
            selected={selectedSceneBackground}
          />
          {actors.map((actor) => (
            <StudioSelectableListItem
              key={actor.id}
              ariaLabel={`选择对象 ${actor.name}`}
              label={actor.name}
              meta={actor.visible ? '可见' : '隐藏'}
              onClick={() => setSelected({ type: 'actor', id: actor.id })}
              selected={selected?.type === 'actor' && selected.id === actor.id}
            />
          ))}
          {cameras.map((camera) => (
            <StudioSelectableListItem
              key={camera.id}
              ariaLabel={`选择对象 ${camera.name}`}
              label={camera.name}
              meta="镜头"
              onClick={() => setSelected({ type: 'camera', id: camera.id })}
              selected={selected?.type === 'camera' && selected.id === camera.id}
            />
          ))}
          {actors.length === 0 && cameras.length === 0 ? <EmptyLine label="暂无对象" /> : null}
        </div>
        <div style={directorActionGridStyle}>
          <button type="button" aria-label="添加角色" style={toolButtonStyle} onClick={addActor}>
            <Plus size={14} />
            添加角色
          </button>
          <button type="button" aria-label="添加镜头" style={toolButtonStyle} onClick={addCamera}>
            <Camera size={14} />
            添加镜头
          </button>
        </div>
      </aside>

      <main style={viewportWrapStyle}>
        <div style={viewportHeaderStyle}>
          <PanelTitle icon={<Camera size={15} />} title="导演视口" />
          <span style={pillStyle}>{data?.scene.gridVisible === false ? '网格关闭' : '网格开启'}</span>
        </div>
        <div style={directorViewportStyle}>
          <DirectorDeskThreeViewport
            actors={actors}
            cameras={cameras}
            scene={director.scene}
            shots={shots}
            selectedId={selected?.id ?? null}
            selectedType={selected?.type ?? null}
          />
        </div>
      </main>

      <aside style={panelStyle}>
        <PanelTitle icon={<Box size={15} />} title="对象属性" />
        <MetricRow label="角色" value={String(actors.length)} />
        <MetricRow label="镜头" value={String(cameras.length)} />
        <MetricRow label="镜头段" value={String(shots.length)} />
        <MetricRow label="单位" value={data?.scene.units || 'meters'} />
        <DirectorInspector
          actor={selectedActor}
          actorAssetCandidates={actorAssetCandidates}
          actorAssetCandidatesError={actorAssetCandidatesError}
          actorAssetCandidatesLoading={actorAssetCandidatesLoading}
          camera={selectedCamera}
          onBindActorAsset={bindSelectedActorAsset}
          onBindSceneBackgroundAsset={bindSceneBackgroundAsset}
          onPatchActor={patchActor}
          onPatchCamera={patchCamera}
          onPatchShot={patchShot}
          scene={selectedSceneBackground ? director.scene : null}
          shot={selectedShot}
        />
      </aside>

      <div style={bottomRailStyle}>
        <div style={railHeaderStyle}>
          <PanelTitle icon={<Play size={15} />} title="镜头轨道" />
          <div style={railActionsStyle}>
            <button type="button" aria-label="捕获镜头段" style={railButtonStyle} onClick={captureShot}>
              <Camera size={14} />
              捕获镜头段
            </button>
            <button
              type="button"
              aria-label="镜头前移"
              disabled={!canMoveSelectedShotBackward}
              style={railIconButtonStyle(canMoveSelectedShotBackward)}
              onClick={() => moveSelectedShot(-1)}
            >
              <ArrowLeft size={14} />
            </button>
            <button
              type="button"
              aria-label="镜头后移"
              disabled={!canMoveSelectedShotForward}
              style={railIconButtonStyle(canMoveSelectedShotForward)}
              onClick={() => moveSelectedShot(1)}
            >
              <ArrowRight size={14} />
            </button>
            <button
              type="button"
              aria-label="删除镜头段"
              disabled={!selectedShot}
              style={railIconButtonStyle(Boolean(selectedShot))}
              onClick={deleteSelectedShot}
            >
              <Trash2 size={14} />
            </button>
            <button
              type="button"
              aria-label="合成到画布"
              disabled={!targetShot || !targetCamera}
              style={{
                ...railButtonStyle,
                opacity: targetShot && targetCamera ? 1 : 0.45,
                cursor: targetShot && targetCamera ? 'pointer' : 'not-allowed',
              }}
              onClick={synthesizeShotToCanvas}
            >
              <ImagePlus size={14} />
              合成到画布
            </button>
            <button
              type="button"
              aria-label="同步到故事板"
              disabled={!targetShot || !targetCamera}
              style={{
                ...railButtonStyle,
                opacity: targetShot && targetCamera ? 1 : 0.45,
                cursor: targetShot && targetCamera ? 'pointer' : 'not-allowed',
              }}
              onClick={syncShotToStoryboard}
            >
              <Grid3X3 size={14} />
              同步到故事板
            </button>
          </div>
        </div>
        <div style={shotStripStyle}>
          {shots.length ? (
            shots.map((shot, index) => (
              <button
                key={shot.id}
                type="button"
                aria-label={`选择镜头段 ${index + 1}`}
                onClick={() => setSelected({ type: 'shot', id: shot.id })}
                style={shotButtonStyle(selected?.type === 'shot' && selected.id === shot.id)}
              >
                <strong>镜头 {index + 1}</strong>
                <span>{Math.round(shot.durationMs / 100) / 10}s</span>
              </button>
            ))
          ) : (
            <EmptyLine label="暂无镜头段" />
          )}
        </div>
      </div>
    </div>
  );
}

function StoryboardContent({
  data,
  nodeId,
  nodePosition,
  onCreateCanvasNodeFromStudio,
  onSyncStoryboardToVideoEditor,
  onUpdateNodeData,
}: {
  data?: FlowNodeData['storyboard'];
  nodeId: string;
  nodePosition: { x: number; y: number };
  onCreateCanvasNodeFromStudio?: (request: StudioCanvasNodeRequest) => void;
  onSyncStoryboardToVideoEditor?: (request: StudioStoryboardVideoSyncRequest) => void;
  onUpdateNodeData?: (nodeId: string, patch: Partial<FlowNodeData>) => void;
}) {
  const storyboard = normalizeStoryboardData(data);
  const selectedCell = storyboard.cells[storyboard.selectedIndex] ?? storyboard.cells[0];
  const hasStoryboardAssets = storyboard.cells.some((cell) => cell.assetId);
  const [storyboardAssetCandidates, setStoryboardAssetCandidates] = useState<AssetItem[]>([]);
  const [storyboardAssetCandidatesError, setStoryboardAssetCandidatesError] = useState<string | null>(null);
  const [storyboardAssetCandidatesLoading, setStoryboardAssetCandidatesLoading] = useState(false);
  useEffect(() => {
    if (!selectedCell) {
      setStoryboardAssetCandidates([]);
      setStoryboardAssetCandidatesError(null);
      setStoryboardAssetCandidatesLoading(false);
      return;
    }

    let cancelled = false;
    setStoryboardAssetCandidatesLoading(true);
    setStoryboardAssetCandidatesError(null);
    listAssets({
      includePreviewUrls: false,
      kind: 'image',
      page: 1,
      pageSize: 6,
    })
      .then((response) => {
        if (cancelled) return;
        setStoryboardAssetCandidates((response.items || []).filter((asset) => asset.kind === 'image'));
      })
      .catch(() => {
        if (cancelled) return;
        setStoryboardAssetCandidates([]);
        setStoryboardAssetCandidatesError('素材加载失败');
      })
      .finally(() => {
        if (!cancelled) setStoryboardAssetCandidatesLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedCell?.id]);
  const updateStoryboard = (nextStoryboard: typeof storyboard) => {
    onUpdateNodeData?.(nodeId, { storyboard: nextStoryboard });
  };
  const bindSelectedStoryboardAsset = (assetId: string) => {
    if (!selectedCell) return;
    updateStoryboard(patchStoryboardCell(storyboard, storyboard.selectedIndex, { assetId }));
  };
  const buildStoryboardImageRequest = (
    cell: typeof storyboard.cells[number],
    batchIndex = 0,
  ): StudioCanvasNodeRequest | null => {
    const prompt = cell.prompt?.trim();
    if (!prompt) return null;
    return {
      kind: 'image',
      position: {
        x: nodePosition.x + 420,
        y: nodePosition.y + 40 + batchIndex * 320,
      },
      runAfterCreate: true,
      data: {
        title: `镜头 ${cell.shotNo} · ${cell.title || '分镜图'}`,
        generationMode: 'standard',
        generationPrompt: prompt,
        params: {
          storyboard: {
            sourceStoryboardNodeId: nodeId,
            cellId: cell.id,
            shotNo: cell.shotNo,
            ...(cell.aspect ? { aspect: cell.aspect } : { aspect: storyboard.aspect }),
            ...(cell.directorCameraId ? { directorCameraId: cell.directorCameraId } : {}),
            ...(cell.directorShotId ? { directorShotId: cell.directorShotId } : {}),
            ...(cell.sourceAssetId ? { sourceAssetId: cell.sourceAssetId } : {}),
            ...(cell.sourceNodeId ? { sourceNodeId: cell.sourceNodeId } : {}),
          },
        },
      },
    };
  };
  const createSelectedCellImageNode = () => {
    if (!selectedCell) return;
    const request = buildStoryboardImageRequest(selectedCell);
    if (!request) return;
    onCreateCanvasNodeFromStudio?.(request);
  };
  const createAllPromptedCellImageNodes = () => {
    let batchIndex = 0;
    storyboard.cells.forEach((cell) => {
      const request = buildStoryboardImageRequest(cell, batchIndex);
      if (!request) return;
      batchIndex += 1;
      onCreateCanvasNodeFromStudio?.(request);
    });
  };
  const createStoryboardSheetImageNode = () => {
    const assetCells = storyboard.cells.filter((cell) => cell.assetId);
    if (!assetCells.length) return;
    const promptLines = assetCells.map((cell) => {
      const title = cell.title?.trim() || `镜头 ${cell.shotNo}`;
      const prompt = cell.prompt?.trim() || '沿用绑定素材画面';
      return `${cell.shotNo}. ${title}: ${prompt}`;
    });

    onCreateCanvasNodeFromStudio?.({
      kind: 'image',
      position: {
        x: nodePosition.x + 420,
        y: nodePosition.y + 40,
      },
      runAfterCreate: true,
      data: {
        title: '故事板合成图',
        generationMode: 'standard',
        generationPrompt: `将以下分镜合成为一张故事板排版图，保留镜头编号、标题和画面顺序。\n${promptLines.join('\n')}`,
        params: {
          storyboardSheet: {
            sourceStoryboardNodeId: nodeId,
            aspect: storyboard.aspect,
            grid: storyboard.grid,
            cells: assetCells.map((cell) => ({
              assetId: cell.assetId,
              cellId: cell.id,
              shotNo: cell.shotNo,
              ...(cell.title ? { title: cell.title } : {}),
              ...(cell.prompt ? { prompt: cell.prompt } : {}),
              ...(cell.aspect ? { aspect: cell.aspect } : { aspect: storyboard.aspect }),
              ...(cell.directorCameraId ? { directorCameraId: cell.directorCameraId } : {}),
              ...(cell.directorShotId ? { directorShotId: cell.directorShotId } : {}),
              ...(cell.sourceAssetId ? { sourceAssetId: cell.sourceAssetId } : {}),
              ...(cell.sourceNodeId ? { sourceNodeId: cell.sourceNodeId } : {}),
            })),
          },
        },
      },
    });
  };
  const syncStoryboardToVideoEditor = () => {
    if (!hasStoryboardAssets) return;
    onSyncStoryboardToVideoEditor?.({
      sourceStoryboardNodeId: nodeId,
      sourceStoryboardNodePosition: nodePosition,
      storyboard,
    });
  };

  return (
    <div style={storyboardLayoutStyle}>
      <main style={panelStyle}>
        <PanelTitle icon={<Grid3X3 size={15} />} title="分镜格" />
        <div style={storyGridStyle}>
          {storyboard.cells.map((cell, index) => (
            <button
              type="button"
              aria-label={`选择镜头 ${cell.shotNo}`}
              key={cell.id}
              onClick={() => updateStoryboard({ ...storyboard, selectedIndex: index })}
              style={{
                ...storyCellStyle,
                borderColor: index === storyboard.selectedIndex ? '#38bdf8' : 'rgba(255,255,255,0.11)',
              }}
            >
              <span>镜头 {cell.shotNo}</span>
              <strong>{cell.title || (cell.assetId ? '已绑定素材' : '空镜头')}</strong>
            </button>
          ))}
        </div>
      </main>
      <aside style={panelStyle}>
        <PanelTitle icon={<Camera size={15} />} title="选中分镜" />
        <MetricRow label="编号" value={selectedCell ? `镜头 ${selectedCell.shotNo}` : '-'} />
        <MetricRow label="画幅" value={selectedCell?.aspect || storyboard.aspect} />
        {storyboard.composedAssetId ? <MetricRow label="合成资产" value={storyboard.composedAssetId} /> : null}
        {selectedCell ? (
          <AssetCandidateList
            candidates={storyboardAssetCandidates}
            error={storyboardAssetCandidatesError}
            loading={storyboardAssetCandidatesLoading}
            onBind={bindSelectedStoryboardAsset}
            selectedAssetId={selectedCell.assetId || ''}
          />
        ) : null}
        <label style={fieldLabelStyle}>
          <span>分镜标题</span>
          <input
            aria-label="分镜标题"
            value={selectedCell?.title || ''}
            onChange={(event) =>
              updateStoryboard(patchStoryboardCell(storyboard, storyboard.selectedIndex, { title: event.target.value }))
            }
            placeholder="填写镜头标题"
            style={textInputStyle}
            type="text"
          />
        </label>
        <label style={fieldLabelStyle}>
          <span>分镜提示词</span>
          <textarea
            aria-label="分镜提示词"
            value={selectedCell?.prompt || ''}
            onChange={(event) =>
              updateStoryboard(patchStoryboardCell(storyboard, storyboard.selectedIndex, { prompt: event.target.value }))
            }
            placeholder="描述这一格要生成或承接的画面"
            style={textareaStyle}
          />
        </label>
        <div style={storyboardActionGridStyle}>
          <button
            type="button"
            aria-label="生成选中镜头"
            disabled={!selectedCell?.prompt}
            style={{
              ...toolButtonStyle,
              opacity: selectedCell?.prompt ? 1 : 0.45,
              cursor: selectedCell?.prompt ? 'pointer' : 'not-allowed',
            }}
            onClick={createSelectedCellImageNode}
          >
            <ImagePlus size={14} />
            生成选中镜头
          </button>
          <button
            type="button"
            aria-label="生成全部镜头"
            disabled={!storyboard.cells.some((cell) => cell.prompt)}
            style={{
              ...toolButtonStyle,
              opacity: storyboard.cells.some((cell) => cell.prompt) ? 1 : 0.45,
              cursor: storyboard.cells.some((cell) => cell.prompt) ? 'pointer' : 'not-allowed',
            }}
            onClick={createAllPromptedCellImageNodes}
          >
            <Grid3X3 size={14} />
            生成全部镜头
          </button>
          <button
            type="button"
            aria-label="合成故事板图"
            disabled={!hasStoryboardAssets}
            style={{
              ...toolButtonStyle,
              gridColumn: '1 / -1',
              opacity: hasStoryboardAssets ? 1 : 0.45,
              cursor: hasStoryboardAssets ? 'pointer' : 'not-allowed',
            }}
            onClick={createStoryboardSheetImageNode}
          >
            <ImagePlus size={14} />
            合成故事板图
          </button>
          <button
            type="button"
            aria-label="同步到剪辑工程"
            disabled={!hasStoryboardAssets}
            style={{
              ...toolButtonStyle,
              gridColumn: '1 / -1',
              opacity: hasStoryboardAssets ? 1 : 0.45,
              cursor: hasStoryboardAssets ? 'pointer' : 'not-allowed',
            }}
            onClick={syncStoryboardToVideoEditor}
          >
            <Film size={14} />
            同步到剪辑工程
          </button>
        </div>
      </aside>
    </div>
  );
}

function VideoEditorContent({
  data,
  nodeId,
  nodePosition,
  onCreateCanvasNodeFromStudio,
  onUpdateNodeData,
}: {
  data?: FlowVideoEditorData;
  nodeId: string;
  nodePosition: { x: number; y: number };
  onCreateCanvasNodeFromStudio?: (request: StudioCanvasNodeRequest) => void;
  onUpdateNodeData?: (nodeId: string, patch: Partial<FlowNodeData>) => void;
}) {
  const videoEditor = normalizeVideoEditorData(data);
  const timeline = videoEditor.timeline;
  const clips = timeline.clips;
  const audio = timeline.audio;
  const subtitles = timeline.subtitles;
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const [selectedAudioId, setSelectedAudioId] = useState<string | null>(null);
  const [selectedSubtitleId, setSelectedSubtitleId] = useState<string | null>(null);
  const selectedAudio = selectedAudioId ? audio.find((item) => item.id === selectedAudioId) ?? null : null;
  const selectedClip = selectedClipId ? clips.find((clip) => clip.id === selectedClipId) ?? null : null;
  const selectedSubtitle = selectedSubtitleId
    ? subtitles.find((subtitle) => subtitle.id === selectedSubtitleId) ?? null
    : null;
  const selectedAssetKind = selectedAudio ? 'audio' : selectedClip?.kind ?? null;
  const exportBlockReason = getVideoEditorExportBlockReason(videoEditor);
  const canExportVideo = !exportBlockReason;
  const [assetCandidates, setAssetCandidates] = useState<AssetItem[]>([]);
  const [assetCandidatesError, setAssetCandidatesError] = useState<string | null>(null);
  const [assetCandidatesLoading, setAssetCandidatesLoading] = useState(false);
  useEffect(() => {
    if (!selectedAssetKind) {
      setAssetCandidates([]);
      setAssetCandidatesError(null);
      setAssetCandidatesLoading(false);
      return;
    }

    let cancelled = false;
    setAssetCandidatesLoading(true);
    setAssetCandidatesError(null);
    listAssets({
      includePreviewUrls: false,
      kind: selectedAssetKind,
      page: 1,
      pageSize: 6,
    })
      .then((response) => {
        if (cancelled) return;
        setAssetCandidates((response.items || []).filter((asset) => asset.kind === selectedAssetKind));
      })
      .catch(() => {
        if (cancelled) return;
        setAssetCandidates([]);
        setAssetCandidatesError('素材加载失败');
      })
      .finally(() => {
        if (!cancelled) setAssetCandidatesLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedAssetKind]);
  const updateVideoEditor = (nextVideoEditor: FlowVideoEditorData) => {
    onUpdateNodeData?.(nodeId, { videoEditor: nextVideoEditor });
  };
  const updateTimeline = (nextTimeline: FlowVideoEditorData['timeline']) => {
    updateVideoEditor({ ...videoEditor, timeline: nextTimeline });
  };
  const addClip = (kind: 'image' | 'video') => {
    const nextClip = buildVideoClip(kind, clips);
    const nextTimeline = { ...timeline, clips: [...clips, nextClip] };
    updateTimeline({
      ...nextTimeline,
      durationMs: getVideoTimelineDurationMs(nextTimeline),
    });
    setSelectedClipId(nextClip.id);
    setSelectedAudioId(null);
    setSelectedSubtitleId(null);
  };
  const addAudio = () => {
    const nextAudio = buildVideoAudio(audio);
    const nextTimeline = { ...timeline, audio: [...audio, nextAudio] };
    updateTimeline({
      ...nextTimeline,
      durationMs: getVideoTimelineDurationMs(nextTimeline),
    });
    setSelectedAudioId(nextAudio.id);
    setSelectedClipId(null);
    setSelectedSubtitleId(null);
  };
  const addSubtitle = () => {
    const nextSubtitle = buildVideoSubtitle(subtitles);
    const nextTimeline = { ...timeline, subtitles: [...subtitles, nextSubtitle] };
    updateTimeline({
      ...nextTimeline,
      durationMs: getVideoTimelineDurationMs(nextTimeline),
    });
    setSelectedAudioId(null);
    setSelectedClipId(null);
    setSelectedSubtitleId(nextSubtitle.id);
  };
  const setDurationSeconds = (value: string) => {
    const seconds = Math.max(0, Number(value) || 0);
    updateTimeline({ ...timeline, durationMs: Math.round(seconds * 1000) });
  };
  const patchClip = (
    clipId: string,
    patcher: (clip: FlowVideoEditorData['timeline']['clips'][number]) => FlowVideoEditorData['timeline']['clips'][number],
  ) => {
    const nextTimeline = {
      ...timeline,
      clips: clips.map((clip) => (clip.id === clipId ? patcher(clip) : clip)),
    };
    updateTimeline({ ...nextTimeline, durationMs: getVideoTimelineDurationMs(nextTimeline) });
  };
  const patchAudio = (
    audioId: string,
    patcher: (item: VideoEditorAudio) => VideoEditorAudio,
  ) => {
    const nextTimeline = {
      ...timeline,
      audio: audio.map((item) => (item.id === audioId ? patcher(item) : item)),
    };
    updateTimeline({ ...nextTimeline, durationMs: getVideoTimelineDurationMs(nextTimeline) });
  };
  const patchSubtitle = (
    subtitleId: string,
    patcher: (subtitle: VideoEditorSubtitle) => VideoEditorSubtitle,
  ) => {
    const nextTimeline = {
      ...timeline,
      subtitles: subtitles.map((subtitle) => (subtitle.id === subtitleId ? patcher(subtitle) : subtitle)),
    };
    updateTimeline({ ...nextTimeline, durationMs: getVideoTimelineDurationMs(nextTimeline) });
  };
  const setSelectedClipStartSeconds = (value: string) => {
    if (!selectedClip) return;
    const startMs = Math.round(Math.max(0, Number(value) || 0) * 1000);
    patchClip(selectedClip.id, (clip) => ({ ...clip, startMs }));
  };
  const setSelectedClipDurationSeconds = (value: string) => {
    if (!selectedClip) return;
    const durationMs = Math.round(Math.max(0, Number(value) || 0) * 1000);
    patchClip(selectedClip.id, (clip) => ({ ...clip, outMs: Math.max(0, Number(clip.inMs) || 0) + durationMs }));
  };
  const setSelectedClipTransition = (type: 'none' | 'fade' | 'crossfade') => {
    if (!selectedClip) return;
    patchClip(selectedClip.id, (clip) => {
      const { transitionOut: _transitionOut, ...rest } = clip;
      if (type === 'none') return rest;
      return {
        ...rest,
        transitionOut: buildVideoTransitionOut(
          type,
          clip.transitionOut?.durationMs ?? DEFAULT_VIDEO_TRANSITION_DURATION_MS,
        ),
      };
    });
  };
  const setSelectedClipTransitionDurationSeconds = (value: string) => {
    if (!selectedClip?.transitionOut) return;
    const durationMs = Math.round(Math.max(0, Number(value) || 0) * 1000);
    patchClip(selectedClip.id, (clip) => ({
      ...clip,
      transitionOut: buildVideoTransitionOut(clip.transitionOut?.type || 'fade', durationMs),
    }));
  };
  const setSelectedClipMuted = (muted: boolean) => {
    if (!selectedClip || selectedClip.kind !== 'video') return;
    patchClip(selectedClip.id, (clip) => ({ ...clip, muted }));
  };
  const setSelectedClipVolume = (value: string) => {
    if (!selectedClip || selectedClip.kind !== 'video') return;
    const volume = Math.max(0, Math.min(2, Number(value) || 0));
    patchClip(selectedClip.id, (clip) => ({ ...clip, volume }));
  };
  const bindSelectedClipAsset = (assetId: string) => {
    if (!selectedClip) return;
    patchClip(selectedClip.id, (clip) => ({ ...clip, assetId }));
  };
  const deleteSelectedClip = () => {
    if (!selectedClip) return;
    const nextTimeline = {
      ...timeline,
      clips: clips.filter((clip) => clip.id !== selectedClip.id),
    };
    updateTimeline({ ...nextTimeline, durationMs: getVideoTimelineDurationMs(nextTimeline) });
    setSelectedClipId(null);
  };
  const setSelectedAudioStartSeconds = (value: string) => {
    if (!selectedAudio) return;
    const startMs = Math.round(Math.max(0, Number(value) || 0) * 1000);
    patchAudio(selectedAudio.id, (item) => ({ ...item, startMs }));
  };
  const setSelectedAudioDurationSeconds = (value: string) => {
    if (!selectedAudio) return;
    const durationMs = Math.round(Math.max(0, Number(value) || 0) * 1000);
    patchAudio(selectedAudio.id, (item) => ({ ...item, outMs: Math.max(0, Number(item.inMs) || 0) + durationMs }));
  };
  const setSelectedAudioVolume = (value: string) => {
    if (!selectedAudio) return;
    const volume = Math.max(0, Math.min(2, Number(value) || 0));
    patchAudio(selectedAudio.id, (item) => ({ ...item, volume }));
  };
  const bindSelectedAudioAsset = (assetId: string) => {
    if (!selectedAudio) return;
    patchAudio(selectedAudio.id, (item) => ({ ...item, assetId }));
  };
  const deleteSelectedAudio = () => {
    if (!selectedAudio) return;
    const nextTimeline = {
      ...timeline,
      audio: audio.filter((item) => item.id !== selectedAudio.id),
    };
    updateTimeline({ ...nextTimeline, durationMs: getVideoTimelineDurationMs(nextTimeline) });
    setSelectedAudioId(null);
  };
  const setSelectedSubtitleText = (value: string) => {
    if (!selectedSubtitle) return;
    patchSubtitle(selectedSubtitle.id, (subtitle) => ({ ...subtitle, text: value }));
  };
  const setSelectedSubtitleStartSeconds = (value: string) => {
    if (!selectedSubtitle) return;
    const startMs = Math.round(Math.max(0, Number(value) || 0) * 1000);
    patchSubtitle(selectedSubtitle.id, (subtitle) => {
      const durationMs = Math.max(0, Number(subtitle.endMs) - Number(subtitle.startMs));
      return { ...subtitle, startMs, endMs: startMs + durationMs };
    });
  };
  const setSelectedSubtitleEndSeconds = (value: string) => {
    if (!selectedSubtitle) return;
    const endMs = Math.round(Math.max(0, Number(value) || 0) * 1000);
    patchSubtitle(selectedSubtitle.id, (subtitle) => ({ ...subtitle, startMs: Math.min(subtitle.startMs, endMs), endMs }));
  };
  const deleteSelectedSubtitle = () => {
    if (!selectedSubtitle) return;
    const nextTimeline = {
      ...timeline,
      subtitles: subtitles.filter((subtitle) => subtitle.id !== selectedSubtitle.id),
    };
    updateTimeline({ ...nextTimeline, durationMs: getVideoTimelineDurationMs(nextTimeline) });
    setSelectedSubtitleId(null);
  };
  const exportVideoToCanvas = () => {
    if (!canExportVideo) return;
    onCreateCanvasNodeFromStudio?.({
      kind: 'video',
      position: {
        x: nodePosition.x + 420,
        y: nodePosition.y + 40,
      },
      runAfterCreate: true,
      data: {
        title: '剪辑工程导出',
        durationMs: timeline.durationMs,
        generationPrompt: '根据剪辑工程时间线生成视频',
        routeKey: VIDEO_EDITOR_EXPORT_ROUTE_KEY,
        params: {
          videoEditor: {
            sourceVideoEditorNodeId: nodeId,
            aspect: videoEditor.aspect,
            resolution: videoEditor.resolution,
            timeline,
          },
        },
      },
    });
  };

  return (
    <div style={videoLayoutStyle}>
      <aside style={panelStyle}>
        <PanelTitle icon={<Layers3 size={15} />} title="素材箱" />
        <StudioListItem label={`${clips.length} 个画面素材`} meta="clips" />
        <StudioListItem label={`${audio.length} 条音频`} meta="audio" />
        <StudioListItem label={`${subtitles.length} 条字幕`} meta="subtitles" />
        <div style={videoActionStackStyle}>
          <button type="button" aria-label="添加图片片段" style={toolButtonStyle} onClick={() => addClip('image')}>
            <Plus size={14} />
            添加图片片段
          </button>
          <button type="button" aria-label="添加视频片段" style={toolButtonStyle} onClick={() => addClip('video')}>
            <Film size={14} />
            添加视频片段
          </button>
          <button type="button" aria-label="添加音频" style={toolButtonStyle} onClick={addAudio}>
            <Plus size={14} />
            添加音频
          </button>
          <button type="button" aria-label="添加字幕" style={toolButtonStyle} onClick={addSubtitle}>
            <Plus size={14} />
            添加字幕
          </button>
          {exportBlockReason ? <EmptyLine label={exportBlockReason} /> : null}
          <button
            type="button"
            aria-label="导出到画布"
            disabled={!canExportVideo}
            style={{
              ...toolButtonStyle,
              cursor: canExportVideo ? 'pointer' : 'not-allowed',
              opacity: canExportVideo ? 1 : 0.45,
            }}
            onClick={exportVideoToCanvas}
          >
            <Film size={14} />
            导出到画布
          </button>
        </div>
      </aside>
      <main style={previewPanelStyle}>
        <PanelTitle icon={<Play size={15} />} title="预览监看" />
        <div style={videoPreviewStyle}>
          <Film size={42} />
        </div>
      </main>
      <aside style={panelStyle}>
        <PanelTitle icon={<Box size={15} />} title="参数检查" />
        <MetricRow label="画幅" value={videoEditor.aspect} />
        <MetricRow label="分辨率" value={videoEditor.resolution} />
        <MetricRow label="时长" value={`${Math.round(timeline.durationMs / 100) / 10}s`} />
        {videoEditor.exportedAssetId ? <MetricRow label="导出资产" value={videoEditor.exportedAssetId} /> : null}
        {selectedAudio ? (
          <>
            <MetricRow label="当前音频" value={selectedAudio.id} />
            <MetricRow label="素材" value={selectedAudio.assetId} />
            <AssetCandidateList
              candidates={assetCandidates}
              error={assetCandidatesError}
              loading={assetCandidatesLoading}
              onBind={bindSelectedAudioAsset}
              selectedAssetId={selectedAudio.assetId}
            />
            <label style={fieldLabelStyle}>
              <span>音频开始（秒）</span>
              <input
                aria-label="音频开始（秒）"
                min={0}
                onChange={(event) => setSelectedAudioStartSeconds(event.target.value)}
                step={0.1}
                style={textInputStyle}
                type="number"
                value={Math.round(selectedAudio.startMs / 100) / 10}
              />
            </label>
            <label style={fieldLabelStyle}>
              <span>音频时长（秒）</span>
              <input
                aria-label="音频时长（秒）"
                min={0}
                onChange={(event) => setSelectedAudioDurationSeconds(event.target.value)}
                step={0.1}
                style={textInputStyle}
                type="number"
                value={Math.round(getVideoAudioDurationMs(selectedAudio) / 100) / 10}
              />
            </label>
            <label style={fieldLabelStyle}>
              <span>音量</span>
              <input
                aria-label="音量"
                max={2}
                min={0}
                onChange={(event) => setSelectedAudioVolume(event.target.value)}
                step={0.05}
                style={textInputStyle}
                type="number"
                value={selectedAudio.volume}
              />
            </label>
            <button type="button" aria-label="删除音频" style={{ ...toolButtonStyle, marginTop: 10 }} onClick={deleteSelectedAudio}>
              删除音频
            </button>
          </>
        ) : selectedClip ? (
          <>
            <MetricRow label="当前片段" value={selectedClip.id} />
            <MetricRow label="素材" value={selectedClip.assetId} />
            <AssetCandidateList
              candidates={assetCandidates}
              error={assetCandidatesError}
              loading={assetCandidatesLoading}
              onBind={bindSelectedClipAsset}
              selectedAssetId={selectedClip.assetId}
            />
            <label style={fieldLabelStyle}>
              <span>片段开始（秒）</span>
              <input
                aria-label="片段开始（秒）"
                min={0}
                onChange={(event) => setSelectedClipStartSeconds(event.target.value)}
                step={0.1}
                style={textInputStyle}
                type="number"
                value={Math.round(selectedClip.startMs / 100) / 10}
              />
            </label>
            <label style={fieldLabelStyle}>
              <span>片段时长（秒）</span>
              <input
                aria-label="片段时长（秒）"
                min={0}
                onChange={(event) => setSelectedClipDurationSeconds(event.target.value)}
                step={0.1}
                style={textInputStyle}
                type="number"
                value={Math.round(getVideoClipDurationMs(selectedClip) / 100) / 10}
              />
            </label>
            {selectedClip.kind === 'video' ? (
              <>
                <label style={checkboxFieldStyle}>
                  <input
                    aria-label="片段静音"
                    checked={selectedClip.muted === true}
                    onChange={(event) => setSelectedClipMuted(event.target.checked)}
                    type="checkbox"
                  />
                  <span>片段静音</span>
                </label>
                <label style={fieldLabelStyle}>
                  <span>片段音量</span>
                  <input
                    aria-label="片段音量"
                    max={2}
                    min={0}
                    onChange={(event) => setSelectedClipVolume(event.target.value)}
                    step={0.05}
                    style={textInputStyle}
                    type="number"
                    value={getClipVolume(selectedClip)}
                  />
                </label>
              </>
            ) : null}
            <div style={fieldLabelStyle}>
              <span>转场</span>
              <div aria-label="转场" role="group" style={motionButtonGroupStyle}>
                {[
                  { label: '无转场', value: 'none' },
                  { label: '淡入淡出', value: 'fade' },
                  { label: '叠化', value: 'crossfade' },
                ].map((option) => {
                  const selected = (selectedClip.transitionOut?.type ?? 'none') === option.value;
                  return (
                    <button
                      key={option.value}
                      aria-pressed={selected}
                      onClick={() => setSelectedClipTransition(option.value as 'none' | 'fade' | 'crossfade')}
                      style={motionButtonStyle(selected)}
                      type="button"
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </div>
            {selectedClip.transitionOut ? (
              <label style={fieldLabelStyle}>
                <span>转场时长（秒）</span>
                <input
                  aria-label="转场时长（秒）"
                  min={0}
                  onChange={(event) => setSelectedClipTransitionDurationSeconds(event.target.value)}
                  step={0.1}
                  style={textInputStyle}
                  type="number"
                  value={getClipTransitionDurationSeconds(selectedClip.transitionOut)}
                />
              </label>
            ) : null}
            <button type="button" aria-label="删除片段" style={{ ...toolButtonStyle, marginTop: 10 }} onClick={deleteSelectedClip}>
              删除片段
            </button>
          </>
        ) : selectedSubtitle ? (
          <>
            <MetricRow label="当前字幕" value={selectedSubtitle.id} />
            <label style={fieldLabelStyle}>
              <span>字幕文本</span>
              <textarea
                aria-label="字幕文本"
                onChange={(event) => setSelectedSubtitleText(event.target.value)}
                style={textareaStyle}
                value={selectedSubtitle.text}
              />
            </label>
            <label style={fieldLabelStyle}>
              <span>字幕开始（秒）</span>
              <input
                aria-label="字幕开始（秒）"
                min={0}
                onChange={(event) => setSelectedSubtitleStartSeconds(event.target.value)}
                step={0.1}
                style={textInputStyle}
                type="number"
                value={Math.round(selectedSubtitle.startMs / 100) / 10}
              />
            </label>
            <label style={fieldLabelStyle}>
              <span>字幕结束（秒）</span>
              <input
                aria-label="字幕结束（秒）"
                min={0}
                onChange={(event) => setSelectedSubtitleEndSeconds(event.target.value)}
                step={0.1}
                style={textInputStyle}
                type="number"
                value={Math.round(selectedSubtitle.endMs / 100) / 10}
              />
            </label>
            <button type="button" aria-label="删除字幕" style={{ ...toolButtonStyle, marginTop: 10 }} onClick={deleteSelectedSubtitle}>
              删除字幕
            </button>
          </>
        ) : (
          <EmptyLine label="选择时间线片段后编辑" />
        )}
        <label style={fieldLabelStyle}>
          <span>工程时长（秒）</span>
          <input
            aria-label="工程时长（秒）"
            min={0}
            onChange={(event) => setDurationSeconds(event.target.value)}
            step={0.1}
            style={textInputStyle}
            type="number"
            value={Math.round(timeline.durationMs / 100) / 10}
          />
        </label>
      </aside>
      <div style={bottomRailStyle}>
        <PanelTitle icon={<Film size={15} />} title="时间线" />
        <div style={timelineStyle}>
          {clips.length ? (
            clips.map((clip) => (
              <button
                key={clip.id}
                type="button"
                aria-label={`选择片段 ${clip.id}`}
                onClick={() => {
                  setSelectedClipId(clip.id);
                  setSelectedAudioId(null);
                  setSelectedSubtitleId(null);
                }}
                style={clipButtonStyle(selectedClipId === clip.id)}
              >
                <strong>{clip.id}</strong>
              <span>{clip.kind}</span>
            </button>
          ))
          ) : (
            <EmptyLine label="暂无剪辑片段" />
          )}
          {audio.map((item) => (
            <button
              key={item.id}
              type="button"
              aria-label={`选择音频 ${item.id}`}
              onClick={() => {
                setSelectedAudioId(item.id);
                setSelectedClipId(null);
                setSelectedSubtitleId(null);
              }}
              style={audioButtonStyle(selectedAudioId === item.id)}
            >
              <strong>{item.id}</strong>
              <span>{Math.round(getVideoAudioDurationMs(item) / 100) / 10}s</span>
            </button>
          ))}
          {subtitles.map((subtitle) => (
            <button
              key={subtitle.id}
              type="button"
              aria-label={`选择字幕 ${subtitle.id}`}
              onClick={() => {
                setSelectedAudioId(null);
                setSelectedClipId(null);
                setSelectedSubtitleId(subtitle.id);
              }}
              style={subtitleButtonStyle(selectedSubtitleId === subtitle.id)}
            >
              <strong>{subtitle.text}</strong>
              <span>{Math.round((subtitle.endMs - subtitle.startMs) / 100) / 10}s</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function AssetCandidateList({
  candidates,
  error,
  loading,
  onBind,
  selectedAssetId,
}: {
  candidates: AssetItem[];
  error: string | null;
  loading: boolean;
  onBind: (assetId: string) => void;
  selectedAssetId: string;
}) {
  return (
    <div style={assetCandidateWrapStyle}>
      <span>素材库候选</span>
      {loading ? <EmptyLine label="正在读取素材库" /> : null}
      {error ? <EmptyLine label={error} /> : null}
      {!loading && !error && candidates.length === 0 ? <EmptyLine label="暂无同类型素材" /> : null}
      {candidates.length ? (
        <div style={assetCandidateListStyle}>
          {candidates.map((asset) => {
            const selected = asset.id === selectedAssetId;
            return (
              <button
                key={asset.id}
                aria-label={`绑定素材 ${asset.id}`}
                disabled={selected}
                onClick={() => onBind(asset.id)}
                style={assetCandidateButtonStyle(selected)}
                type="button"
              >
                <strong>{asset.title || asset.originalFilename || asset.id}</strong>
                <small>{selected ? '已绑定' : asset.id}</small>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function DirectorInspector({
  actor,
  actorAssetCandidates,
  actorAssetCandidatesError,
  actorAssetCandidatesLoading,
  camera,
  onBindActorAsset,
  onBindSceneBackgroundAsset,
  onPatchActor,
  onPatchCamera,
  onPatchShot,
  scene,
  shot,
}: {
  actor: DirectorActor | null;
  actorAssetCandidates: AssetItem[];
  actorAssetCandidatesError: string | null;
  actorAssetCandidatesLoading: boolean;
  camera: DirectorCamera | null;
  onBindActorAsset: (assetId: string) => void;
  onBindSceneBackgroundAsset: (assetId: string) => void;
  onPatchActor: (actorId: string, patch: Partial<DirectorActor>) => void;
  onPatchCamera: (cameraId: string, patch: Partial<DirectorCamera>) => void;
  onPatchShot: (shotId: string, patch: Partial<DirectorShot>) => void;
  scene: FlowDirector3dData['scene'] | null;
  shot: DirectorShot | null;
}) {
  if (actor) {
    return (
      <div style={inspectorFormStyle}>
        <MetricRow label="素材" value={actor.assetId || '未绑定'} />
        <AssetCandidateList
          candidates={actorAssetCandidates}
          error={actorAssetCandidatesError}
          loading={actorAssetCandidatesLoading}
          onBind={onBindActorAsset}
          selectedAssetId={actor.assetId || ''}
        />
        <label style={fieldLabelStyle}>
          <span>对象名称</span>
          <input
            aria-label="对象名称"
            onChange={(event) => onPatchActor(actor.id, { name: event.target.value })}
            style={textInputStyle}
            type="text"
            value={actor.name}
          />
        </label>
        <label style={checkboxFieldStyle}>
          <input
            aria-label="对象可见"
            checked={actor.visible}
            onChange={(event) => onPatchActor(actor.id, { visible: event.target.checked })}
            type="checkbox"
          />
          <span>对象可见</span>
        </label>
        <label style={checkboxFieldStyle}>
          <input
            aria-label="对象锁定"
            checked={actor.locked}
            onChange={(event) => onPatchActor(actor.id, { locked: event.target.checked })}
            type="checkbox"
          />
          <span>对象锁定</span>
        </label>
        <DirectorVectorInputGroup
          label="位置"
          value={actor.position}
          onChange={(axis, value) => onPatchActor(actor.id, {
            position: patchDirectorVectorAxis(actor.position, axis, value, [0, 0, 0]),
          })}
        />
        <DirectorVectorInputGroup
          label="旋转"
          value={actor.rotation}
          onChange={(axis, value) => onPatchActor(actor.id, {
            rotation: patchDirectorVectorAxis(actor.rotation, axis, value, [0, 0, 0]),
          })}
        />
        <DirectorVectorInputGroup
          label="缩放"
          value={actor.scale}
          onChange={(axis, value) => onPatchActor(actor.id, {
            scale: patchDirectorVectorAxis(actor.scale, axis, value, [1, 1, 1], { min: 0.1 }),
          })}
        />
      </div>
    );
  }

  if (scene) {
    return (
      <div style={inspectorFormStyle}>
        <MetricRow label="背景素材" value={scene.backgroundAssetId || '未绑定'} />
        <AssetCandidateList
          candidates={actorAssetCandidates}
          error={actorAssetCandidatesError}
          loading={actorAssetCandidatesLoading}
          onBind={onBindSceneBackgroundAsset}
          selectedAssetId={scene.backgroundAssetId || ''}
        />
      </div>
    );
  }

  if (camera) {
    return (
      <div style={inspectorFormStyle}>
        <MetricRow label="当前镜头" value={camera.name} />
        <DirectorVectorInputGroup
          inputLabelPrefix="镜头位置"
          label="镜头位置"
          value={camera.position}
          onChange={(axis, value) => onPatchCamera(camera.id, {
            position: patchDirectorVectorAxis(camera.position, axis, value, [0, 1.8, 5]),
          })}
        />
        <DirectorVectorInputGroup
          inputLabelPrefix="注视目标"
          label="注视目标"
          value={camera.target}
          onChange={(axis, value) => onPatchCamera(camera.id, {
            target: patchDirectorVectorAxis(camera.target, axis, value, [0, 1, 0]),
          })}
        />
        <label style={fieldLabelStyle}>
          <span>焦距 mm</span>
          <input
            aria-label="焦距 mm"
            min={1}
            max={300}
            onChange={(event) => onPatchCamera(camera.id, {
              focalMm: finiteNumberFromInput(event.target.value, getDirectorCameraFocalMm(camera), { min: 1, max: 300 }),
            })}
            step={1}
            style={textInputStyle}
            type="number"
            value={getDirectorCameraFocalMm(camera)}
          />
        </label>
        <label style={fieldLabelStyle}>
          <span>镜头提示词</span>
          <textarea
            aria-label="镜头提示词"
            onChange={(event) => onPatchCamera(camera.id, { prompt: event.target.value })}
            placeholder="描述这个镜头的构图、运动或情绪"
            style={textareaStyle}
            value={camera.prompt || ''}
          />
        </label>
      </div>
    );
  }

  if (shot) {
    return (
      <div style={inspectorFormStyle}>
        <MetricRow label="当前段落" value={shot.id} />
        {shot.generatedAssetId ? <MetricRow label="生成资产" value={shot.generatedAssetId} /> : null}
        <label style={fieldLabelStyle}>
          <span>镜头段时长（秒）</span>
          <input
            aria-label="镜头段时长（秒）"
            min={0}
            onChange={(event) => onPatchShot(shot.id, {
              durationMs: durationMsFromSecondsInput(event.target.value, shot.durationMs),
            })}
            step={0.1}
            style={textInputStyle}
            type="number"
            value={getShotDurationSeconds(shot)}
          />
        </label>
        <div style={fieldLabelStyle}>
          <span>镜头运动</span>
          <div aria-label="镜头运动" role="group" style={motionButtonGroupStyle}>
            {DIRECTOR_SHOT_MOTION_OPTIONS.map((option) => {
              const selected = normalizeDirectorShotMotion(shot.motion) === option.value;
              return (
                <button
                  key={option.value}
                  aria-pressed={selected}
                  onClick={() => onPatchShot(shot.id, { motion: option.value })}
                  style={motionButtonStyle(selected)}
                  type="button"
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </div>
        <label style={fieldLabelStyle}>
          <span>镜头段提示词</span>
          <textarea
            aria-label="镜头段提示词"
            onChange={(event) => onPatchShot(shot.id, { prompt: event.target.value })}
            placeholder="描述这一段镜头如何推进或转场"
            style={textareaStyle}
            value={shot.prompt || ''}
          />
        </label>
      </div>
    );
  }

  return <EmptyLine label="选择对象、镜头或镜头段后编辑属性" />;
}

function DirectorVectorInputGroup({
  inputLabelPrefix,
  label,
  onChange,
  value,
}: {
  inputLabelPrefix?: string;
  label: string;
  onChange: (axis: DirectorVectorAxis, value: string) => void;
  value: DirectorVector;
}) {
  const normalizedValue = normalizeDirectorVector(value, label === '缩放' ? [1, 1, 1] : [0, 0, 0]);
  return (
    <div style={fieldLabelStyle}>
      <span>{label}</span>
      <div style={vectorGridStyle}>
        {DIRECTOR_AXIS_LABELS.map((axisLabel, axisIndex) => (
          <label key={axisLabel} style={axisFieldStyle}>
            <span>{axisLabel}</span>
            <input
              aria-label={`${inputLabelPrefix || label} ${axisLabel}`}
              onChange={(event) => onChange(axisIndex as DirectorVectorAxis, event.target.value)}
              step={0.1}
              style={axisInputStyle}
              type="number"
              value={normalizedValue[axisIndex]}
            />
          </label>
        ))}
      </div>
    </div>
  );
}

function PanelTitle({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div style={panelTitleStyle}>
      {icon}
      <span>{title}</span>
    </div>
  );
}

function StudioListItem({ label, meta }: { label: string; meta: string }) {
  return (
    <div style={listItemStyle}>
      <span>{label}</span>
      <small>{meta}</small>
    </div>
  );
}

function StudioSelectableListItem({
  ariaLabel,
  label,
  meta,
  onClick,
  selected,
}: {
  ariaLabel: string;
  label: string;
  meta: string;
  onClick: () => void;
  selected: boolean;
}) {
  return (
    <button type="button" aria-label={ariaLabel} style={listItemButtonStyle(selected)} onClick={onClick}>
      <span>{label}</span>
      <small>{meta}</small>
    </button>
  );
}

function MetricRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={metricRowStyle}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function EmptyLine({ label }: { label: string }) {
  return <div style={emptyLineStyle}>{label}</div>;
}

const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 1500,
  background: 'rgba(3,7,18,0.88)',
  backdropFilter: 'blur(14px)',
  padding: 16,
};

const shellStyle: React.CSSProperties = {
  width: '100%',
  height: '100%',
  display: 'grid',
  gridTemplateRows: '54px 1fr',
  overflow: 'hidden',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 8,
  background: '#0b0d12',
  color: '#f8fafc',
  boxShadow: '0 24px 80px rgba(0,0,0,0.48)',
};

const headerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '0 14px 0 18px',
  borderBottom: '1px solid rgba(255,255,255,0.08)',
  background: '#101217',
};

const headerTitleStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 9,
  fontSize: 15,
  fontWeight: 800,
};

const headerMetaStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  color: '#94a3b8',
  fontSize: 11,
};

const iconButtonStyle: React.CSSProperties = {
  width: 32,
  height: 32,
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 8,
  background: 'rgba(255,255,255,0.06)',
  color: '#f8fafc',
  display: 'grid',
  placeItems: 'center',
  cursor: 'pointer',
  padding: 0,
};

const directorLayoutStyle: React.CSSProperties = {
  minHeight: 0,
  display: 'grid',
  gridTemplateColumns: '260px minmax(320px, 1fr) 280px',
  gridTemplateRows: 'minmax(0, 1fr) 112px',
  gap: 10,
  padding: 10,
};

const storyboardLayoutStyle: React.CSSProperties = {
  minHeight: 0,
  display: 'grid',
  gridTemplateColumns: 'minmax(420px, 1fr) 320px',
  gap: 10,
  padding: 10,
};

const videoLayoutStyle: React.CSSProperties = {
  minHeight: 0,
  display: 'grid',
  gridTemplateColumns: '240px minmax(320px, 1fr) 280px',
  gridTemplateRows: 'minmax(0, 1fr) 126px',
  gap: 10,
  padding: 10,
};

const panelStyle: React.CSSProperties = {
  minHeight: 0,
  border: '1px solid rgba(255,255,255,0.09)',
  borderRadius: 8,
  background: '#14171d',
  padding: 12,
  overflow: 'hidden',
};

const viewportWrapStyle: React.CSSProperties = {
  minHeight: 0,
  border: '1px solid rgba(255,255,255,0.09)',
  borderRadius: 8,
  background: '#0e1117',
  overflow: 'hidden',
  display: 'grid',
  gridTemplateRows: '42px 1fr',
};

const viewportHeaderStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '0 12px',
  borderBottom: '1px solid rgba(255,255,255,0.08)',
};

const directorViewportStyle: React.CSSProperties = {
  position: 'relative',
  minHeight: 0,
  backgroundColor: '#0b1020',
  backgroundImage:
    'linear-gradient(rgba(148,163,184,0.14) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,0.14) 1px, transparent 1px)',
  backgroundSize: '32px 32px',
};

const bottomRailStyle: React.CSSProperties = {
  gridColumn: '1 / -1',
  border: '1px solid rgba(255,255,255,0.09)',
  borderRadius: 8,
  background: '#14171d',
  padding: 12,
  overflow: 'hidden',
};

const panelTitleStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 7,
  color: '#e5e7eb',
  fontSize: 12,
  fontWeight: 800,
  marginBottom: 10,
};

const listStyle: React.CSSProperties = {
  display: 'grid',
  gap: 7,
  marginBottom: 10,
};

const listItemStyle: React.CSSProperties = {
  minHeight: 34,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 8,
  borderRadius: 8,
  background: 'rgba(255,255,255,0.055)',
  padding: '0 9px',
  fontSize: 12,
  color: '#f8fafc',
};

const listItemButtonStyle = (selected: boolean): React.CSSProperties => ({
  ...listItemStyle,
  width: '100%',
  border: selected ? '1px solid rgba(56,189,248,0.62)' : '1px solid transparent',
  background: selected ? 'rgba(56,189,248,0.14)' : listItemStyle.background,
  cursor: 'pointer',
  textAlign: 'left',
});

const metricRowStyle: React.CSSProperties = {
  minHeight: 32,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 10,
  borderBottom: '1px solid rgba(255,255,255,0.07)',
  fontSize: 12,
  color: '#cbd5e1',
};

const assetCandidateWrapStyle: React.CSSProperties = {
  display: 'grid',
  gap: 7,
  marginTop: 10,
  color: '#cbd5e1',
  fontSize: 12,
  fontWeight: 800,
};

const assetCandidateListStyle: React.CSSProperties = {
  display: 'grid',
  gap: 6,
};

const assetCandidateButtonStyle = (selected: boolean): React.CSSProperties => ({
  minHeight: 38,
  width: '100%',
  display: 'grid',
  gap: 3,
  border: selected ? '1px solid rgba(45,212,191,0.7)' : '1px solid rgba(255,255,255,0.1)',
  borderRadius: 8,
  background: selected ? 'rgba(20,184,166,0.16)' : '#0f172a',
  color: '#f8fafc',
  cursor: selected ? 'default' : 'pointer',
  padding: '6px 8px',
  textAlign: 'left',
});

const emptyLineStyle: React.CSSProperties = {
  color: '#94a3b8',
  fontSize: 12,
  padding: '8px 0',
};

const inspectorFormStyle: React.CSSProperties = {
  display: 'grid',
  gap: 10,
  marginTop: 12,
};

const checkboxFieldStyle: React.CSSProperties = {
  minHeight: 30,
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  color: '#cbd5e1',
  fontSize: 12,
  fontWeight: 800,
};

const directorActionGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gap: 8,
};

const storyboardActionGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gap: 8,
  marginTop: 10,
};

const videoActionStackStyle: React.CSSProperties = {
  display: 'grid',
  gap: 8,
  marginTop: 10,
};

const toolButtonStyle: React.CSSProperties = {
  height: 32,
  width: '100%',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 6,
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 8,
  background: '#1f2937',
  color: '#f8fafc',
  fontSize: 12,
  fontWeight: 800,
};

const railHeaderStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 10,
};

const railActionsStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
};

const railButtonStyle: React.CSSProperties = {
  height: 30,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 6,
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 8,
  background: '#1f2937',
  color: '#f8fafc',
  padding: '0 10px',
  fontSize: 12,
  fontWeight: 800,
  cursor: 'pointer',
};

const railIconButtonStyle = (enabled: boolean): React.CSSProperties => ({
  ...railButtonStyle,
  width: 30,
  padding: 0,
  opacity: enabled ? 1 : 0.45,
  cursor: enabled ? 'pointer' : 'not-allowed',
});

const pillStyle: React.CSSProperties = {
  height: 24,
  display: 'inline-flex',
  alignItems: 'center',
  borderRadius: 8,
  background: 'rgba(56,189,248,0.13)',
  color: '#7dd3fc',
  padding: '0 8px',
  fontSize: 11,
  fontWeight: 800,
};

const shotStripStyle: React.CSSProperties = {
  display: 'flex',
  gap: 8,
  overflow: 'hidden',
};

const shotItemStyle: React.CSSProperties = {
  width: 132,
  height: 52,
  borderRadius: 8,
  background: '#1e293b',
  border: '1px solid rgba(56,189,248,0.22)',
  display: 'grid',
  alignContent: 'center',
  gap: 4,
  padding: '0 10px',
  fontSize: 11,
};

const shotButtonStyle = (selected: boolean): React.CSSProperties => ({
  ...shotItemStyle,
  color: '#f8fafc',
  cursor: 'pointer',
  textAlign: 'left',
  border: selected ? '1px solid rgba(56,189,248,0.7)' : shotItemStyle.border,
  background: selected ? '#0f3b57' : shotItemStyle.background,
});

const storyGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
  gap: 10,
};

const storyCellStyle: React.CSSProperties = {
  minHeight: 112,
  borderRadius: 8,
  border: '1px solid rgba(255,255,255,0.11)',
  background: '#0f172a',
  color: '#f8fafc',
  cursor: 'pointer',
  display: 'grid',
  alignContent: 'space-between',
  gap: 8,
  padding: 10,
  fontSize: 12,
  textAlign: 'left',
};

const fieldLabelStyle: React.CSSProperties = {
  display: 'grid',
  gap: 6,
  color: '#cbd5e1',
  fontSize: 12,
  fontWeight: 800,
  marginTop: 12,
};

const vectorGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
  gap: 6,
};

const axisFieldStyle: React.CSSProperties = {
  display: 'grid',
  gap: 4,
  color: '#94a3b8',
  fontSize: 10,
  fontWeight: 800,
};

const axisInputStyle: React.CSSProperties = {
  height: 30,
  minWidth: 0,
  borderRadius: 8,
  border: '1px solid rgba(255,255,255,0.1)',
  background: '#0f172a',
  color: '#f8fafc',
  padding: '0 6px',
  fontSize: 11,
  outline: 'none',
};

const textInputStyle: React.CSSProperties = {
  height: 34,
  borderRadius: 8,
  border: '1px solid rgba(255,255,255,0.1)',
  background: '#0f172a',
  color: '#f8fafc',
  padding: '0 10px',
  fontSize: 12,
  outline: 'none',
};

const motionButtonGroupStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
  gap: 6,
};

const motionButtonStyle = (selected: boolean): React.CSSProperties => ({
  height: 30,
  border: selected ? '1px solid rgba(56,189,248,0.72)' : '1px solid rgba(255,255,255,0.1)',
  borderRadius: 8,
  background: selected ? 'rgba(56,189,248,0.18)' : '#0f172a',
  color: selected ? '#e0f2fe' : '#cbd5e1',
  cursor: 'pointer',
  fontSize: 11,
  fontWeight: 800,
  padding: '0 6px',
});

const textareaStyle: React.CSSProperties = {
  minHeight: 118,
  resize: 'vertical',
  borderRadius: 8,
  border: '1px solid rgba(255,255,255,0.1)',
  background: '#0f172a',
  color: '#f8fafc',
  padding: 10,
  fontSize: 12,
  lineHeight: 1.5,
  outline: 'none',
};

const previewPanelStyle: React.CSSProperties = {
  minHeight: 0,
  border: '1px solid rgba(255,255,255,0.09)',
  borderRadius: 8,
  background: '#0e1117',
  padding: 12,
  display: 'grid',
  gridTemplateRows: 'auto 1fr',
};

const videoPreviewStyle: React.CSSProperties = {
  minHeight: 0,
  borderRadius: 8,
  background: '#020617',
  border: '1px solid rgba(255,255,255,0.08)',
  display: 'grid',
  placeItems: 'center',
  color: '#60a5fa',
};

const timelineStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  overflow: 'hidden',
};

const clipItemStyle: React.CSSProperties = {
  minWidth: 156,
  height: 52,
  borderRadius: 8,
  background: '#1d4ed8',
  border: '1px solid rgba(147,197,253,0.24)',
  color: '#f8fafc',
  display: 'grid',
  alignContent: 'center',
  gap: 4,
  padding: '0 10px',
  fontSize: 11,
  textAlign: 'left',
};

const clipButtonStyle = (selected: boolean): React.CSSProperties => ({
  ...clipItemStyle,
  cursor: 'pointer',
  border: selected ? '1px solid rgba(191,219,254,0.85)' : clipItemStyle.border,
  background: selected ? '#1e40af' : clipItemStyle.background,
});

const audioButtonStyle = (selected: boolean): React.CSSProperties => ({
  ...clipItemStyle,
  minWidth: 132,
  background: selected ? '#0f766e' : '#115e59',
  border: selected ? '1px solid rgba(94,234,212,0.75)' : '1px solid rgba(45,212,191,0.24)',
  cursor: 'pointer',
});

const subtitleItemStyle: React.CSSProperties = {
  minWidth: 132,
  height: 52,
  borderRadius: 8,
  background: '#7c2d12',
  border: '1px solid rgba(251,146,60,0.24)',
  display: 'grid',
  alignContent: 'center',
  gap: 4,
  padding: '0 10px',
  fontSize: 11,
};

const subtitleButtonStyle = (selected: boolean): React.CSSProperties => ({
  ...subtitleItemStyle,
  color: '#f8fafc',
  cursor: 'pointer',
  textAlign: 'left',
  border: selected ? '1px solid rgba(251,191,36,0.75)' : subtitleItemStyle.border,
  background: selected ? '#9a3412' : subtitleItemStyle.background,
});
