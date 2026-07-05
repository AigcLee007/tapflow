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
        selectedId="actor-1"
        selectedType="actor"
      />,
    );

    const viewport = screen.getByTestId('director-three-viewport');
    expect(viewport.getAttribute('data-actor-count')).toBe('1');
    expect(viewport.getAttribute('data-camera-count')).toBe('1');
    expect(viewport.getAttribute('data-selected-id')).toBe('actor-1');
  });
});
