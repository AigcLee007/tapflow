import { describe, expect, it } from 'vitest';

import type { FlowDirector3dData, FlowStoryboardData } from '../types';
import { buildStoryboardPatchFromDirectorShot } from './storyboardDirectorSync';

const camera: FlowDirector3dData['cameras'][number] = {
  id: 'camera-1',
  name: '主镜头',
  position: [0, 2, 6],
  target: [0, 1, 0],
  prompt: '俯拍建立空间关系',
};

const shot: FlowDirector3dData['shots'][number] = {
  id: 'shot-1',
  cameraId: 'camera-1',
  startMs: 0,
  durationMs: 3000,
  motion: 'static',
  prompt: '镜头缓慢推进',
  targetStoryboardCellId: 'cell-2',
};

const storyboard: FlowStoryboardData = {
  aspect: '16:9',
  grid: '3x2',
  selectedIndex: 0,
  cells: [
    { id: 'cell-1', shotNo: 1, title: '开场', prompt: '已有提示词' },
    { id: 'cell-2', shotNo: 2 },
    { id: 'cell-3', shotNo: 3 },
    { id: 'cell-4', shotNo: 4 },
    { id: 'cell-5', shotNo: 5 },
    { id: 'cell-6', shotNo: 6 },
  ],
};

describe('storyboardDirectorSync', () => {
  it('patches the target storyboard cell from a director shot', () => {
    const result = buildStoryboardPatchFromDirectorShot({
      camera,
      shot,
      shotIndex: 0,
      sourceDirectorNodeId: 'director-node',
      storyboard,
    });

    expect(result.selectedIndex).toBe(1);
    expect(result.cells[1]).toMatchObject({
      id: 'cell-2',
      shotNo: 2,
      title: '镜头 1 · 主镜头',
      prompt: '镜头缓慢推进',
      directorCameraId: 'camera-1',
      directorShotId: 'shot-1',
      sourceNodeId: 'director-node',
      aspect: '16:9',
    });
    expect(JSON.stringify(result)).not.toMatch(/blob:|data:/);
  });

  it('uses the first empty storyboard cell when the shot has no target cell', () => {
    const result = buildStoryboardPatchFromDirectorShot({
      camera,
      shot: { ...shot, prompt: undefined, targetStoryboardCellId: undefined },
      shotIndex: 1,
      sourceDirectorNodeId: 'director-node',
      storyboard,
    });

    expect(result.selectedIndex).toBe(1);
    expect(result.cells[1]).toMatchObject({
      id: 'cell-2',
      shotNo: 2,
      title: '镜头 2 · 主镜头',
      prompt: '俯拍建立空间关系',
      directorCameraId: 'camera-1',
      directorShotId: 'shot-1',
      sourceNodeId: 'director-node',
    });
    expect(result.cells[0]).toMatchObject({ title: '开场', prompt: '已有提示词' });
    expect(JSON.stringify(result)).not.toMatch(/blob:|data:/);
  });

  it('uses captured camera snapshot naming for storyboard cell titles', () => {
    const result = buildStoryboardPatchFromDirectorShot({
      camera: { ...camera, name: '当前已移动镜头' },
      shot: {
        ...shot,
        cameraSnapshot: {
          name: '捕获时镜头',
          position: [0, 2, 5],
          target: [0, 1, 0],
          focalMm: 55,
        },
        prompt: undefined,
        targetStoryboardCellId: undefined,
      },
      shotIndex: 2,
      sourceDirectorNodeId: 'director-node',
      storyboard,
    });

    expect(result.cells[1]).toMatchObject({
      directorCameraId: 'camera-1',
      directorShotId: 'shot-1',
      prompt: '俯拍建立空间关系',
      title: '镜头 3 · 捕获时镜头',
    });
    expect(JSON.stringify(result)).not.toMatch(/blob:|data:/);
  });
});
