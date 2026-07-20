import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { PromptCard } from "./PromptCard";

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

describe("PromptCard", () => {
  test("keeps copy, favorite, and reference as separate actions", async () => {
    const onCopy = vi.fn();
    const onFavorite = vi.fn();
    const onReference = vi.fn();
    render(<PromptCard onCopy={onCopy} onFavorite={onFavorite} onOpen={vi.fn()} onReference={onReference} prompt={prompt} />);

    fireEvent.click(screen.getByRole("button", { name: "复制提示词" }));
    fireEvent.click(screen.getByRole("button", { name: "收藏" }));
    fireEvent.click(screen.getByRole("button", { name: "引用到画布" }));

    expect(onCopy).toHaveBeenCalledWith(prompt);
    expect(onFavorite).toHaveBeenCalledWith(prompt);
    expect(onReference).toHaveBeenCalledWith(prompt);
  });
});
