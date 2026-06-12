import { describe, expect, it } from "vitest";

import type { AssetItem } from "./assetApi";
import {
  getPreferredAssetPreviewRequest,
  groupAssetsByCreatedDate,
} from "./assetLibraryView";

const baseAsset: AssetItem = {
  bucket: "bucket",
  checksumSha256: null,
  createdAt: "2026-06-12T09:00:00.000Z",
  deletedAt: null,
  description: null,
  durationMs: null,
  favorite: false,
  height: 512,
  id: "asset-1",
  kind: "image",
  metadata: {},
  mimeType: "image/png",
  objectKey: "asset-1.png",
  originalFilename: "asset-1.png",
  ownerUserId: "user-1",
  projectId: null,
  sizeBytes: 1024,
  source: "upload",
  status: "available",
  storageProvider: "s3",
  tags: [],
  tenantId: "tenant-1",
  title: "Asset 1",
  updatedAt: "2026-06-12T09:00:00.000Z",
  variants: [],
  width: 512,
};

describe("assetLibraryView", () => {
  it("prefers thumb, then preview, then original for media previews", () => {
    expect(
      getPreferredAssetPreviewRequest({
        ...baseAsset,
        variants: [
          {
            bucket: "bucket",
            height: 320,
            id: "variant-thumb",
            metadata: {},
            mimeType: "image/webp",
            objectKey: "thumb.webp",
            sizeBytes: 123,
            variantKey: "thumb",
            width: 320,
          },
        ],
      }),
    ).toEqual({ assetId: "asset-1", variantKey: "thumb" });

    expect(
      getPreferredAssetPreviewRequest({
        ...baseAsset,
        variants: [
          {
            bucket: "bucket",
            height: 1024,
            id: "variant-preview",
            metadata: {},
            mimeType: "image/webp",
            objectKey: "preview.webp",
            sizeBytes: 456,
            variantKey: "preview",
            width: 1024,
          },
        ],
      }),
    ).toEqual({ assetId: "asset-1", variantKey: "preview" });

    expect(getPreferredAssetPreviewRequest(baseAsset)).toEqual({ assetId: "asset-1" });
  });

  it("groups assets by created date from newest to oldest", () => {
    const groups = groupAssetsByCreatedDate([
      { ...baseAsset, id: "asset-old", title: "Old", createdAt: "2026-06-10T08:00:00.000Z" },
      { ...baseAsset, id: "asset-newest", title: "Newest", createdAt: "2026-06-12T12:00:00.000Z" },
      { ...baseAsset, id: "asset-mid", title: "Mid", createdAt: "2026-06-11T07:00:00.000Z" },
      { ...baseAsset, id: "asset-same-day", title: "Same Day", createdAt: "2026-06-12T06:00:00.000Z" },
    ]);

    expect(groups.map((group) => group.dateLabel)).toEqual([
      "2026-06-12",
      "2026-06-11",
      "2026-06-10",
    ]);
    expect(groups[0]?.items.map((item) => item.title)).toEqual(["Newest", "Same Day"]);
    expect(groups[1]?.items.map((item) => item.title)).toEqual(["Mid"]);
    expect(groups[2]?.items.map((item) => item.title)).toEqual(["Old"]);
  });
});
