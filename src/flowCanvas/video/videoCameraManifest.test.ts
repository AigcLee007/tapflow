import { describe, expect, it } from "vitest";

import {
  CAMERA_MOTION_LABELS,
  CAMERA_MOTION_IDS,
  getCameraMotionById,
  loadVideoCameraManifest,
} from "./videoCameraManifest";

describe("video camera manifest", () => {
  it("owns a stable Chinese label for every camera motion id", () => {
    expect(Object.keys(CAMERA_MOTION_LABELS)).toEqual(CAMERA_MOTION_IDS);
    expect(CAMERA_MOTION_LABELS.fixed).toBe("\u56fa\u5b9a\u955c\u5934");
    expect(CAMERA_MOTION_LABELS["dolly-in"]).toBe("\u63a8\u8fdb");
  });

  it("exposes all licensed DramaClaw camera motions and filters corrupt cards", () => {
    expect(CAMERA_MOTION_IDS).toEqual([
      "fixed", "follow", "spiral-up", "spiral-down", "tilt-up", "tilt-down",
      "pan-left", "pan-right", "crane-up", "crane-down", "truck-left", "truck-right",
      "dolly-in", "dolly-out", "zoom-in", "zoom-out", "dolly-zoom", "orbit", "roll",
      "fpv", "drone", "aerial", "handheld",
    ]);

    const manifest = loadVideoCameraManifest({
      version: 2,
      attribution: "DramaClaw commercial license",
      items: [
        {
          id: "fixed",
          label: "固定镜头",
          preview: "v2/fixed.mp4",
          durationMs: 2500,
          version: 2,
          attribution: "DramaClaw commercial license",
          codec: "h264",
        },
        {
          id: "follow",
          label: "跟随镜头",
          preview: "v2/follow.mp4",
          durationMs: 2500,
          version: 2,
          attribution: "DramaClaw commercial license",
        },
      ],
    });

    expect(manifest.items.map((item) => item.id)).toEqual(["fixed"]);
    expect(getCameraMotionById("fixed", manifest)?.label).toBe("固定镜头");
    expect(getCameraMotionById("unknown", manifest)).toBeNull();
  });

  it("accepts only canonical licensed MP4 cards and removes duplicate motion ids", () => {
    const validCard = {
      id: "fixed",
      label: "固定镜头",
      preview: "v2/fixed.mp4",
      durationMs: 2500,
      version: 2,
      attribution: "DramaClaw commercial license",
      codec: "h264",
    } as const;

    const manifest = loadVideoCameraManifest({
      version: 2,
      attribution: "DramaClaw commercial license",
      items: [
        validCard,
        { ...validCard, id: "follow", preview: "https://example.test/follow.mp4" },
        { ...validCard, id: "spiral-up", preview: "v2/spiral-up.mp4", codec: "vp9" },
        { ...validCard, id: "spiral-down", preview: "v2/spiral-down.webm" },
        { ...validCard, id: "tilt-up", preview: "v2/not-tilt-up.mp4" },
        { ...validCard, label: "重复固定镜头" },
      ],
    });

    expect(manifest.items).toEqual([validCard]);
  });
});
