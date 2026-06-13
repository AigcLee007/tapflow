import type { FlowNodeData } from '../types';
import type { DerivedImageSourceType } from './persistDerivedImageAsset';

export type OptimisticDerivedImageInput = {
  aspectRatio: number;
  editType: string;
  imageUrl: string;
  metadata?: Record<string, unknown>;
  naturalHeight: number;
  naturalWidth: number;
  sourceAssetId?: string;
  title: string;
};

export type PersistedDerivedImagePatchInput = {
  lastEditType: string;
  naturalHeight: number;
  naturalWidth: number;
  nodeData: Partial<FlowNodeData>;
};

export function getDerivedImageSourceType(editType: string): DerivedImageSourceType {
  if (editType === 'split') return 'slice';
  if (editType === 'crop') return 'crop';
  if (editType === 'annotate') return 'annotation';
  if (editType === 'generated-result') return 'generated-result';
  if (editType === 'resize') return 'resize';
  return 'image-edit';
}

export function buildOptimisticDerivedImageNodeData(
  input: OptimisticDerivedImageInput,
): Partial<FlowNodeData> {
  const source = getDerivedImageSourceType(input.editType);
  return {
    aspectRatio: input.aspectRatio,
    errorMessage: undefined,
    generationStatus: 'generating',
    lastEditType: input.editType,
    metadata: serializeOptimisticMetadata({
      ...input.metadata,
      editType: input.editType,
    }),
    naturalHeight: input.naturalHeight,
    naturalWidth: input.naturalWidth,
    progress: 1,
    source,
    ...(input.sourceAssetId ? { sourceAssetId: input.sourceAssetId } : {}),
    status: 'running',
    thumbnailUrl: input.imageUrl,
    title: input.title,
  };
}

export function buildPersistedDerivedImagePatch(
  input: PersistedDerivedImagePatchInput,
): Partial<FlowNodeData> {
  return {
    ...input.nodeData,
    errorMessage: undefined,
    generationStatus: 'done',
    lastEditType: input.lastEditType,
    naturalHeight: input.naturalHeight,
    naturalWidth: input.naturalWidth,
    progress: 100,
    status: 'success',
  };
}

export function buildFailedDerivedImagePatch(error: unknown): Partial<FlowNodeData> {
  return {
    errorMessage: error instanceof Error ? error.message : 'Failed to save derived image',
    generationStatus: 'error',
    progress: 0,
    status: 'error',
  };
}

function serializeOptimisticMetadata(metadata: Record<string, unknown>) {
  const next: Record<string, string> = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (value === undefined || value === null) continue;
    if (typeof value === 'string') {
      next[key] = value;
    } else if (typeof value === 'number' || typeof value === 'boolean') {
      next[key] = String(value);
    } else {
      next[key] = JSON.stringify(value);
    }
  }
  return next;
}
