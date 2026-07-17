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

  it("accepts only canonical local vp9 cards and removes duplicate motion ids", () => {
    const validCard = {
      id: "fixed",
      label: "固定镜头",
      poster: "v1/fixed.webp",
      preview: "v1/fixed.webm",
      durationMs: 2500,
      version: 1,
      attribution: "TapFlow original",
      codec: "vp9",
    } as const;

    const manifest = loadVideoCameraManifest({
      version: 1,
      attribution: "TapFlow original",
      items: [
        validCard,
        { ...validCard, id: "follow", poster: "https://example.test/follow.webp", preview: "https://example.test/follow.webm" },
        { ...validCard, id: "spiral-up", poster: "v1/spiral-up.webp", preview: "v1/spiral-up.webm", codec: "h264" },
        { ...validCard, id: "spiral-down", poster: "v1/spiral-down.webp", preview: "v1/spiral-down.webm", codec: "av1" },
        { ...validCard, id: "tilt-up", poster: "v1/tilt-up.webp", preview: "v1/not-tilt-up.webm" },
        { ...validCard, label: "重复固定镜头" },
      ],
    });

    expect(manifest.items).toEqual([validCard]);
  });
});
