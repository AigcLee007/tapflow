import { describe, expect, it } from "vitest";
import {
  getMediaMentionLabel,
  indexMediaReferenceIdentities,
  type MediaReferenceSeed,
} from "./mediaReferenceIdentity";

describe("media reference identities", () => {
  it("uses independent labels for each media kind", () => {
    expect(getMediaMentionLabel("image", 1)).toBe("图片1");
    expect(getMediaMentionLabel("image", 2)).toBe("图片2");
    expect(getMediaMentionLabel("video", 1)).toBe("视频1");
    expect(getMediaMentionLabel("audio", 1)).toBe("音频1");
  });

  it("filters text and preserves input identity and runtime fields", () => {
    const seeds: MediaReferenceSeed[] = [
      { inputKey: "text:t", kind: "text", title: "Text" },
      { inputKey: "image:a", kind: "image", title: "A", thumbnailUrl: "thumb-a", previewUrl: "preview-a" },
      { inputKey: "video:v", kind: "video", title: "V", thumbnailUrl: "thumb-v", previewUrl: "preview-v" },
      { inputKey: "image:b", kind: "image", title: "B", assetId: "asset-b" },
    ];

    expect(indexMediaReferenceIdentities(seeds)).toEqual([
      expect.objectContaining({ inputKey: "image:a", kind: "image", kindIndex: 1, mentionLabel: "图片1", thumbnailUrl: "thumb-a", previewUrl: "preview-a" }),
      expect.objectContaining({ inputKey: "video:v", kind: "video", kindIndex: 1, mentionLabel: "视频1", thumbnailUrl: "thumb-v", previewUrl: "preview-v" }),
      expect.objectContaining({ inputKey: "image:b", kind: "image", kindIndex: 2, mentionLabel: "图片2", assetId: "asset-b" }),
    ]);
  });
});
