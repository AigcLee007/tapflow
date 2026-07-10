import type { FlowNodeData } from '../types';
import {
  PANORAMA_DEFAULT_ASPECT_RATIO,
  PANORAMA_DEFAULT_PROJECTION,
  PANORAMA_GENERATION_MODE,
  PANORAMA_MEDIA_KIND,
  PANORAMA_SUPPORTED_ASPECT_RATIOS,
  type PanoramaAssetMetadata,
} from './panoramaTypes';

type MetadataLike = Record<string, unknown> | Record<string, string> | null | undefined;

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function readRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

export function isPanoramaAspectRatio(value: unknown): value is string {
  return PANORAMA_SUPPORTED_ASPECT_RATIOS.includes(String(value || '').trim() as typeof PANORAMA_SUPPORTED_ASPECT_RATIOS[number]);
}

export function resolvePanoramaAspectRatio(value: unknown): string {
  return isPanoramaAspectRatio(value) ? String(value).trim() : PANORAMA_DEFAULT_ASPECT_RATIO;
}

export function buildPanoramaGenerationPrompt(_sourcePrompt: unknown, aspectRatio: unknown): string {
  const outputRatio = resolvePanoramaAspectRatio(aspectRatio);

  return [
    '360 panorama generation requirements:',
    '- Use the connected reference image as the only scene source; do not copy or reinterpret the source node text prompt.',
    `- Output aspect ratio: ${outputRatio}.`,
    '- Create a full 360-degree equirectangular panorama of the same scene from one fixed camera point.',
    '- The left edge and right edge must connect seamlessly as the same physical direction with no visible break.',
    '- Preserve the reference image identity, art style, lighting, material treatment, horizon height, and important fixed fixtures.',
    '- Extend the unseen environment around the viewer; do not make a flat wide-angle image, ordinary landscape crop, or single-camera shot.',
    '- Avoid duplicating unique objects, signs, doors, lights, characters, or props at the seam.',
    '- Keep the scene consistent, spatially continuous, and suitable for a 360 panorama viewer.',
  ].join('\n');
}

export function isPanoramaMetadata(value: MetadataLike): value is PanoramaAssetMetadata {
  const metadata = value || {};
  return readString((metadata as Record<string, unknown>).mediaKind) === PANORAMA_MEDIA_KIND
    || readString((metadata as Record<string, unknown>).generationMode) === PANORAMA_GENERATION_MODE;
}

export function buildPanoramaMetadata(input: {
  aspectRatio?: unknown;
  generationMode?: unknown;
  projection?: unknown;
}): Record<string, string> | undefined {
  const generationMode = readString(input.generationMode);
  if (generationMode !== PANORAMA_GENERATION_MODE) {
    return undefined;
  }
  return {
    aspectRatio: resolvePanoramaAspectRatio(input.aspectRatio),
    generationMode: PANORAMA_GENERATION_MODE,
    mediaKind: PANORAMA_MEDIA_KIND,
    projection: readString(input.projection) || PANORAMA_DEFAULT_PROJECTION,
  };
}

export function mergePanoramaMetadata(
  current: MetadataLike,
  next: MetadataLike,
): Record<string, string> | undefined {
  if (!next) {
    return current ? { ...(current as Record<string, string>) } : undefined;
  }
  return {
    ...(current ? current as Record<string, string> : {}),
    ...(next as Record<string, string>),
  };
}

export function isPanoramaNodeData(data: Partial<FlowNodeData> | null | undefined): boolean {
  if (!data) return false;
  if (isPanoramaMetadata(data.metadata)) return true;
  if (readString(data.generationMode) === PANORAMA_GENERATION_MODE) return true;
  const snapshot = readRecord(data.lastGenerationSnapshot);
  return readString(snapshot?.generationMode) === PANORAMA_GENERATION_MODE;
}

export function getPanoramaSourceUrl(data: Partial<FlowNodeData> | null | undefined): string {
  if (!data) return '';
  const generatedResults = Array.isArray(data.generatedResults)
    ? data.generatedResults as Array<{ url?: string }>
    : [];
  return readString(data.originalImageUrl)
    || readString(data.thumbnailUrl)
    || readString(generatedResults[0]?.url)
    || '';
}

export function getPanoramaParams(data: Partial<FlowNodeData> | null | undefined): {
  aspectRatio: string;
  projection: string;
} {
  const params = readRecord(data?.params);
  const panorama = readRecord(params?.panorama);
  const metadata = data?.metadata || {};
  return {
    aspectRatio: resolvePanoramaAspectRatio(
      readString((metadata as Record<string, unknown>).aspectRatio)
      || readString(params?.aspectRatio)
      || readString(params?.aspect_ratio),
    ),
    projection: readString((metadata as Record<string, unknown>).projection)
      || readString(panorama?.projectionHint)
      || PANORAMA_DEFAULT_PROJECTION,
  };
}

export function isPanoramaAssetLike(asset: {
  kind?: string | null;
  metadata?: Record<string, string> | null;
  mimeType?: string | null;
} | null | undefined): boolean {
  if (!asset) return false;
  return isPanoramaMetadata(asset.metadata)
    && String(asset.kind || '').trim() === 'image'
    && String(asset.mimeType || '').startsWith('image/');
}
