import React from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AuthContext, type AuthState } from "../auth/useAuth";
import { clearAssetSessionCache } from "./assetSessionCache";
import { clearAssetUrlCache } from "./assetUrlCache";
import { useAssetLibrary } from "./useAssetLibrary";
import type { AssetFolder, AssetItem, AssetListResponse } from "./assetApi";

const listAssetsMock = vi.fn();
const listAssetFoldersMock = vi.fn();
const getAssetDownloadUrlMock = vi.fn();
const getAssetSummaryMock = vi.fn();
const getAssetSignedUrlsMock = vi.fn();

vi.mock("./assetApi", () => ({
  getAssetDownloadUrl: (...args: unknown[]) => getAssetDownloadUrlMock(...args),
  getAssetSummary: (...args: unknown[]) => getAssetSummaryMock(...args),
  getAssetSignedUrls: (...args: unknown[]) => getAssetSignedUrlsMock(...args),
  listAssetFolders: (...args: unknown[]) => listAssetFoldersMock(...args),
  listAssets: (...args: unknown[]) => listAssetsMock(...args),
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

const baseAuthState: AuthState = {
  authenticated: true,
  error: null,
  loading: false,
  login: vi.fn(),
  logout: vi.fn(),
  permissions: ["asset:read"],
  refreshMe: vi.fn(),
  register: vi.fn(),
  roles: ["tenant_owner"],
  sessionId: "session-a",
  tenant: {
    id: "tenant-a",
    name: "Tenant A",
    plan: "free",
    slug: "tenant-a",
    status: "active",
  },
  user: {
    displayName: "User A",
    email: "user-a@example.com",
    id: "user-a",
    status: "active",
  },
};

const assetA: AssetItem = {
  bucket: "bucket",
  checksumSha256: null,
  createdAt: "2026-05-19T00:00:00.000Z",
  deletedAt: null,
  description: null,
  durationMs: null,
  favorite: false,
  height: 400,
  id: "asset-a",
  kind: "image",
  metadata: {},
  mimeType: "image/png",
  objectKey: "asset-a.png",
  originalFilename: "asset-a.png",
  ownerUserId: "user-a",
  projectId: null,
  sizeBytes: 100,
  source: "upload",
  status: "available",
  storageProvider: "s3",
  tags: [],
  tenantId: "tenant-a",
  title: "Asset A",
  updatedAt: "2026-05-19T00:00:00.000Z",
  variants: [],
  width: 400,
};

const assetB: AssetItem = {
  ...assetA,
  id: "asset-b",
  objectKey: "asset-b.png",
  originalFilename: "asset-b.png",
  ownerUserId: "user-b",
  tenantId: "tenant-b",
  title: "Asset B",
};

const folderA: AssetFolder = {
  createdAt: "2026-05-19T00:00:00.000Z",
  createdBy: "user-a",
  deletedAt: null,
  description: null,
  id: "folder-a",
  name: "Folder A",
  parentFolderId: null,
  tenantId: "tenant-a",
  updatedAt: "2026-05-19T00:00:00.000Z",
};

const folderB: AssetFolder = {
  ...folderA,
  createdBy: "user-b",
  id: "folder-b",
  name: "Folder B",
  tenantId: "tenant-b",
};

function Harness() {
  const { assets, folders, loading, mediaCounts, setFavoriteOnly } = useAssetLibrary();

  return (
    <div>
      <div data-testid="loading">{loading ? "loading" : "idle"}</div>
      <div data-testid="assets">{assets.map((asset) => asset.title).join(",")}</div>
      <div data-testid="folders">{folders.map((folder) => folder.name).join(",")}</div>
      <div data-testid="counts">
        {mediaCounts.all}/{mediaCounts.image}/{mediaCounts.video}/{mediaCounts.audio}
      </div>
      <button onClick={() => setFavoriteOnly(true)} type="button">
        show favorites
      </button>
    </div>
  );
}

function renderWithAuth(authState: AuthState) {
  return render(
    <AuthContext.Provider value={authState}>
      <Harness />
    </AuthContext.Provider>,
  );
}

describe("useAssetLibrary", () => {
  beforeEach(() => {
    clearAssetSessionCache();
    clearAssetUrlCache();
    listAssetsMock.mockReset();
    listAssetFoldersMock.mockReset();
    getAssetDownloadUrlMock.mockReset();
    getAssetSummaryMock.mockReset();
    getAssetSignedUrlsMock.mockReset();
    getAssetSummaryMock.mockResolvedValue({
      counts: { all: 0, audio: 0, image: 0, video: 0 },
    });
  });

  it("shows cached assets immediately and refreshes silently when reopened", async () => {
    listAssetsMock.mockResolvedValue({
      items: [
        {
          ...assetA,
          previewUrl: "https://cdn.test/a-thumb.webp",
          previewUrlExpiresAt: new Date(Date.now() + 900_000).toISOString(),
          previewVariantKey: "thumb",
        },
      ],
      page: 1,
      pageSize: 30,
      total: 1,
    });
    listAssetFoldersMock.mockResolvedValue([]);
    getAssetSummaryMock.mockResolvedValue({
      counts: { all: 1, audio: 0, image: 1, video: 0 },
    });
    getAssetSignedUrlsMock.mockResolvedValue({ items: [] });

    const first = renderWithAuth(baseAuthState);
    await waitFor(() => expect(screen.getByTestId("loading").textContent).toBe("idle"));
    await act(async () => {
      first.unmount();
    });

    renderWithAuth(baseAuthState);

    expect(screen.getByTestId("assets").textContent).toContain("Asset A");
    expect(screen.getByTestId("loading").textContent).toBe("idle");
    await waitFor(() => {
      expect(listAssetsMock).toHaveBeenCalledTimes(2);
    });
  });

  it("uses inline preview urls and does not call signed urls for the initial asset page", async () => {
    listAssetsMock.mockResolvedValue({
      items: [
        {
          ...assetA,
          previewUrl: "https://cdn.test/a-thumb.webp",
          previewUrlExpiresAt: new Date(Date.now() + 900_000).toISOString(),
          previewVariantKey: "thumb",
        },
      ],
      page: 1,
      pageSize: 30,
      total: 1,
    });
    listAssetFoldersMock.mockResolvedValue([]);
    getAssetSummaryMock.mockResolvedValue({
      counts: { all: 1, audio: 0, image: 1, video: 0 },
    });

    renderWithAuth(baseAuthState);

    await waitFor(() => expect(screen.getByTestId("assets").textContent).toContain("Asset A"));
    expect(listAssetsMock).toHaveBeenCalledWith(expect.objectContaining({ includePreviewUrls: true }));
    expect(getAssetSignedUrlsMock).not.toHaveBeenCalled();
  });

  it("clears stale assets immediately and ignores late responses from the previous identity", async () => {
    const tenantAAssets = deferred<AssetListResponse>();
    const tenantAFolders = deferred<AssetFolder[]>();
    const tenantBAssets = deferred<AssetListResponse>();
    const tenantBFolders = deferred<AssetFolder[]>();

    listAssetsMock
      .mockReturnValueOnce(tenantAAssets.promise)
      .mockReturnValueOnce(tenantBAssets.promise);
    listAssetFoldersMock
      .mockReturnValueOnce(tenantAFolders.promise)
      .mockReturnValueOnce(tenantBFolders.promise);
    const firstRender = renderWithAuth(baseAuthState);

    await waitFor(() => {
      expect(screen.getByTestId("loading").textContent).toBe("loading");
    });

    firstRender.rerender(
      <AuthContext.Provider
        value={{
          ...baseAuthState,
          sessionId: "session-b",
          tenant: {
            ...baseAuthState.tenant!,
            id: "tenant-b",
            name: "Tenant B",
            slug: "tenant-b",
          },
          user: {
            ...baseAuthState.user!,
            displayName: "User B",
            email: "user-b@example.com",
            id: "user-b",
          },
        }}
      >
        <Harness />
      </AuthContext.Provider>,
    );

    expect(screen.getByTestId("assets").textContent).toBe("");
    expect(screen.getByTestId("folders").textContent).toBe("");

    tenantAAssets.resolve({
      items: [{ ...assetA, previewUrl: "https://example.test/asset-a-thumb.webp" }],
      page: 1,
      pageSize: 30,
      total: 1,
    });
    tenantAFolders.resolve([folderA]);

    tenantBAssets.resolve({
      items: [{ ...assetB, previewUrl: "https://example.test/asset-b-thumb.webp" }],
      page: 1,
      pageSize: 30,
      total: 1,
    });
    tenantBFolders.resolve([folderB]);

    await waitFor(() => {
      expect(screen.getByTestId("assets").textContent).toContain("Asset B");
      expect(screen.getByTestId("folders").textContent).toContain("Folder B");
    });

    expect(screen.getByTestId("assets").textContent).not.toContain("Asset A");
    expect(screen.getByTestId("folders").textContent).not.toContain("Folder A");
    expect(getAssetDownloadUrlMock).not.toHaveBeenCalled();
  });

  it("requests inline preview urls instead of signed-url fanout for the first asset page", async () => {
    listAssetsMock.mockResolvedValue({
      items: [
        {
          ...assetA,
          previewUrl: "https://cdn.test/a-thumb.webp",
          previewUrlExpiresAt: new Date(Date.now() + 900_000).toISOString(),
          previewVariantKey: "thumb",
          variants: [
            {
              bucket: "bucket",
              height: 320,
              id: "asset-a-thumb",
              metadata: {},
              mimeType: "image/webp",
              objectKey: "asset-a-thumb.webp",
              sizeBytes: 123,
              variantKey: "thumb",
              width: 320,
            },
          ],
        },
        {
          ...assetA,
          id: "asset-c",
          objectKey: "asset-c.png",
          originalFilename: "asset-c.png",
          previewUrl: "https://cdn.test/c-thumb.webp",
          previewUrlExpiresAt: new Date(Date.now() + 900_000).toISOString(),
          previewVariantKey: "thumb",
          title: "Asset C",
          variants: [
            {
              bucket: "bucket",
              height: 320,
              id: "asset-c-thumb",
              metadata: {},
              mimeType: "image/webp",
              objectKey: "asset-c-thumb.webp",
              sizeBytes: 123,
              variantKey: "thumb",
              width: 320,
            },
          ],
        },
      ],
      page: 1,
      pageSize: 30,
      total: 2,
    });
    listAssetFoldersMock.mockResolvedValue([]);
    getAssetSummaryMock.mockResolvedValue({
      counts: { all: 2, audio: 0, image: 2, video: 0 },
    });

    renderWithAuth(baseAuthState);

    await waitFor(() => expect(screen.getByTestId("assets").textContent).toContain("Asset A"));
    expect(listAssetsMock).toHaveBeenCalledWith(expect.objectContaining({
      includePreviewUrls: true,
      pageSize: 30,
      previewExpiresInSeconds: 900,
    }));
    expect(getAssetDownloadUrlMock).not.toHaveBeenCalled();
    expect(getAssetSignedUrlsMock).not.toHaveBeenCalled();
  });

  it("keeps inline preview or original preview urls provided by the backend", async () => {
    listAssetsMock.mockResolvedValue({
      items: [
        {
          ...assetA,
          id: "asset-preview",
          previewUrl: "https://cdn.test/asset-preview.webp",
          previewUrlExpiresAt: new Date(Date.now() + 900_000).toISOString(),
          previewVariantKey: "preview",
          title: "Preview Asset",
          variants: [
            {
              bucket: "bucket",
              height: 1024,
              id: "asset-preview-variant",
              metadata: {},
              mimeType: "image/webp",
              objectKey: "asset-preview.webp",
              sizeBytes: 456,
              variantKey: "preview",
              width: 1024,
            },
          ],
        },
        {
          ...assetA,
          id: "asset-original",
          previewUrl: "https://cdn.test/asset-original.png",
          previewUrlExpiresAt: new Date(Date.now() + 900_000).toISOString(),
          previewVariantKey: null,
          title: "Original Asset",
          variants: [],
        },
      ],
      page: 1,
      pageSize: 30,
      total: 2,
    });
    listAssetFoldersMock.mockResolvedValue([]);
    getAssetSummaryMock.mockResolvedValue({
      counts: { all: 2, audio: 0, image: 2, video: 0 },
    });

    renderWithAuth(baseAuthState);

    await waitFor(() => expect(screen.getByTestId("assets").textContent).toContain("Preview Asset"));
    expect(getAssetSignedUrlsMock).not.toHaveBeenCalled();
    expect(getAssetDownloadUrlMock).not.toHaveBeenCalled();
  });

  it("uses server totals for media tab counts instead of the loaded page length", async () => {
    const firstPageItems = Array.from({ length: 60 }, (_, index) => ({
      ...assetA,
      id: `image-${index}`,
      objectKey: `image-${index}.png`,
      originalFilename: `image-${index}.png`,
      previewUrl: `https://cdn.test/image-${index}.webp`,
      title: `Image ${index}`,
    }));

    listAssetsMock.mockResolvedValue({ items: firstPageItems, page: 1, pageSize: 30, total: 135 });
    listAssetFoldersMock.mockResolvedValue([]);
    getAssetSummaryMock.mockResolvedValue({
      counts: { all: 135, audio: 0, image: 135, video: 0 },
    });

    renderWithAuth(baseAuthState);

    await waitFor(() => {
      expect(screen.getByTestId("counts").textContent).toBe("135/135/0/0");
    });
  });

  it("requests favorite assets when the favorite filter is enabled", async () => {
    listAssetsMock.mockImplementation((params: { favorite?: boolean; kind?: string }) => {
      if (params.kind) {
        return Promise.resolve({ items: [], page: 1, pageSize: 1, total: 0 });
      }
      return Promise.resolve({
        items: params.favorite ? [{ ...assetA, favorite: true }] : [assetA],
        page: 1,
        pageSize: 60,
        total: 1,
      });
    });
    listAssetFoldersMock.mockResolvedValue([]);
    getAssetSignedUrlsMock.mockResolvedValue({ items: [] });

    renderWithAuth(baseAuthState);

    await waitFor(() => {
      expect(listAssetsMock).toHaveBeenCalledWith(expect.not.objectContaining({ favorite: true }));
    });

    fireEvent.click(screen.getByRole("button", { name: "show favorites" }));

    await waitFor(() => {
      expect(listAssetsMock).toHaveBeenCalledWith(expect.objectContaining({ favorite: true }));
    });
  });
});
