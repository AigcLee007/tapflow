export type VisualContextRef = {
  id: string;
  kind: string;
  width: number;
  height: number;
  expiresAt: string;
};

export type VisualCapture = { id: string; flowId: string; kind: string; width: number; height: number; expiresAt: string };

export async function buildVisualContextRefs(input: {
  flowId: string;
  captureIds: string[];
  repository: { findCapture: (id: string) => Promise<VisualCapture | null | undefined> };
  now?: Date;
}): Promise<VisualContextRef[]> {
  const now = (input.now ?? new Date()).getTime();
  const refs: VisualContextRef[] = [];
  for (const id of input.captureIds) {
    if (refs.length >= 4) break;
    const capture = await input.repository.findCapture(id);
    if (!capture || capture.flowId !== input.flowId) continue;
    const expiry = Date.parse(capture.expiresAt);
    if (!Number.isFinite(expiry) || expiry <= now) continue;
    if (!Number.isFinite(capture.width) || !Number.isFinite(capture.height)) continue;
    refs.push({ id: capture.id, kind: capture.kind, width: capture.width, height: capture.height, expiresAt: capture.expiresAt });
  }
  return refs;
}
