import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Download, Maximize2, Minimize2, X } from 'lucide-react';

import { downloadVideoAsset } from './videoDownload';

export function VideoReadyState({ assetId, filename, src }: {
  assetId: string;
  filename: string;
  src?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [fallbackFullscreenOpen, setFallbackFullscreenOpen] = useState(false);
  const [nativeFullscreen, setNativeFullscreen] = useState(false);

  useEffect(() => {
    const syncFullscreen = () => setNativeFullscreen(document.fullscreenElement === containerRef.current);
    document.addEventListener('fullscreenchange', syncFullscreen);
    syncFullscreen();
    return () => document.removeEventListener('fullscreenchange', syncFullscreen);
  }, []);

  const handleDownload = useCallback(() => {
    void downloadVideoAsset({ assetId, filename }).catch(() => undefined);
  }, [assetId, filename]);

  const handleFullscreen = useCallback(() => {
    if (nativeFullscreen) {
      const exitFullscreen = document.exitFullscreen;
      if (exitFullscreen) void exitFullscreen.call(document).catch(() => undefined);
      return;
    }
    const requestFullscreen = containerRef.current?.requestFullscreen;
    if (!requestFullscreen) {
      setFallbackFullscreenOpen(true);
      return;
    }
    try {
      const result = requestFullscreen.call(containerRef.current);
      if (result && typeof result.catch === 'function') {
        void result.catch(() => setFallbackFullscreenOpen(true));
      }
    } catch {
      setFallbackFullscreenOpen(true);
    }
  }, [nativeFullscreen]);

  const fullscreenLabel = nativeFullscreen || fallbackFullscreenOpen ? '退出全屏预览' : '全屏预览';

  return (
    <>
      <div ref={containerRef} style={{ width: '100%', height: '100%', position: 'relative', background: '#000' }}>
        <video
          aria-label="视频预览"
          controls
          src={src || undefined}
          style={{ width: '100%', height: '100%', objectFit: 'contain', background: '#000', display: 'block' }}
        />
        <div
          className="nodrag nopan nowheel"
          style={{ position: 'absolute', top: 8, right: 8, display: 'flex', gap: 6, zIndex: 1 }}
        >
          <button aria-label="下载视频" title="下载视频" type="button" onClick={handleDownload} style={toolbarButtonStyle}>
            <Download size={16} />
          </button>
          <button aria-label={fullscreenLabel} title={fullscreenLabel} type="button" onClick={handleFullscreen} style={toolbarButtonStyle}>
            {nativeFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
          </button>
        </div>
      </div>
      {fallbackFullscreenOpen && typeof document !== 'undefined' ? createPortal(
        <div
          aria-label="视频全屏预览"
          role="dialog"
          style={{ position: 'fixed', inset: 0, zIndex: 10000, background: 'rgba(0, 0, 0, 0.94)', padding: 24 }}
        >
          <button
            aria-label="关闭全屏预览"
            type="button"
            onClick={() => setFallbackFullscreenOpen(false)}
            style={{ ...toolbarButtonStyle, position: 'absolute', top: 16, right: 16, zIndex: 1 }}
          >
            <X size={18} />
          </button>
          <video
            aria-label="视频全屏内容"
            controls
            src={src || undefined}
            style={{ width: '100%', height: '100%', objectFit: 'contain', background: '#000', display: 'block' }}
          />
        </div>,
        document.body,
      ) : null}
    </>
  );
}

const toolbarButtonStyle: React.CSSProperties = {
  width: 30,
  height: 30,
  border: '1px solid rgba(255,255,255,0.2)',
  borderRadius: 6,
  background: 'rgba(20,20,20,0.82)',
  color: '#fff',
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 0,
};
