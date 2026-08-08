import type { FlowMediaMentionKind } from '../types';

export type MediaMentionConnectedSeed = {
  assetId?: string;
  inputKey: string;
  kind: 'text' | FlowMediaMentionKind;
  sourceNodeId?: string;
  thumbnailUrl?: string;
  mentionLabel?: string;
  title: string;
};

export type MediaMentionCanvasSeed = {
  kind: 'text' | FlowMediaMentionKind;
  nodeId: string;
  thumbnailUrl?: string;
  title: string;
};

export type MediaMentionAssetSeed = {
  assetId: string;
  kind: 'text' | FlowMediaMentionKind;
  thumbnailUrl?: string;
  title: string;
};

export type MediaMentionCandidate = {
  activation:
    | { type: 'connected'; inputKey: string }
    | { type: 'canvas'; nodeId: string }
    | { type: 'asset'; assetId: string };
  candidateKey: string;
  mediaKind: FlowMediaMentionKind;
  mentionLabel?: string;
  thumbnailUrl?: string;
  title: string;
  disabledReason?: string;
};

type CandidateInput = {
  allowedKinds: ReadonlySet<FlowMediaMentionKind>;
  /**
   * When present, non-connected media stays visible and is disabled instead of
   * being filtered out. Existing callers can omit it to retain the legacy
   * allowed-kinds filtering behavior.
   */
  disabledReasons?: ReadonlyMap<FlowMediaMentionKind, string> | Partial<Record<FlowMediaMentionKind, string>>;
  assets: MediaMentionAssetSeed[];
  canvas: MediaMentionCanvasSeed[];
  connected: MediaMentionConnectedSeed[];
  currentNodeId: string;
  recentAssetIds: string[];
};

/**
 * Produces the stable, media-only source list used by the @ picker.
 * Connection identities take priority over a canvas node or library asset that
 * represent the same underlying source, so activating a duplicate can never
 * accidentally create a second input.
 */
export function buildMediaMentionCandidates(input: CandidateInput): MediaMentionCandidate[] {
  const isMediaKind = (kind: MediaMentionConnectedSeed['kind']): kind is FlowMediaMentionKind => kind !== 'text';
  const disabledReasonFor = (kind: FlowMediaMentionKind): string | undefined => {
    if (input.allowedKinds.has(kind)) return undefined;
    if (!input.disabledReasons) return undefined;
    return input.disabledReasons instanceof Map
      ? input.disabledReasons.get(kind)
      : input.disabledReasons[kind];
  };
  const shouldIncludeNewSource = (kind: MediaMentionConnectedSeed['kind']): kind is FlowMediaMentionKind =>
    isMediaKind(kind) && (input.allowedKinds.has(kind) || Boolean(input.disabledReasons));
  const connectedSourceNodeIds = new Set<string>();
  const connectedAssetIds = new Set<string>();
  const candidateKeys = new Set<string>();
  const candidates: MediaMentionCandidate[] = [];

  const add = (candidate: MediaMentionCandidate) => {
    if (candidateKeys.has(candidate.candidateKey)) return;
    candidateKeys.add(candidate.candidateKey);
    candidates.push(candidate);
  };

  for (const source of input.connected) {
    const inputKey = safeId(source.inputKey);
    if (!inputKey || !isMediaKind(source.kind)) continue;
    const sourceNodeId = safeId(source.sourceNodeId);
    const assetId = safeId(source.assetId);
    if (sourceNodeId === input.currentNodeId) continue;
    if (sourceNodeId) connectedSourceNodeIds.add(sourceNodeId);
    if (assetId) connectedAssetIds.add(assetId);
    add({
      activation: { type: 'connected', inputKey },
      candidateKey: `connected:${inputKey}`,
      mediaKind: source.kind,
      mentionLabel: source.mentionLabel,
      thumbnailUrl: safeOptionalUrl(source.thumbnailUrl),
      title: safeTitle(source.title),
    });
  }

  const canvasNodeIds = new Set<string>();
  for (const source of input.canvas) {
    const nodeId = safeId(source.nodeId);
    if (!nodeId || nodeId === input.currentNodeId || !shouldIncludeNewSource(source.kind)) continue;
    if (connectedSourceNodeIds.has(nodeId) || canvasNodeIds.has(nodeId)) continue;
    canvasNodeIds.add(nodeId);
    add({
      activation: { type: 'canvas', nodeId },
      candidateKey: `canvas:${nodeId}`,
      mediaKind: source.kind,
      disabledReason: disabledReasonFor(source.kind),
      thumbnailUrl: safeOptionalUrl(source.thumbnailUrl),
      title: safeTitle(source.title),
    });
  }

  const recentAssetIds = new Set(input.recentAssetIds.map(safeId).filter(Boolean));
  const seenAssetIds = new Set<string>();
  const usableAssets = input.assets.filter((source) => {
    const assetId = safeId(source.assetId);
    if (!assetId || !shouldIncludeNewSource(source.kind) || connectedAssetIds.has(assetId) || seenAssetIds.has(assetId)) return false;
    seenAssetIds.add(assetId);
    return true;
  });
  const orderedAssets = [
    ...usableAssets.filter((source) => recentAssetIds.has(safeId(source.assetId))),
    ...usableAssets.filter((source) => !recentAssetIds.has(safeId(source.assetId))),
  ];

  for (const source of orderedAssets) {
    const assetId = safeId(source.assetId);
    // assetId was validated while building usableAssets.
    add({
      activation: { type: 'asset', assetId },
      candidateKey: `asset:${assetId}`,
      mediaKind: source.kind as FlowMediaMentionKind,
      disabledReason: disabledReasonFor(source.kind as FlowMediaMentionKind),
      thumbnailUrl: safeOptionalUrl(source.thumbnailUrl),
      title: safeTitle(source.title),
    });
  }

  return candidates;
}

function safeId(value: string | undefined): string {
  return typeof value === 'string' ? value.trim() : '';
}

function safeTitle(value: string): string {
  return typeof value === 'string' && value.trim() ? value.trim() : 'Untitled media';
}

function safeOptionalUrl(value: string | undefined): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}
