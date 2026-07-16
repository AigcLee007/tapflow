import { describe, expect, it } from "vitest";

import {
  CAMERA_MOTION_IDS,
  getCameraMotionById,
  loadVideoCameraManifest,
} from "./videoCameraManifest";

describe("video camera manifest", () => {
  it("exposes all valid original camera motions and filters corrupt cards", () => {
    expect(CAMERA_MOTION_IDS).toEqual([
      "fixed", "follow", "spiral-up", "spiral-down", "tilt-up", "tilt-down",
      "pan-left", "pan-right", "crane-up", "crane-down", "truck-left", "truck-right",
      "dolly-in", "dolly-out", "zoom-in", "zoom-out", "dolly-zoom", "orbit", "roll",
      "fpv", "drone", "aerial", "handheld",
    ]);

    const manifest = loadVideoCameraManifest({
      version: 1,
      attribution: "TapFlow original",
      items: [
        {
          id: "fixed",
          label: "固定镜头",
          poster: "v1/fixed.webp",
          preview: "v1/fixed.webm",
          durationMs: 2500,
          version: 1,
          attribution: "TapFlow original",
          codec: "vp9",
        },
        {
          id: "follow",
          label: "跟随镜头",
          poster: "",
          preview: "v1/follow.webm",
          durationMs: 2500,
          version: 1,
          attribution: "TapFlow original",
        },
      ],
    });

    expect(manifest.items.map((item) => item.id)).toEqual(["fixed"]);
    expect(getCameraMotionById("fixed", manifest)?.label).toBe("固定镜头");
    expect(getCameraMotionById("unknown", manifest)).toBeNull();
  });
});
