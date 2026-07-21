import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { PromptLibraryPanel } from "./PromptLibraryPanel";

const listAdminPromptsMock = vi.fn();
const createAdminPromptMock = vi.fn();

vi.mock("../services/v2PromptsApi", () => ({
  createAdminPrompt: (...args: unknown[]) => createAdminPromptMock(...args),
  deleteAdminPromptMedia: vi.fn(),
  getPromptMediaBlob: vi.fn(),
  listAdminPromptMedia: vi.fn(async () => []),
  listAdminPrompts: (...args: unknown[]) => listAdminPromptsMock(...args),
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
    listAdminPromptsMock.mockResolvedValue([]);
  });

  test("creates a draft prompt", async () => {
    createAdminPromptMock.mockResolvedValue({ id: "prompt-1", title: "New prompt", status: "draft" });
    render(<PromptLibraryPanel />);
    await screen.findByText("新建提示词");
    fireEvent.change(screen.getByLabelText("标题"), { target: { value: "New prompt" } });
    fireEvent.change(screen.getByLabelText("提示词"), { target: { value: "cinematic portrait" } });
    fireEvent.click(screen.getByRole("button", { name: "保存草稿" }));
    await waitFor(() => expect(createAdminPromptMock).toHaveBeenCalledWith(expect.objectContaining({ status: "draft", title: "New prompt" })));
  });

  test("requires saving a draft before effect images can be uploaded", async () => {
    render(<PromptLibraryPanel />);

    await screen.findByText("新建提示词");

    expect(screen.getByText("保存草稿后可上传效果图")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "上传效果图" })).toBeNull();
  });
});
