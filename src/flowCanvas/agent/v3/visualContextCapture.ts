export type VisualCaptureMetadata = { id: string; kind: "viewport" | "selection" | "region"; width: number; height: number; expiresAt: string };
export function buildVisualCaptureMetadata(input: { id: string; kind: VisualCaptureMetadata["kind"]; width: number; height: number; expiresAt: string }): VisualCaptureMetadata | null {
  if (!input.id || !Number.isFinite(input.width) || !Number.isFinite(input.height) || input.width <= 0 || input.height <= 0 || input.width > 4096 || input.height > 4096 || Date.parse(input.expiresAt) <= Date.now()) return null;
  return { id: input.id, kind: input.kind, width: Math.round(input.width), height: Math.round(input.height), expiresAt: input.expiresAt };
}
