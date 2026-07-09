import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Expand, LoaderCircle } from 'lucide-react';
import '@photo-sphere-viewer/core/index.css';

type PanoramaViewerProps = {
  className?: string;
  imageUrl: string;
  label?: string;
};

const isJsdom = () =>
  typeof window !== 'undefined'
  && typeof window.navigator !== 'undefined'
  && /jsdom/i.test(window.navigator.userAgent);

export function PanoramaViewer({
  className,
  imageUrl,
  label = '360 全景',
}: PanoramaViewerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>(imageUrl ? 'loading' : 'error');

  useEffect(() => {
    if (!imageUrl) {
      setStatus('error');
      return;
    }
    if (isJsdom()) {
      setStatus('ready');
      return;
    }

    let disposed = false;
    let viewer: { destroy?: () => void } | null = null;

    setStatus('loading');

    void import('@photo-sphere-viewer/core')
      .then(({ Viewer }) => {
        if (disposed || !containerRef.current) return;
        viewer = new Viewer({
          container: containerRef.current,
          defaultZoomLvl: 0,
          mousewheel: true,
          navbar: false,
          panorama: imageUrl,
          touchmoveTwoFingers: false,
        }) as unknown as { destroy?: () => void };
        setStatus('ready');
      })
      .catch(() => {
        if (!disposed) {
          setStatus('error');
        }
      });

    return () => {
      disposed = true;
      viewer?.destroy?.();
    };
  }, [imageUrl]);

  const overlay = useMemo(() => {
    if (status === 'ready') return null;
    return (
      <div
        className="absolute inset-0 flex items-center justify-center bg-black/45 text-white"
        style={{ backdropFilter: 'blur(3px)' }}
      >
        {status === 'loading' ? (
          <div className="flex items-center gap-2 text-sm font-medium">
            <LoaderCircle className="animate-spin" size={16} />
            正在加载全景...
          </div>
        ) : (
          <div className="text-sm font-medium text-white/70">全景加载失败</div>
        )}
      </div>
    );
  }, [status]);

  const requestFullscreen = () => {
    containerRef.current?.parentElement?.requestFullscreen?.().catch(() => undefined);
  };

  return (
    <div
      className={className}
      data-testid="panorama-viewer-shell"
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        minHeight: 180,
        overflow: 'hidden',
        borderRadius: 16,
        background: '#020617',
      }}
    >
      <div
        ref={containerRef}
        style={{
          width: '100%',
          height: '100%',
          backgroundImage: status === 'ready' && isJsdom() ? `url(${imageUrl})` : undefined,
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat',
          backgroundSize: 'cover',
        }}
      />
      <div className="absolute left-3 top-3 rounded-full border border-white/10 bg-black/60 px-3 py-1 text-xs font-semibold text-white/90">
        {label}
      </div>
      <button
        type="button"
        aria-label="全屏查看全景"
        onClick={requestFullscreen}
        className="absolute right-3 top-3 inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-black/60 text-white/90 transition hover:bg-black/80"
      >
        <Expand size={16} />
      </button>
      {overlay}
    </div>
  );
}
