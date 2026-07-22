import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { listPrompts } from "../services/v2PromptsApi";
import { PromptPlazaPage } from "./PromptPlazaPage";

vi.mock("../services/v2PromptsApi", () => ({
  favoritePrompt: vi.fn(),
  getPromptMediaBlob: vi.fn(),
  listPrompts: vi.fn(),
  recordPromptInteraction: vi.fn(),
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
    render(<PromptPlazaPage />);

    await waitFor(() => expect(screen.getByTestId("prompt-plaza-masonry")).toBeTruthy());
    const masonry = screen.getByTestId("prompt-plaza-masonry");
    const item = screen.getByTestId("prompt-masonry-item-prompt-1");

    expect(masonry.className).toContain("columns-1");
    expect(masonry.className).toContain("sm:columns-2");
    expect(masonry.className).toContain("lg:columns-3");
    expect(masonry.className).toContain("xl:columns-4");
    expect(masonry.className).toContain("2xl:columns-5");
    expect(masonry.className).not.toMatch(/(^|\s)grid(\s|$)/);
    expect(item.className).toContain("break-inside-avoid");
    expect(item.className).toContain("mb-3");
  });
});
