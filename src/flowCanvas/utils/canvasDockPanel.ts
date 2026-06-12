export type CanvasDockPanelId = 'assets' | 'templates' | 'comments' | 'history';

export type CanvasDockDrawerLayoutInput = {
  dockLeft: number;
  viewportWidth: number;
  viewportHeight: number;
};

export type CanvasDockDrawerLayout = {
  left: number;
  top: number;
  width: number;
  maxHeight: number;
};

export type CanvasDockBadge = {
  count?: number;
  tone: 'count' | 'dot';
} | null;

export type CanvasDockBadgeInput = {
  assetTotal: number;
  historySnapshotCount: number;
  unresolvedCommentCount: number;
};

const DOCK_VISUAL_WIDTH = 42;
const DRAWER_GAP = 8;
const SAFE_MARGIN = 24;
const DEFAULT_WIDTH = 320;
const MAX_WIDTH = 360;

export function getCanvasDockDrawerLayout(input: CanvasDockDrawerLayoutInput): CanvasDockDrawerLayout {
  const left = input.dockLeft + DOCK_VISUAL_WIDTH + DRAWER_GAP;
  const availableWidth = Math.max(240, input.viewportWidth - left - SAFE_MARGIN);
  const width = Math.min(MAX_WIDTH, DEFAULT_WIDTH, availableWidth);

  return {
    left,
    top: SAFE_MARGIN,
    width,
    maxHeight: Math.max(320, input.viewportHeight - SAFE_MARGIN * 2),
  };
}

export function getCanvasDockBadge(
  panelId: CanvasDockPanelId,
  input: CanvasDockBadgeInput,
): CanvasDockBadge {
  if (panelId === 'assets') {
    return input.assetTotal > 0 ? { tone: 'dot' } : null;
  }

  if (panelId === 'comments') {
    return input.unresolvedCommentCount > 0
      ? {
          count: input.unresolvedCommentCount,
          tone: 'count',
        }
      : null;
  }

  if (panelId === 'history') {
    return input.historySnapshotCount > 0 ? { tone: 'dot' } : null;
  }

  return null;
}
