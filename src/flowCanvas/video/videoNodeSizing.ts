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
  return fitMediaNodeToShortSide(Number(width), Number(height));
}

export function resolveVideoPreviewObjectFit(): 'contain' {
  return 'contain';
}
