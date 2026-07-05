import type { FlowStoryboardCell, FlowStoryboardData } from '../types';

export function getStoryboardGridCellCount(grid: unknown): number {
  if (grid === '2x2') return 4;
  if (grid === '3x3') return 9;
  return 6;
}

function normalizeAspect(value: unknown): FlowStoryboardData['aspect'] {
  return value === '1:1' || value === '4:3' || value === '9:16' ? value : '16:9';
}

function normalizeGrid(value: unknown): FlowStoryboardData['grid'] {
  return value === '2x2' || value === '3x3' ? value : '3x2';
}

function cleanCell(value: unknown, index: number): FlowStoryboardCell {
  const input = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const cell: FlowStoryboardCell = {
    id: typeof input.id === 'string' && input.id.trim() ? input.id.trim() : `storyboard-cell-${index + 1}`,
    shotNo: typeof input.shotNo === 'number' && Number.isFinite(input.shotNo)
      ? Math.max(1, Math.trunc(input.shotNo))
      : index + 1,
  };

  for (const key of ['title', 'prompt', 'assetId', 'sourceNodeId', 'sourceAssetId', 'directorCameraId', 'directorShotId'] as const) {
    const fieldValue = input[key];
    if (typeof fieldValue === 'string' && fieldValue.trim()) {
      cell[key] = fieldValue.trim();
    }
  }

  if (input.aspect === '1:1' || input.aspect === '4:3' || input.aspect === '16:9' || input.aspect === '9:16') {
    cell.aspect = input.aspect;
  }

  return cell;
}

export function normalizeStoryboardData(value: unknown): FlowStoryboardData {
  const input = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const grid = normalizeGrid(input.grid);
  const count = getStoryboardGridCellCount(grid);
  const sourceCells = Array.isArray(input.cells) ? input.cells : [];
  const selectedRaw = typeof input.selectedIndex === 'number' ? input.selectedIndex : 0;

  return {
    aspect: normalizeAspect(input.aspect),
    cells: Array.from({ length: count }, (_, index) => cleanCell(sourceCells[index], index)),
    ...(typeof input.composedAssetId === 'string' && input.composedAssetId.trim()
      ? { composedAssetId: input.composedAssetId.trim() }
      : {}),
    grid,
    selectedIndex: Math.min(Math.max(0, Math.trunc(selectedRaw)), count - 1),
  };
}

export function patchStoryboardCell(
  data: FlowStoryboardData,
  index: number,
  patch: Partial<FlowStoryboardCell>,
): FlowStoryboardData {
  const normalized = normalizeStoryboardData(data);
  return {
    ...normalized,
    cells: normalized.cells.map((cell, cellIndex) =>
      cellIndex === index ? cleanCell({ ...cell, ...patch }, cellIndex) : cell,
    ),
  };
}
