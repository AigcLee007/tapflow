import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';

import { TemplateInsertDialog } from './TemplateInsertDialog';

const assetsApi = vi.hoisted(() => ({ listAssets: vi.fn() }));
vi.mock('../../assets/assetApi', () => assetsApi);

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

  test('loads searchable, paginated assets only from the input media kinds', async () => {
    assetsApi.listAssets.mockResolvedValue({ items: [{ id: 'video-1', kind: 'video', mimeType: 'video/mp4', originalFilename: 'clip.mp4' }], page: 2, pageSize: 20, total: 21 });
    render(<TemplateInsertDialog open template={{ id: 't1', title: 'Video', inputSchema: [{ id: 'clip', label: 'Reference clip', required: true, type: 'asset', assetKinds: ['video'], target: { nodeId: 'n1', fieldPath: 'data.assetId' } }] } as any} onCancel={vi.fn()} onConfirm={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: /Reference clip/i }));
    expect(await screen.findByText('clip.mp4')).toBeTruthy();
    expect(assetsApi.listAssets).toHaveBeenCalledWith(expect.objectContaining({ kind: 'video', page: 1, pageSize: 20 }));
    fireEvent.change(screen.getByLabelText('Search assets'), { target: { value: 'campaign' } });
    expect(await screen.findByText('clip.mp4')).toBeTruthy();
    expect(assetsApi.listAssets).toHaveBeenCalledWith(expect.objectContaining({ kind: 'video', page: 1, query: 'campaign' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next asset page' }));
    expect(assetsApi.listAssets).toHaveBeenCalledWith(expect.objectContaining({ kind: 'video', page: 2, query: 'campaign' }));
  });

  test('initializes an enum selection with the displayed first option', () => {
    const onConfirm = vi.fn();
    render(<TemplateInsertDialog open template={{ id: 't1', title: 'Ratio', inputSchema: [{ id: 'ratio', label: 'Ratio', required: true, type: 'enum', options: ['16:9', '9:16'], target: { nodeId: 'n1', fieldPath: 'data.aspectRatio' } }] } as any} onCancel={vi.fn()} onConfirm={onConfirm} />);

    fireEvent.click(screen.getByRole('button', { name: '插入模板' }));
    expect(onConfirm).toHaveBeenCalledWith({ ratio: '16:9' });
  });
});
