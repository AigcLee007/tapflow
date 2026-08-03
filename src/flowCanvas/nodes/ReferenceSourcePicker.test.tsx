import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ReferenceSourcePicker } from './ReferenceSourcePicker';
import { useFlowCanvasStore } from '../store/flowCanvasStore';
import type { AssetItem } from '../../assets/assetApi';

const useAssetLibraryMock = vi.fn();

vi.mock('../../assets/useAssetLibrary', () => ({
  useAssetLibrary: () => useAssetLibraryMock(),
}));

function createAsset(overrides: Partial<AssetItem> = {}): AssetItem {
  return {
    bucket: 'assets',
    checksumSha256: null,
    createdAt: '2026-07-04T08:30:00.000Z',
    deletedAt: null,
    description: null,
    durationMs: null,
    favorite: false,
    height: 1024,
    id: 'asset-1',
    kind: 'image',
    metadata: {},
    mimeType: 'image/png',
    objectKey: 'images/asset-1.png',
    originalFilename: 'picker-reference.png',
    ownerUserId: 'user-1',
    previewUrl: 'https://cdn.test/asset-1.png',
    projectId: 'project-1',
    sizeBytes: 2_048_000,
    source: 'upload',
    status: 'available',
    storageProvider: 's3',
    tags: [],
    tenantId: 'tenant-1',
    title: 'picker-reference.png',
    updatedAt: '2026-07-04T08:30:00.000Z',
    variants: [],
    width: 1024,
    ...overrides,
  };
}

describe('ReferenceSourcePicker', () => {
  beforeEach(() => {
    useFlowCanvasStore.getState().newProject();
    useAssetLibraryMock.mockReset();
    useAssetLibraryMock.mockReturnValue({
      assets: [createAsset()],
      error: null,
      folders: [],
      groupedAssets: [],
      loading: false,
      mediaCounts: { all: 1, audio: 0, image: 1, video: 0 },
      page: 1,
      pageSize: 30,
      query: '',
      refresh: vi.fn(async () => undefined),
      selectedFolderId: null,
      selectedMediaTab: 'image',
      setFavoriteOnly: vi.fn(),
      setQuery: vi.fn(),
      setSelectedFolderId: vi.fn(),
      setSelectedMediaTab: vi.fn(),
      favoriteOnly: false,
      total: 1,
      updateAssetOptimistically: vi.fn(),
    });
  });

  it('shows canvas image sources, recent assets, and upload entry points in a compact surface', () => {
    const canvasSource = useFlowCanvasStore.getState().addNode('image', { x: 0, y: 0 }, { title: 'Canvas Source', thumbnailUrl: 'https://cdn.test/canvas.png' });
    useFlowCanvasStore.getState().addNode('text', { x: 320, y: 0 }, { title: 'Text' });

    const onPickCanvasNode = vi.fn();
    const onPickAsset = vi.fn();
    const onUploadReference = vi.fn();

    render(
      <ReferenceSourcePicker
        allowedKinds={['image']}
        currentNodeId="current-node"
        open
        onClose={vi.fn()}
        onPickAsset={onPickAsset}
        onPickCanvasNode={onPickCanvasNode}
        onUploadReference={onUploadReference}
      />,
    );

    expect(screen.getByRole('heading', { name: '当前画布' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: '最近素材' })).toBeTruthy();
    expect(screen.getAllByRole('button').some((button) => button.textContent?.includes('上传参考图'))).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: /Canvas Source/ }));
    expect(onPickCanvasNode).toHaveBeenCalledWith(canvasSource.id, 'image');

    fireEvent.click(screen.getByRole('button', { name: /picker-reference\.png/ }));
    expect(onPickAsset).toHaveBeenCalledWith('asset-1', 'image');

    fireEvent.click(screen.getByText('上传参考图').closest('button')!);
    expect(onUploadReference).toHaveBeenCalledWith('image');
  });

  it('filters canvas and library choices by allowed media kinds and returns the selected kind', () => {
    useAssetLibraryMock.mockReturnValue({
      ...useAssetLibraryMock(),
      assets: [
        createAsset({ id: 'asset-image', kind: 'image', title: 'Image asset' }),
        createAsset({ id: 'asset-video', kind: 'video', mimeType: 'video/mp4', previewUrl: 'https://cdn.test/video.jpg', title: 'Video asset' }),
        createAsset({ id: 'asset-audio', kind: 'audio', mimeType: 'audio/mpeg', previewUrl: 'https://cdn.test/audio.mp3', title: 'Audio asset' }),
      ],
    });
    const canvasVideo = useFlowCanvasStore.getState().addNode('video', { x: 0, y: 0 }, { kind: 'video', posterUrl: 'https://cdn.test/canvas-video.jpg', title: 'Canvas video' });
    useFlowCanvasStore.getState().addNode('image', { x: 0, y: 240 }, { kind: 'image', thumbnailUrl: 'https://cdn.test/canvas-image.jpg', title: 'Canvas image' });
    const onPickAsset = vi.fn();
    const onPickCanvasNode = vi.fn();
    const onUploadReference = vi.fn();

    render(
      <ReferenceSourcePicker
        allowedKinds={['video', 'audio']}
        currentNodeId="current-node"
        open
        onClose={vi.fn()}
        onPickAsset={onPickAsset}
        onPickCanvasNode={onPickCanvasNode}
        onUploadReference={onUploadReference}
      />,
    );

    expect(screen.queryByRole('button', { name: /Image asset/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Canvas video/ }));
    expect(onPickCanvasNode).toHaveBeenCalledWith(canvasVideo.id, 'video');
    fireEvent.click(screen.getByRole('button', { name: /Audio asset/ }));
    expect(onPickAsset).toHaveBeenCalledWith('asset-audio', 'audio');
    fireEvent.click(screen.getByText('上传参考图').closest('button')!);
    expect(onUploadReference).toHaveBeenCalledWith('video');
  });
});
