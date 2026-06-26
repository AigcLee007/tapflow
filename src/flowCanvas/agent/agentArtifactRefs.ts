export type CanvasAgentArtifactRefChip = {
  label: string;
  refId: string;
};

export function buildAgentArtifactRefChips(
  refs: Array<{
    assetId: string;
    label: string;
    refId: string;
  }>,
): CanvasAgentArtifactRefChip[] {
  return refs.map((ref) => ({
    label: ref.label,
    refId: ref.refId,
  }));
}

export function normalizeAgentArtifactRefSelection(refIds: string[], nextRefId: string): string[] {
  if (!nextRefId.trim()) return refIds;
  if (refIds.includes(nextRefId)) {
    const filtered = refIds.filter((refId) => refId !== nextRefId);
    return filtered.length > 0 ? filtered : [nextRefId];
  }
  return [...refIds, nextRefId];
}
