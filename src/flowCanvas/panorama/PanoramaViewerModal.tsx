import React from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { PanoramaViewer } from './PanoramaViewer';

export function PanoramaViewerModal({
  imageUrl,
  onClose,
  title,
}: {
  imageUrl: string;
  onClose: () => void;
  title?: string;
}) {
  const modal = (
    <div className="fixed inset-0 z-[2800] flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div
        className="relative h-[min(82vh,820px)] w-full max-w-6xl overflow-hidden rounded-[24px] border border-white/10 bg-black shadow-[0_24px_80px_rgba(0,0,0,0.55)]"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          aria-label="关闭全景查看"
          onClick={onClose}
          className="absolute right-4 top-4 z-20 inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-black/65 text-white/90 transition hover:bg-black/85"
        >
          <X size={18} />
        </button>
        <PanoramaViewer className="h-full w-full" imageUrl={imageUrl} label={title || '360 全景'} />
      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(modal, document.body) : modal;
}
