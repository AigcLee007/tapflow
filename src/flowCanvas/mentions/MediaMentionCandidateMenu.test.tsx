import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MediaMentionCandidateMenu } from './MediaMentionCandidateMenu';

describe('MediaMentionCandidateMenu', () => {
  it('shows the disabled reason inside each disabled option', () => {
    render(
      <MediaMentionCandidateMenu
        anchorRect={{ left: 10, top: 10, right: 110, bottom: 40, width: 100, height: 30, x: 10, y: 10, toJSON: () => ({}) } as DOMRect}
        candidates={[{ activation: { type: 'canvas', nodeId: 'image-node' }, candidateKey: 'canvas:image-node', mediaKind: 'image', title: 'Canvas image', disabledReason: '模型能力加载中' }]}
        layerKey="test-menu"
        menuId="test-menu"
        onDismiss={vi.fn()}
        onSelect={vi.fn()}
        query=""
        selectedIndex={0}
        setSelectedIndex={vi.fn()}
      />,
    );

    expect(screen.getByRole('option', { name: /Canvas image.*图片.*模型能力加载中/ }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByText('模型能力加载中')).toBeTruthy();
  });
});
