import React, { useRef, useState } from 'react';
import { Upload } from 'lucide-react';

import { uploadAssetFile, type AssetItem } from './assetApi';

type UploadState = {
  error: string | null;
  fileName: string;
  id: string;
  status: 'failed' | 'success' | 'uploading';
};

function statusLabel(status: UploadState['status']) {
  if (status === 'uploading') return '上传中';
  if (status === 'success') return '成功';
  return '失败';
}

export function UploadAssetButton({
  onUploaded,
  onUploadComplete,
  projectId,
  variant = 'default',
}: {
  onUploaded: () => void;
  onUploadComplete?: (asset: AssetItem) => void;
  projectId?: string | null;
  variant?: 'compact' | 'default';
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [items, setItems] = useState<UploadState[]>([]);

  const buttonClassName =
    variant === 'compact'
      ? 'inline-flex h-8 items-center gap-2 rounded-lg border border-white/10 bg-white/[0.07] px-3 text-xs font-semibold text-slate-100 hover:bg-white/[0.1] disabled:opacity-60'
      : 'inline-flex h-10 items-center gap-2 rounded bg-white px-4 text-sm font-semibold text-slate-950 hover:bg-slate-200 disabled:opacity-60';
  const wrapperClassName = variant === 'compact' ? 'space-y-1.5' : 'space-y-2';
  const resultPanelClassName =
    variant === 'compact'
      ? 'rounded-lg border border-white/10 bg-black/20 p-2 text-[11px] text-slate-300'
      : 'rounded border border-white/10 bg-black/20 p-3 text-xs text-slate-300';
  const resultTitleClassName = variant === 'compact' ? 'mb-1.5 font-medium text-slate-200' : 'mb-2 font-medium text-slate-200';

  const upload = async (files: FileList | null) => {
    const selectedFiles = Array.from(files ?? []);
    if (selectedFiles.length === 0) return;

    const nextItems = selectedFiles.map((file, index) => ({
      error: null,
      fileName: file.name,
      id: `${Date.now()}-${index}-${file.name}`,
      status: 'uploading' as const,
    }));
    setItems(nextItems);
    setUploading(true);
    let successCount = 0;

    try {
      for (let index = 0; index < selectedFiles.length; index += 1) {
        const file = selectedFiles[index];
        const itemId = nextItems[index]?.id;
        if (!file || !itemId) continue;

        try {
          const asset = await uploadAssetFile({ file, projectId });
          successCount += 1;
          onUploadComplete?.(asset);
          setItems((current) =>
            current.map((item) =>
              item.id === itemId
                ? {
                    ...item,
                    error: null,
                    status: 'success',
                  }
                : item,
            ),
          );
        } catch (error) {
          const message = error instanceof Error ? error.message : '上传失败，请稍后重试。';
          setItems((current) =>
            current.map((item) =>
              item.id === itemId
                ? {
                    ...item,
                    error: message,
                    status: 'failed',
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
      if (inputRef.current) inputRef.current.value = '';
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
          {uploading ? '上传中...' : '上传'}
        </button>
        {items.length > 0 ? (
          <div className={resultPanelClassName}>
            <div className={resultTitleClassName}>上传结果</div>
            <div className="space-y-2">
              {items.map((item) => (
                <div className="flex items-start justify-between gap-3" key={item.id}>
                  <div className="min-w-0">
                    <div className="truncate">{item.fileName}</div>
                    {item.error ? <div className="mt-1 text-red-300">{item.error}</div> : null}
                  </div>
                  <div
                    className={
                      item.status === 'success'
                        ? 'text-emerald-300'
                        : item.status === 'failed'
                          ? 'text-red-300'
                          : 'text-sky-300'
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
