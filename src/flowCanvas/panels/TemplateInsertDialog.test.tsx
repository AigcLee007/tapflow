import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';

import { TemplateInsertDialog } from './TemplateInsertDialog';

describe('TemplateInsertDialog', () => {
  test('blocks a required template input until it is supplied', () => {
    const onConfirm = vi.fn();
    render(<TemplateInsertDialog open template={{ id: 't1', title: 'Product video', inputSchema: [{ id: 'subject', label: 'Product description', required: true, type: 'text', target: { nodeId: 'n1', fieldPath: 'data.generationPrompt' } }] } as any} onCancel={vi.fn()} onConfirm={onConfirm} />);
    expect((screen.getByRole('button', { name: '插入模板' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Product description'), { target: { value: 'a lamp' } });
    fireEvent.click(screen.getByRole('button', { name: '插入模板' }));
    expect(onConfirm).toHaveBeenCalledWith({ subject: 'a lamp' });
  });

  test('uses an asset ID selected from the asset library', () => {
    const onConfirm = vi.fn();
    render(<TemplateInsertDialog open template={{ id: 't1', title: 'Image', inputSchema: [{ id: 'image', label: 'Reference image', required: true, type: 'asset', target: { nodeId: 'n1', fieldPath: 'data.assetId' } }] } as any} onCancel={vi.fn()} onConfirm={onConfirm} assets={[{ id: 'asset-1', filename: 'shoe.png' }]} />);
    fireEvent.click(screen.getByRole('button', { name: /Reference image/i }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'shoe.png' }));
    fireEvent.click(screen.getByRole('button', { name: '插入模板' }));
    expect(onConfirm).toHaveBeenCalledWith({ image: 'asset-1' });
  });
});
