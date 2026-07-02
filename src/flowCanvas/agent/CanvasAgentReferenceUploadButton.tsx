import React from "react";
import { Loader2, Plus } from "lucide-react";

import { uploadAssetFile } from "../../assets/assetApi";
import type { AgentReferenceChip } from "./CanvasAgentWorkspaceTypes";

const NON_IMAGE_ERROR = "只能上传图片作为参考图。";
const DEFAULT_UPLOAD_ERROR = "参考图上传失败。";

export function CanvasAgentReferenceUploadButton(props: {
  disabled?: boolean;
  existingCount?: number;
  onError?: (message: string) => void;
  onUploaded: (chips: AgentReferenceChip[]) => void;
  projectId?: string | null;
}) {
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = React.useState(false);

  const resetInput = () => {
    if (inputRef.current) {
      inputRef.current.value = "";
    }
  };

  const handleFiles = async (files: FileList | null) => {
    const selected = Array.from(files ?? []);
    if (selected.length === 0) {
      resetInput();
      return;
    }

    if (selected.some((file) => !file.type.startsWith("image/"))) {
      props.onError?.(NON_IMAGE_ERROR);
      resetInput();
      return;
    }

    setUploading(true);
    try {
      const offset = props.existingCount ?? 0;
      const assets = await Promise.all(
        selected.map((file) => uploadAssetFile({ file, kind: "image", projectId: props.projectId ?? null })),
      );

      props.onUploaded(
        assets.map((asset, index) => ({
          assetId: asset.id,
          id: `upload-${asset.id}`,
          kind: "upload",
          label: `参考图 ${offset + index + 1}`,
          previewUrl: asset.previewUrl,
          refId: `upload-${offset + index + 1}`,
        })),
      );
    } catch (error) {
      props.onError?.(error instanceof Error && error.message.trim() ? error.message : DEFAULT_UPLOAD_ERROR);
    } finally {
      setUploading(false);
      resetInput();
    }
  };

  const disabled = Boolean(props.disabled || uploading);

  return (
    <>
      <button
        aria-label="上传参考图"
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
        style={iconButtonStyle(disabled)}
        title="上传参考图"
        type="button"
      >
        {uploading ? <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} /> : <Plus size={16} />}
      </button>
      <input
        accept="image/*"
        aria-label="上传参考图"
        disabled={disabled}
        multiple
        onChange={(event) => {
          void handleFiles(event.currentTarget.files);
        }}
        ref={inputRef}
        style={{ display: "none" }}
        type="file"
      />
    </>
  );
}

function iconButtonStyle(disabled: boolean): React.CSSProperties {
  return {
    alignItems: "center",
    background: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: 16,
    color: "#f8fafc",
    cursor: disabled ? "not-allowed" : "pointer",
    display: "inline-flex",
    height: 36,
    justifyContent: "center",
    opacity: disabled ? 0.55 : 1,
    width: 36,
  };
}
