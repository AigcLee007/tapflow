import { describe, expect, test } from "vitest";

import {
  getPersistedVideoResultAssetId,
  getSafePersistedVideoPosterUrl,
  getSelectedRuntimeVideoPreviewUrl,
} from "./videoResultPreview";

describe("video result preview selection", () => {
  test("uses the active persisted asset result rather than its transient URL", () => {
    expect(getPersistedVideoResultAssetId({
      activeResultIndex: 1,
      generatedResults: [
        { id: "asset:video-one", url: "https://cdn.test/one.mp4?X-Amz-Signature=one" },
        { id: "asset:video-two", url: "blob:http://localhost/two" },
      ],
    })).toBe("video-two");
  });

  test("rejects malformed result ids and unsafe persisted poster URLs", () => {
    expect(getPersistedVideoResultAssetId({
      activeResultIndex: 0,
      generatedResults: [{ id: "https://cdn.test/video.mp4", url: "https://cdn.test/video.mp4" }],
    })).toBeNull();
    expect(getSafePersistedVideoPosterUrl("data:video/mp4;base64,abc")).toBeNull();
    expect(getSafePersistedVideoPosterUrl("https://cdn.test/video.mp4?X-Amz-Signature=signed")).toBeNull();
    expect(getSafePersistedVideoPosterUrl("/video-library/preview.mp4")).toBe("/video-library/preview.mp4");
  });

  test("uses the active runtime output index and falls back to the first current output", () => {
    const assets = [
      { downloadUrl: "https://cdn.test/one.mp4?X-Amz-Signature=one" },
      { downloadUrl: "https://cdn.test/two.mp4?X-Amz-Signature=two" },
    ];
    expect(getSelectedRuntimeVideoPreviewUrl(assets, 1)).toBe(assets[1]?.downloadUrl);
    expect(getSelectedRuntimeVideoPreviewUrl(assets, 9)).toBe(assets[0]?.downloadUrl);
  });
});
