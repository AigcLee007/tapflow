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

  it('preserves safe StoryAI project state while stripping transient media urls', () => {
    const data = normalizeDirector3dData({
      storyAiProject: {
        version: 1,
        scene: {
          backgroundColor: '#203040',
          showLabels: false,
          snapToGrid: true,
          showGround: false,
          groundOpacity: 0.18,
          groundHeight: -1.25,
          panoramaYaw: 45,
          panoramaRadius: 90,
        },
        assets: [
          {
            id: 'asset_1',
            kind: 'panorama',
            sourceType: 'image',
            fileName: 'studio.png',
            url: 'blob:live-panorama',
            projectionMode: 'equirectangular',
          },
        ],
        objects: [
          {
            id: 'char_default_a',
            name: '角色01',
            kind: 'character',
            color: '#ff3355',
            visible: true,
            locked: false,
            transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
          },
          {
            id: 'cam_object_1',
            name: '机位01',
            kind: 'camera',
            visible: false,
            locked: false,
            linkedCameraId: 'cam_1',
            transform: { position: [0, 2.2, 9], rotation: [0, 0, 0], scale: [1, 1, 1] },
          },
        ],
        cameras: [
          {
            id: 'cam_1',
            name: '机位01',
            fov: 50,
            transform: { position: [0, 2.2, 9], rotation: [0, 0, 0], scale: [1, 1, 1] },
            targetMode: 'manual',
            target: [0, 1.2, 0],
            lastCaptureUrl: 'data:image/png;base64,live',
            captures: [{ id: 'capture_1', dataUrl: 'data:image/png;base64,live' }],
          },
        ],
        activeCameraId: 'cam_1',
        panoramaAssetId: 'asset_1',
      },
      actors: [],
      cameras: [],
      shots: [],
    } as any);

    expect(data.storyAiProject).toMatchObject({
      version: 1,
      scene: {
        backgroundColor: '#203040',
        showLabels: false,
        snapToGrid: true,
        showGround: false,
        groundOpacity: 0.18,
        groundHeight: -1.25,
        panoramaYaw: 45,
        panoramaRadius: 90,
      },
      assets: [
        {
          id: 'asset_1',
          kind: 'panorama',
          sourceType: 'image',
          fileName: 'studio.png',
          projectionMode: 'equirectangular',
        },
      ],
      objects: [
        {
          id: 'char_default_a',
          color: '#ff3355',
        },
        {
          id: 'cam_object_1',
          visible: false,
        },
      ],
      activeCameraId: 'cam_1',
      panoramaAssetId: 'asset_1',
    });
    expect(JSON.stringify(data.storyAiProject)).not.toMatch(/blob:|data:|https?:\/\//);
  });
});
