import type { Node } from '@xyflow/react';
import type { FlowNodeData, FlowNodeKind } from '../types';

export type FlowConnectionAction = {
  kind: Extract<FlowNodeKind, 'text' | 'image' | 'video' | 'audio' | 'panorama_viewer'>;
  label: string;
  desc?: string;
  promptSeed?: string;
};

type FlowNodeLike = Pick<Node<FlowNodeData>, 'type' | 'data'> & Partial<Pick<Node<FlowNodeData>, 'id'>>;

export const getFlowNodeKind = (node?: FlowNodeLike | null): FlowNodeKind | undefined => {
  if (!node) return undefined;
  return (node.data?.kind || node.type) as FlowNodeKind | undefined;
};

export const isUploadedImageNode = (node?: FlowNodeLike | null) => {
  if (!node) return false;
  const data = node.data || {};
  return (
    getFlowNodeKind(node) === 'image'
    && (!!data.thumbnailUrl || !!data.assetId || (Array.isArray(data.assetIds) && data.assetIds.length > 0))
    && !data.lastGenerationSnapshot
    && !data.editSourceNodeId
    && !data.lastEditType
  );
};

export const canNodeReceiveIncoming = (node?: FlowNodeLike | null) => {
  if (!node) return false;
  return !isUploadedImageNode(node);
};

const ALLOWED_TARGETS_BY_SOURCE: Record<string, FlowConnectionAction[]> = {
  text: [
    { kind: 'text', label: '文本生成', desc: '续写、改写或扩写文案' },
    { kind: 'image', label: '图片生成', desc: '根据文本生成图片' },
    { kind: 'video', label: '视频生成', desc: '根据文本生成视频' },
  ],
  image: [
    { kind: 'text', label: '图片分析', desc: '识别图片内容并反推提示词', promptSeed: '分析这张图片，并提炼可复用的生成提示词。' },
    { kind: 'image', label: '图片生成', desc: '图生图或继续编辑图片' },
    { kind: 'video', label: '视频生成', desc: '基于图片生成视频' },
    { kind: 'panorama_viewer', label: '360 全景查看', desc: '在全景查看器中查看这张图片' },
  ],
  video: [
    { kind: 'video', label: "\u89c6\u9891\u53c2\u8003", desc: "\u5c06\u52a8\u4f5c\u6216\u8fd0\u955c\u4f5c\u4e3a\u89c6\u9891\u751f\u6210\u53c2\u8003" },
    { kind: 'text', label: '视频分析', desc: '理解视频内容并提炼脚本', promptSeed: '分析这个视频，提炼画面内容、镜头信息和可复用提示词。' },
  ],
  audio: [
    { kind: 'video', label: "\u97f3\u9891\u53c2\u8003", desc: "\u5c06\u97f3\u9891\u4f5c\u4e3a\u89c6\u9891\u751f\u6210\u53c2\u8003" },
    { kind: 'text', label: '\u97f3\u9891\u5206\u6790', desc: '\u8bc6\u522b\u97f3\u9891\u5185\u5bb9\u5e76\u751f\u6210\u6587\u672c' },
  ],
};

const ALLOWED_SOURCES_BY_TARGET: Record<string, string[]> = {
  text: ['text', 'image', 'video', 'audio'],
  image: ['text', 'image'],
  panorama_viewer: ['image'],
  video: ['text', 'image', 'video', 'audio'],
};

export const getConnectionActionsForSource = (source?: FlowNodeLike | null): FlowConnectionAction[] => {
  const sourceKind = getFlowNodeKind(source);
  return sourceKind ? ALLOWED_TARGETS_BY_SOURCE[sourceKind] || [] : [];
};

export const canCreateNodeFromSource = (source: FlowNodeLike | null | undefined, targetKind: FlowNodeKind) =>
  getConnectionActionsForSource(source).some((action) => action.kind === targetKind);

export const getConnectionAction = (
  source: FlowNodeLike | null | undefined,
  targetKind: FlowNodeKind,
) => getConnectionActionsForSource(source).find((action) => action.kind === targetKind);

export const canConnectFlowNodes = (
  source?: FlowNodeLike | null,
  target?: FlowNodeLike | null,
): { ok: boolean; reason?: string } => {
  const sourceKind = getFlowNodeKind(source);
  const targetKind = getFlowNodeKind(target);
  if (!source || !target || !sourceKind || !targetKind) {
    return { ok: false, reason: '连接节点不存在' };
  }
  if (source === target || (!!source.id && source.id === target.id)) {
    return { ok: false, reason: '不能连接到自身' };
  }
  if (!canNodeReceiveIncoming(target)) {
    return { ok: false, reason: '上传图片节点不接受传入连接' };
  }
  if (!canCreateNodeFromSource(source, targetKind)) {
    return { ok: false, reason: `${sourceKind} 节点不能连接到 ${targetKind} 节点` };
  }
  const allowedSources = ALLOWED_SOURCES_BY_TARGET[targetKind] || [];
  if (!allowedSources.includes(sourceKind)) {
    return { ok: false, reason: `${targetKind} 节点不接受 ${sourceKind} 节点传入` };
  }
  return { ok: true };
};
