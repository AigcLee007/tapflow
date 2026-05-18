import React, { useRef, useState } from "react";
import { Upload } from "lucide-react";

import { uploadAssetFile } from "./assetApi";

export function UploadAssetButton({
  onUploaded,
  projectId,
}: {
  onUploaded: () => void;
  projectId?: string | null;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);

  const upload = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      await uploadAssetFile({ file, projectId });
      onUploaded();
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
        type="file"
      />
      <button
        className="inline-flex h-10 items-center gap-2 rounded bg-white px-4 text-sm font-semibold text-slate-950 hover:bg-slate-200 disabled:opacity-60"
        disabled={uploading}
        onClick={() => inputRef.current?.click()}
        type="button"
      >
        <Upload size={16} />
        {uploading ? "Uploading" : "Upload"}
      </button>
    </>
  );
}
