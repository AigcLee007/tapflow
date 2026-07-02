import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CanvasAgentReferenceUploadButton } from "./CanvasAgentReferenceUploadButton";

const uploadAssetFileMock = vi.fn();

vi.mock("../../assets/assetApi", () => ({
  uploadAssetFile: (...args: unknown[]) => uploadAssetFileMock(...args),
}));

describe("CanvasAgentReferenceUploadButton", () => {
  beforeEach(() => {
    uploadAssetFileMock.mockReset();
  });

  it("renders an image-only multiple file input behind the upload trigger", () => {
    const { container } = render(<CanvasAgentReferenceUploadButton onUploaded={vi.fn()} />);

    expect(screen.getByRole("button", { name: "上传参考图" })).toBeTruthy();

    const input = container.querySelector('input[type="file"]') as HTMLInputElement | null;
    expect(input).toBeTruthy();
    expect(input?.multiple).toBe(true);
    expect(input?.accept).toBe("image/*");
  });

  it("rejects non-image files before upload", async () => {
    const onError = vi.fn();
    const onUploaded = vi.fn();
    const { container } = render(<CanvasAgentReferenceUploadButton onError={onError} onUploaded={onUploaded} />);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;

    fireEvent.change(input, {
      target: {
        files: [new File(["hello"], "notes.txt", { type: "text/plain" })],
      },
    });

    await waitFor(() => {
      expect(onError).toHaveBeenCalledWith("只能上传图片作为参考图。");
    });
    expect(uploadAssetFileMock).not.toHaveBeenCalled();
    expect(onUploaded).not.toHaveBeenCalled();
    expect(input.value).toBe("");
  });

  it("uploads images and returns stable upload reference chips", async () => {
    uploadAssetFileMock
      .mockResolvedValueOnce({ id: "asset-1", previewUrl: "/preview/asset-1.png" })
      .mockResolvedValueOnce({ id: "asset-2", previewUrl: "/preview/asset-2.png" });
    const onUploaded = vi.fn();
    const { container } = render(
      <CanvasAgentReferenceUploadButton existingCount={2} onUploaded={onUploaded} projectId="project-1" />,
    );
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const firstFile = new File(["one"], "first.png", { type: "image/png" });
    const secondFile = new File(["two"], "second.webp", { type: "image/webp" });

    fireEvent.change(input, {
      target: {
        files: [firstFile, secondFile],
      },
    });

    await waitFor(() => {
      expect(uploadAssetFileMock).toHaveBeenCalledTimes(2);
    });
    expect(uploadAssetFileMock).toHaveBeenNthCalledWith(1, {
      file: firstFile,
      kind: "image",
      projectId: "project-1",
    });
    expect(uploadAssetFileMock).toHaveBeenNthCalledWith(2, {
      file: secondFile,
      kind: "image",
      projectId: "project-1",
    });
    expect(onUploaded).toHaveBeenCalledWith([
      {
        assetId: "asset-1",
        id: "upload-asset-1",
        kind: "upload",
        label: "参考图 3",
        previewUrl: "/preview/asset-1.png",
        refId: "upload-3",
      },
      {
        assetId: "asset-2",
        id: "upload-asset-2",
        kind: "upload",
        label: "参考图 4",
        previewUrl: "/preview/asset-2.png",
        refId: "upload-4",
      },
    ]);
    expect(input.value).toBe("");
  });

  it("shows upload progress and reports upload failures", async () => {
    let rejectUpload: (error: Error) => void = () => undefined;
    uploadAssetFileMock.mockReturnValue(
      new Promise((_resolve, reject) => {
        rejectUpload = reject;
      }),
    );
    const onError = vi.fn();
    const { container } = render(<CanvasAgentReferenceUploadButton onError={onError} onUploaded={vi.fn()} />);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;

    fireEvent.change(input, {
      target: {
        files: [new File(["one"], "first.png", { type: "image/png" })],
      },
    });

    expect((screen.getByRole("button", { name: "上传参考图" }) as HTMLButtonElement).disabled).toBe(true);

    rejectUpload(new Error("network down"));

    await waitFor(() => {
      expect(onError).toHaveBeenCalledWith("network down");
    });
    expect((screen.getByRole("button", { name: "上传参考图" }) as HTMLButtonElement).disabled).toBe(false);
    expect(input.value).toBe("");
  });
});
