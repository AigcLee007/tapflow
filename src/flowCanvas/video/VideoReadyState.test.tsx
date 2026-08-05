import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const downloadVideoAssetMock = vi.hoisted(() => vi.fn());

vi.mock('./videoDownload', () => ({
  downloadVideoAsset: (...args: unknown[]) => downloadVideoAssetMock(...args),
}));

import { VideoReadyState } from './VideoReadyState';

describe('VideoReadyState', () => {
  beforeEach(() => {
    downloadVideoAssetMock.mockReset();
    downloadVideoAssetMock.mockResolvedValue(undefined);
  });

  it('renders one native video with the limited ready toolbar', () => {
    const { container } = render(
      <VideoReadyState assetId="asset-video" filename="shot.mp4" src="/preview.mp4" />,
    );

    const preview = screen.getByLabelText('视频预览') as HTMLVideoElement;
    expect(preview.hasAttribute('controls')).toBe(true);
    expect(preview.style.width).toBe('100%');
    expect(preview.style.height).toBe('100%');
    expect(preview.style.objectFit).toBe('contain');
    expect(preview.style.background).toBe('rgb(0, 0, 0)');
    expect(container.querySelectorAll('video')).toHaveLength(1);
    expect(screen.getByRole('button', { name: '下载视频' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '全屏预览' })).toBeTruthy();
    expect(container.querySelector('.nodrag.nopan.nowheel')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /上传|替换/ })).toBeNull();
  });

  it('uses the download helper only after the download action is clicked', async () => {
    render(<VideoReadyState assetId="asset-video" filename="shot.mp4" src="/preview.mp4" />);
    expect(downloadVideoAssetMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: '下载视频' }));
    await waitFor(() => expect(downloadVideoAssetMock).toHaveBeenCalledWith({ assetId: 'asset-video', filename: 'shot.mp4' }));
  });

  it('opens a dismissible portal fallback when native fullscreen is unavailable', () => {
    render(<VideoReadyState assetId="asset-video" filename="shot.mp4" src="/preview.mp4" />);
    fireEvent.click(screen.getByRole('button', { name: '全屏预览' }));

    expect(screen.getByRole('dialog', { name: '视频全屏预览' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '关闭全屏预览' }));
    expect(screen.queryByRole('dialog', { name: '视频全屏预览' })).toBeNull();
  });

  it('toggles native fullscreen from the same top-right button', async () => {
    let fullscreenElement: Element | null = null;
    Object.defineProperty(document, 'fullscreenElement', {
      configurable: true,
      get: () => fullscreenElement,
    });
    const requestFullscreen = vi.fn().mockImplementation(function (this: HTMLElement) {
      fullscreenElement = this;
      document.dispatchEvent(new Event('fullscreenchange'));
      return Promise.resolve();
    });
    const exitFullscreen = vi.fn().mockImplementation(() => {
      fullscreenElement = null;
      document.dispatchEvent(new Event('fullscreenchange'));
      return Promise.resolve();
    });
    Object.defineProperty(HTMLElement.prototype, 'requestFullscreen', { configurable: true, value: requestFullscreen });
    Object.defineProperty(document, 'exitFullscreen', { configurable: true, value: exitFullscreen });

    render(<VideoReadyState assetId="asset-video" filename="shot.mp4" src="/preview.mp4" />);
    const toggle = screen.getByRole('button', { name: '全屏预览' });
    fireEvent.click(toggle);
    await waitFor(() => expect(screen.getByRole('button', { name: '退出全屏预览' })).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: '退出全屏预览' }));
    await waitFor(() => expect(screen.getByRole('button', { name: '全屏预览' })).toBeTruthy());
    expect(requestFullscreen).toHaveBeenCalledTimes(1);
    expect(exitFullscreen).toHaveBeenCalledTimes(1);
  });
});
