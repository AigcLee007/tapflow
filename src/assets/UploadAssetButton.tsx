import React, { useRef, useState } from "react";
import { Upload } from "lucide-react";

import { uploadAssetFile } from "./assetApi";

type UploadState = {
  error: string | null;
  fileName: string;
  id: string;
  status: "failed" | "success" | "uploading";
};

export function UploadAssetButton({
  onUploaded,
  projectId,
}: {
  onUploaded: () => void;
  projectId?: string | null;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [items, setItems] = useState<UploadState[]>([]);

  const upload = async (files: FileList | null) => {
    const selectedFiles = Array.from(files ?? []);
    if (selectedFiles.length === 0) return;

    const nextItems = selectedFiles.map((file, index) => ({
      error: null,
      fileName: file.name,
      id: `${Date.now()}-${index}-${file.name}`,
      status: "uploading" as const,
    }));
    setItems(nextItems);
    setUploading(true);
    let successCount = 0;
    try {
      for (let index = 0; index < selectedFiles.length; index += 1) {
        const file = selectedFiles[index];
        const itemId = nextItems[index]?.id;
        if (!itemId) continue;

        try {
          await uploadAssetFile({ file, projectId });
          successCount += 1;
          setItems((current) =>
            current.map((item) =>
              item.id === itemId
                ? {
                    ...item,
                    error: null,
                    status: "success",
                  }
                : item,
            ),
          );
        } catch (error) {
          const message = error instanceof Error ? error.message : "Upload failed";
          setItems((current) =>
            current.map((item) =>
              item.id === itemId
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
        onChange={(event) => void upload(event.target.files)}
        ref={inputRef}
        multiple
        type="file"
      />
      <div className="space-y-2">
        <button
          className="inline-flex h-10 items-center gap-2 rounded bg-white px-4 text-sm font-semibold text-slate-950 hover:bg-slate-200 disabled:opacity-60"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
          type="button"
        >
          <Upload size={16} />
          {uploading ? "Uploading..." : "Upload"}
        </button>
        {items.length > 0 && (
          <div className="rounded border border-white/10 bg-black/20 p-3 text-xs text-slate-300">
            <div className="mb-2 font-medium text-slate-200">Upload results</div>
            <div className="space-y-2">
              {items.map((item) => (
                <div className="flex items-start justify-between gap-3" key={item.id}>
                  <div className="min-w-0">
                    <div className="truncate">{item.fileName}</div>
                    {item.error && <div className="mt-1 text-red-300">{item.error}</div>}
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
                    {item.status}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
