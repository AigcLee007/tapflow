import React, { useRef, useState } from "react";
import { Upload } from "lucide-react";

import { uploadAssetFile, type AssetItem } from "./assetApi";

type UploadState = {
  error: string | null;
  fileName: string;
  id: string;
  status: "failed" | "success" | "uploading";
};

export type UploadAssetPreview = {
  fileName: string;
  id: string;
  previewUrl: string | null;
};

const TEXT = {
  failed: "\u5931\u8d25",
  failedMessage: "\u4e0a\u4f20\u5931\u8d25\uff0c\u8bf7\u7a0d\u540e\u91cd\u8bd5\u3002",
  success: "\u6210\u529f",
  upload: "\u4e0a\u4f20",
  uploading: "\u4e0a\u4f20\u4e2d",
  uploadResult: "\u4e0a\u4f20\u7ed3\u679c",
};

function statusLabel(status: UploadState["status"]) {
  if (status === "uploading") return TEXT.uploading;
  if (status === "success") return TEXT.success;
  return TEXT.failed;
}

function createPreview(file: File, index: number): UploadAssetPreview {
  return {
    fileName: file.name,
    id: `${Date.now()}-${index}-${file.name}`,
    previewUrl: file.type.startsWith("image/") ? URL.createObjectURL(file) : null,
  };
}

export function UploadAssetButton({
  onUploaded,
  onUploadComplete,
  onUploadStart,
  projectId,
  variant = "default",
}: {
  onUploaded: () => void;
  onUploadComplete?: (asset: AssetItem, preview: UploadAssetPreview) => void;
  onUploadStart?: (preview: UploadAssetPreview) => void;
  projectId?: string | null;
  variant?: "compact" | "default";
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [items, setItems] = useState<UploadState[]>([]);

  const buttonClassName =
    variant === "compact"
      ? "inline-flex h-8 items-center gap-2 rounded-lg border border-white/10 bg-white/[0.07] px-3 text-xs font-semibold text-slate-100 hover:bg-white/[0.1] disabled:opacity-60"
      : "inline-flex h-10 items-center gap-2 rounded bg-white px-4 text-sm font-semibold text-slate-950 hover:bg-slate-200 disabled:opacity-60";
  const wrapperClassName = variant === "compact" ? "space-y-1.5" : "space-y-2";
  const resultPanelClassName =
    variant === "compact"
      ? "rounded-lg border border-white/10 bg-black/20 p-2 text-[11px] text-slate-300"
      : "rounded border border-white/10 bg-black/20 p-3 text-xs text-slate-300";
  const resultTitleClassName = variant === "compact" ? "mb-1.5 font-medium text-slate-200" : "mb-2 font-medium text-slate-200";

  const upload = async (files: FileList | null) => {
    const selectedFiles = Array.from(files ?? []);
    if (selectedFiles.length === 0) return;

    const previews = selectedFiles.map(createPreview);
    previews.forEach((preview) => onUploadStart?.(preview));
    setItems(
      previews.map((preview) => ({
        error: null,
        fileName: preview.fileName,
        id: preview.id,
        status: "uploading",
      })),
    );
    setUploading(true);
    let successCount = 0;

    try {
      for (let index = 0; index < selectedFiles.length; index += 1) {
        const file = selectedFiles[index];
        const preview = previews[index];
        if (!file || !preview) continue;

        try {
          const asset = await uploadAssetFile({ file, projectId });
          successCount += 1;
          onUploadComplete?.(asset, preview);
          setItems((current) =>
            current.map((item) =>
              item.id === preview.id
                ? {
                    ...item,
                    error: null,
                    status: "success",
                  }
                : item,
            ),
          );
        } catch (error) {
          const message = error instanceof Error ? error.message : TEXT.failedMessage;
          setItems((current) =>
            current.map((item) =>
              item.id === preview.id
                ? {
                    ...item,
                    error: message,
                    status: "failed",
                  }
                : item,
            ),
          );
        }
      }

      if (successCount > 0) {
        onUploaded();
      }
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <>
      <input
        className="hidden"
        multiple
        onChange={(event) => void upload(event.target.files)}
        ref={inputRef}
        type="file"
      />
      <div className={wrapperClassName}>
        <button
          className={buttonClassName}
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
          type="button"
        >
          <Upload size={16} />
          {uploading ? `${TEXT.uploading}...` : TEXT.upload}
        </button>
        {items.length > 0 ? (
          <div className={resultPanelClassName}>
            <div className={resultTitleClassName}>{TEXT.uploadResult}</div>
            <div className="space-y-2">
              {items.map((item) => (
                <div className="flex items-start justify-between gap-3" key={item.id}>
                  <div className="min-w-0">
                    <div className="truncate">{item.fileName}</div>
                    {item.error ? <div className="mt-1 text-red-300">{item.error}</div> : null}
                  </div>
                  <div
                    className={
                      item.status === "success"
                        ? "text-emerald-300"
                        : item.status === "failed"
                          ? "text-red-300"
                          : "text-sky-300"
                    }
                  >
                    {statusLabel(item.status)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </>
  );
}
