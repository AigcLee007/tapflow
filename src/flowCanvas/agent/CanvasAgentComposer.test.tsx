import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { CanvasAgentComposer } from "./CanvasAgentComposer";

describe("CanvasAgentComposer", () => {
  it("renders a controlled draft value and updates it", () => {
    const onChangeDraft = vi.fn();
    render(
      <CanvasAgentComposer
        draftValue="Use round-1-image-1 as reference"
        onChangeDraft={onChangeDraft}
        onSend={vi.fn()}
      />,
    );

    const input = screen.getByPlaceholderText("描述你想完成的生产任务，或引用当前画布内容...");
    expect((input as HTMLTextAreaElement).value).toBe("Use round-1-image-1 as reference");

    fireEvent.change(input, { target: { value: "Use round-1-image-1 to make a poster" } });
    expect(onChangeDraft).toHaveBeenCalledWith("Use round-1-image-1 to make a poster");
  });

  it("renders reference chips and lets them be inserted into the draft", () => {
    const onChangeDraft = vi.fn();
    render(
      <CanvasAgentComposer
        draftValue=""
        onChangeDraft={onChangeDraft}
        onSend={vi.fn()}
        referenceRefs={[
          { label: "Round 1 image 1", refId: "round-1-image-1" },
          { label: "Round 1 image 2", refId: "round-1-image-2" },
        ]}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Round 1 image 1" }));

    expect(onChangeDraft).toHaveBeenCalledWith("round-1-image-1");
  });

  it("appends multiple reference chips into the current draft", () => {
    const onChangeDraft = vi.fn();
    render(
      <CanvasAgentComposer
        draftValue="Make this into a poster"
        onChangeDraft={onChangeDraft}
        onSend={vi.fn()}
        referenceRefs={[
          { label: "Round 1 image 1", refId: "round-1-image-1" },
          { label: "Round 1 image 2", refId: "round-1-image-2" },
        ]}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Round 1 image 1" }));
    fireEvent.click(screen.getByRole("button", { name: "Round 1 image 2" }));

    expect(onChangeDraft).toHaveBeenNthCalledWith(1, "Make this into a poster round-1-image-1");
    expect(onChangeDraft).toHaveBeenNthCalledWith(2, "Make this into a poster round-1-image-2");
  });
});
