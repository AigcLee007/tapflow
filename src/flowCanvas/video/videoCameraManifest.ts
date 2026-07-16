export const CAMERA_MOTION_IDS = [
  "fixed", "follow", "spiral-up", "spiral-down", "tilt-up", "tilt-down",
  "pan-left", "pan-right", "crane-up", "crane-down", "truck-left", "truck-right",
  "dolly-in", "dolly-out", "zoom-in", "zoom-out", "dolly-zoom", "orbit", "roll",
  "fpv", "drone", "aerial", "handheld",
] as const;

export type CameraMotionId = (typeof CAMERA_MOTION_IDS)[number];
export type VideoCameraMotion = { id: CameraMotionId; label: string; poster: string; preview: string; durationMs: number; version: 1; attribution: "TapFlow original"; codec?: "vp9" | "vp8" };
export type VideoCameraManifest = { version: 1; attribution: "TapFlow original"; items: VideoCameraMotion[] };

const knownIds = new Set<string>(CAMERA_MOTION_IDS);

function isCameraMotion(value: unknown): value is VideoCameraMotion {
  if (!value || typeof value !== "object") return false;
  const motion = value as Record<string, unknown>;
  return knownIds.has(String(motion.id))
    && typeof motion.label === "string" && motion.label.trim().length > 0
    && typeof motion.poster === "string" && motion.poster.trim().length > 0
    && typeof motion.preview === "string" && motion.preview.trim().length > 0
    && typeof motion.durationMs === "number" && motion.durationMs >= 1000 && motion.durationMs <= 4000
    && motion.version === 1 && motion.attribution === "TapFlow original";
}

export function loadVideoCameraManifest(value: unknown): VideoCameraManifest {
  const raw = value as Partial<VideoCameraManifest> | null;
  const items = Array.isArray(raw?.items) ? raw.items.filter(isCameraMotion) : [];
  return { version: 1, attribution: "TapFlow original", items };
}

export function getCameraMotionById(id: string | null | undefined, manifest: VideoCameraManifest): VideoCameraMotion | null {
  return manifest.items.find((item) => item.id === id) ?? null;
}
