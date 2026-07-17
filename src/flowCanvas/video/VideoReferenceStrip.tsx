import { ImagePlus, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { ReferenceSourcePicker } from "../nodes/ReferenceSourcePicker";
import type {
  VideoGenerationMode,
  VideoGenerationParamsV1,
  VideoReferenceRole,
  VideoReferenceSource,
} from "./videoTypes";
import { VIDEO_UI_COPY, VIDEO_UI_REFERENCE_ROLE_COPY } from "./videoUiCopy";

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

const ROLE_LABELS: Record<VideoReferenceRole, string> = VIDEO_UI_REFERENCE_ROLE_COPY;

export function VideoReferenceStrip({ currentNodeId, onChange, onUploadReference, value }: VideoReferenceStripProps) {
  const [activeRole, setActiveRole] = useState<VideoReferenceRole | null>(null);
  const roles = ROLES_BY_MODE[value.videoGeneration.mode];
  const allowedRolesRef = useRef<readonly VideoReferenceRole[]>(roles);
  allowedRolesRef.current = roles;
  const pickerRole = activeRole && roles.includes(activeRole) ? activeRole : null;

  useEffect(() => {
    if (activeRole && !roles.includes(activeRole)) {
      setActiveRole(null);
    }
  }, [activeRole, roles]);

  const isAllowedRole = (role: VideoReferenceRole) => allowedRolesRef.current.includes(role);

  const updateRole = (role: VideoReferenceRole, source: VideoReferenceSource | null) => {
    if (!isAllowedRole(role)) return;

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
      // A palette assignment belongs to the active role, not to an orphaned
      // source. Replacing or clearing the role must therefore discard every
      // older palette entry for that role while retaining other roles.
      videoGeneration: {
        ...value.videoGeneration,
        contextPaletteRefs: value.videoGeneration.contextPaletteRefs.filter((entry) => entry.role !== role),
        referenceRolesByKey,
      },
    });
  };

  if (roles.length === 0) return null;

  return (
    <div className="relative flex flex-wrap gap-2" aria-label={VIDEO_UI_COPY.referenceSources}>
      {roles.map((role) => {
        const assignment = value.videoGeneration.referenceRolesByKey[role];
        const selected = assignment?.source;
        const roleLabel = ROLE_LABELS[role];
        return (
          <div key={role} className="inline-flex h-[38px] items-center gap-1 rounded-[10px] border border-white/10 bg-[#17171b] p-1">
            <button
              aria-label={`${VIDEO_UI_COPY.selectReference}${roleLabel}`}
              className="inline-flex h-[30px] items-center gap-[7px] rounded-[9px] px-2 text-xs font-bold text-white/80 transition hover:bg-white/[0.08] focus:bg-white/[0.08] focus:outline-none"
              onClick={() => setActiveRole(role)}
              type="button"
            >
              <ImagePlus aria-hidden="true" size={14} />
              <span>{roleLabel}</span>
              {selected ? <span className="text-[9px] font-medium text-sky-200">{roleLabel}{VIDEO_UI_COPY.selected}</span> : null}
            </button>
            {selected ? (
              <button
                aria-label={`${VIDEO_UI_COPY.clearReference}${roleLabel}`}
                className="inline-flex h-[30px] w-[30px] items-center justify-center rounded-[9px] text-white/45 transition hover:bg-white/[0.08] hover:text-white focus:bg-white/[0.08] focus:outline-none"
                onClick={() => updateRole(role, null)}
                title={`${VIDEO_UI_COPY.clearReference}${roleLabel}`}
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
          if (!pickerRole || !isAllowedRole(pickerRole) || !isSafeReferenceId(assetId)) return;
          updateRole(pickerRole, { kind: "asset", id: assetId });
          setActiveRole(null);
        }}
        onPickCanvasNode={(nodeId) => {
          if (!pickerRole || !isAllowedRole(pickerRole) || !isSafeReferenceId(nodeId)) return;
          updateRole(pickerRole, { kind: "upstream", id: nodeId });
          setActiveRole(null);
        }}
        onUploadReference={onUploadReference}
        open={pickerRole !== null}
        roleLabel={pickerRole ? ROLE_LABELS[pickerRole] : undefined}
      />
    </div>
  );
}

function isSafeReferenceId(value: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(value)
    && !/^(?:blob:|data:|https?:)/i.test(value);
}
