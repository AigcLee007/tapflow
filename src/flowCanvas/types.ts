/**
 * Flow Canvas Type Definitions
 * TapNow-style: content nodes with embedded generation
 */

// ─── Node Kinds ──────────────────────────────────────────────
export type FlowNodeKind =
  | 'text'
  | 'image'
  | 'video'
  | 'audio'
  | 'upload'
  | 'image_editor'
  | 'panorama_viewer'
  | 'storyboard'
  | 'director3d'
  | 'video_editor'
  | 'group';

// ─── Node Status ─────────────────────────────────────────────
export type FlowNodeStatus =
  | 'idle'
  | 'pending'
  | 'queued'
  | 'runnable'
  | 'running'
  | 'waiting_provider'
  | 'success'
  | 'succeeded'
  | 'error'
  | 'failed'
  | 'stale'
  | 'cancelled'
  | 'canceled';

// ─── Generation Status (embedded in content nodes) ───────────
export type FlowGenerationStatus = 'idle' | 'generating' | 'done' | 'error';
export type FlowMultiImageDisplayMode = 'combined' | 'split_nodes';
export type FlowImageGenerationMode =
  | 'standard'
  | 'panorama_360'
  | 'wraparound_270'
  | 'subject_orbit_270';
export type FlowProductionSubjectType = 'scene' | 'subject';
export type FlowProductionLayer =
  | 'evidence'
  | 'constraints'
  | 'anchors'
  | 'expansion'
  | 'execution'
  | 'results';

export interface FlowStoryboardCell {
  id: string;
  shotNo: number;
  title?: string;
  prompt?: string;
  assetId?: string;
  sourceNodeId?: string;
  sourceAssetId?: string;
  directorCameraId?: string;
  directorShotId?: string;
  aspect?: '1:1' | '4:3' | '16:9' | '9:16';
}

export interface FlowStoryboardData {
  aspect: '1:1' | '4:3' | '16:9' | '9:16';
  cells: FlowStoryboardCell[];
  composedAssetId?: string;
  grid: '2x2' | '3x2' | '3x3';
  selectedIndex: number;
}

export interface FlowDirector3dData {
  version: 1;
  storyAiProject?: Record<string, unknown>;
  scene: {
    backgroundAssetId?: string;
    gridVisible: boolean;
    units: 'meters';
  };
  actors: Array<{
    id: string;
    name: string;
    kind: 'placeholder_humanoid' | 'image_plane' | 'asset_model';
    assetId?: string;
    position: [number, number, number];
    rotation: [number, number, number];
    scale: [number, number, number];
    pose?: string;
    poseControls?: Record<string, number>;
    visible: boolean;
    locked: boolean;
  }>;
  cameras: Array<{
    id: string;
    name: string;
    position: [number, number, number];
    target: [number, number, number];
    focalMm?: number;
    fov?: number;
    durationMs?: number;
    prompt?: string;
  }>;
  shots: Array<{
    cameraSnapshot?: {
      name?: string;
      position: [number, number, number];
      target: [number, number, number];
      focalMm?: number;
      fov?: number;
    };
    id: string;
    cameraId: string;
    startMs: number;
    durationMs: number;
    motion?: 'static' | 'dolly' | 'orbit' | 'pan' | 'custom_path';
    prompt?: string;
    generatedAssetId?: string;
    generatedSourceNodeId?: string;
    targetStoryboardCellId?: string;
  }>;
}

export interface FlowProjectStudios {
  director3d?: FlowDirector3dData;
}

export interface FlowVideoEditorData {
  version: 1;
  aspect: '16:9' | '9:16' | '1:1';
  exportedAssetId?: string;
  resolution: '1280x720' | '1920x1080' | '720x1280' | '1080x1920' | '1080x1080';
  timeline: {
    audio: Array<{
      id: string;
      assetId: string;
      track: number;
      startMs: number;
      inMs: number;
      outMs: number;
      volume: number;
    }>;
    clips: Array<{
      id: string;
      assetId: string;
      kind: 'video' | 'image';
      track: number;
      startMs: number;
      inMs: number;
      outMs: number;
      speed: number;
      muted?: boolean;
      volume?: number;
      transitionOut?: { type: string; durationMs: number };
      transform?: { scale: number; x: number; y: number; rotate: number };
      sourceDirectorNodeId?: string;
      directorShotId?: string;
      directorCameraId?: string;
      directorShotMotion?: FlowDirector3dData['shots'][number]['motion'];
      directorPrompt?: string;
      sourceStoryboardNodeId?: string;
      storyboardCellId?: string;
      storyboardShotNo?: number;
      storyboardTitle?: string;
      storyboardPrompt?: string;
    }>;
    durationMs: number;
    subtitles: Array<{
      id: string;
      text: string;
      startMs: number;
      endMs: number;
      style?: Record<string, unknown>;
      sourceDirectorNodeId?: string;
      directorShotId?: string;
      directorCameraId?: string;
      sourceStoryboardNodeId?: string;
      storyboardCellId?: string;
      storyboardShotNo?: number;
    }>;
  };
}

export interface FlowAgentNodeMetadata {
  agentSessionId?: string;
  agentTurnId?: string;
  agentTaskId?: string;
  approvalStatus?: 'candidate' | 'approved' | 'rejected';
  creationStage?: string;
  highlightedAt?: number;
  productionLayer?: FlowProductionLayer;
  sourceEvidenceNodeIds?: string[];
}

export interface FlowWorkbenchNodeMetadata {
  batchId: string;
  createdAt: number;
  source: 'image-workbench';
}

export interface FlowImageResultItem {
  assetId?: string;
  id: string;
  url: string;
  createdAt: number;
}

export interface FlowRuntimeAssetRef {
  assetId: string;
  downloadUrl?: string;
  durationMs?: number | null;
  expiresAt?: string | null;
  height?: number | null;
  kind: string;
  metadata?: Record<string, string>;
  mimeType: string;
  width?: number | null;
}

export interface FlowRuntimeNodeOutput {
  assets?: FlowRuntimeAssetRef[];
  errorMessage?: string | null;
  output?: Record<string, unknown> | null;
  providerTask?: Record<string, unknown> | null;
  text?: string | null;
}

export interface FlowImageReferenceComparisonSource {
  key: string;
  source: 'asset' | 'upstream';
  assetId?: string;
  nodeId?: string;
  label?: string;
}

export interface FlowImageGenerationSnapshot {
  modelId: string;
  routeId?: string;
  prompt: string;
  size?: string;
  aspectRatio?: string;
  quality?: string;
  n?: number;
  generationMode?: FlowImageGenerationMode;
  productionSubjectType?: FlowProductionSubjectType;
  referenceImageCount: number;
  referenceComparison?: FlowImageReferenceComparisonSource | null;
  activeCommandId?: string;
  generatedAt: number;
}

// ─── Edge Data Types ─────────────────────────────────────────
export type FlowEdgeDataType = 'text' | 'image' | 'video' | 'audio' | 'json' | 'any';

// ─── Node Data ───────────────────────────────────────────────
export interface FlowNodeData {
  /** Index signature required by React Flow's Node<Record<string, unknown>> */
  [key: string]: unknown;

  kind: FlowNodeKind;
  title: string;

  // UI
  width: number;
  height: number;
  collapsed?: boolean;
  locked?: boolean;

  // Workflow status
  status: FlowNodeStatus;
  progress?: number;
  errorMessage?: string;

  // Assets
  assetId?: string;
  assetIds?: string[];
  sourceAssetId?: string;
  thumbnailAssetId?: string;
  mimeType?: string;
  durationMs?: number;
  thumbnailUrl?: string;
  posterUrl?: string;
  originalImageUrl?: string;
  editHistory?: string[];
  lastEditType?: string;
  editSourceNodeId?: string;
  editPrompt?: string;
  imageFolderIds?: string[];
  naturalWidth?: number;
  naturalHeight?: number;
  aspectRatio?: number;
  crop?: { x: number; y: number; width: number; height: number };
  grid?: { rows: number; cols: number };
  row?: number;
  col?: number;
  rows?: number;
  cols?: number;
  slice?: boolean;
  metadata?: Record<string, string>;
  fovDeg?: number;
  frontYawDeg?: number;
  panelOpen?: boolean;
  panoramaPitch?: number;
  panoramaSourceNodeId?: string;
  panoramaYaw?: number;
  panoramaZoom?: number;
  sphereCorrectionDeg?: {
    pitch: number;
    roll: number;
    yaw: number;
  };

  // Embedded generation (TapNow-style)
  generationPrompt?: string;
  generationStatus?: FlowGenerationStatus;
  modelId?: string;
  routeKey?: string;
  routeId?: string;
  referenceAssetItemIds?: string[];
  referenceOrder?: string[];
  generationReferenceComparison?: FlowImageReferenceComparisonSource | null;
  generationMode?: FlowImageGenerationMode;
  activeCommandId?: string;
  generatedResults?: FlowImageResultItem[];
  activeResultIndex?: number;
  coverResultId?: string;
  favoriteResultIds?: string[];
  lastGenerationSnapshot?: FlowImageGenerationSnapshot;
  sourcePromptId?: string;
  sourcePromptInsertRequestId?: string;
  sourcePromptSnapshot?: string;
  sourcePromptTitle?: string;
  params?: Record<string, unknown>;
  director3d?: FlowDirector3dData;
  storyboard?: FlowStoryboardData;
  videoEditor?: FlowVideoEditorData;

  // Text content
  text?: string;
  backgroundColor?: string;
  fontSize?: 'h1' | 'h2' | 'h3' | 'body';
  fontWeight?: 'normal' | 'bold';
  fontStyle?: 'normal' | 'italic';
  listType?: 'none' | 'bullet' | 'number';

  // Batch Generation
  batchCount?: number;
  multiImageDisplayMode?: FlowMultiImageDisplayMode;
  latestMultiImageDelivery?: FlowMultiImageDisplayMode;
  agentMetadata?: FlowAgentNodeMetadata;
  workbench?: FlowWorkbenchNodeMetadata;

  // Timestamps
  createdAt: number;
  updatedAt: number;
}

// ─── Edge Data ───────────────────────────────────────────────
export interface FlowEdgeData {
  /** Index signature required by React Flow's Edge<Record<string, unknown>> */
  [key: string]: unknown;

  dataType: FlowEdgeDataType;
  status?: 'idle' | 'running' | 'success' | 'error';
}

// ─── Handle Definitions ─────────────────────────────────────
export interface HandleConfig {
  id: string;
  type: 'source' | 'target';
  position: 'top' | 'bottom' | 'left' | 'right';
  dataType: FlowEdgeDataType;
  label?: string;
}

// ─── Node Config ─────────────────────────────────────────────
export interface NodeKindConfig {
  kind: FlowNodeKind;
  label: string;
  icon: string;
  color: string;
  defaultWidth: number;
  defaultHeight: number;
  inputs: HandleConfig[];
  outputs: HandleConfig[];
}
