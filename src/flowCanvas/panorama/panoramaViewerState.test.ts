import { describe, expect, it } from "vitest";

import {
  clampPanoramaFov,
  getDefaultPanoramaViewerState,
  resolveDirectionYaw,
} from "./panoramaViewerState";

describe("panoramaViewerState", () => {
  it("clamps FOV into the supported range", () => {
    expect(clampPanoramaFov(2)).toBe(5);
    expect(clampPanoramaFov(180)).toBe(170);
  });

  it("wraps front-yaw direction offsets", () => {
    expect(resolveDirectionYaw(170, "right")).toBe(-100);
    expect(resolveDirectionYaw(170, "back")).toBe(-10);
  });

  it("returns stable default viewer state", () => {
    expect(getDefaultPanoramaViewerState()).toEqual({
      fovDeg: 70,
      frontYawDeg: 0,
      panelOpen: true,
      sphereCorrectionDeg: { pitch: 0, roll: 0, yaw: 0 },
    });
  });
});
