import { describe, expect, it } from "vitest";
import type { VideoGenerationCapabilities } from "../video/videoTypes";
import { resolveVideoMentionAllowedKinds } from "./videoMentionCapabilities";

const capabilities = {
  maxImages: 1,
  maxVideos: 2,
  maxAudios: 0,
  modeConstraints: { image_to_video: { maxImages: 0, maxVideos: 1 } },
} as VideoGenerationCapabilities;

describe("resolveVideoMentionAllowedKinds", () => {
  it("keeps candidates unavailable while catalog is loading or failed", () => {
    expect(resolveVideoMentionAllowedKinds({ capabilities, mode: "text_to_video", catalogState: "loading" }).state).toBe("loading");
    expect(resolveVideoMentionAllowedKinds({ capabilities: undefined, mode: "text_to_video", catalogState: "error" }).state).toBe("unavailable");
  });
  it("uses route mode limits and never defaults unknown limits to allowed", () => {
    const result = resolveVideoMentionAllowedKinds({ capabilities, mode: "image_to_video", catalogState: "ready" });
    expect([...result.allowedKinds]).toEqual(["video"]);
  });
  it("returns all explicitly supported media limits", () => {
    const result = resolveVideoMentionAllowedKinds({ capabilities, mode: "text_to_video", catalogState: "ready" });
    expect([...result.allowedKinds]).toEqual(["image", "video"]);
  });
});
