import React from "react";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { AuthContext, type AuthState } from "../auth/useAuth";
import { AssetLibraryPage } from "./AssetLibraryPage";

const useAssetLibraryMock = vi.fn();

vi.mock("./useAssetLibrary", () => ({
  useAssetLibrary: () => useAssetLibraryMock(),
}));

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

describe("AssetLibraryPage", () => {
  beforeEach(() => {
    useAssetLibraryMock.mockReturnValue({
      assets: [],
      error: null,
      folders: [],
      groupedAssets: [],
      loading: false,
      mediaCounts: { all: 135, audio: 0, image: 60, video: 0 },
      query: "",
      refresh: vi.fn(async () => undefined),
      selectedMediaTab: "image",
      selectedFolderId: null,
      setQuery: vi.fn(),
      setSelectedFolderId: vi.fn(),
      setSelectedMediaTab: vi.fn(),
      total: 0,
    });
  });

  test("renders categorized asset library empty state", () => {
    render(
      <AuthContext.Provider value={createAuthState()}>
        <AssetLibraryPage />
      </AuthContext.Provider>,
    );

    expect(screen.getByRole("heading", { name: /素材库/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /全部素材/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /图片/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /视频/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /音频/ })).toBeTruthy();
    expect(screen.getByPlaceholderText(/搜索素材/i)).toBeTruthy();
    expect(screen.getByText(/上传第一个素材/i)).toBeTruthy();
    expect(screen.getByText(/上传图片/i)).toBeTruthy();
    expect(screen.getByText(/上传视频/i)).toBeTruthy();
    expect(screen.getByText(/上传音频/i)).toBeTruthy();
    expect(screen.getByText("共 135 个素材")).toBeTruthy();
    expect(screen.getByRole("button", { name: "图片60" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "视频0" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "音频0" })).toBeTruthy();
  });
});
