import { create } from 'zustand';
import {
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  type Edge,
  type Node,
  type OnConnect,
  type OnEdgesChange,
  type OnNodesChange,
  type Viewport,
} from '@xyflow/react';
import { nanoid } from 'nanoid';
import type { FlowDirector3dData, FlowEdgeData, FlowNodeData, FlowNodeKind, FlowProjectStudios } from '../types';
import { createFlowNode, duplicateFlowNode } from '../utils/nodeFactory';
import { canConnectFlowNodes, canCreateNodeFromSource } from '../rules/connectionRules';
import { buildAssetBackedNodeData } from '../utils/assetNodeData';
import { FLOW_NODE_DEFAULT_SIZES, fitMediaNodeToShortSide, getMediaNodeSizeFromRatioString, parseAspectRatio } from '../utils/nodeSizing';
import { buildImageGenerationModeParamPatch } from '../utils/imageGenerationModes';
import { normalizeVideoGenerationParams } from '../video/videoGenerationParams';
import { normalizeReferenceRolesForMode } from '../video/videoReferenceRules';
import type { VideoReferenceInputV2 } from '../video/videoTypes';
import { PANORAMA_GENERATION_MODE, type PanoramaGenerateSettings } from '../panorama/panoramaTypes';
import { buildPanoramaGenerationPrompt } from '../panorama/panoramaUtils';
import { toUpstreamInputKey, type CanvasInputSeed } from '../inputs/canvasInputProjection';
import type {
  FlowRuntimeNodeOutput,
} from '../types';
import type {
  V2WorkflowRunEventView,
  V2WorkflowRunStatus,
} from '../../services/v2WorkflowRunsApi';
import { buildGroupExecutionPlan, type GroupExecutionPlan } from '../groupExecution/groupExecutionPlan';

type FlowNode = Node<FlowNodeData>;
type FlowEdge = Edge<FlowEdgeData>;

export type ActiveImageToolType =
  | 'crop'
  | 'resize'
  | 'split'
  | 'annotate'
  | 'repaint'
  | 'erase'
  | 'outpaint'
  | 'lighting'
  | 'multiAngle'
  | 'folder';

export interface ActiveImageToolState {
  nodeId: string;
  tool: ActiveImageToolType;
}

interface HistoryEntry {
  nodes: FlowNode[];
  edges: FlowEdge[];
}

export interface FlowUpstreamMediaRef {
  key: string;
  id: string;
  assetId?: string;
  edgeId: string;
  mediaKind: 'image' | 'video' | 'audio';
  hoverPreviewUrl?: string;
  previewUrl?: string;
  thumbnailUrl?: string;
  title: string;
  source: 'upstream';
}

export interface FlowUpstreamImageRef extends FlowUpstreamMediaRef {
  mediaKind: 'image';
  imageUrl: string;
  referenceUploadId?: string;
}

export interface FlowDerivedEditCounts {
  crop: number;
  resize: number;
  split: number;
  annotate: number;
}

export interface FlowGraphIndex {
  upstreamInputRefsByNodeId: Record<string, CanvasInputSeed[]>;
  upstreamMediaRefsByNodeId: Record<string, FlowUpstreamMediaRef[]>;
  upstreamImageRefsByNodeId: Record<string, FlowUpstreamImageRef[]>;
  hasIncomingEdgesByNodeId: Record<string, boolean>;
  childEditCountsByNodeId: Record<string, FlowDerivedEditCounts>;
}

interface FlowProject {
  backendCurrentVersionId?: string | null;
  backendFlowId?: string | null;
  backendProjectId?: string | null;
  id: string;
  title: string;
  nodes: FlowNode[];
  edges: FlowEdge[];
  projectStudios?: FlowProjectStudios;
  viewport: Viewport;
  version: number;
  updatedAt: number;
}

interface FlowCanvasState {
  backendCurrentVersionId: string | null;
  backendFlowId: string | null;
  backendProjectId: string | null;
  projectId: string;
  projectTitle: string;
  version: number;
  isDirty: boolean;

  nodes: FlowNode[];
  edges: FlowEdge[];
  projectStudios: FlowProjectStudios;
  graphIndex: FlowGraphIndex;
  selectedNodeCount: number;
  viewport: Viewport;

  history: HistoryEntry[];
  historyIndex: number;

  leftPanelOpen: boolean;
  contextMenu: { x: number; y: number; nodeId?: string } | null;
  activeImageTool: ActiveImageToolState | null;
  isNodeDragging: boolean;
  currentRunId: string | null;
  isRunningBackendWorkflow: boolean;
  nodeOutputByNodeId: Record<string, FlowRuntimeNodeOutput>;
  nodeRunIdByNodeId: Record<string, string>;
  nodeRunStatusByNodeId: Record<string, V2WorkflowRunStatus>;
  workflowRunIdByNodeId: Record<string, string>;
  nodeIdByNodeRunId: Record<string, string>;
  runError: string | null;
  runEvents: V2WorkflowRunEventView[];
  runStatus: V2WorkflowRunStatus | null;
  latestGroupExecutionPlan: GroupExecutionPlan | null;

  onNodesChange: OnNodesChange<FlowNode>;
  onEdgesChange: OnEdgesChange<FlowEdge>;
  onConnect: OnConnect;
  connectVideoReference: (input: {
    mediaKind: VideoReferenceInputV2['mediaKind'];
    referenceKey: string;
    role: VideoReferenceInputV2['role'];
    sourceNodeId: string;
    targetNodeId: string;
  }) => void;

  addNode: (
    kind: FlowNodeKind,
    position: { x: number; y: number },
    overrides?: Partial<FlowNodeData>,
    options?: { selected?: boolean; preserveSelection?: boolean },
  ) => FlowNode;
  addNodeAndEdge: (
    kind: FlowNodeKind,
    position: { x: number; y: number },
    sourceNodeId: string,
    sourceHandle?: string,
    targetHandle?: string,
    overrides?: Partial<FlowNodeData>,
  ) => FlowNode;
  addGeneratedImageChildren: (
    parentNodeId: string,
    items: Array<{
      assetId: string;
      downloadUrl: string;
      height?: number | null;
      mimeType: string;
      title: string;
      width?: number | null;
    }>,
  ) => string[];
  createPanoramaTargetNodeFromSource: (sourceNodeId: string, settings: PanoramaGenerateSettings) => FlowNode;
  ensurePanoramaViewerForImageNode: (sourceNodeId: string) => string | null;
  getUpstreamNodes: (nodeId: string) => FlowNode[];
  groupNodesAsPanoramaCaptureSet: (
    nodeIds: string[],
    groupTitle: string,
  ) => { groupId: string | null };
  groupSelectedNodes: () => void;
  ungroupSelectedGroups: () => void;
  layoutSelectedGroup: (layout: 'grid' | 'horizontal') => void;
  getSelectedGroup: () => FlowNode | null;
  getSelectedGroupGraph: () => { groupId: string; nodes: FlowNode[]; edges: FlowEdge[] } | null;
  buildSelectedGroupExecutionPlan: () => GroupExecutionPlan | null;
  deleteSelectedNodes: () => void;
  duplicateSelectedNodes: () => void;
  mergeTemplateGraph: (graph: { nodes: FlowNode[]; edges: FlowEdge[] }) => void;
  restoreGraphSnapshot: (graph: { nodes: FlowNode[]; edges: FlowEdge[]; viewport?: Viewport }) => void;
  setNodeRuntimeOutputs: (outputs: Record<string, FlowRuntimeNodeOutput | null | undefined>) => void;
  setNodeRuntimeOutput: (nodeId: string, output: FlowRuntimeNodeOutput | null) => void;
  updateNodeData: (nodeId: string, patch: Partial<FlowNodeData>) => void;
  updateProjectDirector3d: (director3d: FlowDirector3dData) => void;
  replaceNode: (nodeId: string, input: { data?: Partial<FlowNodeData>; type?: FlowNodeKind }) => void;
  commitNodePositions: (nodes: FlowNode[]) => void;
  lockNode: (nodeId: string, locked: boolean) => void;
  connectNodes: (source: string, target: string, sourceHandle?: string, targetHandle?: string) => void;
  removeNodesByIds: (nodeIds: string[]) => void;
  removeEdgesByIds: (edgeIds: string[]) => void;
  removeNodeInput: (targetNodeId: string, inputKey: string) => void;
  removeTextNodeInputs: (targetNodeId: string) => void;
  reorderNodeInputs: (targetNodeId: string, inputKeys: string[]) => void;
  selectNodesByIds: (nodeIds: string[]) => void;

  deleteSelectedEdges: () => void;

  selectAll: () => void;
  deselectAll: () => void;

  pushHistory: () => void;
  undo: () => void;
  redo: () => void;

  setProjectTitle: (title: string) => void;
  setBackendFlowBinding: (input: {
    backendCurrentVersionId?: string | null;
    backendFlowId?: string | null;
    backendProjectId?: string | null;
  }) => void;
  loadProject: (project: FlowProject) => void;
  getProjectSnapshot: () => FlowProject;
  newProject: () => void;
  markDirty: () => void;
  markClean: () => void;
  setViewport: (viewport: Viewport) => void;
  setNodeDragging: (dragging: boolean) => void;

  toggleLeftPanel: () => void;
  setLeftPanelOpen: (open: boolean) => void;
  openContextMenu: (x: number, y: number, nodeId?: string) => void;
  closeContextMenu: () => void;
  openImageTool: (nodeId: string, tool: ActiveImageToolType) => void;
  closeImageTool: () => void;
  resetBackendRunState: () => void;
}

const MAX_HISTORY = 50;
const INITIAL_VIEWPORT: Viewport = { x: 0, y: 0, zoom: 1 };

const isTextNode = (node: FlowNode) => node.type === 'text' || node.data?.kind === 'text';

const cloneHistoryEntry = (nodes: FlowNode[], edges: FlowEdge[]): HistoryEntry => ({
  nodes: structuredClone(nodes),
  edges: structuredClone(edges),
});

const resetStaleTextGenerationNodes = (nodes: FlowNode[]) =>
  nodes.map((node) => {
    const isTextNode = node.type === 'text' || node.data?.kind === 'text';
    const isRunning = node.data?.generationStatus === 'generating' || node.data?.status === 'running';
    if (!isTextNode || !isRunning) return node;
    return {
      ...node,
      data: {
        ...node.data,
        generationStatus: 'error',
        status: 'error',
        errorMessage: '上次文本生成已中断，请重新生成',
      },
    };
  });

const EMPTY_GRAPH_INDEX: FlowGraphIndex = {
  upstreamInputRefsByNodeId: {},
  upstreamMediaRefsByNodeId: {},
  upstreamImageRefsByNodeId: {},
  hasIncomingEdgesByNodeId: {},
  childEditCountsByNodeId: {},
};

const countSelectedNodes = (nodes: FlowNode[]) => nodes.reduce((count, node) => count + (node.selected ? 1 : 0), 0);

const createEditCounts = (): FlowDerivedEditCounts => ({
  crop: 0,
  resize: 0,
  split: 0,
  annotate: 0,
});

const isImageNode = (node: FlowNode | undefined | null) =>
  !!node && (node.type === 'image' || node.data.kind === 'image');

const isVideoNode = (node: FlowNode | undefined | null) =>
  !!node && (node.type === 'video' || node.data.kind === 'video');

const getNodeReferenceMediaKind = (
  node: FlowNode | undefined,
  runtimeNodeOutput?: FlowRuntimeNodeOutput,
): FlowUpstreamMediaRef['mediaKind'] | null => {
  const nodeKind = String(node?.data.kind || node?.type || '').trim().toLowerCase();
  if (nodeKind === 'image' || nodeKind === 'video' || nodeKind === 'audio') return nodeKind;
  const runtimeAssetKind = Array.isArray(runtimeNodeOutput?.assets)
    ? runtimeNodeOutput.assets.map((asset) => String(asset.kind || '').toLowerCase()).find((kind) => kind === 'image' || kind === 'video' || kind === 'audio')
    : '';
  if (runtimeAssetKind === 'image' || runtimeAssetKind === 'video' || runtimeAssetKind === 'audio') return runtimeAssetKind;
  const mimeType = String(node?.data.mimeType || '').trim().toLowerCase();
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType.startsWith('audio/')) return 'audio';
  return null;
};

const getNodeReferenceInputKind = (
  node: FlowNode | undefined,
  runtimeNodeOutput?: FlowRuntimeNodeOutput,
): CanvasInputSeed['kind'] | null => {
  if (!node) return null;
  if (String(node.data.kind || '').trim().toLowerCase() === 'text' || node.type === 'text') return 'text';
  return getNodeReferenceMediaKind(node, runtimeNodeOutput);
};

const getNodeTextExcerpt = (node: FlowNode, runtimeNodeOutput?: FlowRuntimeNodeOutput) => {
  const text = [runtimeNodeOutput?.text, node.data.text, node.data.generationPrompt]
    .map((candidate) => String(candidate || '').trim())
    .find(Boolean) || '';
  return text.length > 77 ? `${text.slice(0, 77)}...` : text;
};

const getNodeReferenceImageUrl = (
  node: FlowNode | undefined,
  runtimeNodeOutput?: FlowRuntimeNodeOutput,
) => {
  if (!node || !isImageNode(node)) return '';

  const thumbnailUrl = String(node.data.thumbnailUrl || '').trim();
  if (thumbnailUrl) return thumbnailUrl;

  const originalImageUrl = String(node.data.originalImageUrl || '').trim();
  if (originalImageUrl) return originalImageUrl;

  const generatedResults = Array.isArray(node.data.generatedResults)
    ? (node.data.generatedResults as Array<{ id?: string; url?: string }>)
    : [];
  const coverResultId = String(node.data.coverResultId || '');
  const activeResultIndex = Number(node.data.activeResultIndex || 0);
  const coverResult = generatedResults.find((item) => String(item?.id || '') === coverResultId);
  const activeResult = generatedResults[activeResultIndex];
  const generatedUrl = String(coverResult?.url || activeResult?.url || generatedResults[0]?.url || '').trim();
  if (generatedUrl) return generatedUrl;

  const runtimeAssetUrl = Array.isArray(runtimeNodeOutput?.assets)
    ? runtimeNodeOutput.assets.find((asset) => asset.kind === 'image' && asset.downloadUrl)?.downloadUrl || ''
    : '';
  return String(runtimeAssetUrl || '').trim();
};

const getNodeReferenceThumbnailUrl = (
  node: FlowNode | undefined,
  runtimeNodeOutput: FlowRuntimeNodeOutput | undefined,
  mediaKind: FlowUpstreamMediaRef['mediaKind'],
) => {
  if (!node) return '';
  if (mediaKind === 'image') return getNodeReferenceImageUrl(node, runtimeNodeOutput);
  const candidates = mediaKind === 'video'
    ? [node.data.posterUrl, node.data.thumbnailUrl]
    : [node.data.previewUrl, node.data.thumbnailUrl, node.data.audioUrl, node.data.originalAudioUrl];
  const nodeUrl = candidates.map((candidate) => String(candidate || '').trim()).find(Boolean);
  if (nodeUrl) return nodeUrl;
  if (mediaKind === 'video') return '';
  const runtimeAssetUrl = Array.isArray(runtimeNodeOutput?.assets)
    ? runtimeNodeOutput.assets.find((asset) => asset.kind === mediaKind && asset.downloadUrl)?.downloadUrl || ''
    : '';
  return String(runtimeAssetUrl || '').trim();
};

const getNodeReferenceHoverPreviewUrl = (
  node: FlowNode | undefined,
  runtimeNodeOutput: FlowRuntimeNodeOutput | undefined,
  mediaKind: FlowUpstreamMediaRef['mediaKind'],
) => {
  if (!node) return '';
  if (mediaKind === 'image') return getNodeReferenceImageUrl(node, runtimeNodeOutput);
  const candidates = mediaKind === 'video'
    ? [node.data.previewUrl, node.data.videoUrl, node.data.originalVideoUrl]
    : [node.data.previewUrl, node.data.audioUrl, node.data.originalAudioUrl];
  const nodeUrl = candidates.map((candidate) => String(candidate || '').trim()).find(Boolean);
  if (nodeUrl) return nodeUrl;
  const runtimeAssetUrl = Array.isArray(runtimeNodeOutput?.assets)
    ? runtimeNodeOutput.assets.find((asset) => asset.kind === mediaKind && asset.downloadUrl)?.downloadUrl || ''
    : '';
  return String(runtimeAssetUrl || '').trim();
};

const getNodeReferenceAssetId = (
  node: FlowNode | undefined,
  runtimeNodeOutput?: FlowRuntimeNodeOutput,
  mediaKind?: FlowUpstreamMediaRef['mediaKind'],
) => {
  if (!node) return '';
  const nodeAssetId = String(node.data.assetId || '').trim();
  if (nodeAssetId) return nodeAssetId;
  const nodeAssetIds = Array.isArray(node.data.assetIds)
    ? (node.data.assetIds as unknown[]).map((item) => String(item || '').trim()).filter(Boolean)
    : [];
  if (nodeAssetIds[0]) return nodeAssetIds[0];
  const runtimeAssetId = Array.isArray(runtimeNodeOutput?.assets)
    ? runtimeNodeOutput.assets.find((asset) => asset.kind === (mediaKind || 'image') && asset.assetId)?.assetId || ''
    : '';
  return String(runtimeAssetId || '').trim();
};

const getNodeRuntimeInputIdentity = (
  node: FlowNode | undefined,
  runtimeNodeOutput?: FlowRuntimeNodeOutput,
) => {
  const mediaKind = getNodeReferenceMediaKind(node, runtimeNodeOutput);
  if (!mediaKind) return '';
  return `${mediaKind}:${getNodeReferenceAssetId(node, runtimeNodeOutput, mediaKind)}`;
};

const getRuntimeReconciliationTargetIds = (
  nodes: FlowNode[],
  edges: FlowEdge[],
  previousOutputs: Record<string, FlowRuntimeNodeOutput>,
  nextOutputs: Record<string, FlowRuntimeNodeOutput>,
  changedSourceIds: Set<string>,
) => {
  const nodesById = new Map(nodes.map((node) => [node.id, node]));
  const structuralSourceIds = new Set<string>();
  changedSourceIds.forEach((sourceId) => {
    const node = nodesById.get(sourceId);
    if (getNodeRuntimeInputIdentity(node, previousOutputs[sourceId]) !== getNodeRuntimeInputIdentity(node, nextOutputs[sourceId])) {
      structuralSourceIds.add(sourceId);
    }
  });
  if (structuralSourceIds.size === 0) return new Set<string>();
  const targetIds = new Set<string>();
  edges.forEach((edge) => {
    if (!structuralSourceIds.has(edge.source)) return;
    const target = nodesById.get(edge.target);
    if (isImageNode(target) || isVideoNode(target)) targetIds.add(edge.target);
  });
  return targetIds;
};

const appendReferenceOrderKey = (referenceOrder: unknown, key: string) => {
  const current = Array.isArray(referenceOrder)
    ? referenceOrder.map((item) => String(item || '')).filter(Boolean)
    : [];
  return current.includes(key) ? current : [...current, key];
};

const getUniqueInputKeys = (value: unknown) => {
  const keys = Array.isArray(value) ? value : [];
  const seen = new Set<string>();
  return keys.map((key) => String(key || '').trim()).filter((key) => {
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const appendInputOrderKey = (inputOrder: unknown, key: string) => {
  const current = getUniqueInputKeys(inputOrder);
  return current.includes(key) ? current : [...current, key];
};

const toAssetInputKey = (assetId: string) => `asset:${assetId}`;

const normalizeVideoReferenceInputOrder = (data: FlowNodeData, inputOrder: string[]): FlowNodeData => {
  const params = normalizeVideoGenerationParams(data).params;
  if (params.mode !== 'first_last_frame') return data;
  const inputOrderByKey = new Map(inputOrder.map((key, index) => [key, index]));
  const referenceInputs = normalizeReferenceRolesForMode(
    [...params.referenceInputs]
      .sort((left, right) => {
        const leftKey = left.source.kind === 'upstream' ? toUpstreamInputKey(left.source.id) : toAssetInputKey(left.source.id);
        const rightKey = right.source.kind === 'upstream' ? toUpstreamInputKey(right.source.id) : toAssetInputKey(right.source.id);
        return (inputOrderByKey.get(leftKey) ?? Number.MAX_SAFE_INTEGER) - (inputOrderByKey.get(rightKey) ?? Number.MAX_SAFE_INTEGER);
      })
      .map((reference, order) => ({ ...reference, order })),
    params.mode,
    'ordered_first_last_frames',
  );
  if (JSON.stringify(referenceInputs) === JSON.stringify(params.referenceInputs)) return data;
  return {
    ...data,
    params: { ...(data.params ?? {}), videoGeneration: { ...params, referenceInputs } },
  };
};

const hasSameItems = (left: readonly string[], right: readonly string[]) =>
  left.length === right.length && left.every((item, index) => item === right[index]);

const getAutomaticVideoReferenceRole = (
  node: FlowNode,
  mediaKind: VideoReferenceInputV2["mediaKind"],
  sourceNodeId: string,
): VideoReferenceInputV2["role"] => {
  if (mediaKind === "video") return "reference_video";
  if (mediaKind === "audio") return "reference_audio";
  const mode = normalizeVideoGenerationParams(node.data).params.mode;
  if (mode === "image_to_video") return "main_image";
  if (mode === "first_last_frame") {
    const hasFirstFrame = normalizeVideoGenerationParams(node.data).params.referenceInputs.some(
      (reference) => reference.role === "first_frame" && reference.source.id !== sourceNodeId,
    );
    return hasFirstFrame ? "last_frame" : "first_frame";
  }
  return "reference_image";
};

const upsertUpstreamVideoReference = (
  node: FlowNode,
  input: {
    mediaKind: VideoReferenceInputV2['mediaKind'];
    referenceKey: string;
    role: VideoReferenceInputV2['role'];
    sourceNodeId: string;
  },
): FlowNode => {
  const normalized = normalizeVideoGenerationParams(node.data).params;
  const referenceInputs = [
    ...normalized.referenceInputs.filter((reference) => reference.referenceKey !== input.referenceKey),
    {
      mediaKind: input.mediaKind,
      order: normalized.referenceInputs.length,
      referenceKey: input.referenceKey,
      role: input.role,
      source: { kind: 'upstream' as const, id: input.sourceNodeId },
    },
  ].map((reference, order) => ({ ...reference, order }));

  return {
    ...node,
    data: {
      ...node.data,
      params: {
        ...(node.data.params ?? {}),
        videoGeneration: { ...normalized, referenceInputs },
      },
      updatedAt: Date.now(),
    },
  };
};

const getDirectAssetInputKeys = (node: FlowNode, referenceInputs?: VideoReferenceInputV2[]) => {
  const assetIds = Array.isArray(node.data.referenceAssetItemIds)
    ? node.data.referenceAssetItemIds.map((assetId) => String(assetId || '').trim()).filter(Boolean)
    : [];
  const referenceAssetIds = referenceInputs
    ? referenceInputs
      .filter((reference) => reference.source.kind === 'asset')
      .map((reference) => reference.source.id)
    : [];
  const orderedAssetKeys = getUniqueInputKeys(node.data.referenceOrder)
    .filter((key) => key.startsWith('asset:'));
  return getUniqueInputKeys([...assetIds, ...referenceAssetIds].map(toAssetInputKey).concat(orderedAssetKeys));
};

const getNodeInputKeyPartitions = (
  target: FlowNode,
  nodes: FlowNode[],
  edges: FlowEdge[],
  runtimeOutputs: Record<string, FlowRuntimeNodeOutput> = {},
) => {
  const nodesById = new Map(nodes.map((node) => [node.id, node]));
  const upstreamKeysByKind = edges.reduce<{ textKeys: string[]; mediaKeys: string[] }>((partitions, edge) => {
    if (edge.target !== target.id) return partitions;
    const source = nodesById.get(edge.source);
    const inputKind = getNodeReferenceInputKind(source, runtimeOutputs[edge.source]);
    const inputKey = toUpstreamInputKey(edge.source);
    if (!inputKind || partitions.textKeys.includes(inputKey) || partitions.mediaKeys.includes(inputKey)) return partitions;
    if (inputKind === 'text') partitions.textKeys.push(inputKey);
    else partitions.mediaKeys.push(inputKey);
    return partitions;
  }, { textKeys: [], mediaKeys: [] });
  const params = isVideoNode(target) ? normalizeVideoGenerationParams(target.data).params : undefined;
  return {
    textKeys: upstreamKeysByKind.textKeys,
    mediaKeys: [...upstreamKeysByKind.mediaKeys, ...getDirectAssetInputKeys(target, params?.referenceInputs)],
  };
};

const getNodeInputKeyKinds = (
  target: FlowNode,
  nodes: FlowNode[],
  edges: FlowEdge[],
  runtimeOutputs: Record<string, FlowRuntimeNodeOutput> = {},
) => {
  const nodesById = new Map(nodes.map((node) => [node.id, node]));
  const kinds = new Map<string, CanvasInputSeed['kind']>();
  edges.forEach((edge) => {
    if (edge.target !== target.id) return;
    const kind = getNodeReferenceInputKind(nodesById.get(edge.source), runtimeOutputs[edge.source]);
    if (kind) kinds.set(toUpstreamInputKey(edge.source), kind);
  });
  const params = isVideoNode(target) ? normalizeVideoGenerationParams(target.data).params : undefined;
  getDirectAssetInputKeys(target, params?.referenceInputs).forEach((key) => {
    const assetId = key.slice('asset:'.length);
    const reference = params?.referenceInputs.find((item) => item.source.kind === 'asset' && item.source.id === assetId);
    kinds.set(key, reference?.mediaKind ?? 'image');
  });
  return kinds;
};

const normalizeNodeInputOrder = (
  storedOrder: unknown,
  textKeys: string[],
  mediaKeys: string[],
) => {
  const mediaSet = new Set(mediaKeys);
  const storedMedia = getUniqueInputKeys(storedOrder).filter((key) => mediaSet.has(key));
  const orderedMedia = mediaKeys.reduce(appendInputOrderKey, storedMedia);
  return [...getUniqueInputKeys(textKeys), ...orderedMedia];
};

const reconcileNodeInputs = (
  nodes: FlowNode[],
  edges: FlowEdge[],
  runtimeOutputs: Record<string, FlowRuntimeNodeOutput> = {},
  targetNodeIds?: ReadonlySet<string>,
): FlowNode[] => {
  const nodesById = new Map(nodes.map((node) => [node.id, node]));
  const edgesByTarget = new Map<string, FlowEdge[]>();
  edges.forEach((edge) => {
    if (!nodesById.has(edge.source)) return;
    const targetEdges = edgesByTarget.get(edge.target) ?? [];
    targetEdges.push(edge);
    edgesByTarget.set(edge.target, targetEdges);
  });

  return nodes.map((node) => {
    if (targetNodeIds && !targetNodeIds.has(node.id)) return node;
    if (!isTextNode(node) && !isImageNode(node) && !isVideoNode(node)) return node;
    const incomingEdges = edgesByTarget.get(node.id) ?? [];
    const upstreamSources = incomingEdges.reduce<Array<{
      inputKind: CanvasInputSeed['kind'];
      node: FlowNode;
      key: string;
      mediaKind: FlowUpstreamMediaRef['mediaKind'] | null;
    }>>((sources, edge) => {
      const source = nodesById.get(edge.source);
      const key = toUpstreamInputKey(edge.source);
      if (!source || sources.some((candidate) => candidate.key === key)) return sources;
      const inputKind = getNodeReferenceInputKind(source, runtimeOutputs[source.id]);
      if (!inputKind) return sources;
      sources.push({
        inputKind,
        node: source,
        key,
        mediaKind: getNodeReferenceMediaKind(source, runtimeOutputs[source.id]),
      });
      return sources;
    }, []);

    const normalized = isVideoNode(node) ? normalizeVideoGenerationParams(node.data).params : null;
    const directAssetKeys = getDirectAssetInputKeys(node, normalized?.referenceInputs);
    const textKeys = upstreamSources.filter((source) => source.inputKind === 'text').map((source) => source.key);
    const mediaKeys = [
      ...upstreamSources.filter((source) => source.inputKind !== 'text').map((source) => source.key),
      ...directAssetKeys,
    ];
    const inputOrder = normalizeNodeInputOrder(node.data.inputOrder, textKeys, mediaKeys);
    const imageReferenceOrder = inputOrder.filter((key) => {
      if (key.startsWith('asset:')) return true;
      const source = upstreamSources.find((candidate) => candidate.key === key);
      return source?.mediaKind === 'image';
    });

    if (isTextNode(node) || isImageNode(node)) {
      const nextData = {
        ...node.data,
        inputOrder,
        referenceOrder: imageReferenceOrder,
      };
      if (hasSameItems(getUniqueInputKeys(node.data.inputOrder), inputOrder)
        && hasSameItems(getUniqueInputKeys(node.data.referenceOrder), imageReferenceOrder)) return node;
      return { ...node, data: { ...nextData, updatedAt: Date.now() } };
    }

    const connectedMediaByKey = new Map(
      upstreamSources
        .filter((source): source is typeof source & { mediaKind: FlowUpstreamMediaRef['mediaKind'] } => Boolean(source.mediaKind))
        .map((source) => [source.key, source]),
    );
    const connectedMediaKeys = new Set(connectedMediaByKey.keys());
    const retainedReferences = normalized!.referenceInputs.filter((reference) => {
      if (reference.source.kind === 'upstream') return connectedMediaKeys.has(toUpstreamInputKey(reference.source.id));
      return true;
    });
    const referencesByInputKey = new Map<string, VideoReferenceInputV2[]>();
    const referenceIdentities = new Set<string>();
    const addReference = (reference: VideoReferenceInputV2) => {
      const inputKey = reference.source.kind === 'upstream'
        ? toUpstreamInputKey(reference.source.id)
        : toAssetInputKey(reference.source.id);
      const identity = reference.source.kind === 'upstream'
        ? inputKey
        : String(reference.referenceKey || `${reference.source.kind}:${reference.source.id}:${reference.role}`);
      if (referenceIdentities.has(identity)) return;
      referenceIdentities.add(identity);
      const bucket = referencesByInputKey.get(inputKey) ?? [];
      bucket.push(reference);
      referencesByInputKey.set(inputKey, bucket);
    };
    retainedReferences.forEach((reference) => {
      addReference(reference);
    });
    connectedMediaByKey.forEach((source, key) => {
      if (referencesByInputKey.has(key)) return;
      const roleNode: FlowNode = {
        ...node,
        data: {
          ...node.data,
          params: {
            ...(node.data.params ?? {}),
            videoGeneration: { ...normalized!, referenceInputs: [...referencesByInputKey.values()].flat() },
          },
        },
      };
      addReference({
        mediaKind: source.mediaKind,
        order: referenceIdentities.size,
        referenceKey: key,
        role: getAutomaticVideoReferenceRole(roleNode, source.mediaKind, source.node.id),
        source: { kind: 'upstream', id: source.node.id },
      });
    });
    const mediaInputOrder = inputOrder.filter((key) => referencesByInputKey.has(key));
    const referenceInputs = mediaInputOrder
      .flatMap((key) => referencesByInputKey.get(key)!)
      .map((reference, order) => ({ ...reference, referenceKey: reference.source.kind === 'upstream'
        ? toUpstreamInputKey(reference.source.id)
        : reference.referenceKey, order }));
    // A legacy draft can contain several untyped image edges into an
    // image-to-video node. Keep all edges in the unified input order, but only
    // the newest upstream image can be its single typed main-image reference.
    const normalizedReferenceInputs = normalized!.mode === 'image_to_video'
      ? (() => {
        const lastUpstreamImageIndex = referenceInputs.reduce((lastIndex, reference, index) => (
          reference.source.kind === 'upstream' && reference.mediaKind === 'image' ? index : lastIndex
        ), -1);
        return referenceInputs.filter((reference, index) => {
          if (reference.mediaKind !== 'image') return true;
          if (lastUpstreamImageIndex >= 0) {
            return reference.source.kind === 'upstream' && index === lastUpstreamImageIndex;
          }
          return index === referenceInputs.findIndex((candidate) => candidate.mediaKind === 'image');
        }).map((reference, order) => ({ ...reference, order }));
      })()
      : referenceInputs;
    const roleNormalizedReferenceInputs = normalized!.mode === 'first_last_frame'
      ? normalizeReferenceRolesForMode(normalizedReferenceInputs, normalized!.mode, 'ordered_first_last_frames')
      : normalizedReferenceInputs;
    const referenceOrder = getUniqueInputKeys(roleNormalizedReferenceInputs.map((reference) => reference.source.kind === 'upstream'
      ? toUpstreamInputKey(reference.source.id)
      : toAssetInputKey(reference.source.id)));
    const referenceAssetItemIds = getUniqueInputKeys(roleNormalizedReferenceInputs
      .filter((reference) => reference.source.kind === 'asset')
      .map((reference) => reference.source.id));
    const existingReferenceInputs = normalized!.referenceInputs.map((reference) => ({
      ...reference,
      referenceKey: reference.source.kind === 'upstream' ? toUpstreamInputKey(reference.source.id) : reference.referenceKey,
    }));
    const referencesChanged = JSON.stringify(existingReferenceInputs) !== JSON.stringify(roleNormalizedReferenceInputs);
    if (!referencesChanged
      && hasSameItems(getUniqueInputKeys(node.data.inputOrder), inputOrder)
      && hasSameItems(getUniqueInputKeys(node.data.referenceOrder), referenceOrder)
      && hasSameItems(getUniqueInputKeys(node.data.referenceAssetItemIds), referenceAssetItemIds)) return node;
    return {
      ...node,
      data: {
        ...node.data,
        inputOrder,
        referenceAssetItemIds,
        referenceOrder,
        params: {
          ...(node.data.params ?? {}),
          videoGeneration: { ...normalized!, referenceInputs: roleNormalizedReferenceInputs },
        },
        updatedAt: Date.now(),
      },
    };
  });
};

const isPanoramaViewerNode = (node: FlowNode | undefined | null) =>
  !!node && (node.type === 'panorama_viewer' || node.data.kind === 'panorama_viewer');

const buildPanoramaViewerEdge = (sourceNodeId: string, targetNodeId: string): FlowEdge => ({
  id: nanoid(12),
  source: sourceNodeId,
  sourceHandle: 'out',
  target: targetNodeId,
  targetHandle: 'in',
  type: 'smart',
  data: { dataType: 'any' as const } satisfies FlowEdgeData,
});

const buildPanoramaViewerPosition = (sourceNode: FlowNode) => {
  const sourceWidth = Number(sourceNode.data.width || 260);
  const sourceHeight = Number(sourceNode.data.height || 200);
  const viewerHeight = FLOW_NODE_DEFAULT_SIZES.panoramaViewer.height;
  return {
    x: sourceNode.position.x + sourceWidth + 160,
    y: sourceNode.position.y + Math.max(0, Math.round((sourceHeight - viewerHeight) / 2)),
  };
};

const findPanoramaViewerForSource = (
  nodes: FlowNode[],
  edges: FlowEdge[],
  sourceNodeId: string,
): FlowNode | undefined =>
  nodes.find((node) => {
    if (!isPanoramaViewerNode(node)) return false;
    if (node.data.panoramaSourceNodeId === sourceNodeId) return true;
    return edges.some((edge) => edge.source === sourceNodeId && edge.target === node.id);
  });

const buildPanoramaTargetPosition = (sourceNode: FlowNode) => ({
  x: sourceNode.position.x + Number(sourceNode.data.width || 260) + 160,
  y: sourceNode.position.y,
});

const buildGroupBounds = (nodes: FlowNode[]) => {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  nodes.forEach((node) => {
    const width = Number(node.data.width || 280);
    const height = Number(node.data.height || 180);
    minX = Math.min(minX, node.position.x);
    minY = Math.min(minY, node.position.y);
    maxX = Math.max(maxX, node.position.x + width);
    maxY = Math.max(maxY, node.position.y + height);
  });

  return { maxX, maxY, minX, minY };
};

const buildGraphIndex = (
  nodes: FlowNode[],
  edges: FlowEdge[],
  nodeOutputByNodeId: Record<string, FlowRuntimeNodeOutput> = {},
): FlowGraphIndex => {
  if (nodes.length === 0 && edges.length === 0) return EMPTY_GRAPH_INDEX;

  const nodesById = new Map(nodes.map((node) => [node.id, node]));
  const upstreamInputRefsByNodeId: FlowGraphIndex['upstreamInputRefsByNodeId'] = {};
  const upstreamMediaRefsByNodeId: FlowGraphIndex['upstreamMediaRefsByNodeId'] = {};
  const upstreamImageRefsByNodeId: FlowGraphIndex['upstreamImageRefsByNodeId'] = {};
  const hasIncomingEdgesByNodeId: FlowGraphIndex['hasIncomingEdgesByNodeId'] = {};
  const childEditCountsByNodeId: FlowGraphIndex['childEditCountsByNodeId'] = {};

  for (const edge of edges) {
    hasIncomingEdgesByNodeId[edge.target] = true;

    const sourceNode = nodesById.get(edge.source);
    const sourceRuntimeOutput = nodeOutputByNodeId[edge.source];
    const sourceInputKind = getNodeReferenceInputKind(sourceNode, sourceRuntimeOutput);
    if (sourceNode && sourceInputKind) {
      const sourceAssetId = sourceInputKind === 'text'
        ? ''
        : getNodeReferenceAssetId(sourceNode, sourceRuntimeOutput, sourceInputKind);
      const sourceThumbnailUrl = sourceInputKind === 'text'
        ? ''
        : getNodeReferenceThumbnailUrl(sourceNode, sourceRuntimeOutput, sourceInputKind);
      const sourceHoverPreviewUrl = sourceInputKind === 'text'
        ? ''
        : getNodeReferenceHoverPreviewUrl(sourceNode, sourceRuntimeOutput, sourceInputKind);
      const durationMs = Number(sourceNode.data.durationMs);
      const fallbackTitle = sourceInputKind === 'text'
        ? '文本'
        : sourceInputKind === 'image'
          ? '图片'
          : sourceInputKind === 'video'
            ? '视频'
            : '音频';
      const inputKey = toUpstreamInputKey(sourceNode.id);
      const inputRefs = upstreamInputRefsByNodeId[edge.target] || [];
      if (!inputRefs.some((input) => input.inputKey === inputKey)) {
        inputRefs.push({
          inputKey,
          source: 'upstream',
          kind: sourceInputKind,
          title: String(sourceNode.data.title || '').trim() || fallbackTitle,
          edgeId: edge.id,
          sourceNodeId: sourceNode.id,
          ...(sourceAssetId ? { assetId: sourceAssetId } : {}),
          ...(sourceInputKind === 'text' ? { textExcerpt: getNodeTextExcerpt(sourceNode, sourceRuntimeOutput) } : {}),
          ...(sourceThumbnailUrl ? { thumbnailUrl: sourceThumbnailUrl, previewUrl: sourceThumbnailUrl } : {}),
          ...(sourceHoverPreviewUrl ? { hoverPreviewUrl: sourceHoverPreviewUrl } : {}),
          ...(Number.isFinite(durationMs) ? { durationMs } : {}),
          sourceRevision: String(sourceNode.data.updatedAt),
          previewState: sourceThumbnailUrl || sourceHoverPreviewUrl ? 'ready' : 'unavailable',
        });
      }
      upstreamInputRefsByNodeId[edge.target] = inputRefs;
    }
    const sourceMediaKind = getNodeReferenceMediaKind(sourceNode, sourceRuntimeOutput);
    if (sourceNode && sourceMediaKind) {
      const sourceReferenceUploadId = String(sourceNode.data.referenceUploadId || '').trim();
      const sourceAssetId = getNodeReferenceAssetId(sourceNode, sourceRuntimeOutput, sourceMediaKind);
      const sourceThumbnailUrl = getNodeReferenceThumbnailUrl(sourceNode, sourceRuntimeOutput, sourceMediaKind);
      const sourceHoverPreviewUrl = getNodeReferenceHoverPreviewUrl(sourceNode, sourceRuntimeOutput, sourceMediaKind);
      const mediaRefs = upstreamMediaRefsByNodeId[edge.target] || [];
      mediaRefs.push({
        key: `upstream:${sourceNode.id}`,
        id: sourceNode.id,
        ...(sourceAssetId ? { assetId: sourceAssetId } : {}),
        edgeId: edge.id,
        mediaKind: sourceMediaKind,
        ...(sourceThumbnailUrl ? { thumbnailUrl: sourceThumbnailUrl, previewUrl: sourceThumbnailUrl } : {}),
        ...(sourceHoverPreviewUrl ? { hoverPreviewUrl: sourceHoverPreviewUrl } : {}),
        title: String(sourceNode.data.title || (sourceMediaKind === 'video' ? '参考视频' : sourceMediaKind === 'audio' ? '参考音频' : '参考图')),
        source: 'upstream',
      });
      upstreamMediaRefsByNodeId[edge.target] = mediaRefs;

      if (sourceMediaKind === 'image' && sourceThumbnailUrl) {
        const imageRefs = upstreamImageRefsByNodeId[edge.target] || [];
        imageRefs.push({
          key: `upstream:${sourceNode.id}`,
          id: sourceNode.id,
          ...(sourceAssetId ? { assetId: sourceAssetId } : {}),
          edgeId: edge.id,
          imageUrl: sourceThumbnailUrl,
          mediaKind: 'image',
          previewUrl: sourceThumbnailUrl,
          ...(sourceReferenceUploadId ? { referenceUploadId: sourceReferenceUploadId } : {}),
          title: String(sourceNode.data.title || '参考图'),
          source: 'upstream',
        });
        upstreamImageRefsByNodeId[edge.target] = imageRefs;
      }
    }

    const targetNode = nodesById.get(edge.target);
    const editType = String(targetNode?.data.lastEditType || '');
    if (!editType) continue;

    const counts = childEditCountsByNodeId[edge.source] || createEditCounts();
    if (editType === 'crop') counts.crop += 1;
    if (editType === 'resize') counts.resize += 1;
    if (editType === 'split') counts.split += 1;
    if (editType === 'annotate') counts.annotate += 1;
    childEditCountsByNodeId[edge.source] = counts;
  }

  return {
    upstreamInputRefsByNodeId,
    upstreamMediaRefsByNodeId,
    upstreamImageRefsByNodeId,
    hasIncomingEdgesByNodeId,
    childEditCountsByNodeId,
  };
};

const shouldMarkNodeChangesDirty = (changes: Parameters<OnNodesChange<FlowNode>>[0]) =>
  changes.some((change) => {
    if (change.type === 'select') return false;
    if (change.type === 'dimensions') return false;
    if (change.type === 'position') return change.dragging !== true;
    return true;
  });

const shouldRebuildGraphIndexForNodeChanges = (changes: Parameters<OnNodesChange<FlowNode>>[0]) =>
  changes.some((change) => change.type !== 'select' && change.type !== 'position' && change.type !== 'dimensions');

const shouldRecountSelectionForNodeChanges = (changes: Parameters<OnNodesChange<FlowNode>>[0]) =>
  changes.some((change) => change.type === 'select' || change.type === 'add' || change.type === 'remove');

export const useFlowCanvasStore = create<FlowCanvasState>((set, get) => ({
  backendCurrentVersionId: null,
  backendFlowId: null,
  backendProjectId: null,
  projectId: nanoid(12),
  projectTitle: '未命名项目',
  version: 1,
  isDirty: false,

  nodes: [],
  edges: [],
  projectStudios: {},
  graphIndex: EMPTY_GRAPH_INDEX,
  selectedNodeCount: 0,
  viewport: INITIAL_VIEWPORT,

  history: [],
  historyIndex: -1,

  leftPanelOpen: false,
  contextMenu: null,
  activeImageTool: null,
  isNodeDragging: false,
  currentRunId: null,
  isRunningBackendWorkflow: false,
  nodeOutputByNodeId: {},
  nodeRunIdByNodeId: {},
  nodeRunStatusByNodeId: {},
  workflowRunIdByNodeId: {},
  nodeIdByNodeRunId: {},
  runError: null,
  runEvents: [],
  runStatus: null,
  latestGroupExecutionPlan: null,

  onNodesChange: (changes) => {
    const dirty = shouldMarkNodeChangesDirty(changes);
    const rebuildGraphIndex = shouldRebuildGraphIndexForNodeChanges(changes);
    const recountSelection = shouldRecountSelectionForNodeChanges(changes);
    set((state) => {
      const nodes = applyNodeChanges(changes, state.nodes);
      return {
        nodes,
        graphIndex: rebuildGraphIndex ? buildGraphIndex(nodes, state.edges, state.nodeOutputByNodeId) : state.graphIndex,
        latestGroupExecutionPlan: changes.length > 0 ? null : state.latestGroupExecutionPlan,
        selectedNodeCount: recountSelection ? countSelectedNodes(nodes) : state.selectedNodeCount,
        isDirty: dirty ? true : state.isDirty,
      };
    });
  },

  onEdgesChange: (changes) => {
    const dirty = changes.some((change) => change.type !== 'select');
    set((state) => {
      const edges = applyEdgeChanges(changes, state.edges);
      const nodes = reconcileNodeInputs(state.nodes, edges, state.nodeOutputByNodeId);
      return {
        edges,
        graphIndex: buildGraphIndex(nodes, edges, state.nodeOutputByNodeId),
        latestGroupExecutionPlan: null,
        isDirty: dirty ? true : state.isDirty,
        nodes,
      };
    });
  },

  onConnect: (connection) => {
    const { nodes, edges } = get();
    const sourceNode = nodes.find((node) => node.id === connection.source);
    const targetNode = nodes.find((node) => node.id === connection.target);
    if (!canConnectFlowNodes(sourceNode, targetNode).ok) return;
    const duplicate = edges.some(
      (edge) =>
        edge.source === connection.source &&
        edge.target === connection.target &&
        edge.sourceHandle === connection.sourceHandle &&
        edge.targetHandle === connection.targetHandle,
    );
    if (duplicate) return;

    get().pushHistory();
    set((state) => {
      const edges = addEdge(
        {
          ...connection,
          id: nanoid(12),
          type: 'smart',
          data: { dataType: 'any' as const } satisfies FlowEdgeData,
        },
        state.edges,
      );
      const nodes = reconcileNodeInputs(state.nodes, edges, state.nodeOutputByNodeId);
      return {
        nodes,
        edges,
        graphIndex: buildGraphIndex(nodes, edges, state.nodeOutputByNodeId),
        isDirty: true,
      };
    });
  },

  connectVideoReference: (input) => {
    if (!input.sourceNodeId || !input.targetNodeId || input.sourceNodeId === input.targetNodeId) return;
    get().pushHistory();
    set((state) => {
      const edgeExists = state.edges.some((edge) => edge.source === input.sourceNodeId && edge.target === input.targetNodeId);
      const edges = edgeExists
        ? state.edges
        : addEdge(
          {
            id: nanoid(12),
            source: input.sourceNodeId,
            sourceHandle: 'out',
            target: input.targetNodeId,
            targetHandle: 'in',
            type: 'smart',
            data: { dataType: 'any' as const } satisfies FlowEdgeData,
          },
          state.edges,
        );
      const nodes = state.nodes.map((node) => (
        node.id === input.targetNodeId ? upsertUpstreamVideoReference(node, input) : node
      ));
      const reconciledNodes = reconcileNodeInputs(nodes, edges, state.nodeOutputByNodeId);
      return {
        edges,
        graphIndex: buildGraphIndex(reconciledNodes, edges, state.nodeOutputByNodeId),
        isDirty: true,
        nodes: reconciledNodes,
      };
    });
  },

  addNode: (kind, position, overrides, options) => {
    get().pushHistory();
    const node = {
      ...createFlowNode(kind, position, overrides),
      selected: !!options?.selected,
    };
    set((state) => {
      const nodes = [
        ...(options?.selected && !options?.preserveSelection
          ? state.nodes.map((item) => (item.selected ? { ...item, selected: false } : item))
          : state.nodes),
        node,
      ];
      return {
        nodes,
        graphIndex: buildGraphIndex(nodes, state.edges, state.nodeOutputByNodeId),
        selectedNodeCount: countSelectedNodes(nodes),
        isDirty: true,
      };
    });
    return node;
  },

  addNodeAndEdge: (kind, position, sourceNodeId, sourceHandle, targetHandle, overrides) => {
    const sourceNode = get().nodes.find((node) => node.id === sourceNodeId);
    if (!sourceNode || !canCreateNodeFromSource(sourceNode, kind)) {
      throw new Error('该节点不支持生成所选类型');
    }
    get().pushHistory();
    const node = createFlowNode(kind, position, {
      ...overrides,
      ...(kind === 'image' && isImageNode(sourceNode)
        ? {
            referenceOrder: appendReferenceOrderKey(undefined, `upstream:${sourceNode.id}`),
          }
        : {}),
    });
    const edge: FlowEdge = {
      id: nanoid(12),
      source: sourceNodeId,
      sourceHandle: sourceHandle || 'right',
      target: node.id,
      targetHandle: targetHandle || 'left',
      type: 'smart',
      data: { dataType: 'any' as const } satisfies FlowEdgeData,
    };
    set((state) => {
      const edges = [...state.edges, edge];
      const nodes = reconcileNodeInputs([...state.nodes, node], edges, state.nodeOutputByNodeId);
      return {
        nodes,
        edges,
        graphIndex: buildGraphIndex(nodes, edges, state.nodeOutputByNodeId),
        isDirty: true,
      };
    });
    return node;
  },

  addGeneratedImageChildren: (parentNodeId, items) => {
    const parentNode = get().nodes.find((node) => node.id === parentNodeId);
    if (!parentNode || items.length === 0) return [];

    get().pushHistory();

    const parentWidth = Number(parentNode.data.width || 260);
    const parentX = parentNode.position.x;
    const parentY = parentNode.position.y;
    const startX = parentX + parentWidth + 160;
    const gapY = 28;
    const createdIds: string[] = [];

    set((state) => {
      const nextNodes = [...state.nodes];
      const nextEdges = [...state.edges];

      items.forEach((item, index) => {
        const fitted = fitMediaNodeToShortSide(
          typeof item.width === 'number' && item.width > 0 ? item.width : 260,
          typeof item.height === 'number' && item.height > 0 ? item.height : 210,
        );
        const node = createFlowNode(
          'image',
          {
            x: startX,
            y: parentY + index * (fitted.height + gapY),
          },
          {
            ...buildAssetBackedNodeData({
              durationMs: null,
              height: typeof item.height === 'number' ? item.height : null,
              id: item.assetId,
              mimeType: item.mimeType,
              originalFilename: item.title,
              previewUrl: item.downloadUrl,
              source: 'generated-result',
              title: item.title,
              width: typeof item.width === 'number' ? item.width : null,
            }, {
              naturalHeight: item.height,
              naturalWidth: item.width,
              previewUrl: item.downloadUrl,
              source: 'generated-result',
              title: item.title,
            }),
            editSourceNodeId: parentNodeId,
            referenceOrder: appendReferenceOrderKey(undefined, `upstream:${parentNodeId}`),
            width: fitted.width,
            height: fitted.height,
          },
        );

        const edge: FlowEdge = {
          id: nanoid(12),
          source: parentNodeId,
          sourceHandle: 'out',
          target: node.id,
          targetHandle: 'in',
          type: 'smart',
          data: { dataType: 'any' as const } satisfies FlowEdgeData,
        };

        createdIds.push(node.id);
        nextNodes.push(node);
        nextEdges.push(edge);
      });

      const nodes = reconcileNodeInputs(nextNodes, nextEdges, state.nodeOutputByNodeId);
      return {
        nodes,
        edges: nextEdges,
        graphIndex: buildGraphIndex(nodes, nextEdges, state.nodeOutputByNodeId),
        isDirty: true,
      };
    });

    return createdIds;
  },

  createPanoramaTargetNodeFromSource: (sourceNodeId, settings) => {
    const sourceNode = get().nodes.find((node) => node.id === sourceNodeId);
    if (!isImageNode(sourceNode)) {
      throw new Error('PANORAMA_SOURCE_NOT_FOUND');
    }

    get().pushHistory();

    let createdNode: FlowNode | null = null;
    set((state) => {
      const latestSourceNode = state.nodes.find((node) => node.id === sourceNodeId);
      if (!isImageNode(latestSourceNode)) {
        return state;
      }

      const sourceParams =
        latestSourceNode.data.params && typeof latestSourceNode.data.params === 'object'
          ? latestSourceNode.data.params as Record<string, unknown>
          : {};
      const sourcePanorama =
        sourceParams.panorama && typeof sourceParams.panorama === 'object'
          ? sourceParams.panorama as Record<string, unknown>
          : {};
      const aspectRatio = settings.aspectRatio;
      const selectedSize = String(settings.size || '1k').toUpperCase();
      const selectedModelId = String(settings.modelId || latestSourceNode.data.modelId || '').trim();
      const selectedRouteKey = String(settings.routeKey || latestSourceNode.data.routeKey || '').trim();
      const aspectRatioValue = parseAspectRatio(aspectRatio) || 2;
      const displaySize = getMediaNodeSizeFromRatioString(aspectRatio, 2);
      const naturalWidth = aspectRatio === '21:9' ? 2100 : 2000;
      const naturalHeight = aspectRatio === '21:9' ? 900 : 1000;

      const created = createFlowNode(
        'image',
        buildPanoramaTargetPosition(latestSourceNode),
        {
          aspectRatio: aspectRatioValue,
          generationMode: PANORAMA_GENERATION_MODE,
          generationPrompt: buildPanoramaGenerationPrompt(latestSourceNode.data.generationPrompt, aspectRatio),
          height: displaySize.height,
          naturalHeight,
          naturalWidth,
          params: {
            ...sourceParams,
            ...buildImageGenerationModeParamPatch(PANORAMA_GENERATION_MODE),
            aspectRatio,
            aspect_ratio: aspectRatio,
            generationMode: PANORAMA_GENERATION_MODE,
            imageSize: selectedSize,
            image_size: selectedSize,
            size: selectedSize,
            panorama: {
              ...sourcePanorama,
              aspectRatio,
              continuity: 'seamless',
              projectionHint: 'equirectangular',
              subjectType: 'scene',
            },
          },
          referenceOrder: appendReferenceOrderKey(undefined, `upstream:${latestSourceNode.id}`),
          title: `${String(latestSourceNode.data.title || 'Image')} Panorama`,
          width: displaySize.width,
          ...(selectedModelId ? { modelId: selectedModelId } : {}),
          ...(selectedRouteKey ? { routeKey: selectedRouteKey } : {}),
        },
      );
      created.selected = true;
      createdNode = created;

      const nodes = [
        ...state.nodes.map((node) => (node.selected ? { ...node, selected: false } : node)),
        created,
      ];
      const edges = [...state.edges, buildPanoramaViewerEdge(sourceNodeId, created.id)];
      const reconciledNodes = reconcileNodeInputs(nodes, edges, state.nodeOutputByNodeId);
      return {
        edges,
        graphIndex: buildGraphIndex(reconciledNodes, edges, state.nodeOutputByNodeId),
        isDirty: true,
        nodes: reconciledNodes,
        selectedNodeCount: countSelectedNodes(reconciledNodes),
      };
    });

    if (!createdNode) {
      throw new Error('PANORAMA_TARGET_CREATE_FAILED');
    }
    return createdNode;
  },

  ensurePanoramaViewerForImageNode: (sourceNodeId) => {
    const sourceNode = get().nodes.find((node) => node.id === sourceNodeId);
    if (!isImageNode(sourceNode)) {
      return null;
    }

    const currentState = get();
    const existingViewer = findPanoramaViewerForSource(currentState.nodes, currentState.edges, sourceNodeId);
    const viewerId = existingViewer?.id || null;
    const connectionTargetId = viewerId || '';
    const viewerEdgeCount = connectionTargetId
      ? currentState.edges.filter((edge) => edge.source === sourceNodeId && edge.target === connectionTargetId).length
      : 0;
    const needsCreateViewer = !existingViewer;
    const needsConnectViewer = !needsCreateViewer && viewerEdgeCount === 0;
    const hasDuplicateViewerEdges = viewerEdgeCount > 1;
    const needsPatchViewerSource = !!existingViewer && existingViewer.data.panoramaSourceNodeId !== sourceNodeId;

    if (!needsCreateViewer && !needsConnectViewer && !hasDuplicateViewerEdges && !needsPatchViewerSource) {
      return existingViewer!.id;
    }

    get().pushHistory();

    let resolvedViewerId: string | null = viewerId;
    set((state) => {
      const latestSourceNode = state.nodes.find((node) => node.id === sourceNodeId);
      if (!isImageNode(latestSourceNode)) {
        return state;
      }

      let nextNodes = [...state.nodes];
      let nextEdges = [...state.edges];
      let targetViewer = findPanoramaViewerForSource(nextNodes, nextEdges, sourceNodeId);

      if (!targetViewer) {
        targetViewer = createFlowNode(
          'panorama_viewer',
          buildPanoramaViewerPosition(latestSourceNode),
          {
            panoramaSourceNodeId: sourceNodeId,
            title: '360 全景查看',
          },
        );
        nextNodes = [...nextNodes, targetViewer];
      } else if (targetViewer.data.panoramaSourceNodeId !== sourceNodeId) {
        nextNodes = nextNodes.map((node) =>
          node.id === targetViewer!.id
            ? {
                ...node,
                data: {
                  ...node.data,
                  panoramaSourceNodeId: sourceNodeId,
                  updatedAt: Date.now(),
                },
              }
            : node,
        );
        targetViewer = nextNodes.find((node) => node.id === targetViewer!.id);
      }

      if (!targetViewer) {
        return state;
      }

      resolvedViewerId = targetViewer.id;
      const viewerEdges = nextEdges.filter((edge) => edge.source === sourceNodeId && edge.target === targetViewer!.id);
      if (viewerEdges.length === 0) {
        nextEdges = [...nextEdges, buildPanoramaViewerEdge(sourceNodeId, targetViewer.id)];
      } else if (viewerEdges.length > 1) {
        const keepEdgeId = viewerEdges[0]!.id;
        nextEdges = nextEdges.filter((edge) =>
          !(edge.source === sourceNodeId && edge.target === targetViewer!.id && edge.id !== keepEdgeId),
        );
      }

      const nodes = reconcileNodeInputs(nextNodes, nextEdges, state.nodeOutputByNodeId);
      return {
        nodes,
        edges: nextEdges,
        graphIndex: buildGraphIndex(nodes, nextEdges, state.nodeOutputByNodeId),
        isDirty: true,
      };
    });

    return resolvedViewerId;
  },

  getUpstreamNodes: (nodeId) => {
    const { nodes, edges } = get();
    const incomingEdges = edges.filter((edge) => edge.target === nodeId);
    return incomingEdges
      .map((edge) => nodes.find((node) => node.id === edge.source))
      .filter(Boolean) as FlowNode[];
  },

  groupNodesAsPanoramaCaptureSet: (nodeIds, groupTitle) => {
    const nodeIdSet = new Set(nodeIds);
    const groupedNodes = get().nodes.filter((node) => nodeIdSet.has(node.id) && node.type !== 'group');
    if (groupedNodes.length < 2) {
      return { groupId: null };
    }

    const { maxX, maxY, minX, minY } = buildGroupBounds(groupedNodes);
    const padding = 40;
    const groupX = minX - padding;
    const groupY = minY - padding;
    const groupW = maxX - minX + padding * 2;
    const groupH = maxY - minY + padding * 2;

    const groupNode = createFlowNode('group', { x: groupX, y: groupY }, { title: groupTitle });
    groupNode.style = { width: groupW, height: groupH };
    groupNode.data.width = groupW;
    groupNode.data.height = groupH;
    groupNode.selected = true;

    get().pushHistory();

    set((state) => {
      const nodes = state.nodes.map((node) => {
        if (node.id === groupNode.id) return node;
        if (!nodeIdSet.has(node.id) || node.type === 'group') {
          return node.selected ? { ...node, selected: false } : node;
        }
        return {
          ...node,
          extent: 'parent' as const,
          parentId: groupNode.id,
          position: {
            x: node.position.x - groupX,
            y: node.position.y - groupY,
          },
          selected: false,
        };
      });
      const nextNodes = [
        groupNode,
        ...nodes.filter((node) => node.id !== groupNode.id),
      ];
      return {
        graphIndex: buildGraphIndex(nextNodes, state.edges, state.nodeOutputByNodeId),
        isDirty: true,
        nodes: nextNodes,
        selectedNodeCount: countSelectedNodes(nextNodes),
      };
    });

    return { groupId: groupNode.id };
  },

  groupSelectedNodes: () => {
    const { nodes } = get();
    const selected = nodes.filter((node) => node.selected && node.type !== 'group');
    if (selected.length < 2) return;

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    selected.forEach((node) => {
      minX = Math.min(minX, node.position.x);
      minY = Math.min(minY, node.position.y);
      const width = node.data?.width || 280;
      const height = node.data?.height || 180;
      maxX = Math.max(maxX, node.position.x + width);
      maxY = Math.max(maxY, node.position.y + height);
    });

    const padding = 40;
    const groupX = minX - padding;
    const groupY = minY - padding;
    const groupW = maxX - minX + padding * 2;
    const groupH = maxY - minY + padding * 2;

    const groupNode = createFlowNode('group', { x: groupX, y: groupY }, { title: '新建组' });
    groupNode.style = { width: groupW, height: groupH };
    groupNode.data.width = groupW;
    groupNode.data.height = groupH;
    groupNode.selected = true;

    const updatedSelected = selected.map((node) => ({
      ...node,
      parentId: groupNode.id,
      extent: 'parent' as const,
      position: {
        x: node.position.x - groupX,
        y: node.position.y - groupY,
      },
    }));

    get().pushHistory();
    set((state) => {
      const selectedIds = new Set(selected.map((node) => node.id));
      const otherNodes = state.nodes
        .filter((node) => !selectedIds.has(node.id))
        .map((node) => (node.selected ? { ...node, selected: false } : node));
      const nodes = [groupNode, ...otherNodes, ...updatedSelected.map((node) => ({ ...node, selected: false }))];
      return {
        nodes,
        graphIndex: buildGraphIndex(nodes, state.edges, state.nodeOutputByNodeId),
        selectedNodeCount: countSelectedNodes(nodes),
        isDirty: true,
      };
    });
  },

  ungroupSelectedGroups: () => {
    const { nodes } = get();
    const selectedGroups = nodes.filter((node) => node.selected && node.type === 'group');
    if (selectedGroups.length === 0) return;

    const groupById = new Map(selectedGroups.map((node) => [node.id, node]));
    const groupIds = new Set(groupById.keys());

    get().pushHistory();
    set((state) => {
      const nodes = state.nodes
        .filter((node) => !groupIds.has(node.id))
        .map((node) => {
          if (!node.parentId || !groupIds.has(node.parentId)) return node;
          const parent = groupById.get(node.parentId);
          return {
            ...node,
            parentId: undefined,
            extent: undefined,
            selected: true,
            position: {
              x: (parent?.position.x || 0) + node.position.x,
              y: (parent?.position.y || 0) + node.position.y,
            },
          };
        });
      return {
        nodes,
        graphIndex: buildGraphIndex(nodes, state.edges, state.nodeOutputByNodeId),
        selectedNodeCount: countSelectedNodes(nodes),
        isDirty: true,
      };
    });
  },

  layoutSelectedGroup: (layout) => {
    const { nodes } = get();
    const group = nodes.find((node) => node.selected && node.type === 'group');
    if (!group) return;
    const children = nodes.filter((node) => node.parentId === group.id);
    if (children.length === 0) return;

    const gap = 32;
    const padding = 36;
    const childSizes = children.map((node) => ({
      id: node.id,
      width: Number(node.data.width || node.measured?.width || 240),
      height: Number(node.data.height || node.measured?.height || 180),
    }));

    let positions = new Map<string, { x: number; y: number }>();
    let groupW = Number(group.data.width || group.style?.width || 600);
    let groupH = Number(group.data.height || group.style?.height || 400);

    if (layout === 'horizontal') {
      let cursorX = padding;
      let maxH = 0;
      childSizes.forEach((child) => {
        positions.set(child.id, { x: cursorX, y: padding });
        cursorX += child.width + gap;
        maxH = Math.max(maxH, child.height);
      });
      groupW = Math.max(360, cursorX - gap + padding);
      groupH = Math.max(240, maxH + padding * 2);
    } else {
      const columns = Math.ceil(Math.sqrt(children.length));
      const colWidths = Array(columns).fill(0);
      const rowHeights: number[] = [];
      childSizes.forEach((child, index) => {
        const col = index % columns;
        const row = Math.floor(index / columns);
        colWidths[col] = Math.max(colWidths[col], child.width);
        rowHeights[row] = Math.max(rowHeights[row] || 0, child.height);
      });
      childSizes.forEach((child, index) => {
        const col = index % columns;
        const row = Math.floor(index / columns);
        const x = padding + colWidths.slice(0, col).reduce((sum, width) => sum + width + gap, 0);
        const y = padding + rowHeights.slice(0, row).reduce((sum, height) => sum + height + gap, 0);
        positions.set(child.id, { x, y });
      });
      groupW = Math.max(360, padding * 2 + colWidths.reduce((sum, width) => sum + width, 0) + gap * (columns - 1));
      groupH = Math.max(240, padding * 2 + rowHeights.reduce((sum, height) => sum + height, 0) + gap * (rowHeights.length - 1));
    }

    get().pushHistory();
    set((state) => {
      const nodes = state.nodes.map((node) => {
        if (node.id === group.id) {
          return { ...node, data: { ...node.data, width: groupW, height: groupH, updatedAt: Date.now() }, style: { ...node.style, width: groupW, height: groupH } };
        }
        const nextPosition = positions.get(node.id);
        return nextPosition ? { ...node, position: nextPosition } : node;
      });
      return {
        nodes,
        graphIndex: buildGraphIndex(nodes, state.edges, state.nodeOutputByNodeId),
        isDirty: true,
      };
    });
  },

  getSelectedGroup: () => get().nodes.find((node) => node.selected && node.type === 'group') ?? null,

  getSelectedGroupGraph: () => {
    const group = get().getSelectedGroup();
    if (!group) return null;
    const { nodes, edges } = get();
    return { groupId: group.id, nodes, edges };
  },

  buildSelectedGroupExecutionPlan: () => {
    const graph = get().getSelectedGroupGraph();
    if (!graph) {
      set({ latestGroupExecutionPlan: null });
      return null;
    }
    const plan = buildGroupExecutionPlan(graph.nodes, graph.edges, graph.groupId, get().nodeOutputByNodeId);
    set({ latestGroupExecutionPlan: plan });
    return plan;
  },

  deleteSelectedNodes: () => {
    const selectedIds = new Set(get().nodes.filter((node) => node.selected).map((node) => node.id));
    if (selectedIds.size === 0) return;
    get().pushHistory();
    set((state) => {
      const nodes = state.nodes.filter((node) => !selectedIds.has(node.id));
      const edges = state.edges.filter((edge) => !selectedIds.has(edge.source) && !selectedIds.has(edge.target));
      const reconciledNodes = reconcileNodeInputs(nodes, edges, state.nodeOutputByNodeId);
      return {
        nodes: reconciledNodes,
        edges,
        graphIndex: buildGraphIndex(reconciledNodes, edges, state.nodeOutputByNodeId),
        latestGroupExecutionPlan: null,
        selectedNodeCount: countSelectedNodes(reconciledNodes),
        activeImageTool: state.activeImageTool && selectedIds.has(state.activeImageTool.nodeId) ? null : state.activeImageTool,
        isDirty: true,
      };
    });
  },

  duplicateSelectedNodes: () => {
    const selected = get().nodes.filter((node) => node.selected);
    if (selected.length === 0) return;
    get().pushHistory();
    const newNodes = selected.map((node) => duplicateFlowNode(node));
    set((state) => {
      const nodes = [
        ...state.nodes.map((node) => (node.selected ? { ...node, selected: false } : node)),
        ...newNodes.map((node) => ({ ...node, selected: true })),
      ];
      return {
        nodes,
        graphIndex: buildGraphIndex(nodes, state.edges, state.nodeOutputByNodeId),
        selectedNodeCount: countSelectedNodes(nodes),
        isDirty: true,
      };
    });
  },

  mergeTemplateGraph: (graph) => {
    if (!graph.nodes.length && !graph.edges.length) return;
    get().pushHistory();
    set((state) => {
      const nodes = [
        ...state.nodes.map((node) => (node.selected ? { ...node, selected: false } : node)),
        ...graph.nodes.map((node) => ({ ...node, selected: true })),
      ];
      const edges = [
        ...state.edges.map((edge) => (edge.selected ? { ...edge, selected: false } : edge)),
        ...graph.edges.map((edge) => ({ ...edge, selected: false })),
      ];
      const reconciledNodes = reconcileNodeInputs(nodes, edges, state.nodeOutputByNodeId);
      return {
        nodes: reconciledNodes,
        edges,
        graphIndex: buildGraphIndex(reconciledNodes, edges, state.nodeOutputByNodeId),
        selectedNodeCount: countSelectedNodes(reconciledNodes),
        isDirty: true,
      };
    });
  },

  restoreGraphSnapshot: (graph) => {
    const viewport = graph.viewport ?? INITIAL_VIEWPORT;
    set((state) => {
      const nodes = graph.nodes.map((node) => ({
        ...node,
        selected: !!node.selected,
      }));
      const edges = graph.edges.map((edge) => ({
        ...edge,
        selected: false,
      }));
      const reconciledNodes = reconcileNodeInputs(nodes, edges, state.nodeOutputByNodeId);
      return {
        nodes: reconciledNodes,
        edges,
        graphIndex: buildGraphIndex(reconciledNodes, edges, state.nodeOutputByNodeId),
        selectedNodeCount: countSelectedNodes(reconciledNodes),
        viewport,
        contextMenu: null,
        activeImageTool: null,
        isDirty: true,
      };
    });
  },

  setNodeRuntimeOutputs: (outputs) => {
    set((state) => {
      const nodeOutputByNodeId = { ...state.nodeOutputByNodeId };
      const changedSourceIds = new Set<string>();
      for (const [nodeId, output] of Object.entries(outputs)) {
        changedSourceIds.add(nodeId);
        if (output) {
          nodeOutputByNodeId[nodeId] = output;
        } else {
          delete nodeOutputByNodeId[nodeId];
        }
      }
      const targetNodeIds = getRuntimeReconciliationTargetIds(
        state.nodes,
        state.edges,
        state.nodeOutputByNodeId,
        nodeOutputByNodeId,
        changedSourceIds,
      );
      const reconciledNodes = targetNodeIds.size > 0
        ? reconcileNodeInputs(state.nodes, state.edges, nodeOutputByNodeId, targetNodeIds)
        : state.nodes;
      const nodesChanged = reconciledNodes.some((node, index) => node !== state.nodes[index]);
      const nodes = nodesChanged ? reconciledNodes : state.nodes;
      return {
        nodeOutputByNodeId,
        nodes,
        graphIndex: buildGraphIndex(nodes, state.edges, nodeOutputByNodeId),
        latestGroupExecutionPlan: null,
        isDirty: nodesChanged ? true : state.isDirty,
      };
    });
  },

  setNodeRuntimeOutput: (nodeId, output) => {
    get().setNodeRuntimeOutputs({ [nodeId]: output });
  },

  updateNodeData: (nodeId, patch) => {
    set((state) => {
      const nodes = state.nodes.map((node) =>
        node.id === nodeId
          ? { ...node, data: { ...node.data, ...patch, updatedAt: Date.now() } }
          : node,
      );
      return {
        nodes,
        graphIndex: buildGraphIndex(nodes, state.edges, state.nodeOutputByNodeId),
        latestGroupExecutionPlan: null,
        isDirty: true,
      };
    });
  },

  updateProjectDirector3d: (director3d) => {
    set((state) => ({
      projectStudios: {
        ...state.projectStudios,
        director3d,
      },
      isDirty: true,
    }));
  },

  replaceNode: (nodeId, input) => {
    set((state) => {
      const nodes = state.nodes.map((node) => {
        if (node.id !== nodeId) return node;
        return {
          ...node,
          type: input.type ?? node.type,
          data: {
            ...node.data,
            ...input.data,
            kind: input.type ?? node.data.kind,
            updatedAt: Date.now(),
          },
        };
      });
      return {
        nodes,
        graphIndex: buildGraphIndex(nodes, state.edges, state.nodeOutputByNodeId),
        isDirty: true,
      };
    });
  },

  commitNodePositions: (nextNodes) => {
    const positionById = new Map(nextNodes.map((node) => [node.id, node]));
    set((state) => {
      let changed = false;
      const nodes = state.nodes.map((node) => {
        const next = positionById.get(node.id);
        if (!next) return node;
        const positionChanged =
          node.position.x !== next.position.x ||
          node.position.y !== next.position.y ||
          node.parentId !== next.parentId ||
          node.extent !== next.extent;
        const selectedChanged = !!node.selected !== !!next.selected;
        if (!positionChanged && !selectedChanged) return node;
        changed = true;
        return {
          ...node,
          position: next.position,
          positionAbsolute: next.positionAbsolute,
          parentId: next.parentId,
          extent: next.extent,
          selected: next.selected,
        };
      });
      if (!changed) return state;
      return {
        nodes,
        selectedNodeCount: countSelectedNodes(nodes),
        isDirty: true,
      };
    });
  },

  lockNode: (nodeId, locked) => {
    set((state) => {
      const nodes = state.nodes.map((node) =>
        node.id === nodeId ? { ...node, draggable: !locked, data: { ...node.data, locked } } : node,
      );
      return {
        nodes,
        graphIndex: buildGraphIndex(nodes, state.edges, state.nodeOutputByNodeId),
        isDirty: true,
      };
    });
  },

  connectNodes: (source, target, sourceHandle = "out", targetHandle = "in") => {
    get().onConnect({ source, sourceHandle, target, targetHandle });
  },

  removeNodesByIds: (nodeIds) => {
    const idSet = new Set(nodeIds);
    if (idSet.size === 0) return;
    get().pushHistory();
    set((state) => {
      const nodes = state.nodes.filter((node) => !idSet.has(node.id));
      const edges = state.edges.filter((edge) => !idSet.has(edge.source) && !idSet.has(edge.target));
      const indexedNodes = reconcileNodeInputs(nodes, edges, state.nodeOutputByNodeId);
      return {
        activeImageTool: state.activeImageTool && idSet.has(state.activeImageTool.nodeId) ? null : state.activeImageTool,
        edges,
        graphIndex: buildGraphIndex(indexedNodes, edges, state.nodeOutputByNodeId),
        isDirty: true,
        nodes: indexedNodes,
        selectedNodeCount: countSelectedNodes(indexedNodes),
      };
    });
  },

  removeEdgesByIds: (edgeIds) => {
    if (edgeIds.length === 0) return;
    const idSet = new Set(edgeIds);
    get().pushHistory();
    set((state) => {
      const edges = state.edges.filter((edge) => !idSet.has(edge.id));
      const nodes = reconcileNodeInputs(state.nodes, edges, state.nodeOutputByNodeId);
      return {
        edges,
        graphIndex: buildGraphIndex(nodes, edges, state.nodeOutputByNodeId),
        isDirty: true,
        nodes,
      };
    });
  },

  removeNodeInput: (targetNodeId, inputKey) => {
    const key = String(inputKey || '').trim();
    const target = get().nodes.find((node) => node.id === targetNodeId);
    if (!key || !target || (!isTextNode(target) && !isImageNode(target) && !isVideoNode(target))) return;
    const sourceNodeId = key.startsWith('upstream:') ? key.slice('upstream:'.length) : '';
    const assetId = key.startsWith('asset:') ? key.slice('asset:'.length) : '';
    if (!sourceNodeId && !assetId) return;
    const currentParams = isVideoNode(target) ? normalizeVideoGenerationParams(target.data).params : null;
    const inputExists = getUniqueInputKeys(target.data.inputOrder).includes(key)
      || getUniqueInputKeys(target.data.referenceOrder).includes(key)
      || (sourceNodeId
        ? get().edges.some((edge) => edge.source === sourceNodeId && edge.target === targetNodeId)
          || Boolean(currentParams?.referenceInputs.some((reference) => reference.source.kind === 'upstream' && reference.source.id === sourceNodeId))
        : Array.isArray(target.data.referenceAssetItemIds) && target.data.referenceAssetItemIds.some((id) => String(id) === assetId)
          || Boolean(currentParams?.referenceInputs.some((reference) => reference.source.kind === 'asset' && reference.source.id === assetId)));
    if (!inputExists) return;
    get().pushHistory();
    set((state) => {
      const edges = sourceNodeId
        ? state.edges.filter((edge) => !(edge.source === sourceNodeId && edge.target === targetNodeId))
        : state.edges;
      const nodes = state.nodes.map((node) => {
        if (node.id !== targetNodeId) return node;
        const inputOrder = getUniqueInputKeys(node.data.inputOrder).filter((item) => item !== key);
        const referenceOrder = getUniqueInputKeys(node.data.referenceOrder).filter((item) => item !== key);
        const referenceAssetItemIds = Array.isArray(node.data.referenceAssetItemIds)
          ? node.data.referenceAssetItemIds.filter((id) => String(id) !== assetId)
          : node.data.referenceAssetItemIds;
        if (!isVideoNode(node)) {
          return { ...node, data: { ...node.data, inputOrder, referenceOrder, referenceAssetItemIds, updatedAt: Date.now() } };
        }
        const params = normalizeVideoGenerationParams(node.data).params;
        const referenceInputs = params.referenceInputs.filter((reference) => (
          sourceNodeId
            ? !(reference.source.kind === 'upstream' && reference.source.id === sourceNodeId)
            : !(reference.source.kind === 'asset' && reference.source.id === assetId)
        )).map((reference, order) => ({ ...reference, order }));
        return {
          ...node,
          data: {
            ...node.data,
            inputOrder,
            referenceOrder,
            referenceAssetItemIds,
            params: { ...(node.data.params ?? {}), videoGeneration: { ...params, referenceInputs } },
            updatedAt: Date.now(),
          },
        };
      });
      const reconciledNodes = reconcileNodeInputs(nodes, edges, state.nodeOutputByNodeId);
      return {
        edges,
        graphIndex: buildGraphIndex(reconciledNodes, edges, state.nodeOutputByNodeId),
        isDirty: true,
        nodes: reconciledNodes,
      };
    });
  },

  removeTextNodeInputs: (targetNodeId) => {
    const target = get().nodes.find((node) => node.id === targetNodeId);
    if (!target || (!isTextNode(target) && !isImageNode(target) && !isVideoNode(target))) return;
    const nodesById = new Map(get().nodes.map((node) => [node.id, node]));
    const hasTextInput = get().edges.some((edge) => (
      edge.target === targetNodeId
      && getNodeReferenceInputKind(nodesById.get(edge.source), get().nodeOutputByNodeId[edge.source]) === 'text'
    ));
    if (!hasTextInput) return;
    get().pushHistory();
    set((state) => {
      const stateNodesById = new Map(state.nodes.map((node) => [node.id, node]));
      const edges = state.edges.filter((edge) => (
        edge.target !== targetNodeId
        || getNodeReferenceInputKind(stateNodesById.get(edge.source), state.nodeOutputByNodeId[edge.source]) !== 'text'
      ));
      const nodes = reconcileNodeInputs(state.nodes, edges, state.nodeOutputByNodeId, new Set([targetNodeId]));
      return {
        edges,
        graphIndex: buildGraphIndex(nodes, edges, state.nodeOutputByNodeId),
        isDirty: true,
        nodes,
      };
    });
  },

  reorderNodeInputs: (targetNodeId, inputKeys) => {
    const target = get().nodes.find((node) => node.id === targetNodeId);
    if (!target || (!isTextNode(target) && !isImageNode(target) && !isVideoNode(target))) return;
    const { textKeys, mediaKeys } = getNodeInputKeyPartitions(target, get().nodes, get().edges, get().nodeOutputByNodeId);
    const mediaKeySet = new Set(mediaKeys);
    const currentMediaKeys = getUniqueInputKeys(target.data.inputOrder).filter((key) => mediaKeySet.has(key));
    const mediaKinds = getNodeInputKeyKinds(target, get().nodes, get().edges, get().nodeOutputByNodeId);
    const requestedMediaKeys = getUniqueInputKeys(inputKeys).filter((key) => mediaKeySet.has(key));
    const requestedByKind = new Map<CanvasInputSeed['kind'], string[]>();
    requestedMediaKeys.forEach((key) => {
      const kind = mediaKinds.get(key);
      if (!kind) return;
      const keys = requestedByKind.get(kind) ?? [];
      keys.push(key);
      requestedByKind.set(kind, keys);
    });
    const currentByKind = new Map<CanvasInputSeed['kind'], string[]>();
    currentMediaKeys.forEach((key) => {
      const kind = mediaKinds.get(key);
      if (!kind) return;
      const keys = currentByKind.get(kind) ?? [];
      keys.push(key);
      currentByKind.set(kind, keys);
    });
    const queues = new Map<CanvasInputSeed['kind'], string[]>();
    currentByKind.forEach((keys, kind) => queues.set(kind, [
      ...(requestedByKind.get(kind) ?? []),
      ...keys.filter((key) => !(requestedByKind.get(kind) ?? []).includes(key)),
    ]));
    const reorderedMediaKeys = currentMediaKeys.map((key) => {
      const kind = mediaKinds.get(key);
      const queue = kind ? queues.get(kind) : undefined;
      return queue?.shift() ?? key;
    });
    const inputOrder = normalizeNodeInputOrder(
      reorderedMediaKeys,
      textKeys,
      mediaKeys,
    );
    const projectedNodes = get().nodes.map((node) => (
      node.id === targetNodeId ? { ...node, data: normalizeVideoReferenceInputOrder({ ...node.data, inputOrder }, inputOrder) } : node
    ));
    const projectedTarget = reconcileNodeInputs(projectedNodes, get().edges, get().nodeOutputByNodeId)
      .find((node) => node.id === targetNodeId);
    if (!projectedTarget || JSON.stringify(projectedTarget.data) === JSON.stringify(target.data)) return;
    get().pushHistory();
    set((state) => {
      const nodes = state.nodes.map((node) => (
        node.id === targetNodeId
          ? { ...node, data: { ...normalizeVideoReferenceInputOrder({ ...node.data, inputOrder }, inputOrder), updatedAt: Date.now() } }
          : node
      ));
      const reconciledNodes = reconcileNodeInputs(nodes, state.edges, state.nodeOutputByNodeId);
      return {
        graphIndex: buildGraphIndex(reconciledNodes, state.edges, state.nodeOutputByNodeId),
        isDirty: true,
        nodes: reconciledNodes,
      };
    });
  },

  selectNodesByIds: (nodeIds) => {
    const selectedIds = new Set(nodeIds);
    set((state) => {
      const nodes = state.nodes.map((node) => ({ ...node, selected: selectedIds.has(node.id) }));
      return {
        edges: state.edges.map((edge) => ({ ...edge, selected: false })),
        latestGroupExecutionPlan: null,
        nodes,
        selectedNodeCount: countSelectedNodes(nodes),
      };
    });
  },

  deleteSelectedEdges: () => {
    const hasSelected = get().edges.some((edge) => edge.selected);
    if (!hasSelected) return;
    get().pushHistory();
    set((state) => {
      const edges = state.edges.filter((edge) => !edge.selected);
      const nodes = reconcileNodeInputs(state.nodes, edges, state.nodeOutputByNodeId);
      return {
        edges,
        graphIndex: buildGraphIndex(nodes, edges, state.nodeOutputByNodeId),
        latestGroupExecutionPlan: null,
        isDirty: true,
        nodes,
      };
    });
  },

  selectAll: () => {
    set((state) => {
      const nodes = state.nodes.map((node) => ({ ...node, selected: true }));
      return {
        nodes,
        selectedNodeCount: nodes.length,
        latestGroupExecutionPlan: null,
        edges: state.edges.map((edge) => ({ ...edge, selected: true })),
      };
    });
  },

  deselectAll: () => {
    set((state) => ({
      nodes: state.nodes.map((node) => (node.selected ? { ...node, selected: false } : node)),
      selectedNodeCount: 0,
      edges: state.edges.map((edge) => (edge.selected ? { ...edge, selected: false } : edge)),
      latestGroupExecutionPlan: null,
    }));
  },

  pushHistory: () => {
    const { nodes, edges, history, historyIndex } = get();
    const trimmed = history.slice(0, historyIndex + 1);
    const next = [...trimmed, cloneHistoryEntry(nodes, edges)];
    if (next.length > MAX_HISTORY) next.shift();
    set({ history: next, historyIndex: next.length - 1 });
  },

  undo: () => {
    const { historyIndex, history } = get();
    if (historyIndex <= 0) return;
    const previous = history[historyIndex - 1];
    if (!previous) return;
    set({
      nodes: structuredClone(previous.nodes),
      edges: structuredClone(previous.edges),
      graphIndex: buildGraphIndex(previous.nodes, previous.edges, get().nodeOutputByNodeId),
      selectedNodeCount: countSelectedNodes(previous.nodes),
      historyIndex: historyIndex - 1,
      activeImageTool: null,
      isDirty: true,
    });
  },

  redo: () => {
    const { historyIndex, history } = get();
    if (historyIndex >= history.length - 1) return;
    const next = history[historyIndex + 1];
    if (!next) return;
    set({
      nodes: structuredClone(next.nodes),
      edges: structuredClone(next.edges),
      graphIndex: buildGraphIndex(next.nodes, next.edges, get().nodeOutputByNodeId),
      selectedNodeCount: countSelectedNodes(next.nodes),
      historyIndex: historyIndex + 1,
      activeImageTool: null,
      isDirty: true,
    });
  },

  setProjectTitle: (title) => set({ projectTitle: title, isDirty: true }),

  setBackendFlowBinding: (input) =>
    set((state) => ({
      backendCurrentVersionId:
        input.backendCurrentVersionId !== undefined
          ? input.backendCurrentVersionId
          : state.backendCurrentVersionId,
      backendFlowId:
        input.backendFlowId !== undefined
          ? input.backendFlowId
          : state.backendFlowId,
      backendProjectId:
        input.backendProjectId !== undefined
          ? input.backendProjectId
          : state.backendProjectId,
    })),

  loadProject: (project) => {
    const nodes = reconcileNodeInputs(resetStaleTextGenerationNodes(project.nodes || []), project.edges || []);
    const edges = project.edges || [];
    set({
      backendCurrentVersionId: project.backendCurrentVersionId ?? null,
      backendFlowId: project.backendFlowId ?? null,
      backendProjectId: project.backendProjectId ?? null,
      projectId: project.id,
      projectTitle: project.title || '未命名项目',
      nodes,
      edges,
      projectStudios: project.projectStudios ?? {},
      graphIndex: buildGraphIndex(nodes, edges, {}),
      selectedNodeCount: countSelectedNodes(nodes),
      viewport: project.viewport || INITIAL_VIEWPORT,
      version: project.version || 1,
      isDirty: false,
      history: [],
      historyIndex: -1,
      contextMenu: null,
      activeImageTool: null,
      currentRunId: null,
      isNodeDragging: false,
      isRunningBackendWorkflow: false,
      nodeOutputByNodeId: {},
      nodeRunIdByNodeId: {},
      nodeRunStatusByNodeId: {},
      workflowRunIdByNodeId: {},
      nodeIdByNodeRunId: {},
      runError: null,
      runEvents: [],
      runStatus: null,
      latestGroupExecutionPlan: null,
    });
  },

  getProjectSnapshot: () => {
    const {
      backendCurrentVersionId,
      backendFlowId,
      backendProjectId,
      projectId,
      projectTitle,
      nodes,
      edges,
      projectStudios,
      viewport,
      version,
    } = get();
    return {
      backendCurrentVersionId,
      backendFlowId,
      backendProjectId,
      id: projectId,
      title: projectTitle,
      nodes,
      edges,
      projectStudios,
      viewport,
      version,
      updatedAt: Date.now(),
    };
  },

  newProject: () => {
    set({
      backendCurrentVersionId: null,
      backendFlowId: null,
      backendProjectId: null,
      projectId: nanoid(12),
      projectTitle: '未命名项目',
      nodes: [],
      edges: [],
      projectStudios: {},
      graphIndex: EMPTY_GRAPH_INDEX,
      selectedNodeCount: 0,
      viewport: INITIAL_VIEWPORT,
      version: 1,
      isDirty: false,
      history: [],
      historyIndex: -1,
      contextMenu: null,
      activeImageTool: null,
      currentRunId: null,
      isNodeDragging: false,
      isRunningBackendWorkflow: false,
      nodeOutputByNodeId: {},
      nodeRunIdByNodeId: {},
      nodeRunStatusByNodeId: {},
      workflowRunIdByNodeId: {},
      nodeIdByNodeRunId: {},
      runError: null,
      runEvents: [],
      runStatus: null,
      latestGroupExecutionPlan: null,
    });
  },

  markDirty: () => set((state) => (state.isDirty ? state : { isDirty: true })),
  markClean: () => set({ isDirty: false, version: get().version + 1 }),
  setViewport: (viewport) => set({ viewport }),
  setNodeDragging: (dragging) => set((state) => (state.isNodeDragging === dragging ? state : { isNodeDragging: dragging })),

  toggleLeftPanel: () => set((state) => ({ leftPanelOpen: !state.leftPanelOpen })),
  setLeftPanelOpen: (open) => set((state) => (state.leftPanelOpen === open ? state : { leftPanelOpen: open })),
  openContextMenu: (x, y, nodeId) => set({ contextMenu: { x, y, nodeId }, activeImageTool: null }),
  closeContextMenu: () => set({ contextMenu: null }),
  openImageTool: (nodeId, tool) => set({ activeImageTool: { nodeId, tool }, contextMenu: null }),
  closeImageTool: () => set({ activeImageTool: null }),
  resetBackendRunState: () =>
    set((state) => ({
      currentRunId: null,
      isRunningBackendWorkflow: false,
      nodeOutputByNodeId: {},
      nodeRunIdByNodeId: {},
      nodeRunStatusByNodeId: {},
      workflowRunIdByNodeId: {},
      nodeIdByNodeRunId: {},
      graphIndex: buildGraphIndex(state.nodes, state.edges, {}),
      runError: null,
      runEvents: [],
      runStatus: null,
      latestGroupExecutionPlan: null,
    })),
}));
