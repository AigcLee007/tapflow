const FOV_MIN = 5;
const FOV_MAX = 170;

export type PanoramaDirection = "front" | "right" | "back" | "left" | "seam";

const DIRECTION_OFFSETS: Record<PanoramaDirection, number> = {
  back: 180,
  front: 0,
  left: -90,
  right: 90,
  seam: -180,
};

export function getDefaultPanoramaViewerState() {
  return {
    fovDeg: 70,
    frontYawDeg: 0,
    panelOpen: true,
    sphereCorrectionDeg: { pitch: 0, roll: 0, yaw: 0 },
  };
}

export function clampPanoramaFov(value: number) {
  return Math.max(FOV_MIN, Math.min(FOV_MAX, Math.round(value)));
}

export function wrapPanoramaDegrees(value: number) {
  return ((Math.round(value) + 540) % 360) - 180;
}

export function resolveDirectionYaw(frontYawDeg: number, direction: PanoramaDirection) {
  return wrapPanoramaDegrees(frontYawDeg + DIRECTION_OFFSETS[direction]);
}
