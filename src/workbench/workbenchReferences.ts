function toPositiveInt(value: unknown): number | null {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  const integer = Math.floor(parsed);
  return integer > 0 ? integer : null;
}

export function parseWorkbenchReferenceIndices(prompt: string, maxCount: number): number[] {
  const tags = String(prompt || "").matchAll(/@(?:图)?\s*(\d+)/g);
  const seen = new Set<number>();
  const indices: number[] = [];

  for (const match of tags) {
    const index = toPositiveInt(match[1]);
    if (!index || index > maxCount || seen.has(index)) continue;
    seen.add(index);
    indices.push(index);
  }

  return indices;
}

export function getReferencedAssetIdsForPrompt(prompt: string, assetIds: string[]): string[] {
  const source = Array.isArray(assetIds) ? assetIds : [];
  const indices = parseWorkbenchReferenceIndices(prompt, source.length);
  if (indices.length === 0) return source;
  return indices.map((index) => source[index - 1]).filter((assetId): assetId is string => Boolean(assetId));
}

export function insertWorkbenchReferenceMention(
  prompt: string,
  index: number,
  caretPosition?: number,
): { caretPosition: number; prompt: string } {
  const value = String(prompt || "");
  const safeCaret = Math.max(0, Math.min(Number(caretPosition ?? value.length) || 0, value.length));
  const token = `@图${index}`;
  const prefix = safeCaret > 0 && !/\s/.test(value[safeCaret - 1] ?? "") ? " " : "";
  const suffix = value[safeCaret] && !/\s/.test(value[safeCaret] ?? "") ? " " : "";
  const insertion = `${prefix}${token}${suffix || " "}`;
  return {
    caretPosition: safeCaret + insertion.length,
    prompt: `${value.slice(0, safeCaret)}${insertion}${value.slice(safeCaret)}`,
  };
}
