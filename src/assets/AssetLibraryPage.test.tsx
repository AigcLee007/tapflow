import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { AuthContext, type AuthState } from "../auth/useAuth";
import { AssetLibraryPage } from "./AssetLibraryPage";
import type { AssetFolder, AssetItem } from "./assetApi";

const useAssetLibraryMock = vi.fn();
const updateAssetMetadataMock = vi.fn();
const deleteAssetMock = vi.fn();
const getAssetDownloadUrlMock = vi.fn();
const addAssetToFolderMock = vi.fn();

vi.mock("./useAssetLibrary", () => ({
  useAssetLibrary: () => useAssetLibraryMock(),
}));

vi.mock("./assetApi", async () => {
  const actual = await vi.importActual<typeof import("./assetApi")>("./assetApi");
  return {
    ...actual,
    addAssetToFolder: (...args: unknown[]) => addAssetToFolderMock(...args),
    deleteAsset: (...args: unknown[]) => deleteAssetMock(...args),
    getAssetDownloadUrl: (...args: unknown[]) => getAssetDownloadUrlMock(...args),
    updateAssetMetadata: (...args: unknown[]) => updateAssetMetadataMock(...args),
  };
});

vi.mock("./UploadAssetButton", () => ({
  UploadAssetButton: ({ onUploaded }: { onUploaded: () => void }) => (
    <button onClick={onUploaded} type="button">
      上传
    </button>
  ),
}));

function createAuthState(): AuthState {
  return {
    authenticated: true,
    error: null,
    loading: false,
    permissions: [],
    refreshMe: vi.fn(async () => undefined),
    register: vi.fn(async () => undefined),
    login: vi.fn(async () => undefined),
    logout: vi.fn(async () => undefined),
    roles: ["tenant_owner"],
    sessionId: "session-1",
    tenant: { id: "tenant-1", name: "测试工作区", plan: "free", slug: "test", status: "active" },
    user: { displayName: "测试", email: "user@example.com", id: "user-1", status: "active" },
  };
}

const asset: AssetItem = {
  bucket: "bucket",
  checksumSha256: null,
  createdAt: "2026-06-12T01:00:00.000Z",
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
  title: "Asset One",
  updatedAt: "2026-06-12T01:00:00.000Z",
  variants: [],
  width: 512,
};

const folder: AssetFolder = {
  createdAt: "2026-06-12T01:00:00.000Z",
  createdBy: "user-1",
  deletedAt: null,
  description: null,
  id: "folder-1",
  name: "Campaign",
  parentFolderId: null,
  tenantId: "tenant-1",
  updatedAt: "2026-06-12T01:00:00.000Z",
};

function mockLibrary(overrides: Record<string, unknown> = {}) {
  useAssetLibraryMock.mockReturnValue({
    assets: [],
    error: null,
    folders: [],
    groupedAssets: [],
    loading: false,
    mediaCounts: { all: 135, audio: 0, image: 60, video: 0 },
    query: "",
    refresh: vi.fn(async () => undefined),
    favoriteOnly: false,
    updateAssetOptimistically: vi.fn(async (_assetId: string, _updater: unknown, action: () => Promise<void>) => {
      await action();
    }),
    selectedMediaTab: "image",
    selectedFolderId: null,
    setQuery: vi.fn(),
    setFavoriteOnly: vi.fn(),
    setSelectedFolderId: vi.fn(),
    setSelectedMediaTab: vi.fn(),
    total: 0,
    ...overrides,
  });
}

function renderPage() {
  return render(
    <AuthContext.Provider value={createAuthState()}>
      <AssetLibraryPage />
    </AuthContext.Provider>,
  );
}

describe("AssetLibraryPage", () => {
  beforeEach(() => {
    useAssetLibraryMock.mockReset();
    updateAssetMetadataMock.mockReset();
    deleteAssetMock.mockReset();
    getAssetDownloadUrlMock.mockReset();
    addAssetToFolderMock.mockReset();
    mockLibrary();
  });

  test("renders categorized asset library empty state", () => {
    renderPage();

    expect(screen.getByRole("heading", { name: /素材库/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /全部素材/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /图片/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /视频/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /音频/ })).toBeTruthy();
    expect(screen.getByPlaceholderText(/搜索素材/i)).toBeTruthy();
    expect(screen.getByText(/上传第一个素材/i)).toBeTruthy();
    expect(screen.getByText("共 135 个素材")).toBeTruthy();
  });

  test("opens an asset action menu and manages the asset", async () => {
    const refresh = vi.fn(async () => undefined);
    mockLibrary({
      assets: [asset],
      folders: [folder],
      groupedAssets: [{ dateLabel: "2026-06-12", items: [asset] }],
      mediaCounts: { all: 1, audio: 0, image: 1, video: 0 },
      refresh,
      total: 1,
    });
    updateAssetMetadataMock.mockResolvedValue(asset);
    deleteAssetMock.mockResolvedValue({ ok: true });
    addAssetToFolderMock.mockResolvedValue({ ok: true });
    getAssetDownloadUrlMock.mockResolvedValue({
      expiresAt: "2026-06-12T02:00:00.000Z",
      method: "GET",
      url: "https://example.test/original.png",
    });
    vi.spyOn(window, "open").mockImplementation(() => null);

    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "管理素材 Asset One" }));
    expect(screen.getByRole("menuitem", { name: "预览" })).toBeTruthy();

    fireEvent.click(screen.getByRole("menuitem", { name: "重命名" }));
    fireEvent.change(screen.getByLabelText("素材名称"), { target: { value: "Renamed Asset" } });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));
    await waitFor(() => {
      expect(updateAssetMetadataMock).toHaveBeenCalledWith("asset-1", { title: "Renamed Asset" });
    });

    fireEvent.click(screen.getByRole("button", { name: "管理素材 Asset One" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "收藏" }));
    await waitFor(() => {
      expect(updateAssetMetadataMock).toHaveBeenCalledWith("asset-1", { favorite: true });
    });

    fireEvent.click(screen.getByRole("button", { name: "管理素材 Asset One" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "下载原图" }));
    await waitFor(() => {
      expect(getAssetDownloadUrlMock).toHaveBeenCalledWith("asset-1");
    });

    fireEvent.click(screen.getByRole("button", { name: "管理素材 Asset One" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "移动到文件夹" }));
    fireEvent.click(screen.getByRole("button", { name: "移动到 Campaign" }));
    await waitFor(() => {
      expect(addAssetToFolderMock).toHaveBeenCalledWith("folder-1", "asset-1");
    });

    fireEvent.click(screen.getByRole("button", { name: "管理素材 Asset One" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "删除" }));
    fireEvent.click(screen.getByRole("button", { name: "确认删除" }));
    await waitFor(() => {
      expect(deleteAssetMock).toHaveBeenCalledWith("asset-1");
    });
    expect(refresh).toHaveBeenCalled();
  });

  test("selects the favorite category from the sidebar", () => {
    const setFavoriteOnly = vi.fn();
    mockLibrary({
      favoriteOnly: false,
      setFavoriteOnly,
    });

    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "收藏" }));

    expect(setFavoriteOnly).toHaveBeenCalledWith(true);
  });

  test("renders asset cards as canvas-style thumbnail tiles", () => {
    mockLibrary({
      assets: [asset],
      groupedAssets: [{ dateLabel: "2026-06-12", items: [asset] }],
      mediaCounts: { all: 1, audio: 0, image: 1, video: 0 },
      total: 1,
    });

    renderPage();

    expect(screen.getByRole("button", { name: "Asset One" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "管理素材 Asset One" })).toBeTruthy();
    expect(screen.queryByText("Asset One")).toBeNull();
    expect(screen.queryByText("1 KB")).toBeNull();
  });

  test("limits initial thumbnail DOM nodes for large asset groups", () => {
    const manyAssets = Array.from({ length: 120 }, (_, index) => ({
      ...asset,
      id: `asset-${index}`,
      originalFilename: `asset-${index}.png`,
      title: `Asset ${index}`,
    }));

    mockLibrary({
      assets: manyAssets,
      groupedAssets: [{ dateLabel: "2026-06-12", items: manyAssets }],
      mediaCounts: { all: 120, audio: 0, image: 120, video: 0 },
      total: 120,
    });

    renderPage();

    expect(screen.getAllByRole("button", { name: /^Asset / }).length).toBeLessThanOrEqual(40);
  });
});
