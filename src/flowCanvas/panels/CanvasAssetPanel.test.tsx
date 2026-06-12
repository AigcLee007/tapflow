import React from "react";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import type { AssetItem } from "../../assets/assetApi";
import { CanvasAssetPanel } from "./CanvasAssetPanel";

const useAssetLibraryMock = vi.fn();

vi.mock("../../assets/useAssetLibrary", () => ({
  useAssetLibrary: () => useAssetLibraryMock(),
}));

vi.mock("../../assets/UploadAssetButton", () => ({
  UploadAssetButton: ({ onUploaded }: { onUploaded: () => void }) => (
    <button onClick={onUploaded} type="button">
      upload
    </button>
  ),
}));

function createAsset(overrides: Partial<AssetItem> = {}): AssetItem {
  return {
    bucket: "assets",
    checksumSha256: null,
    createdAt: "2026-06-12T08:30:00.000Z",
    deletedAt: null,
    description: null,
    durationMs: null,
    favorite: false,
    height: 1024,
    id: "asset-1",
    kind: "image",
    metadata: {},
    mimeType: "image/png",
    objectKey: "images/asset-1.png",
    originalFilename: "drawer-reference.png",
    ownerUserId: "user-1",
    previewUrl: "https://example.com/asset-1-thumb.png",
    projectId: "project-1",
    sizeBytes: 2_048_000,
    source: "upload",
    status: "available",
    storageProvider: "s3",
    tags: [],
    tenantId: "tenant-1",
    title: "drawer-reference.png",
    updatedAt: "2026-06-12T08:30:00.000Z",
    variants: [],
    width: 1024,
    ...overrides,
  };
}

describe("CanvasAssetPanel", () => {
  beforeEach(() => {
    useAssetLibraryMock.mockReturnValue({
      assets: [createAsset()],
      error: null,
      folders: [{ id: "folder-1", name: "Recent", createdAt: "", createdBy: null, deletedAt: null, description: null, parentFolderId: null, tenantId: "tenant-1", updatedAt: "" }],
      groupedAssets: [{ dateLabel: "2026-06-12", items: [createAsset()] }],
      loading: false,
      page: 1,
      pageSize: 60,
      query: "",
      refresh: vi.fn(async () => undefined),
      selectedFolderId: null,
      selectedMediaTab: "image",
      setQuery: vi.fn(),
      setSelectedFolderId: vi.fn(),
      setSelectedMediaTab: vi.fn(),
      total: 1,
    });
  });

  test("renders the drawer as date-grouped thumbnails without verbose asset metadata", () => {
    render(<CanvasAssetPanel onInsertAsset={vi.fn()} projectId="project-1" />);

    expect(screen.getByText("2026-06-12")).toBeTruthy();
    expect(screen.getByRole("button", { name: /图片1/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /视频0/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /音频0/ })).toBeTruthy();

    expect(screen.queryByText("drawer-reference.png")).toBeNull();
    expect(screen.queryByText("2.0 MB")).toBeNull();
    expect(screen.queryByRole("button", { name: /all/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /recent/i })).toBeNull();
  });

  test("does not show asset management buttons inside the drawer", () => {
    render(<CanvasAssetPanel onInsertAsset={vi.fn()} projectId="project-1" />);

    expect(screen.queryByRole("button", { name: "管理素材 drawer-reference.png" })).toBeNull();
  });

  test("does not render search or upload controls in the drawer header", () => {
    render(<CanvasAssetPanel onInsertAsset={vi.fn()} projectId="project-1" />);

    expect(screen.queryByPlaceholderText("搜索素材")).toBeNull();
    expect(screen.queryByRole("button", { name: "upload" })).toBeNull();
    expect(screen.getByRole("button", { name: /图片1/ })).toBeTruthy();
  });
});
