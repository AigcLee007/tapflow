import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { CanvasPromptPanel } from "./CanvasPromptPanel";

const listPromptsMock = vi.fn();

vi.mock("../../services/v2PromptsApi", () => ({
  listPrompts: (...args: unknown[]) => listPromptsMock(...args),
}));

describe("CanvasPromptPanel", () => {
  beforeEach(() => listPromptsMock.mockReset());

  test("adds a new image node when a prompt is referenced", async () => {
    listPromptsMock.mockResolvedValue({
      items: [{
        category: "portrait",
        description: "",
        id: "prompt-1",
        isFavorite: false,
        media: [],
        promptText: "cinematic portrait",
        tags: ["portrait"],
        title: "Portrait",
      }],
      nextCursor: null,
    });
    const onReference = vi.fn();

    render(<CanvasPromptPanel onReference={onReference} />);

    await screen.findByText("Portrait");
    fireEvent.click(screen.getByRole("button", { name: "引用 Portrait" }));

    expect(onReference).toHaveBeenCalledWith(expect.objectContaining({ id: "prompt-1" }));
    await waitFor(() => expect(listPromptsMock).toHaveBeenCalled());
  });
});
