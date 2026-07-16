export const CAMERA_MOTION_IDS = [
  "fixed", "follow", "spiral-up", "spiral-down", "tilt-up", "tilt-down",
  "pan-left", "pan-right", "crane-up", "crane-down", "truck-left", "truck-right",
  "dolly-in", "dolly-out", "zoom-in", "zoom-out", "dolly-zoom", "orbit", "roll",
  "fpv", "drone", "aerial", "handheld",
] as const;

export type CameraMotionId = (typeof CAMERA_MOTION_IDS)[number];
export type VideoCameraMotion = { id: CameraMotionId; label: string; poster: string; preview: string; durationMs: number; version: 1; attribution: "TapFlow original"; codec: "vp9" };
export type VideoCameraManifest = { version: 1; attribution: "TapFlow original"; items: VideoCameraMotion[] };

const knownIds = new Set<string>(CAMERA_MOTION_IDS);

function isCameraMotion(value: unknown): value is VideoCameraMotion {
  if (!value || typeof value !== "object") return false;
  const motion = value as Record<string, unknown>;
  const id = String(motion.id);
  return knownIds.has(id)
    && typeof motion.label === "string" && motion.label.trim().length > 0
    && motion.poster === `v1/${id}.webp`
    && motion.preview === `v1/${id}.webm`
    && typeof motion.durationMs === "number" && Number.isFinite(motion.durationMs) && motion.durationMs >= 1000 && motion.durationMs <= 4000
    && motion.version === 1 && motion.attribution === "TapFlow original" && motion.codec === "vp9";
}

export function loadVideoCameraManifest(value: unknown): VideoCameraManifest {
  const raw = value as Partial<VideoCameraManifest> | null;
  if (raw?.version !== 1 || raw.attribution !== "TapFlow original") {
    return { version: 1, attribution: "TapFlow original", items: [] };
  }

  const seenIds = new Set<CameraMotionId>();
  const items = Array.isArray(raw.items)
    ? raw.items.filter(isCameraMotion).filter((item) => {
      if (seenIds.has(item.id)) return false;
      seenIds.add(item.id);
      return true;
    })
    : [];
  return { version: 1, attribution: "TapFlow original", items };
}

export function getCameraMotionById(id: string | null | undefined, manifest: VideoCameraManifest): VideoCameraMotion | null {
  return manifest.items.find((item) => item.id === id) ?? null;
}
