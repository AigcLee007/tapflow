import React, { useEffect, useState } from 'react';
import { Box, Camera, Film, Grid3X3, Layers3, Play, Plus, X } from 'lucide-react';
import type { Node } from '@xyflow/react';

import type { FlowDirector3dData, FlowNodeData, FlowVideoEditorData } from '../types';
import { normalizeStoryboardData, patchStoryboardCell } from '../utils/storyboardNodeData';
import type { ProductionStudioKind } from './productionStudioEvents';

type FlowNode = Node<FlowNodeData>;
type DirectorSelection =
  | { type: 'actor'; id: string }
  | { type: 'camera'; id: string }
  | { type: 'shot'; id: string };
type DirectorActor = FlowDirector3dData['actors'][number];
type DirectorCamera = FlowDirector3dData['cameras'][number];
type DirectorShot = FlowDirector3dData['shots'][number];

interface ProductionStudioShellProps {
  node: FlowNode;
  onClose: () => void;
  onUpdateNodeData?: (nodeId: string, patch: Partial<FlowNodeData>) => void;
  studio: ProductionStudioKind;
}

const studioTitleByKind: Record<ProductionStudioKind, string> = {
  storyboard: '故事板',
  director3d: '3D导演台',
  video_editor: '剪辑工程',
};

export const ProductionStudioShell: React.FC<ProductionStudioShellProps> = ({ node, onClose, onUpdateNodeData, studio }) => {
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
            onUpdateNodeData={onUpdateNodeData}
          />
        ) : studio === 'storyboard' ? (
          <StoryboardContent
            data={node.data.storyboard}
            nodeId={node.id}
            onUpdateNodeData={onUpdateNodeData}
          />
        ) : (
          <VideoEditorContent
            data={node.data.videoEditor}
            nodeId={node.id}
            onUpdateNodeData={onUpdateNodeData}
          />
        )}
      </section>
    </div>
  );
};

function normalizeDirector3dData(data?: FlowDirector3dData): FlowDirector3dData {
  return {
    version: 1,
    scene: {
      ...(data?.scene.backgroundAssetId ? { backgroundAssetId: data.scene.backgroundAssetId } : {}),
      gridVisible: data?.scene.gridVisible !== false,
      units: 'meters',
    },
    actors: Array.isArray(data?.actors) ? data.actors : [],
    cameras: Array.isArray(data?.cameras) ? data.cameras : [],
    shots: Array.isArray(data?.shots) ? data.shots : [],
  };
}

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

function buildDirectorShot(
  index: number,
  cameraId: string,
  previousShots: FlowDirector3dData['shots'],
): FlowDirector3dData['shots'][number] {
  const number = index + 1;
  const startMs = previousShots.reduce((sum, shot) => sum + Math.max(0, Number(shot.durationMs) || 0), 0);
  return {
    id: `shot-${number}`,
    cameraId,
    startMs,
    durationMs: 3000,
    motion: 'static',
  };
}

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

function getClipDurationMs(clip: FlowVideoEditorData['timeline']['clips'][number]) {
  const rawDuration = Number(clip.outMs) - Number(clip.inMs);
  return Math.max(0, Number.isFinite(rawDuration) ? rawDuration : 0);
}

function getTimelineEndMs(clips: FlowVideoEditorData['timeline']['clips']) {
  return clips.reduce(
    (endMs, clip) => Math.max(endMs, Math.max(0, Number(clip.startMs) || 0) + getClipDurationMs(clip)),
    0,
  );
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
    startMs: getTimelineEndMs(clips),
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

function DirectorDeskContent({
  data,
  nodeId,
  onUpdateNodeData,
}: {
  data?: FlowDirector3dData;
  nodeId: string;
  onUpdateNodeData?: (nodeId: string, patch: Partial<FlowNodeData>) => void;
}) {
  const director = normalizeDirector3dData(data);
  const actors = director.actors;
  const cameras = director.cameras;
  const shots = director.shots;
  const [selected, setSelected] = useState<DirectorSelection | null>(null);
  const updateDirector = (nextDirector: FlowDirector3dData) => {
    onUpdateNodeData?.(nodeId, { director3d: nextDirector });
  };
  const addActor = () => updateDirector({ ...director, actors: [...actors, buildDirectorActor(actors.length)] });
  const addCamera = () => updateDirector({ ...director, cameras: [...cameras, buildDirectorCamera(cameras.length)] });
  const captureShot = () => {
    const fallbackCamera = cameras[0] ? null : buildDirectorCamera(0);
    const nextCameras = fallbackCamera ? [fallbackCamera] : cameras;
    const cameraId = nextCameras[0]?.id || 'camera-1';
    updateDirector({
      ...director,
      cameras: nextCameras,
      shots: [...shots, buildDirectorShot(shots.length, cameraId, shots)],
    });
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
      shots: shots.map((shot) => (shot.id === shotId ? { ...shot, ...patch } : shot)),
    });
  };
  const selectedActor = selected?.type === 'actor' ? actors.find((actor) => actor.id === selected.id) ?? null : null;
  const selectedCamera = selected?.type === 'camera' ? cameras.find((camera) => camera.id === selected.id) ?? null : null;
  const selectedShot = selected?.type === 'shot' ? shots.find((shot) => shot.id === selected.id) ?? null : null;

  return (
    <div style={directorLayoutStyle}>
      <aside style={panelStyle}>
        <PanelTitle icon={<Layers3 size={15} />} title="场景对象" />
        <div style={listStyle}>
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
          <div style={axisHelperStyle}>XYZ</div>
          <div style={actorMarkerStyle} />
          <div style={cameraMarkerStyle} />
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
          camera={selectedCamera}
          onPatchActor={patchActor}
          onPatchCamera={patchCamera}
          onPatchShot={patchShot}
          shot={selectedShot}
        />
      </aside>

      <div style={bottomRailStyle}>
        <div style={railHeaderStyle}>
          <PanelTitle icon={<Play size={15} />} title="镜头轨道" />
          <button type="button" aria-label="捕获镜头段" style={railButtonStyle} onClick={captureShot}>
            <Camera size={14} />
            捕获镜头段
          </button>
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
  onUpdateNodeData,
}: {
  data?: FlowNodeData['storyboard'];
  nodeId: string;
  onUpdateNodeData?: (nodeId: string, patch: Partial<FlowNodeData>) => void;
}) {
  const storyboard = normalizeStoryboardData(data);
  const selectedCell = storyboard.cells[storyboard.selectedIndex] ?? storyboard.cells[0];
  const updateStoryboard = (nextStoryboard: typeof storyboard) => {
    onUpdateNodeData?.(nodeId, { storyboard: nextStoryboard });
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
      </aside>
    </div>
  );
}

function VideoEditorContent({
  data,
  nodeId,
  onUpdateNodeData,
}: {
  data?: FlowVideoEditorData;
  nodeId: string;
  onUpdateNodeData?: (nodeId: string, patch: Partial<FlowNodeData>) => void;
}) {
  const videoEditor = normalizeVideoEditorData(data);
  const timeline = videoEditor.timeline;
  const clips = timeline.clips;
  const audio = timeline.audio;
  const subtitles = timeline.subtitles;
  const updateVideoEditor = (nextVideoEditor: FlowVideoEditorData) => {
    onUpdateNodeData?.(nodeId, { videoEditor: nextVideoEditor });
  };
  const updateTimeline = (nextTimeline: FlowVideoEditorData['timeline']) => {
    updateVideoEditor({ ...videoEditor, timeline: nextTimeline });
  };
  const addClip = (kind: 'image' | 'video') => {
    const nextClip = buildVideoClip(kind, clips);
    updateTimeline({
      ...timeline,
      clips: [...clips, nextClip],
      durationMs: Math.max(timeline.durationMs, nextClip.startMs + getClipDurationMs(nextClip)),
    });
  };
  const addSubtitle = () => {
    const nextSubtitle = buildVideoSubtitle(subtitles);
    updateTimeline({
      ...timeline,
      durationMs: Math.max(timeline.durationMs, nextSubtitle.endMs),
      subtitles: [...subtitles, nextSubtitle],
    });
  };
  const setDurationSeconds = (value: string) => {
    const seconds = Math.max(0, Number(value) || 0);
    updateTimeline({ ...timeline, durationMs: Math.round(seconds * 1000) });
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
          <button type="button" aria-label="添加字幕" style={toolButtonStyle} onClick={addSubtitle}>
            <Plus size={14} />
            添加字幕
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
              <div key={clip.id} style={clipItemStyle}>
                <strong>{clip.id}</strong>
                <span>{clip.kind}</span>
              </div>
            ))
          ) : (
            <EmptyLine label="暂无剪辑片段" />
          )}
          {subtitles.map((subtitle) => (
            <div key={subtitle.id} style={subtitleItemStyle}>
              <strong>{subtitle.text}</strong>
              <span>{Math.round((subtitle.endMs - subtitle.startMs) / 100) / 10}s</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function DirectorInspector({
  actor,
  camera,
  onPatchActor,
  onPatchCamera,
  onPatchShot,
  shot,
}: {
  actor: DirectorActor | null;
  camera: DirectorCamera | null;
  onPatchActor: (actorId: string, patch: Partial<DirectorActor>) => void;
  onPatchCamera: (cameraId: string, patch: Partial<DirectorCamera>) => void;
  onPatchShot: (shotId: string, patch: Partial<DirectorShot>) => void;
  shot: DirectorShot | null;
}) {
  if (actor) {
    return (
      <div style={inspectorFormStyle}>
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
      </div>
    );
  }

  if (camera) {
    return (
      <div style={inspectorFormStyle}>
        <MetricRow label="当前镜头" value={camera.name} />
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

const axisHelperStyle: React.CSSProperties = {
  position: 'absolute',
  right: 14,
  bottom: 12,
  color: '#f59e0b',
  fontSize: 11,
  fontWeight: 800,
};

const actorMarkerStyle: React.CSSProperties = {
  position: 'absolute',
  left: '45%',
  top: '38%',
  width: 30,
  height: 54,
  borderRadius: 8,
  border: '2px solid #22c55e',
  background: 'rgba(34,197,94,0.18)',
};

const cameraMarkerStyle: React.CSSProperties = {
  position: 'absolute',
  left: '57%',
  top: '48%',
  width: 42,
  height: 28,
  clipPath: 'polygon(0 25%, 62% 25%, 100% 0, 100% 100%, 62% 75%, 0 75%)',
  background: '#38bdf8',
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
  display: 'grid',
  alignContent: 'center',
  gap: 4,
  padding: '0 10px',
  fontSize: 11,
};

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
