import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { CanvasAgentReferenceChips } from "./CanvasAgentReferenceChips";

describe("CanvasAgentReferenceChips", () => {
  it("renders thumbnails and removes only removable upload chips", () => {
    const onInsertRef = vi.fn();
    const onRemoveRef = vi.fn();

    render(
      <CanvasAgentReferenceChips
        chips={[
          {
            assetId: "asset-upload-1",
            id: "upload-chip",
            kind: "upload",
            label: "参考图 1",
            previewUrl: "/preview/ref.png",
            refId: "upload-1",
          },
          {
            assetId: "asset-artifact-1",
            id: "artifact-chip",
            kind: "artifact",
            label: "上一轮结果 1",
            refId: "round-1-image-1",
          },
        ]}
        onInsertRef={onInsertRef}
        onRemoveRef={onRemoveRef}
        removableKinds={["upload"]}
      />,
    );

    const thumbnail = document.querySelector('img[src="/preview/ref.png"]') as HTMLImageElement | null;
    expect(thumbnail).toBeTruthy();
    if (!thumbnail) return;
    expect(thumbnail.src).toContain("/preview/ref.png");
    expect(screen.getByRole("button", { name: "移除 参考图 1" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "移除 上一轮结果 1" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "移除 参考图 1" }));

    expect(onRemoveRef).toHaveBeenCalledWith(expect.objectContaining({ id: "upload-chip", refId: "upload-1" }));
    expect(onInsertRef).not.toHaveBeenCalled();
  });
});
