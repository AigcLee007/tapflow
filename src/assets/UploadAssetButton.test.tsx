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
      expect(screen.getByText("success")).toBeTruthy();
      expect(screen.getByText("failed")).toBeTruthy();
      expect(screen.getByText("Second upload failed")).toBeTruthy();
    });

    expect(onUploaded).toHaveBeenCalledTimes(1);
  });
});
