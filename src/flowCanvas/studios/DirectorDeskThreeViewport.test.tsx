import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { DirectorDeskThreeViewport } from './DirectorDeskThreeViewport';

describe('DirectorDeskThreeViewport', () => {
  it('renders a director viewport host with actor and camera metadata', () => {
    render(
      <DirectorDeskThreeViewport
        actors={[
          {
            id: 'actor-1',
            name: '角色 A',
            kind: 'placeholder_humanoid',
            position: [0, 0, 0],
            rotation: [0, 0, 0],
            scale: [1, 1, 1],
            visible: true,
            locked: false,
          },
        ]}
        cameras={[
          {
            id: 'camera-1',
            name: '主镜头',
            position: [0, 2, 6],
            target: [0, 1, 0],
          },
        ]}
        shots={[]}
        selectedId="actor-1"
        selectedType="actor"
      />,
    );

    const viewport = screen.getByTestId('director-three-viewport');
    expect(viewport.getAttribute('data-actor-count')).toBe('1');
    expect(viewport.getAttribute('data-camera-count')).toBe('1');
    expect(viewport.getAttribute('data-selected-id')).toBe('actor-1');
  });

  it('renders director shot metadata from captured camera snapshots', () => {
    render(
      <DirectorDeskThreeViewport
        actors={[]}
        cameras={[
          {
            id: 'camera-1',
            name: 'A camera',
            position: [0, 2, 6],
            target: [0, 1, 0],
          },
        ]}
        shots={[
          {
            id: 'shot-1',
            cameraId: 'camera-1',
            startMs: 0,
            durationMs: 3000,
            motion: 'static',
          },
          {
            id: 'shot-2',
            cameraId: 'camera-1',
            startMs: 3000,
            durationMs: 4200,
            motion: 'orbit',
            cameraSnapshot: {
              name: 'Captured orbit',
              position: [1.5, 2.25, 4.75],
              target: [0, 1.1, 0],
              focalMm: 55,
            },
          },
        ]}
        selectedId="shot-2"
        selectedType="shot"
      />,
    );

    const viewport = screen.getByTestId('director-three-viewport');
    expect(viewport.getAttribute('data-shot-count')).toBe('2');
    expect(viewport.getAttribute('data-selected-shot-id')).toBe('shot-2');
    expect(viewport.getAttribute('data-selected-shot-camera-position')).toBe('1.5,2.25,4.75');
    expect(screen.getByText('Captured orbit')).toBeTruthy();
  });

  it('keeps scene background selection metadata in the viewport host', () => {
    render(
      <DirectorDeskThreeViewport
        actors={[]}
        cameras={[]}
        shots={[]}
        selectedId="background"
        selectedType="scene"
      />,
    );

    const viewport = screen.getByTestId('director-three-viewport');
    expect(viewport.getAttribute('data-selected-id')).toBe('background');
  });
});
