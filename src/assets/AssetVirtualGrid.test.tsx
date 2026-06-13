import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import type { AssetItem } from "./assetApi";
import { AssetVirtualGrid } from "./AssetVirtualGrid";

vi.mock("./AssetCard", () => ({
  AssetCard: ({ asset }: { asset: AssetItem }) => <div>{asset.title}</div>,
}));

function createAsset(index: number): AssetItem {
  return {
    bucket: "assets",
    checksumSha256: null,
    createdAt: "2026-06-12T01:00:00.000Z",
    deletedAt: null,
    description: null,
    durationMs: null,
    favorite: false,
    height: 512,
    id: `asset-${index}`,
    kind: "image",
    metadata: {},
    mimeType: "image/png",
    objectKey: `asset-${index}.png`,
    originalFilename: `asset-${index}.png`,
    ownerUserId: "user-1",
    previewUrl: null,
    projectId: null,
    sizeBytes: 1200,
    source: "upload",
    status: "available",
    storageProvider: "s3",
    tags: [],
    tenantId: "tenant-1",
    title: `Asset ${index}`,
    updatedAt: "2026-06-12T01:00:00.000Z",
    variants: [],
    width: 512,
  };
}

describe("AssetVirtualGrid", () => {
  test("renders a readable load more button when the grid is truncated", () => {
    render(<AssetVirtualGrid items={Array.from({ length: 40 }, (_, index) => createAsset(index))} />);

    expect(screen.getByRole("button", { name: "加载更多" })).toBeTruthy();
  });
});
