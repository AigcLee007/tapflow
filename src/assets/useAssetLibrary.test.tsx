import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AuthContext, type AuthState } from "../auth/useAuth";
import { clearAssetUrlCache } from "./assetUrlCache";
import { useAssetLibrary } from "./useAssetLibrary";
import type { AssetFolder, AssetItem, AssetListResponse } from "./assetApi";

const listAssetsMock = vi.fn();
const listAssetFoldersMock = vi.fn();
const getAssetDownloadUrlMock = vi.fn();
const getAssetSignedUrlsMock = vi.fn();

vi.mock("./assetApi", () => ({
  getAssetDownloadUrl: (...args: unknown[]) => getAssetDownloadUrlMock(...args),
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
  const { assets, folders, loading } = useAssetLibrary();

  return (
    <div>
      <div data-testid="loading">{loading ? "loading" : "idle"}</div>
      <div data-testid="assets">{assets.map((asset) => asset.title).join(",")}</div>
      <div data-testid="folders">{folders.map((folder) => folder.name).join(",")}</div>
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
    clearAssetUrlCache();
    listAssetsMock.mockReset();
    listAssetFoldersMock.mockReset();
    getAssetDownloadUrlMock.mockReset();
    getAssetSignedUrlsMock.mockReset();
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
    getAssetSignedUrlsMock
      .mockResolvedValueOnce({
        items: [
          {
            assetId: assetA.id,
            expiresAt: "2026-05-19T01:00:00.000Z",
            method: "GET",
            url: "https://example.test/asset-a-thumb.webp",
            variantKey: "thumb",
          },
        ],
      })
      .mockResolvedValueOnce({
        items: [
          {
            assetId: assetB.id,
            expiresAt: "2026-05-19T01:00:00.000Z",
            method: "GET",
            url: "https://example.test/asset-b-thumb.webp",
            variantKey: "thumb",
          },
        ],
      });

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
      items: [assetA],
      page: 1,
      pageSize: 60,
      total: 1,
    });
    tenantAFolders.resolve([folderA]);

    tenantBAssets.resolve({
      items: [assetB],
      page: 1,
      pageSize: 60,
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

  it("batch signs thumb variants instead of requesting per-asset download urls", async () => {
    listAssetsMock.mockResolvedValue({
      items: [
        {
          ...assetA,
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
      pageSize: 60,
      total: 2,
    });
    listAssetFoldersMock.mockResolvedValue([]);
    getAssetSignedUrlsMock.mockResolvedValue({
      items: [
        {
          assetId: assetA.id,
          expiresAt: new Date(Date.now() + 900_000).toISOString(),
          method: "GET",
          url: "https://cdn.test/a-thumb.webp",
          variantKey: "thumb",
        },
        {
          assetId: "asset-c",
          expiresAt: new Date(Date.now() + 900_000).toISOString(),
          method: "GET",
          url: "https://cdn.test/c-thumb.webp",
          variantKey: "thumb",
        },
      ],
    });

    renderWithAuth(baseAuthState);

    await waitFor(() => expect(screen.getByTestId("assets").textContent).toContain("Asset A"));
    expect(getAssetSignedUrlsMock).toHaveBeenCalledWith([
      { assetId: assetA.id, variantKey: "thumb" },
      { assetId: "asset-c", variantKey: "thumb" },
    ]);
    expect(getAssetDownloadUrlMock).not.toHaveBeenCalled();
  });

  it("falls back to preview or original signing when thumb is unavailable", async () => {
    listAssetsMock.mockResolvedValue({
      items: [
        {
          ...assetA,
          id: "asset-preview",
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
          title: "Original Asset",
          variants: [],
        },
      ],
      page: 1,
      pageSize: 60,
      total: 2,
    });
    listAssetFoldersMock.mockResolvedValue([]);
    getAssetSignedUrlsMock.mockResolvedValue({
      items: [
        {
          assetId: "asset-preview",
          expiresAt: new Date(Date.now() + 900_000).toISOString(),
          method: "GET",
          url: "https://cdn.test/asset-preview.webp",
          variantKey: "preview",
        },
        {
          assetId: "asset-original",
          expiresAt: new Date(Date.now() + 900_000).toISOString(),
          method: "GET",
          url: "https://cdn.test/asset-original.png",
          variantKey: null,
        },
      ],
    });

    renderWithAuth(baseAuthState);

    await waitFor(() => expect(screen.getByTestId("assets").textContent).toContain("Preview Asset"));
    expect(getAssetSignedUrlsMock).toHaveBeenCalledWith([
      { assetId: "asset-preview", variantKey: "preview" },
      { assetId: "asset-original" },
    ]);
    expect(getAssetDownloadUrlMock).not.toHaveBeenCalled();
  });
});
