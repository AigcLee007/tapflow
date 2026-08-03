import React, { useEffect, useMemo, useRef } from 'react';
import { AudioLines, ChevronRight, Image as ImageIcon, Upload, Video, X } from 'lucide-react';

import { useAssetLibrary } from '../../assets/useAssetLibrary';
import { MenuSurface } from '../../components/menu/MenuSurface';
import { MENU_ITEM_CLASS, MENU_ITEM_PRIMARY_CLASS, MENU_ITEM_SECONDARY_CLASS } from '../../components/menu/menuStyles';
import { useDismissibleLayer } from '../../components/menu/useDismissibleLayer';
import { useFlowCanvasStore } from '../store/flowCanvasStore';
import { buildCanvasMediaReferenceSources, type ReferenceMediaKind } from '../utils/referenceSourceResolver';

type ReferenceSourcePickerProps = {
  allowedKinds: ReferenceMediaKind[];
  currentNodeId: string;
  open: boolean;
  query?: string;
  roleLabel?: string;
  onClose: () => void;
  onPickAsset: (assetId: string, mediaKind: ReferenceMediaKind) => void;
  onPickCanvasNode: (nodeId: string, mediaKind: ReferenceMediaKind) => void;
  onUploadReference: (mediaKind: ReferenceMediaKind) => void;
};

export function ReferenceSourcePicker({
  allowedKinds,
  currentNodeId,
  open,
  query = '',
  roleLabel,
  onClose,
  onPickAsset,
  onPickCanvasNode,
  onUploadReference,
}: ReferenceSourcePickerProps) {
  const layer = useDismissibleLayer(`reference-source-picker-${currentNodeId}`);
  const nodes = useFlowCanvasStore((state) => state.nodes);
  const assetLibrary = useAssetLibrary();
  const wasLayerOpenRef = useRef(false);

  useEffect(() => {
    if (open) {
      layer.openLayer();
      return;
    }
    layer.closeLayer();
  }, [layer, open]);

  useEffect(() => {
    if (wasLayerOpenRef.current && !layer.open && open) {
      onClose();
    }
    wasLayerOpenRef.current = layer.open;
  }, [layer.open, onClose, open]);

  const normalizedQuery = query.trim().toLowerCase();
  const canvasSources = useMemo(() => {
    const sources = buildCanvasMediaReferenceSources({ allowedKinds, currentNodeId, nodes });
    if (!normalizedQuery) return sources;
    return sources.filter((item) => item.title.toLowerCase().includes(normalizedQuery));
  }, [allowedKinds, currentNodeId, nodes, normalizedQuery]);

  const recentAssets = useMemo(() => {
    return [...assetLibrary.assets]
      .filter((asset) => allowedKinds.includes(asset.kind as ReferenceMediaKind))
      .sort((a, b) => Number(new Date(b.updatedAt)) - Number(new Date(a.updatedAt)))
      .filter((asset) => {
        if (!normalizedQuery) return true;
        return `${asset.title || ''} ${asset.originalFilename || ''}`.toLowerCase().includes(normalizedQuery);
      })
      .slice(0, 6);
  }, [allowedKinds, assetLibrary.assets, normalizedQuery]);

  if (!open) return null;

  return (
    <MenuSurface
      ref={layer.ref as React.RefObject<HTMLDivElement>}
      className="absolute left-[-80px] top-[54px] z-[1600] w-[420px] max-h-[540px] overflow-hidden p-2"
      role="dialog"
      aria-label="参考图来源"
    >
      <div className="sleek-scroll-y max-h-[516px] overflow-y-auto">
        <div className="flex items-center justify-between px-1.5 pb-2">
          <div>
            <div className={MENU_ITEM_PRIMARY_CLASS}>参考图来源</div>
            {roleLabel ? <div className="pt-0.5 text-[9px] font-medium leading-[1.25] text-white/40">{roleLabel}</div> : null}
          </div>
          <button
            type="button"
            className="inline-flex h-7 w-7 items-center justify-center rounded-[8px] border border-white/10 bg-white/0 text-white/70 transition hover:bg-white/[0.08] hover:text-white"
            onClick={onClose}
            aria-label="关闭"
            title="关闭"
          >
            <X size={14} />
          </button>
        </div>

        <section className="px-1.5 pb-2">
          <h3 className="pb-1 text-[10px] font-bold leading-none text-white/40">当前画布</h3>
          <div className="flex flex-col gap-1">
            {canvasSources.length > 0 ? canvasSources.map((source) => (
              <button
                key={source.key}
                type="button"
                className={`${MENU_ITEM_CLASS} h-[38px]`.trim()}
                onClick={() => {
                  onPickCanvasNode(source.nodeId, source.mediaKind);
                  onClose();
                }}
              >
                <span className="flex h-[30px] w-[30px] shrink-0 items-center justify-center overflow-hidden rounded-[9px] border border-white/10 bg-white/[0.04]">
                  <MediaKindIcon mediaKind={source.mediaKind} previewUrl={source.previewUrl} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className={MENU_ITEM_PRIMARY_CLASS}>{source.title || mediaKindLabel(source.mediaKind)}</span>
                  <span className={MENU_ITEM_SECONDARY_CLASS}>{`画布${mediaKindLabel(source.mediaKind)}`}</span>
                </span>
                <ChevronRight size={14} className="shrink-0 text-white/35" />
              </button>
            )) : (
              <div className="px-1.5 py-2 text-[10px] font-medium leading-tight text-white/35">没有可用的画布图片</div>
            )}
          </div>
        </section>

        <section className="px-1.5 pb-2">
          <h3 className="pb-1 text-[10px] font-bold leading-none text-white/40">最近素材</h3>
          <div className="flex flex-col gap-1">
            {assetLibrary.loading && recentAssets.length === 0 ? (
              <div className="px-1.5 py-2 text-[10px] font-medium leading-tight text-white/35">素材库加载中</div>
            ) : recentAssets.length > 0 ? recentAssets.map((asset) => (
              <button
                key={asset.id}
                type="button"
                className={`${MENU_ITEM_CLASS} h-[38px]`.trim()}
                onClick={() => {
                  onPickAsset(asset.id, asset.kind as ReferenceMediaKind);
                  onClose();
                }}
              >
                <span className="flex h-[30px] w-[30px] shrink-0 items-center justify-center overflow-hidden rounded-[9px] border border-white/10 bg-white/[0.04]">
                  <MediaKindIcon mediaKind={asset.kind as ReferenceMediaKind} previewUrl={asset.previewUrl} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className={MENU_ITEM_PRIMARY_CLASS}>{asset.title || asset.originalFilename || '素材'}</span>
                  <span className={MENU_ITEM_SECONDARY_CLASS}>{`最近${mediaKindLabel(asset.kind as ReferenceMediaKind)}`}</span>
                </span>
                <MediaKindIcon mediaKind={asset.kind as ReferenceMediaKind} />
              </button>
            )) : (
              <div className="px-1.5 py-2 text-[10px] font-medium leading-tight text-white/35">没有可用的最近素材</div>
            )}
          </div>
        </section>

        <section className="px-1.5 pb-1">
          <button
            type="button"
            className={`${MENU_ITEM_CLASS} h-[38px]`.trim()}
            onClick={() => {
              onUploadReference(allowedKinds[0] ?? 'image');
              onClose();
            }}
          >
            <span className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[9px] border border-white/10 bg-white/[0.04]">
              <Upload size={14} />
            </span>
            <span className="min-w-0 flex-1">
              <span className={MENU_ITEM_PRIMARY_CLASS}>上传参考图</span>
              <span className={MENU_ITEM_SECONDARY_CLASS}>本地图片上传后直接加入参考图</span>
            </span>
          </button>
        </section>
      </div>
    </MenuSurface>
  );
}

function mediaKindLabel(mediaKind: ReferenceMediaKind): string {
  if (mediaKind === 'video') return '视频';
  if (mediaKind === 'audio') return '音频';
  return '图片';
}

function MediaKindIcon({ mediaKind, previewUrl }: { mediaKind: ReferenceMediaKind; previewUrl?: string }) {
  if (previewUrl && mediaKind !== 'audio') return <img src={previewUrl} alt="" className="h-full w-full object-cover" />;
  const Icon = mediaKind === 'video' ? Video : mediaKind === 'audio' ? AudioLines : ImageIcon;
  return <Icon aria-hidden="true" size={14} className="shrink-0 text-white/35" />;
}
