import { describe, expect, it } from 'vitest';

import { normalizeDirector3dData } from './director3dNodeData';

describe('director3dNodeData', () => {
  it('normalizes malformed director drafts and strips transient media references', () => {
    const data = normalizeDirector3dData({
      scene: {
        backgroundAssetId: 'blob:scene-bg',
        gridVisible: false,
        units: 'feet',
      },
      actors: [
        {
          id: ' actor-1 ',
          name: ' Hero ',
          kind: 'image_plane',
          assetId: 'data:image/png;base64,bad',
          position: [1, 'bad', 3],
          rotation: ['bad', 45, null],
          scale: [0, 2, Number.POSITIVE_INFINITY],
          visible: true,
          locked: 'yes',
          pose: ' standing ',
          poseControls: {
            ' leftHip.pitch ': 68,
            'rightKnee.bend': 80,
            bad: 'nope',
          },
        },
      ],
      cameras: [
        {
          id: '',
          name: ' A Camera ',
          position: [0, 2, Number.NaN],
          target: [0, null, 0],
          focalMm: 500,
          fov: -1,
          durationMs: -400,
          prompt: ' low angle ',
        },
      ],
      shots: [
        {
          id: ' shot-1 ',
          cameraId: '',
          cameraSnapshot: {
            name: ' Snapshot ',
            position: ['bad', 2.5, 5],
            target: [0, 1, undefined],
            focalMm: Number.NaN,
            fov: 60,
          },
          startMs: -100,
          durationMs: 2500.6,
          motion: 'orbit',
          prompt: ' push in ',
          generatedAssetId: 'https://signed.example.com/output.png',
          generatedSourceNodeId: ' image-node-1 ',
        },
      ],
    } as any);

    expect(data).toMatchObject({
      version: 1,
      scene: {
        gridVisible: false,
        units: 'meters',
      },
      actors: [
        {
          id: 'actor-1',
          name: 'Hero',
          kind: 'image_plane',
          position: [1, 0, 3],
          rotation: [0, 45, 0],
          scale: [0.1, 2, 1],
          visible: true,
          locked: false,
          pose: 'standing',
          poseControls: {
            'leftHip.pitch': 68,
            'rightKnee.bend': 80,
          },
        },
      ],
      cameras: [
        {
          id: 'camera-1',
          name: 'A Camera',
          position: [0, 2, 5],
          target: [0, 1, 0],
          focalMm: 300,
          durationMs: 0,
          prompt: 'low angle',
        },
      ],
      shots: [
        {
          id: 'shot-1',
          cameraId: 'camera-1',
          cameraSnapshot: {
            name: 'Snapshot',
            position: [0, 2.5, 5],
            target: [0, 1, 0],
            fov: 60,
          },
          startMs: 0,
          durationMs: 2501,
          motion: 'orbit',
          prompt: 'push in',
          generatedSourceNodeId: 'image-node-1',
        },
      ],
    });
    expect(data.scene.backgroundAssetId).toBeUndefined();
    expect(data.actors[0]?.assetId).toBeUndefined();
    expect(data.shots[0]?.generatedAssetId).toBeUndefined();
    expect(JSON.stringify(data)).not.toMatch(/blob:|data:|https?:\/\//);
  });

  it('normalizes unsafe director reference ids away', () => {
    const data = normalizeDirector3dData({
      actors: [
        {
          id: 'blob:actor-id',
          name: 'Unsafe actor id',
          kind: 'placeholder_humanoid',
        },
      ],
      cameras: [
        {
          id: 'https://signed.example.com/camera-id',
          name: 'Camera URL id',
        },
      ],
      shots: [
        {
          id: 'data:shot-id',
          cameraId: 'https://signed.example.com/camera-id',
          generatedSourceNodeId: 'blob:image-node-id',
          targetStoryboardCellId: 'data:storyboard-cell-id',
        },
      ],
    } as any);

    expect(data.actors[0]?.id).toBe('actor-1');
    expect(data.cameras[0]?.id).toBe('camera-1');
    expect(data.shots[0]).toMatchObject({
      id: 'shot-1',
      cameraId: 'camera-1',
    });
    expect(data.shots[0]?.generatedSourceNodeId).toBeUndefined();
    expect(data.shots[0]?.targetStoryboardCellId).toBeUndefined();
    expect(JSON.stringify(data)).not.toMatch(/blob:|data:|https?:\/\//);
  });
});
