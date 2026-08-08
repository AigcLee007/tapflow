import { useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Image, Music2, Video } from 'lucide-react';
import { MenuSurface } from '../../components/menu/MenuSurface';
import { MENU_ITEM_CLASS, MENU_ITEM_PRIMARY_CLASS, MENU_ITEM_SECONDARY_CLASS } from '../../components/menu/menuStyles';
import { useDismissibleLayer } from '../../components/menu/useDismissibleLayer';
import type { MediaMentionCandidate } from './mediaMentionCandidates';

export type MediaMentionCandidateMenuProps = {
  anchorRect: DOMRect | null;
  candidates: MediaMentionCandidate[];
  onDismiss: () => void;
  onSelect: (candidate: MediaMentionCandidate) => void;
  query: string;
  selectedIndex: number;
  setSelectedIndex: (index: number) => void;
};

const GROUP_LABELS = {
  connected: '已连接媒体',
  canvas: '画布媒体',
  asset: '素材库',
} as const;

export function MediaMentionCandidateMenu({
  anchorRect,
  candidates,
  onDismiss,
  onSelect,
  query,
  selectedIndex,
  setSelectedIndex,
}: MediaMentionCandidateMenuProps) {
  const layer = useDismissibleLayer('media-mention-candidates', { onDismiss });
  const filteredCandidates = useMemo(() => filterCandidates(candidates, query), [candidates, query]);

  useEffect(() => {
    queueMicrotask(layer.openLayer);
    return () => layer.closeLayer();
  }, [layer.closeLayer, layer.openLayer]);

  useEffect(() => {
    const dismissOutside = (event: PointerEvent) => {
      if (!layer.ref.current?.contains(event.target as Node)) onDismiss();
    };
    window.addEventListener('pointerdown', dismissOutside);
    return () => window.removeEventListener('pointerdown', dismissOutside);
  }, [layer.ref, onDismiss]);

  useEffect(() => {
    if (selectedIndex >= filteredCandidates.length) setSelectedIndex(Math.max(0, filteredCandidates.length - 1));
  }, [filteredCandidates.length, selectedIndex, setSelectedIndex]);

  if (typeof document === 'undefined' || !anchorRect || !filteredCandidates.length) return null;

  const left = clamp(anchorRect.left, 8, Math.max(8, window.innerWidth - 292));
  const spaceBelow = window.innerHeight - anchorRect.bottom;
  const top = spaceBelow >= 240
    ? clamp(anchorRect.bottom + 8, 8, Math.max(8, window.innerHeight - 300))
    : clamp(anchorRect.top - 260, 8, Math.max(8, window.innerHeight - 300));
  let lastGroup: string | undefined;

  return createPortal(
    <MenuSurface
      aria-label="引用媒体"
      className="nodrag nopan nowheel max-h-[280px] w-[284px] overflow-x-hidden overflow-y-auto p-1"
      ref={layer.ref as React.RefObject<HTMLDivElement>}
      role="listbox"
      style={{ position: 'fixed', zIndex: 1200, left, top }}
    >
      {filteredCandidates.map((candidate, index) => {
        const group = candidate.candidateKey.split(':', 1)[0] as keyof typeof GROUP_LABELS;
        const groupLabel = group !== lastGroup ? GROUP_LABELS[group] : undefined;
        lastGroup = group;
        const active = index === selectedIndex;
        return (
          <div key={candidate.candidateKey}>
            {groupLabel ? <div className="px-1.5 pb-1 pt-1.5 text-[9px] font-medium leading-[1.25] text-white/40">{groupLabel}</div> : null}
            <button
              aria-selected={active}
              className={`${MENU_ITEM_CLASS} h-[38px] ${active ? 'bg-white/[0.088]' : ''}`.trim()}
              onClick={() => onSelect(candidate)}
              onMouseEnter={() => setSelectedIndex(index)}
              role="option"
              type="button"
            >
              <CandidateThumbnail candidate={candidate} />
              <span className="min-w-0 flex-1">
                <span className={`${MENU_ITEM_PRIMARY_CLASS} block truncate`}>{candidate.title}</span>
                <span className={`${MENU_ITEM_SECONDARY_CLASS} block`}>{kindLabel(candidate.mediaKind)}</span>
              </span>
            </button>
          </div>
        );
      })}
    </MenuSurface>,
    document.body,
  );
}

export function filterCandidates(candidates: MediaMentionCandidate[], query: string): MediaMentionCandidate[] {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  if (!normalizedQuery) return candidates;
  return candidates.filter((candidate) => `${candidate.title} ${kindLabel(candidate.mediaKind)} ${candidate.mediaKind}`
    .toLocaleLowerCase()
    .includes(normalizedQuery));
}

function CandidateThumbnail({ candidate }: { candidate: MediaMentionCandidate }) {
  if (candidate.thumbnailUrl) {
    return <img alt="" className="h-[30px] w-[30px] rounded-[9px] object-cover" src={candidate.thumbnailUrl} />;
  }
  const Icon = candidate.mediaKind === 'image' ? Image : candidate.mediaKind === 'video' ? Video : Music2;
  return <span className="flex h-[30px] w-[30px] items-center justify-center rounded-[9px] bg-white/[0.08] text-white/65"><Icon size={15} /></span>;
}

function kindLabel(kind: MediaMentionCandidate['mediaKind']): string {
  return kind === 'image' ? '图片' : kind === 'video' ? '视频' : '音频';
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}
