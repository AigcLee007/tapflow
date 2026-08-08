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
    const loading = resolveVideoMentionAllowedKinds({ capabilities, mode: "text_to_video", catalogState: "loading" });
    const unavailable = resolveVideoMentionAllowedKinds({ capabilities: undefined, mode: "text_to_video", catalogState: "error" });
    expect(loading.state).toBe("loading");
    expect(loading.disabledReason).toBeTruthy();
    expect(loading.disabledReasons.get("image")).toBe(loading.disabledReason);
    expect(unavailable.state).toBe("unavailable");
    expect(unavailable.disabledReason).toBeTruthy();
    expect(unavailable.disabledReasons.get("video")).toBe(unavailable.disabledReason);
  });
  it("uses route mode limits and never defaults unknown limits to allowed", () => {
    const result = resolveVideoMentionAllowedKinds({ capabilities, mode: "image_to_video", catalogState: "ready" });
    expect([...result.allowedKinds]).toEqual(["video"]);
    expect(result.disabledReason).toBeUndefined();
    expect(result.disabledReasons.get("image")).toBeTruthy();
    expect(result.disabledReasons.get("video")).toBeUndefined();
  });
  it("returns all explicitly supported media limits", () => {
    const result = resolveVideoMentionAllowedKinds({ capabilities, mode: "text_to_video", catalogState: "ready" });
    expect([...result.allowedKinds]).toEqual(["image", "video"]);
  });
});
