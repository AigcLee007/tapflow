import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { PromptLibraryPanel } from "./PromptLibraryPanel";

const listAdminPromptsMock = vi.fn();
const createAdminPromptMock = vi.fn();
const deleteAdminPromptMock = vi.fn();
const reorderAdminPromptsMock = vi.fn();

vi.mock("../services/v2PromptsApi", () => ({
  createAdminPrompt: (...args: unknown[]) => createAdminPromptMock(...args),
  deleteAdminPrompt: (...args: unknown[]) => deleteAdminPromptMock(...args),
  deleteAdminPromptMedia: vi.fn(),
  getPromptMediaBlob: vi.fn(),
  listAdminPromptMedia: vi.fn(async () => []),
  listAdminPrompts: (...args: unknown[]) => listAdminPromptsMock(...args),
  reorderAdminPrompts: (...args: unknown[]) => reorderAdminPromptsMock(...args),
  setAdminPromptStatus: vi.fn(),
  updateAdminPromptMediaOrder: vi.fn(),
  updateAdminPrompt: vi.fn(),
  uploadAdminPromptMedia: vi.fn(),
  validatePromptImport: vi.fn(),
  importPrompts: vi.fn(),
}));

describe("PromptLibraryPanel", () => {
  beforeEach(() => {
    listAdminPromptsMock.mockReset();
    createAdminPromptMock.mockReset();
    deleteAdminPromptMock.mockReset();
    reorderAdminPromptsMock.mockReset();
    listAdminPromptsMock.mockResolvedValue([]);
  });

  test("creates a draft prompt", async () => {
    createAdminPromptMock.mockResolvedValue({ category: "portrait", createdAt: "", createdBy: null, description: "", externalKey: "new-prompt", id: "prompt-1", isFavorite: false, media: [], negativePrompt: null, promptText: "电影感人像", promptTextEn: null, promptTextZh: "电影感人像", publishedAt: null, sortWeight: 0, status: "draft", tags: [], tenantId: null, title: "New prompt", updatedAt: "", version: 1 });
    render(<PromptLibraryPanel />);
    await screen.findByText("新建提示词");
    fireEvent.change(screen.getByLabelText("标题"), { target: { value: "New prompt" } });
    fireEvent.change(screen.getByLabelText("中文提示词"), { target: { value: "电影感人像" } });
    fireEvent.click(screen.getByRole("button", { name: "保存草稿" }));
    await waitFor(() => expect(createAdminPromptMock).toHaveBeenCalledWith(expect.objectContaining({ promptTextZh: "电影感人像", status: "draft", title: "New prompt" })));
  });

  test("requires saving a draft before effect images can be uploaded", async () => {
    render(<PromptLibraryPanel />);

    await screen.findByText("新建提示词");

    expect(screen.getByText("保存草稿后可上传效果图")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "上传效果图" })).toBeNull();
  });
});
