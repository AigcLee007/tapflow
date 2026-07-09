import React, { memo, useEffect, useMemo, useState } from 'react';
import { Handle, NodeResizer, Position, useConnection, type NodeProps } from '@xyflow/react';
import { Globe2, Link2 } from 'lucide-react';

import { getAssetVariantUrl } from '../../services/v2AssetsApi';
import { PanoramaViewer } from '../panorama/PanoramaViewer';
import { PanoramaViewerModal } from '../panorama/PanoramaViewerModal';
import { getPanoramaSourceUrl } from '../panorama/panoramaUtils';
import { useFlowCanvasStore } from '../store/flowCanvasStore';
import type { FlowNodeData } from '../types';
import { FLOW_NODE_DEFAULT_SIZES } from '../utils/nodeSizing';

const cardStyle = (selected?: boolean, magnetic?: boolean): React.CSSProperties => ({
  position: 'relative',
  width: '100%',
  height: '100%',
  borderRadius: 18,
  background: '#111827',
  border: selected
    ? '1.5px solid rgba(255,255,255,0.4)'
    : magnetic
      ? '1.5px solid rgba(34,197,94,0.7)'
      : '1.5px solid rgba(255,255,255,0.04)',
  overflow: 'hidden',
  boxShadow: selected
    ? '0 10px 34px rgba(0,0,0,0.45)'
    : '0 6px 22px rgba(0,0,0,0.28)',
});

const invisibleHandle: React.CSSProperties = {
  width: 24,
  height: 24,
  background: 'transparent',
  border: 'none',
};

export const PanoramaViewerNode = memo(function PanoramaViewerNode({
  id,
  data,
  selected,
}: NodeProps<{ data: FlowNodeData }>) {
  const allNodes = useFlowCanvasStore((state) => state.nodes);
  const allEdges = useFlowCanvasStore((state) => state.edges);
  const { connectionNodeId } = useConnection();
  const [fallbackUrl, setFallbackUrl] = useState('');
  const [fullscreenOpen, setFullscreenOpen] = useState(false);

  const sourceNodeId = useMemo(() => {
    if (typeof data.panoramaSourceNodeId === 'string' && data.panoramaSourceNodeId.trim()) {
      return data.panoramaSourceNodeId.trim();
    }
    return allEdges.find((edge) => edge.target === id)?.source || '';
  }, [allEdges, data.panoramaSourceNodeId, id]);

  const sourceNode = allNodes.find((node) => node.id === sourceNodeId);
  const sourceData = sourceNode?.data;
  const directUrl = getPanoramaSourceUrl(sourceData);
  const imageUrl = directUrl || fallbackUrl;
  const isTargeting = !!connectionNodeId && connectionNodeId !== id;
  const width = Number(data.width || FLOW_NODE_DEFAULT_SIZES.panoramaViewer.width);
  const height = Number(data.height || FLOW_NODE_DEFAULT_SIZES.panoramaViewer.height);

  useEffect(() => {
    if (directUrl || !sourceData?.assetId) {
      setFallbackUrl('');
      return;
    }
    let cancelled = false;
    void getAssetVariantUrl(sourceData.assetId, 'preview')
      .catch(() => getAssetVariantUrl(sourceData.assetId as string))
      .then((result) => {
        if (!cancelled) {
          setFallbackUrl(String(result.url || '').trim());
        }
      })
      .catch(() => {
        if (!cancelled) {
          setFallbackUrl('');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [directUrl, sourceData?.assetId]);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <NodeResizer
        minWidth={280}
        minHeight={190}
        lineStyle={{ borderColor: 'rgba(255,255,255,0.36)' }}
        handleStyle={{ background: 'transparent', borderColor: 'transparent' }}
      />
      <div
        style={{
          position: 'absolute',
          bottom: 'calc(100% + 6px)',
          left: 0,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          color: '#e5e7eb',
          fontSize: 12,
          fontWeight: 700,
        }}
      >
        <Globe2 size={14} />
        <span>{String(data.title || '360 全景查看')}</span>
      </div>

      <Handle type="target" position={Position.Left} id="in" style={{ ...invisibleHandle, left: -2 }} />

      <div style={{ ...cardStyle(selected, isTargeting), width, height }}>
        {imageUrl ? (
          <div className="h-full w-full" onDoubleClick={() => setFullscreenOpen(true)}>
            <PanoramaViewer className="h-full w-full" imageUrl={imageUrl} />
          </div>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center text-white/70">
            <Link2 size={20} />
            <div className="text-sm font-medium">连接一张 360 全景图后即可查看</div>
          </div>
        )}
      </div>

      {fullscreenOpen && imageUrl ? (
        <PanoramaViewerModal
          imageUrl={imageUrl}
          onClose={() => setFullscreenOpen(false)}
          title={String(sourceData?.title || data.title || '360 全景')}
        />
      ) : null}
    </div>
  );
});
