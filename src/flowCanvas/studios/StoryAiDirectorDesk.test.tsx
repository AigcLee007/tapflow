import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PerspectiveCamera, Scene } from 'three';

import type { FlowDirector3dData, FlowNodeData } from '../types';
import { StoryAiDirectorDesk } from './StoryAiDirectorDesk';

const hostBridgeMock = vi.hoisted(() => ({
  clear: vi.fn(),
  init: vi.fn(),
  postCaptures: vi.fn(),
}));

vi.mock('./storyai/editor/io/hostBridge', () => ({
  clearDirectorDeskHostBridge: hostBridgeMock.clear,
  initDirectorDeskHostBridge: hostBridgeMock.init,
  postDirectorDeskCapturesToHost: hostBridgeMock.postCaptures,
}));

vi.mock('@react-three/fiber', () => ({
  Canvas: function MockCanvas({
    className,
    onCreated,
    onPointerMissed,
  }: {
    className?: string;
    onCreated?: (input: { camera: PerspectiveCamera }) => void;
    onPointerMissed?: () => void;
  }) {
    React.useEffect(() => {
      onCreated?.({ camera: createTestCamera() });
    }, []);
    return <div className={className} data-testid="storyai-mock-r3f-canvas" onClick={() => onPointerMissed?.()} />;
  },
  useFrame: () => undefined,
  useLoader: () => null,
  useThree: () => ({
    camera: createTestCamera(),
    gl: {
      domElement: {
        clientHeight: 720,
        clientWidth: 1280,
        height: 720,
        toDataURL: () => 'data:image/png;base64,unit-test',
        width: 1280,
      },
      render: () => undefined,
      setClearColor: () => undefined,
    },
    scene: new Scene(),
    size: { height: 720, width: 1280 },
  }),
}));

vi.mock('@react-three/drei', () => ({
  GizmoHelper: ({ children }: { children?: React.ReactNode }) => <div data-testid="storyai-mock-gizmo">{children}</div>,
  GizmoViewport: () => <div data-testid="storyai-mock-gizmo-viewport" />,
  Grid: () => <div data-testid="storyai-mock-grid" />,
  Html: ({ children }: { children?: React.ReactNode }) => <div data-testid="storyai-mock-html">{children}</div>,
  Line: () => <div data-testid="storyai-mock-line" />,
  OrbitControls: () => <div data-testid="storyai-mock-orbit-controls" />,
  PerspectiveCamera: () => <div data-testid="storyai-mock-perspective-camera" />,
  TransformControls: ({ children }: { children?: React.ReactNode }) => (
    <div data-testid="storyai-mock-transform-controls">{children}</div>
  ),
}));

vi.mock('./storyai/editor/runtime/CharacterModel', () => ({
  CharacterModel: ({ objectId }: { objectId: string }) => (
    <div data-testid="storyai-mock-character-model" data-object-id={objectId} />
  ),
}));

describe('StoryAiDirectorDesk', () => {
  beforeEach(() => {
    hostBridgeMock.clear.mockClear();
    hostBridgeMock.init.mockClear();
    hostBridgeMock.postCaptures.mockClear();
  });

  it('initializes and clears the StoryAI host bridge like the reference app shell', () => {
    const { unmount } = render(
      <StoryAiDirectorDesk
        data={undefined}
        nodeId="director-node"
        onClose={() => undefined}
        onUpdateNodeData={() => undefined}
      />,
    );

    expect(hostBridgeMock.init).toHaveBeenCalledTimes(1);

    unmount();

    expect(hostBridgeMock.clear).toHaveBeenCalledTimes(1);
  });

  it('renders the StoryAI director layout instead of the legacy simplified viewport', () => {
    render(
      <StoryAiDirectorDesk
        data={undefined}
        nodeId="director-node"
        onClose={() => undefined}
        onUpdateNodeData={() => undefined}
      />,
    );

    expect(screen.getByTestId('storyai-director-desk')).toBeTruthy();
    expect(screen.getByTestId('storyai-director-left-sidebar')).toBeTruthy();
    expect(screen.getByTestId('storyai-director-right-sidebar')).toBeTruthy();
    expect(screen.getByTestId('storyai-director-canvas')).toBeTruthy();
    expect(screen.getByTestId('storyai-director-toolbar')).toBeTruthy();
    expect(screen.queryByTestId('director-three-viewport')).toBeNull();
  });

  it('persists StoryAI scene edits back to safe TapFlow director3d data', async () => {
    const onUpdateNodeData = vi.fn<(nodeId: string, patch: Partial<FlowNodeData>) => void>();

    render(
      <StoryAiDirectorDesk
        data={buildUnsafeDirectorData()}
        nodeId="director-node"
        onClose={() => undefined}
        onUpdateNodeData={onUpdateNodeData}
      />,
    );

    await waitFor(() => expect(screen.getByTestId('storyai-add-character')).toBeTruthy());
    await new Promise((resolve) => setTimeout(resolve, 0));

    fireEvent.click(screen.getByTestId('storyai-add-character'));
    fireEvent.click(screen.getByTestId('storyai-add-character-mannequin'));

    await waitFor(() => expect(onUpdateNodeData).toHaveBeenCalled());

    const [, patch] = onUpdateNodeData.mock.calls.at(-1) ?? [];
    expect(patch?.director3d?.actors.length).toBeGreaterThan(1);
    expect(JSON.stringify(patch?.director3d)).not.toMatch(/blob:|data:|https?:\/\//i);
  });
});

function buildUnsafeDirectorData(): FlowDirector3dData {
  return {
    version: 1,
    scene: {
      backgroundAssetId: 'https://example.com/not-safe.png',
      gridVisible: true,
      units: 'meters',
    },
    actors: [
      {
        id: 'actor-1',
        name: 'Actor 1',
        kind: 'image_plane',
        assetId: 'data:image/png;base64,not-safe',
        position: [0, 0, 0],
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
        visible: true,
        locked: false,
      },
    ],
    cameras: [
      {
        id: 'camera-1',
        name: 'Camera 1',
        position: [0, 2.2, 9],
        target: [0, 1.2, 0],
      },
    ],
    shots: [],
  };
}

function createTestCamera() {
  const camera = new PerspectiveCamera(50, 1280 / 720, 0.1, 1000);
  camera.position.set(0, 2.2, 9);
  camera.lookAt(0, 1.2, 0);
  camera.updateMatrixWorld();
  camera.updateProjectionMatrix();
  return camera;
}
