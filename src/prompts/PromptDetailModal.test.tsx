import React, { useState } from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import type { PromptEntry, PromptMedia } from "../services/v2PromptsApi";
import { PromptDetailModal } from "./PromptDetailModal";

const favoritePromptMock = vi.fn();
const getPromptMediaBlobMock = vi.fn();
const getPromptMock = vi.fn();
const listWorkspaceProjectsMock = vi.fn();
const recordPromptInteractionMock = vi.fn();
const createObjectURLMock = vi.fn();
const revokeObjectURLMock = vi.fn();
const writeTextMock = vi.fn();

vi.mock("../services/v2PromptsApi", () => ({
  favoritePrompt: (...args: unknown[]) => favoritePromptMock(...args),
  getPrompt: (...args: unknown[]) => getPromptMock(...args),
  getPromptMediaBlob: (...args: unknown[]) => getPromptMediaBlobMock(...args),
  recordPromptInteraction: (...args: unknown[]) => recordPromptInteractionMock(...args),
}));

vi.mock("../workspace/workspaceApi", () => ({
  listWorkspaceProjects: (...args: unknown[]) => listWorkspaceProjectsMock(...args),
}));

function media(id: string, sortOrder: number): PromptMedia {
  return {
    altText: `效果图 ${sortOrder + 1}`,
    height: 1200,
    id,
    mimeType: "image/jpeg",
    originalFilename: `${id}.jpg`,
    sizeBytes: 1024,
    sortOrder,
    width: 800,
  };
}

function prompt(mediaItems: PromptMedia[] = []): PromptEntry {
  return {
    category: "poster",
    createdAt: "2026-07-22T00:00:00.000Z",
    createdBy: null,
    description: "单图提示词详情",
    externalKey: "single-image-prompt",
    id: "prompt-1",
    isFavorite: false,
    media: mediaItems,
    negativePrompt: "low quality",
    promptText: "cinematic poster, natural light",
    publishedAt: "2026-07-22T00:00:00.000Z",
    sortWeight: 0,
    status: "published",
    tags: ["海报", "自然光"],
    tenantId: null,
    title: "单图提示词",
    updatedAt: "2026-07-22T00:00:00.000Z",
    version: 1,
  };
}

describe("PromptDetailModal", () => {
  beforeEach(() => {
    favoritePromptMock.mockReset();
    getPromptMediaBlobMock.mockReset();
    getPromptMock.mockReset();
    listWorkspaceProjectsMock.mockReset();
    recordPromptInteractionMock.mockReset();
    createObjectURLMock.mockReset();
    revokeObjectURLMock.mockReset();
    writeTextMock.mockReset();
    favoritePromptMock.mockResolvedValue({ isFavorite: true });
    getPromptMediaBlobMock.mockResolvedValue(new Blob(["image"], { type: "image/jpeg" }));
    listWorkspaceProjectsMock.mockResolvedValue([]);
    recordPromptInteractionMock.mockResolvedValue({ ok: true });
    writeTextMock.mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: writeTextMock },
    });
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: createObjectURLMock });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: revokeObjectURLMock });
  });

  test("shows one intrinsic-ratio main image without empty slots or thumbnails", async () => {
    getPromptMock.mockResolvedValue(prompt([media("media-1", 0)]));
    createObjectURLMock.mockReturnValue("blob:media-1");

    render(<PromptDetailModal onClose={vi.fn()} promptId="prompt-1" />);

    const dialog = await screen.findByRole("dialog", { name: "单图提示词" });
    const image = await within(dialog).findByTestId("prompt-detail-main-image");
    expect(image.getAttribute("src")).toBe("blob:media-1");
    expect(image.className).toContain("h-auto");
    expect(image.className).not.toContain("object-cover");
    expect(within(dialog).queryByTestId("prompt-detail-thumbnails")).toBeNull();
    expect(within(dialog).queryByText("暂无效果图")).toBeNull();
  });

  test("renders one thumbnail per real media item and switches the main image", async () => {
    getPromptMock.mockResolvedValue(prompt([media("media-1", 0), media("media-2", 1)]));
    createObjectURLMock.mockReturnValueOnce("blob:media-1").mockReturnValueOnce("blob:media-2");

    render(<PromptDetailModal onClose={vi.fn()} promptId="prompt-1" />);

    const dialog = await screen.findByRole("dialog", { name: "单图提示词" });
    const thumbnails = await within(dialog).findByTestId("prompt-detail-thumbnails");
    expect(within(thumbnails).getAllByRole("button", { name: /查看效果图/ })).toHaveLength(2);
    expect((await within(dialog).findByTestId("prompt-detail-main-image")).getAttribute("src")).toBe("blob:media-1");

    fireEvent.click(within(thumbnails).getByRole("button", { name: "查看效果图 2" }));
    expect(within(dialog).getByTestId("prompt-detail-main-image").getAttribute("src")).toBe("blob:media-2");
  });

  test("uses modal dismissal, scroll lock, and focus restoration", async () => {
    getPromptMock.mockResolvedValue(prompt());

    function Harness() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button onClick={() => setOpen(true)} type="button">打开提示词</button>
          {open ? <PromptDetailModal onClose={() => setOpen(false)} promptId="prompt-1" /> : null}
        </>
      );
    }

    render(<Harness />);
    const trigger = screen.getByRole("button", { name: "打开提示词" });
    trigger.focus();
    fireEvent.click(trigger);

    const dialog = await screen.findByRole("dialog", { name: "单图提示词" });
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(document.body.style.overflow).toBe("hidden");
    expect(document.activeElement).toBe(within(dialog).getByRole("button", { name: "关闭提示词详情" }));

    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "单图提示词" })).toBeNull());
    expect(document.body.style.overflow).toBe("");
    expect(document.activeElement).toBe(trigger);
  });

  test("shows one explicit empty state and opens an image-only zoom preview", async () => {
    getPromptMock.mockResolvedValueOnce(prompt());
    const emptyView = render(<PromptDetailModal onClose={vi.fn()} promptId="prompt-1" />);
    const emptyDialog = await screen.findByRole("dialog", { name: "单图提示词" });
    expect(within(emptyDialog).getAllByText("暂无效果图")).toHaveLength(1);
    emptyView.unmount();

    getPromptMock.mockResolvedValueOnce(prompt([media("media-1", 0)]));
    createObjectURLMock.mockReturnValue("blob:media-1");
    render(<PromptDetailModal onClose={vi.fn()} promptId="prompt-1" />);
    const dialog = await screen.findByRole("dialog", { name: "单图提示词" });
    fireEvent.click(await within(dialog).findByRole("button", { name: "放大效果图" }));

    const zoom = screen.getByRole("dialog", { name: "效果图放大预览" });
    expect(within(zoom).getByRole("img").getAttribute("src")).toBe("blob:media-1");
    fireEvent.click(within(zoom).getByRole("button", { name: "关闭效果图预览" }));
    expect(screen.queryByRole("dialog", { name: "效果图放大预览" })).toBeNull();
    expect(screen.getByRole("dialog", { name: "单图提示词" })).toBeTruthy();
  });

  test("copies only prompt text and toggles favorite", async () => {
    getPromptMock.mockResolvedValue(prompt());
    render(<PromptDetailModal onClose={vi.fn()} promptId="prompt-1" />);

    const dialog = await screen.findByRole("dialog", { name: "单图提示词" });
    const actionFooter = within(dialog).getByRole("button", { name: "复制提示词" }).closest("footer");
    expect(actionFooter?.className).toContain("fixed");
    expect(actionFooter?.className).toContain("lg:sticky");
    fireEvent.click(within(dialog).getByRole("button", { name: "复制提示词" }));
    await waitFor(() => expect(writeTextMock).toHaveBeenCalledWith("cinematic poster, natural light"));
    expect(writeTextMock).toHaveBeenCalledTimes(1);

    fireEvent.click(within(dialog).getByRole("button", { name: "收藏" }));
    await waitFor(() => expect(favoritePromptMock).toHaveBeenCalledWith("prompt-1", true));
  });

  test("closes the project picker before closing prompt detail on Escape", async () => {
    const onClose = vi.fn();
    getPromptMock.mockResolvedValue(prompt());
    listWorkspaceProjectsMock.mockResolvedValue([]);
    render(<PromptDetailModal onClose={onClose} promptId="prompt-1" />);

    const detail = await screen.findByRole("dialog", { name: "单图提示词" });
    fireEvent.click(within(detail).getByRole("button", { name: "引用到画布" }));
    expect(screen.getByRole("dialog", { name: "选择项目" })).toBeTruthy();

    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "选择项目" })).toBeNull());
    expect(screen.getByRole("dialog", { name: "单图提示词" })).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
