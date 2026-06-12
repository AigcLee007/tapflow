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
    tenant: { id: "tenant-1", name: "测试 的工作区", plan: "free", slug: "test", status: "active" },
    user: { displayName: "测试", email: "user@example.com", id: "user-1", status: "active" },
  };
}

describe("AssetLibraryPage", () => {
  beforeEach(() => {
    useAssetLibraryMock.mockReturnValue({
      assets: [],
      error: null,
      folders: [],
      loading: false,
      query: "",
      refresh: vi.fn(async () => undefined),
      selectedFolderId: null,
      setQuery: vi.fn(),
      setSelectedFolderId: vi.fn(),
      total: 0,
    });
  });

  test("renders TapNow-style asset library empty state", () => {
    render(
      <AuthContext.Provider value={createAuthState()}>
        <AssetLibraryPage />
      </AuthContext.Provider>,
    );

    expect(screen.getByRole("heading", { name: "素材库" })).toBeTruthy();
    expect(screen.getByText("管理项目可复用的图片、视频、音频和参考素材。")).toBeTruthy();
    expect(screen.getByRole("button", { name: "全部素材" })).toBeTruthy();
    expect(screen.getByPlaceholderText("搜索素材")).toBeTruthy();
    expect(screen.getByText("上传第一个素材")).toBeTruthy();
    expect(screen.getByText("上传图片")).toBeTruthy();
    expect(screen.getByText("上传视频")).toBeTruthy();
    expect(screen.getByText("上传音频")).toBeTruthy();
  });
});
