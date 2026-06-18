import React from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AssetPreviewModal } from "./AssetPreviewModal";
import type { AssetItem } from "./assetApi";

const listWorkspaceProjectsMock = vi.fn();
const updateWorkspaceProjectMock = vi.fn();
const getAssetDownloadUrlMock = vi.fn();
const getAssetVariantUrlMock = vi.fn();
const updateAssetMetadataMock = vi.fn();

vi.mock("../workspace/workspaceApi", () => ({
  listWorkspaceProjects: (...args: unknown[]) => listWorkspaceProjectsMock(...args),
  updateWorkspaceProject: (...args: unknown[]) => updateWorkspaceProjectMock(...args),
}));

vi.mock("./assetApi", () => ({
  getAssetDownloadUrl: (...args: unknown[]) => getAssetDownloadUrlMock(...args),
  getAssetVariantUrl: (...args: unknown[]) => getAssetVariantUrlMock(...args),
  updateAssetMetadata: (...args: unknown[]) => updateAssetMetadataMock(...args),
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, reject, resolve };
}

const asset: AssetItem = {
  bucket: "bucket",
  checksumSha256: null,
  createdAt: "2026-05-19T00:00:00.000Z",
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
  previewUrl: "https://example.test/asset-1.png",
  projectId: null,
  sizeBytes: 1200,
  source: "upload",
  status: "available",
  storageProvider: "s3",
  tags: [],
  tenantId: "tenant-1",
  title: "Asset 1",
  updatedAt: "2026-05-19T00:00:00.000Z",
  variants: [],
  width: 512,
};

describe("AssetPreviewModal", () => {
  beforeEach(() => {
    listWorkspaceProjectsMock.mockReset();
    updateWorkspaceProjectMock.mockReset();
    getAssetDownloadUrlMock.mockReset();
    getAssetVariantUrlMock.mockReset();
    updateAssetMetadataMock.mockReset();
  });

  it("keeps the close button available while setting a project cover", async () => {
    listWorkspaceProjectsMock.mockResolvedValue([
      {
        coverAssetId: null,
        createdAt: "2026-05-19T00:00:00.000Z",
        createdBy: "user-1",
        description: null,
        id: "project-1",
        name: "Project One",
        tenantId: "tenant-1",
        updatedAt: "2026-05-19T00:00:00.000Z",
      },
    ]);

    const saveRequest = deferred<{ coverAssetId: string }>();
    updateWorkspaceProjectMock.mockReturnValue(saveRequest.promise);
    getAssetVariantUrlMock.mockResolvedValue({
      expiresAt: "2026-05-19T01:00:00.000Z",
      method: "GET",
      url: "https://example.test/asset-1-preview.webp",
      variantKey: "preview",
    });

    const onClose = vi.fn();
    render(<AssetPreviewModal asset={asset} onClose={onClose} onUpdated={() => undefined} />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "asset project Project One" })).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("button", { name: /设为项目封面/i }));

    const closeButton = screen.getByRole("button", { name: /关闭预览/i });
    expect(closeButton).toBeTruthy();

    fireEvent.click(closeButton);
    expect(onClose).toHaveBeenCalledTimes(1);

    await act(async () => {
      saveRequest.resolve({ coverAssetId: asset.id });
      await saveRequest.promise;
    });
  });

  it("uses a full-screen centered detail preview matching the asset reference modal", async () => {
    listWorkspaceProjectsMock.mockResolvedValue([]);
    getAssetVariantUrlMock.mockResolvedValue({
      expiresAt: "2026-05-19T01:00:00.000Z",
      method: "GET",
      url: "https://example.test/asset-1-preview.webp",
      variantKey: "preview",
    });

    render(<AssetPreviewModal asset={asset} onClose={() => undefined} onUpdated={() => undefined} />);

    await waitFor(() => {
      expect(getAssetVariantUrlMock).toHaveBeenCalledWith("asset-1", "preview");
    });

    const overlay = screen.getByTestId("asset-preview-overlay");
    const backdrop = screen.getByTestId("asset-preview-backdrop");
    const panel = screen.getByRole("dialog");
    const imageStage = screen.getByTestId("asset-preview-stage");

    expect(overlay.parentElement).toBe(document.body);
    expect(overlay.className).toContain("fixed");
    expect(overlay.className).toContain("inset-0");
    expect(overlay.className).toContain("z-[2600]");
    expect(overlay.className).toContain("items-center");
    expect(overlay.className).toContain("justify-center");
    expect(backdrop.className).toContain("absolute");
    expect(backdrop.className).toContain("inset-0");
    expect(overlay.className).not.toContain("top-20");
    expect(overlay.className).not.toContain("bottom-0");
    expect(panel.className).toContain("w-full");
    expect(panel.className).toContain("max-w-4xl");
    expect(panel.className).toContain("max-h-[90vh]");
    expect(panel.className).toContain("rounded-3xl");
    expect(panel.className).toContain("md:flex-row");
    expect(panel.className).not.toContain("max-w-none");
    expect(panel.className).not.toContain("rounded-none");
    expect(imageStage.className).toContain("md:w-1/2");
    expect(imageStage.className).toContain("min-h-[16rem]");
  });
});
