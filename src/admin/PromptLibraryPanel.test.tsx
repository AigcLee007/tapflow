import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { PromptLibraryPanel } from "./PromptLibraryPanel";

const listAdminPromptsMock = vi.fn();
const createAdminPromptMock = vi.fn();
const deleteAdminPromptMock = vi.fn();
const reorderAdminPromptsMock = vi.fn();
const setAdminPromptStatusMock = vi.fn();
const updateAdminPromptMock = vi.fn();

vi.mock("../services/v2PromptsApi", () => ({
  createAdminPrompt: (...args: unknown[]) => createAdminPromptMock(...args),
  deleteAdminPrompt: (...args: unknown[]) => deleteAdminPromptMock(...args),
  deleteAdminPromptMedia: vi.fn(),
  getPromptMediaBlob: vi.fn(),
  listAdminPromptMedia: vi.fn(async () => []),
  listAdminPrompts: (...args: unknown[]) => listAdminPromptsMock(...args),
  reorderAdminPrompts: (...args: unknown[]) => reorderAdminPromptsMock(...args),
  setAdminPromptStatus: (...args: unknown[]) => setAdminPromptStatusMock(...args),
  updateAdminPromptMediaOrder: vi.fn(),
  updateAdminPrompt: (...args: unknown[]) => updateAdminPromptMock(...args),
  uploadAdminPromptMedia: vi.fn(),
  validatePromptImport: vi.fn(),
  importPrompts: vi.fn(),
}));

describe("PromptLibraryPanel", () => {
  const entry = (id: string, status: "archived" | "draft" | "published", title: string) => ({
    category: "portrait", createdAt: "", createdBy: null, description: "", externalKey: `${id}-key`, id,
    isFavorite: false, media: [], negativePrompt: "low quality", promptText: "English prompt", promptTextEn: "English prompt",
    promptTextZh: "中文提示词", publishedAt: status === "published" ? "2026-07-22T00:00:00.000Z" : null,
    sortWeight: 0, status, tags: [], tenantId: null, title, updatedAt: "", version: 1,
  });
  const selectEntry = (title: string) => fireEvent.click(screen.getByText(title).closest("button")!);

  beforeEach(() => {
    listAdminPromptsMock.mockReset();
    createAdminPromptMock.mockReset();
    deleteAdminPromptMock.mockReset();
    reorderAdminPromptsMock.mockReset();
    setAdminPromptStatusMock.mockReset();
    updateAdminPromptMock.mockReset();
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

  test("shows status-specific lifecycle actions", async () => {
    listAdminPromptsMock.mockResolvedValue([
      entry("draft-1", "draft", "草稿提示词"),
      entry("published-1", "published", "正式提示词"),
      entry("archived-1", "archived", "归档提示词"),
    ]);
    render(<PromptLibraryPanel />);

    await screen.findByText("草稿提示词");
    selectEntry("草稿提示词");
    expect(screen.getByRole("button", { name: "发布" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "归档" })).toBeTruthy();
    expect(screen.getByRole("button", { name: /删除/ })).toBeTruthy();

    selectEntry("正式提示词");
    expect(screen.getByRole("button", { name: "保存修改" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "下架" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /删除/ })).toBeNull();

    selectEntry("归档提示词");
    expect(screen.getByRole("button", { name: "恢复草稿" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "永久删除" })).toBeTruthy();
  });

  test("keeps external key read-only, video category available, and negative prompt editable", async () => {
    listAdminPromptsMock.mockResolvedValue([entry("draft-1", "draft", "草稿提示词")]);
    render(<PromptLibraryPanel />);
    await screen.findByText("草稿提示词");
    selectEntry("草稿提示词");
    fireEvent.click(screen.getByText("高级设置"));
    expect(screen.getByLabelText("外部唯一标识")).toHaveProperty("readOnly", true);
    expect(screen.getByLabelText("负面提示词（选填）")).toHaveProperty("value", "low quality");
    fireEvent.click(screen.getByRole("button", { name: /分类/ }));
    expect(screen.getByRole("menuitem", { name: "视频" })).toBeTruthy();
  });

  test("preserves independent bilingual values and retains published status when saving", async () => {
    const published = entry("published-1", "published", "正式提示词");
    listAdminPromptsMock.mockResolvedValue([published]);
    updateAdminPromptMock.mockImplementation(async (_id, input) => ({ ...published, ...input }));
    render(<PromptLibraryPanel />);
    await screen.findByText("正式提示词");
    selectEntry("正式提示词");
    expect(screen.getByLabelText("中文提示词")).toHaveProperty("value", "中文提示词");
    fireEvent.click(screen.getByRole("button", { name: /English/ }));
    fireEvent.change(screen.getByLabelText("英文提示词"), { target: { value: "Updated English" } });
    fireEvent.click(screen.getByRole("button", { name: "保存修改" }));
    await waitFor(() => expect(updateAdminPromptMock).toHaveBeenCalledWith("published-1", expect.objectContaining({
      promptTextEn: "Updated English", promptTextZh: "中文提示词", status: "published",
    })));
  });

  test("reorders only visible status items while submitting the complete order", async () => {
    const draftA = entry("draft-a", "draft", "草稿 A");
    const published = entry("published-1", "published", "正式提示词");
    const draftB = entry("draft-b", "draft", "草稿 B");
    listAdminPromptsMock.mockResolvedValue([draftA, published, draftB]);
    reorderAdminPromptsMock.mockImplementation(async ({ promptIds }: { promptIds: string[] }) => promptIds.map((id) => [draftA, published, draftB].find((item) => item.id === id)));
    render(<PromptLibraryPanel />);
    fireEvent.click(await screen.findByRole("button", { name: /状态筛选/ }));
    fireEvent.click(screen.getByRole("menuitem", { name: "草稿" }));
    fireEvent.click(screen.getByRole("button", { name: "上移 草稿 B" }));
    await waitFor(() => expect(reorderAdminPromptsMock).toHaveBeenCalledWith({ promptIds: ["draft-b", "published-1", "draft-a"] }));
  });
});
