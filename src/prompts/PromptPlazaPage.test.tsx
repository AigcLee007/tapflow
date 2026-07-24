import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { getPromptMediaBlob, listPrompts } from "../services/v2PromptsApi";
import { PromptPlazaPage } from "./PromptPlazaPage";

vi.mock("../services/v2PromptsApi", () => ({
  favoritePrompt: vi.fn(),
  getPromptMediaBlob: vi.fn(),
  listPrompts: vi.fn(),
  recordPromptInteraction: vi.fn(),
}));

vi.mock("./PromptDetailModal", () => ({
  PromptDetailModal: ({ promptId }: { promptId: string }) => (
    <div aria-label={`详情 ${promptId}`} role="dialog" />
  ),
}));

const prompt = {
  category: "portrait",
  createdAt: "2026-07-20T00:00:00.000Z",
  createdBy: null,
  description: "Soft cinematic portrait",
  externalKey: "portrait-1",
  id: "prompt-1",
  isFavorite: false,
  media: [],
  negativePrompt: null,
  promptText: "cinematic portrait, soft side light",
  publishedAt: "2026-07-20T00:00:00.000Z",
  sortWeight: 0,
  status: "published" as const,
  tags: ["cinematic", "soft-light"],
  tenantId: null,
  title: "Cinematic portrait",
  updatedAt: "2026-07-20T00:00:00.000Z",
  version: 1,
};

describe("PromptPlazaPage", () => {
  beforeEach(() => {
    vi.mocked(listPrompts).mockResolvedValue({ items: [prompt], nextCursor: null });
  });

  test("renders prompt results in responsive masonry columns", async () => {
    render(<PromptPlazaPage promptId={null} />);

    await waitFor(() => expect(screen.getByTestId("prompt-plaza-masonry")).toBeTruthy());
    const masonry = screen.getByTestId("prompt-plaza-masonry");
    const item = screen.getByTestId("prompt-masonry-item-prompt-1");

    expect(masonry.className).toContain("columns-[340px]");
    expect(masonry.className).not.toMatch(/(?:^|\s)(?:sm|md|lg|xl|2xl):columns-/);
    expect(masonry.className).not.toMatch(/(^|\s)grid(\s|$)/);
    expect(item.className).toContain("break-inside-avoid");
    expect(item.className).toContain("mb-3");
  });

  test("keeps the existing masonry mounted when a detail modal opens", async () => {
    const view = render(<PromptPlazaPage promptId={null} />);
    const masonry = await screen.findByTestId("prompt-plaza-masonry");

    view.rerender(<PromptPlazaPage promptId="prompt-1" />);

    expect(screen.getByTestId("prompt-plaza-masonry")).toBe(masonry);
    expect(screen.getByRole("dialog", { name: "详情 prompt-1" })).toBeTruthy();
  });

  test("does not request original media when the plaza first mounts", async () => {
    vi.mocked(listPrompts).mockResolvedValue({
      items: [{ ...prompt, media: [{ altText: "", height: 1200, id: "media-1", mimeType: "image/jpeg", originalFilename: "portrait.jpg", sizeBytes: 100, sortOrder: 0, width: 800 }] }],
      nextCursor: null,
    });
    vi.stubGlobal("IntersectionObserver", class {
      disconnect = vi.fn();
      observe = vi.fn();
      unobserve = vi.fn();
      root = null;
      rootMargin = "600px 0px";
      thresholds = [0];
      takeRecords = () => [];
    });

    render(<PromptPlazaPage promptId={null} />);
    await screen.findByTestId("prompt-plaza-masonry");

    expect(getPromptMediaBlob).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
