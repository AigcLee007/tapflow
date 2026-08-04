import {
  fitMediaNodeToShortSide,
  getMediaNodeSizeFromRatioString,
} from '../utils/nodeSizing';

export type VideoNodeSize = { width: number; height: number };

export function getVideoNodeSizeForRequestedRatio(ratio: unknown): VideoNodeSize {
  return getMediaNodeSizeFromRatioString(ratio, 16 / 9);
}

export function getVideoNodeSizeForNaturalDimensions(
  width: unknown,
  height: unknown,
): VideoNodeSize {
  const naturalWidth = Number(width);
  const naturalHeight = Number(height);
  if (!Number.isFinite(naturalWidth) || !Number.isFinite(naturalHeight) || naturalWidth <= 0 || naturalHeight <= 0) {
    return getVideoNodeSizeForRequestedRatio('16:9');
  }
  return fitMediaNodeToShortSide(naturalWidth, naturalHeight);
}

export function resolveVideoPreviewObjectFit(): 'contain' {
  return 'contain';
}
