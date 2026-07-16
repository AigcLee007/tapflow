import { ImagePlus, Trash2 } from "lucide-react";
import { useState } from "react";

import { ReferenceSourcePicker } from "../nodes/ReferenceSourcePicker";
import type {
  VideoGenerationMode,
  VideoGenerationParamsV1,
  VideoReferenceRole,
  VideoReferenceSource,
} from "./videoTypes";

export type VideoReferenceStripValue = {
  referenceAssetItemIds: string[];
  referenceOrder: string[];
  videoGeneration: VideoGenerationParamsV1;
};

type VideoReferenceStripProps = {
  currentNodeId: string;
  onChange: (value: VideoReferenceStripValue) => void;
  onUploadReference: () => void;
  value: VideoReferenceStripValue;
};

const ROLES_BY_MODE: Record<VideoGenerationMode, VideoReferenceRole[]> = {
  text_to_video: [],
  all_reference: ["subject", "scene", "prop", "style"],
  image_to_video: ["reference"],
  first_last_frame: ["first_frame", "last_frame"],
  image_reference: ["subject", "scene", "prop", "style"],
};

const ROLE_LABELS: Record<VideoReferenceRole, string> = {
  subject: "Subject",
  scene: "Scene",
  prop: "Prop",
  style: "Style",
  first_frame: "First frame",
  last_frame: "Last frame",
  reference: "Reference",
};

export function VideoReferenceStrip({ currentNodeId, onChange, onUploadReference, value }: VideoReferenceStripProps) {
  const [activeRole, setActiveRole] = useState<VideoReferenceRole | null>(null);
  const roles = ROLES_BY_MODE[value.videoGeneration.mode];

  const updateRole = (role: VideoReferenceRole, source: VideoReferenceSource | null) => {
    const referenceRolesByKey = {
      ...value.videoGeneration.referenceRolesByKey,
      [role]: source ? { role, source } : null,
    };
    const nextAssetIds = source?.kind === "asset" && !value.referenceAssetItemIds.includes(source.id)
      ? [...value.referenceAssetItemIds, source.id]
      : value.referenceAssetItemIds;
    const sourceOrderKey = source ? `${source.kind === "asset" ? "asset" : "upstream"}:${source.id}` : null;
    const nextOrder = sourceOrderKey && !value.referenceOrder.includes(sourceOrderKey)
      ? [...value.referenceOrder, sourceOrderKey]
      : value.referenceOrder;

    onChange({
      referenceAssetItemIds: nextAssetIds,
      referenceOrder: nextOrder,
      videoGeneration: { ...value.videoGeneration, referenceRolesByKey },
    });
  };

  if (roles.length === 0) return null;

  return (
    <div className="relative flex flex-wrap gap-2" aria-label="Video references">
      {roles.map((role) => {
        const assignment = value.videoGeneration.referenceRolesByKey[role];
        const selected = assignment?.source;
        const roleLabel = ROLE_LABELS[role];
        return (
          <div key={role} className="inline-flex h-[38px] items-center gap-1 rounded-[10px] border border-white/10 bg-[#17171b] p-1">
            <button
              aria-label={`Select ${roleLabel.toLowerCase()} reference`}
              className="inline-flex h-[30px] items-center gap-[7px] rounded-[9px] px-2 text-xs font-bold text-white/80 transition hover:bg-white/[0.08] focus:bg-white/[0.08] focus:outline-none"
              onClick={() => setActiveRole(role)}
              type="button"
            >
              <ImagePlus aria-hidden="true" size={14} />
              <span>{roleLabel}</span>
              {selected ? <span className="max-w-16 truncate text-[9px] font-medium text-sky-200">{selected.id}</span> : null}
            </button>
            {selected ? (
              <button
                aria-label={`Clear ${roleLabel.toLowerCase()} reference`}
                className="inline-flex h-[30px] w-[30px] items-center justify-center rounded-[9px] text-white/45 transition hover:bg-white/[0.08] hover:text-white focus:bg-white/[0.08] focus:outline-none"
                onClick={() => updateRole(role, null)}
                title={`Clear ${roleLabel} reference`}
                type="button"
              >
                <Trash2 aria-hidden="true" size={14} />
              </button>
            ) : null}
          </div>
        );
      })}
      <ReferenceSourcePicker
        currentNodeId={currentNodeId}
        onClose={() => setActiveRole(null)}
        onPickAsset={(assetId) => {
          if (!activeRole || !isSafeReferenceId(assetId)) return;
          updateRole(activeRole, { kind: "asset", id: assetId });
          setActiveRole(null);
        }}
        onPickCanvasNode={(nodeId) => {
          if (!activeRole || !isSafeReferenceId(nodeId)) return;
          updateRole(activeRole, { kind: "upstream", id: nodeId });
          setActiveRole(null);
        }}
        onUploadReference={onUploadReference}
        open={activeRole !== null}
        roleLabel={activeRole ? ROLE_LABELS[activeRole] : undefined}
      />
    </div>
  );
}

function isSafeReferenceId(value: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(value)
    && !/^(?:blob:|data:|https?:)/i.test(value);
}
