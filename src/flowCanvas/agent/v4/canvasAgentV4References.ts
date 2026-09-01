type UnknownNode = { data?: unknown };

function cleanAssetId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const id = value.trim();
  if (!id || id.length > 200 || /[:/\\\s]/.test(id)) return null;
  return id;
}

export function collectCanvasV4ReferenceContext(nodes: UnknownNode[]): Array<{ assetId: string }> {
  const ids: string[] = [];
  const add = (value: unknown) => {
    const id = cleanAssetId(value);
    if (id && !ids.includes(id) && ids.length < 16) ids.push(id);
  };
  for (const node of nodes) {
    const data = node?.data && typeof node.data === "object" ? node.data as Record<string, unknown> : {};
    add(data.assetId);
    for (const key of ["referenceAssetItemIds", "referenceAssetIds"]) {
      const values = data[key];
      if (Array.isArray(values)) values.forEach(add);
    }
  }
  return ids.map((assetId) => ({ assetId }));
}
