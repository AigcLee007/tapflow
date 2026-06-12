import React from 'react';
import { Image, Search } from 'lucide-react';

import { UploadAssetButton } from '../../assets/UploadAssetButton';
import { useAssetLibrary } from '../../assets/useAssetLibrary';
import { CanvasDockEmptyState } from './CanvasDockDrawer';

const ASSET_DRAG_TYPE = 'application/x-tapflow-asset-id';

export function CanvasAssetPanel({
  onInsertAsset,
  projectId,
}: {
  onInsertAsset: (assetId: string) => void;
  projectId?: string | null;
}) {
  const library = useAssetLibrary();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <label style={{ position: 'relative', display: 'block', flex: 1, minWidth: 0 }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: 9, color: '#71717a' }} />
          <input
            className="nodrag nopan"
            value={library.query}
            onChange={(event) => library.setQuery(event.target.value)}
            placeholder="搜索素材"
            style={{
              width: '100%',
              height: 32,
              borderRadius: 11,
              border: '1px solid rgba(255,255,255,0.08)',
              background: 'rgba(255,255,255,0.055)',
              color: '#f8fafc',
              fontSize: 12,
              outline: 'none',
              padding: '0 10px 0 30px',
            }}
          />
        </label>
        <UploadAssetButton
          onUploaded={() => {
            void library.refresh();
          }}
          projectId={projectId}
          variant="compact"
        />
      </div>

      <div className="sleek-scroll-x" style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 2 }}>
        <button
          type="button"
          className="nodrag nopan"
          onClick={() => library.setSelectedFolderId(null)}
          style={folderChip(!library.selectedFolderId)}
        >
          全部
        </button>
        {library.folders.map((folder) => (
          <button
            key={folder.id}
            type="button"
            className="nodrag nopan"
            onClick={() => library.setSelectedFolderId(folder.id)}
            style={folderChip(library.selectedFolderId === folder.id)}
          >
            {folder.name}
          </button>
        ))}
      </div>

      {library.loading ? <CanvasDockEmptyState message="正在加载素材..." /> : null}
      {library.error ? <CanvasDockEmptyState message={library.error} /> : null}
      {!library.loading && !library.error && library.assets.length === 0 ? (
        <CanvasDockEmptyState
          message="还没有可用素材，上传图片或生成图片后会出现在这里。"
          action={
            <UploadAssetButton
              onUploaded={() => {
                void library.refresh();
              }}
              projectId={projectId}
              variant="compact"
            />
          }
        />
      ) : null}

      {!library.loading && !library.error && library.assets.length > 0 ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
          {library.assets.map((asset) => (
            <button
              key={asset.id}
              type="button"
              className="nodrag nopan"
              draggable
              onClick={() => onInsertAsset(asset.id)}
              onDragStart={(event) => {
                event.dataTransfer.setData(ASSET_DRAG_TYPE, asset.id);
                event.dataTransfer.setData('text/plain', asset.id);
                event.dataTransfer.effectAllowed = 'copy';
              }}
              title={asset.title || asset.originalFilename || '素材'}
              style={{
                aspectRatio: '1 / 1',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 10,
                background: 'rgba(255,255,255,0.04)',
                overflow: 'hidden',
                cursor: 'pointer',
                padding: 0,
              }}
            >
              {asset.previewUrl && asset.mimeType.startsWith('image/') ? (
                <img
                  src={asset.previewUrl}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                />
              ) : (
                <span style={{ width: '100%', height: '100%', display: 'grid', placeItems: 'center', color: '#71717a' }}>
                  <Image size={18} />
                </span>
              )}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function folderChip(active: boolean): React.CSSProperties {
  return {
    height: 26,
    border: 'none',
    borderRadius: 999,
    background: active ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.055)',
    color: active ? '#fff' : '#a1a1aa',
    fontSize: 11,
    fontWeight: 650,
    padding: '0 10px',
    whiteSpace: 'nowrap',
    cursor: 'pointer',
  };
}
