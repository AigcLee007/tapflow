import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { UploadAssetButton } from "./UploadAssetButton";

const uploadAssetFileMock = vi.fn();

vi.mock("./assetApi", () => ({
  uploadAssetFile: (...args: unknown[]) => uploadAssetFileMock(...args),
}));

describe("UploadAssetButton", () => {
  beforeEach(() => {
    uploadAssetFileMock.mockReset();
  });

  it("renders a compact trigger for canvas drawer usage", () => {
    render(<UploadAssetButton onUploaded={vi.fn()} variant="compact" />);

    const button = screen.getByRole("button");
    expect(button.className).toContain("h-8");
    expect(button.className).toContain("rounded-lg");
  });

  it("uploads multiple files and preserves partial failures", async () => {
    uploadAssetFileMock
      .mockResolvedValueOnce({ id: "asset-1" })
      .mockRejectedValueOnce(new Error("Second upload failed"));

    const onUploaded = vi.fn();
    const { container } = render(<UploadAssetButton onUploaded={onUploaded} />);

    const input = container.querySelector('input[type="file"]') as HTMLInputElement | null;
    expect(input).toBeTruthy();

    const firstFile = new File(["one"], "first.png", { type: "image/png" });
    const secondFile = new File(["two"], "second.png", { type: "image/png" });

    fireEvent.change(input!, {
      target: {
        files: [firstFile, secondFile],
      },
    });

    await waitFor(() => {
      expect(uploadAssetFileMock).toHaveBeenCalledTimes(2);
    });

    await waitFor(() => {
      expect(screen.getByText("first.png")).toBeTruthy();
      expect(screen.getByText("second.png")).toBeTruthy();
      expect(screen.getByText("成功")).toBeTruthy();
      expect(screen.getByText("失败")).toBeTruthy();
      expect(screen.getByText("Second upload failed")).toBeTruthy();
    });

    expect(onUploaded).toHaveBeenCalledTimes(1);
  });
});
