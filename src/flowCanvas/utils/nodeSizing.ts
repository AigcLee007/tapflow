export const FLOW_NODE_BASE_SIZE = 170;

export const FLOW_NODE_DEFAULT_SIZES = {
  text: { width: FLOW_NODE_BASE_SIZE, height: FLOW_NODE_BASE_SIZE },
  image: { width: 260, height: 210 },
  video: { width: 302, height: 170 },
  audio: { width: 302, height: 170 },
  upload: { width: 260, height: 210 },
  imageEditor: { width: FLOW_NODE_BASE_SIZE, height: FLOW_NODE_BASE_SIZE },
  storyboard: { width: 360, height: 260 },
  director3d: { width: 340, height: 220 },
  videoEditor: { width: 360, height: 220 },
};

export function parseAspectRatio(ratio: unknown): number | null {
  if (typeof ratio === 'number' && Number.isFinite(ratio) && ratio > 0) {
    return ratio;
  }

  const match = String(ratio || '').match(/^\s*(\d+(?:\.\d+)?)\s*:\s*(\d+(?:\.\d+)?)\s*$/);
  if (!match) return null;

  const width = Number(match[1]);
  const height = Number(match[2]);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return null;
  }

  return width / height;
}

export function fitMediaNodeToShortSide(
  naturalWidth: number,
  naturalHeight: number,
  baseSize = FLOW_NODE_BASE_SIZE,
) {
  if (
    !Number.isFinite(naturalWidth) ||
    !Number.isFinite(naturalHeight) ||
    naturalWidth <= 0 ||
    naturalHeight <= 0
  ) {
    return { width: baseSize, height: baseSize };
  }

  return getMediaNodeSizeFromAspectRatio(naturalWidth / naturalHeight, baseSize);
}

export function getMediaNodeSizeFromAspectRatio(
  aspectRatio: number | null | undefined,
  baseSize = FLOW_NODE_BASE_SIZE,
) {
  if (!Number.isFinite(aspectRatio) || !aspectRatio || aspectRatio <= 0) {
    return { width: baseSize, height: baseSize };
  }

  if (aspectRatio >= 1) {
    return {
      width: Math.round(baseSize * aspectRatio),
      height: baseSize,
    };
  }

  return {
    width: baseSize,
    height: Math.round(baseSize / aspectRatio),
  };
}

export function getMediaNodeSizeFromRatioString(
  ratio: unknown,
  fallbackAspectRatio = 1,
  baseSize = FLOW_NODE_BASE_SIZE,
) {
  return getMediaNodeSizeFromAspectRatio(parseAspectRatio(ratio) || fallbackAspectRatio, baseSize);
}
