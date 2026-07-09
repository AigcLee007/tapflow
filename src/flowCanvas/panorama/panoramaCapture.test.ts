import { describe, expect, it } from "vitest";

import {
  buildPanoramaCaptureFrames,
  buildPanoramaCaptureGridPositions,
  buildPanoramaCaptureNodeTitle,
  shouldGroupPanoramaCaptures,
} from "./panoramaCapture";

describe("panoramaCapture", () => {
  it("builds one capture frame for the current view", () => {
    expect(buildPanoramaCaptureFrames("current")).toHaveLength(1);
  });

  it("builds four capture frames for the 2x2 grid export", () => {
    expect(buildPanoramaCaptureFrames("grid_2x2")).toHaveLength(4);
  });

  it("builds twelve capture frames for the 4x3 grid export", () => {
    expect(buildPanoramaCaptureFrames("grid_4x3")).toHaveLength(12);
  });

  it("groups multi-capture outputs and leaves single captures ungrouped", () => {
    expect(shouldGroupPanoramaCaptures(4)).toBe(true);
    expect(shouldGroupPanoramaCaptures(1)).toBe(false);
  });

  it("lays out four capture nodes in a stable 2x2 grid", () => {
    expect(buildPanoramaCaptureGridPositions(4, { x: 100, y: 200 })).toEqual([
      { x: 100, y: 200 },
      { x: 404, y: 200 },
      { x: 100, y: 404 },
      { x: 404, y: 404 },
    ]);
  });

  it("builds a readable capture node title from the source title and frame label", () => {
    expect(buildPanoramaCaptureNodeTitle("Panorama Source", "Front")).toBe("Panorama Source - Front");
  });
});
