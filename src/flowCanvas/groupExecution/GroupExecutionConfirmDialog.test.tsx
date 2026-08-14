import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';

import { GroupExecutionConfirmDialog } from './GroupExecutionConfirmDialog';

const runnablePlan = {
  blockingIssues: [],
  estimatedCredits: 120,
  externalDependencies: [],
  layers: [['image-1'], ['video-1']],
  nodeIds: ['image-1', 'video-1'],
  retryableNodeIds: [],
};

describe('GroupExecutionConfirmDialog', () => {
  test('does not create a run until the user confirms', async () => {
    const onCancel = vi.fn();
    const onConfirm = vi.fn();
    render(<GroupExecutionConfirmDialog open plan={runnablePlan} onCancel={onCancel} onConfirm={onConfirm} />);

    expect(screen.getByRole('dialog', { name: 'Confirm group execution' })).toBeTruthy();
    expect(screen.getByText('2 executable nodes')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Start execution' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  test('disables start when the plan has blocking issues', () => {
    render(<GroupExecutionConfirmDialog open plan={{ ...runnablePlan, blockingIssues: [{ code: 'MISSING_EXTERNAL_RESULT', message: 'Missing external result.', nodeId: 'image-1' }] }} onCancel={vi.fn()} onConfirm={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Start execution' })).toHaveProperty('disabled', true);
    expect(screen.getByText('Missing external result.')).toBeTruthy();
  });
});
