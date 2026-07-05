import type { FlowDirector3dData, FlowStoryboardData } from '../types';
import { normalizeStoryboardData, patchStoryboardCell } from './storyboardNodeData';

type DirectorCamera = FlowDirector3dData['cameras'][number];
type DirectorShot = FlowDirector3dData['shots'][number];

interface BuildStoryboardPatchFromDirectorShotInput {
  camera: DirectorCamera;
  shot: DirectorShot;
  shotIndex: number;
  sourceDirectorNodeId: string;
  storyboard: FlowStoryboardData;
}

function findStoryboardCellIndex(storyboard: FlowStoryboardData, shot: DirectorShot) {
  if (shot.targetStoryboardCellId) {
    const targetIndex = storyboard.cells.findIndex((cell) => cell.id === shot.targetStoryboardCellId);
    if (targetIndex >= 0) return targetIndex;
  }

  const emptyIndex = storyboard.cells.findIndex(
    (cell) => !cell.assetId && !cell.prompt && !cell.directorShotId,
  );
  return emptyIndex >= 0 ? emptyIndex : storyboard.selectedIndex;
}

export function buildStoryboardPatchFromDirectorShot({
  camera,
  shot,
  shotIndex,
  sourceDirectorNodeId,
  storyboard,
}: BuildStoryboardPatchFromDirectorShotInput): FlowStoryboardData {
  const normalized = normalizeStoryboardData(storyboard);
  const cellIndex = findStoryboardCellIndex(normalized, shot);
  const prompt =
    shot.prompt ||
    camera.prompt ||
    `基于 ${camera.name || `镜头 ${shotIndex + 1}`} 规划分镜画面`;
  const cameraName = shot.cameraSnapshot?.name || camera.name || camera.id;
  const patched = patchStoryboardCell(normalized, cellIndex, {
    aspect: normalized.aspect,
    directorCameraId: camera.id,
    directorShotId: shot.id,
    prompt,
    sourceNodeId: sourceDirectorNodeId,
    title: `镜头 ${shotIndex + 1} · ${cameraName}`,
  });

  return {
    ...patched,
    selectedIndex: cellIndex,
  };
}
