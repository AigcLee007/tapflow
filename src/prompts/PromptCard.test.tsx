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
  test("preserves the original image ratio on full plaza cards", () => {
    const { container } = render(
      <PromptCard
        imageUrl="blob:portrait"
        onCopy={vi.fn()}
        onFavorite={vi.fn()}
        onOpen={vi.fn()}
        onReference={vi.fn()}
        prompt={prompt}
      />,
    );
    const image = container.querySelector("img");

    expect(image?.className).toContain("h-auto");
    expect(image?.className).not.toContain("object-cover");
    expect(image?.parentElement?.className).not.toContain("aspect-[4/3]");
  });

  test("keeps the fixed cover ratio on compact canvas cards", () => {
    const { container } = render(
      <PromptCard
        compact
        imageUrl="blob:portrait"
        onCopy={vi.fn()}
        onFavorite={vi.fn()}
        onOpen={vi.fn()}
        onReference={vi.fn()}
        prompt={prompt}
      />,
    );
    const image = container.querySelector("img");

    expect(image?.className).toContain("h-full");
    expect(image?.className).toContain("object-cover");
    expect(image?.parentElement?.className).toContain("aspect-[4/3]");
  });

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
