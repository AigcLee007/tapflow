export const CAMERA_MOTION_IDS = [
  "fixed", "follow", "spiral-up", "spiral-down", "tilt-up", "tilt-down",
  "pan-left", "pan-right", "crane-up", "crane-down", "truck-left", "truck-right",
  "dolly-in", "dolly-out", "zoom-in", "zoom-out", "dolly-zoom", "orbit", "roll",
  "fpv", "drone", "aerial", "handheld",
] as const;

export type CameraMotionId = (typeof CAMERA_MOTION_IDS)[number];
// Manifest labels remain metadata. This mapping owns all creator-facing names.
export const CAMERA_MOTION_LABELS: Record<CameraMotionId, string> = {
  fixed: "\u56fa\u5b9a\u955c\u5934", follow: "\u8ddf\u968f\u62cd\u6444", "spiral-up": "\u76d8\u65cb\u62ac\u5347", "spiral-down": "\u76d8\u65cb\u4e0b\u964d",
  "tilt-up": "\u955c\u5934\u4e0a\u6447", "tilt-down": "\u955c\u5934\u4e0b\u6447", "pan-left": "\u955c\u5934\u5de6\u6447", "pan-right": "\u955c\u5934\u53f3\u6447",
  "crane-up": "\u955c\u5934\u4e0a\u5347", "crane-down": "\u955c\u5934\u4e0b\u964d", "truck-left": "\u955c\u5934\u5de6\u79fb", "truck-right": "\u955c\u5934\u53f3\u79fb",
  "dolly-in": "\u63a8\u8fdb", "dolly-out": "\u62c9\u8fdc", "zoom-in": "\u53d8\u7126\u63a8\u8fdb", "zoom-out": "\u53d8\u7126\u62c9\u8fdc",
  "dolly-zoom": "\u5e0c\u533a\u67ef\u514b\u53d8\u7126", orbit: "\u73af\u7ed5\u62cd\u6444", roll: "\u6eda\u8f6c", fpv: "\u7b2c\u4e00\u89c6\u89d2",
  drone: "\u65e0\u4eba\u673a\u62cd\u6444", aerial: "\u9ad8\u7a7a\u822a\u62cd", handheld: "\u624b\u6301\u62cd\u6444",
};

export function getCameraMotionLabel(id: CameraMotionId | null | undefined): string | null {
  return id ? CAMERA_MOTION_LABELS[id] : null;
}
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
