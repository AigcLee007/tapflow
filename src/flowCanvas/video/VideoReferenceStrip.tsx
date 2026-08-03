import { ImagePlus, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { ReferenceSourcePicker } from "../nodes/ReferenceSourcePicker";
import { resolveAutomaticVideoMode } from "./videoReferenceRules";
import type {
  VideoGenerationMode,
  VideoGenerationCapabilities,
  VideoGenerationParamsV1,
  VideoGenerationParamsV2,
  VideoReferenceRole,
  VideoReferenceInputV2,
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

type VideoReferenceStripV2Props = {
  capabilities: VideoGenerationCapabilities;
  currentNodeId: string;
  onChange: (params: VideoGenerationParamsV2) => void;
  onConnectCanvasReference: (input: Pick<VideoReferenceInputV2, "mediaKind" | "referenceKey" | "role"> & { sourceNodeId: string }) => void;
  onUploadReference: (file: File, mediaKind: VideoReferenceInputV2["mediaKind"]) => Promise<{ id: string; kind: string }>;
  value: VideoGenerationParamsV2;
};

const ROLES_BY_MODE: Record<VideoGenerationMode, VideoReferenceRole[]> = {
  text_to_video: [],
  all_reference: ["subject", "scene", "prop", "style"],
  image_to_video: ["reference"],
  first_last_frame: ["first_frame", "last_frame"],
  image_reference: ["subject", "scene", "prop", "style"],
};

const ROLE_LABELS: Record<VideoReferenceRole, string> = VIDEO_UI_REFERENCE_ROLE_COPY;

export function VideoReferenceStrip(props: VideoReferenceStripProps | VideoReferenceStripV2Props) {
  if ("capabilities" in props) return <VideoReferenceStripV2 {...props} />;
  return <LegacyVideoReferenceStrip {...props} />;
}

function LegacyVideoReferenceStrip({ currentNodeId, onChange, onUploadReference, value }: VideoReferenceStripProps) {
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
      ...(value.videoGeneration.referenceRolesByKey ?? {}),
      [role]: source ? { role, source } : null,
    };
    const canonicalRole = canonicalReferenceRole(role, value.videoGeneration.mode);
    const currentInputs = value.videoGeneration.referenceInputs ?? [];
    const retainedInputs = currentInputs.filter((input) => input.role !== canonicalRole);
    const nextInputs: VideoReferenceInputV2[] = source
      ? [...retainedInputs, {
          referenceKey: `${source.kind}:${source.id}:${retainedInputs.length}`,
          source,
          mediaKind: "image",
          role: canonicalRole,
          order: retainedInputs.length,
        }]
      : retainedInputs;
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
        contextPaletteRefs: (value.videoGeneration.contextPaletteRefs ?? []).filter((entry) => entry.role !== role),
        referenceInputs: nextInputs.map((input, order) => ({ ...input, order })),
        referenceRolesByKey,
      },
    });
  };

  if (roles.length === 0) return null;

  return (
    <div className="relative flex flex-wrap gap-2" aria-label={VIDEO_UI_COPY.referenceSources}>
      {roles.map((role) => {
        const assignment = (value.videoGeneration.referenceRolesByKey ?? {})[role];
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
        allowedKinds={["image"]}
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

function VideoReferenceStripV2({ capabilities, currentNodeId, onChange, onConnectCanvasReference, onUploadReference, value }: VideoReferenceStripV2Props) {
  const [pickerKind, setPickerKind] = useState<VideoReferenceInputV2["mediaKind"] | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const constraint = capabilities.modeConstraints?.[value.mode] ?? {};
  const imageCount = value.referenceInputs.filter((reference) => reference.mediaKind === "image").length;
  const videoCount = value.referenceInputs.filter((reference) => reference.mediaKind === "video").length;
  const audioCount = value.referenceInputs.filter((reference) => reference.mediaKind === "audio").length;
  const maxImages = Number(constraint.maxImages ?? capabilities.maxImages ?? 0);
  const maxVideos = Number(constraint.maxVideos ?? capabilities.maxVideos ?? 0);
  const maxAudios = Number(constraint.maxAudios ?? capabilities.maxAudios ?? 0);
  const remove = (referenceKey: string) => onChange({
    ...value,
    referenceInputs: value.referenceInputs
      .filter((reference) => reference.referenceKey !== referenceKey)
      .map((reference, order) => ({ ...reference, order })),
  });
  const appendReference = (
    mediaKind: VideoReferenceInputV2["mediaKind"],
    source: VideoReferenceInputV2["source"],
  ) => {
    const role = referenceRoleFor(value, capabilities, mediaKind);
    const nextReferences = [
      ...value.referenceInputs,
      {
        mediaKind,
        order: value.referenceInputs.length,
        referenceKey: `${source.kind}:${source.id}:${value.referenceInputs.length}`,
        role,
        source,
      },
    ];
    const resolved = resolveAutomaticVideoMode(capabilities, nextReferences, value.mode);
    onChange({ ...value, mode: resolved.mode, referenceInputs: resolved.references });
  };
  const handleUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    const mediaKind = pickerKind;
    event.target.value = "";
    if (!file || !mediaKind) return;
    try {
      const asset = await onUploadReference(file, mediaKind);
      if (asset.kind !== mediaKind) throw new Error("REFERENCE_ASSET_KIND_MISMATCH");
      appendReference(mediaKind, { kind: "asset", id: asset.id });
      setUploadError(null);
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "REFERENCE_ASSET_KIND_MISMATCH");
    }
  };
  const hasReferenceMode = value.mode !== "text_to_video";
  if (!hasReferenceMode) return null;

  return (
    <div aria-label={VIDEO_UI_COPY.referenceSources} className="relative flex flex-wrap gap-2">
      {value.referenceInputs.map((reference) => (
        <div key={reference.referenceKey} className="inline-flex h-[38px] items-center gap-1 rounded-[10px] border border-white/10 bg-[#17171b] p-1">
          <span className="px-2 text-xs font-bold text-white/80">{VIDEO_UI_REFERENCE_ROLE_COPY[reference.role]}</span>
          <button aria-label={`${VIDEO_UI_COPY.clearReference}${VIDEO_UI_REFERENCE_ROLE_COPY[reference.role]}`} className="inline-flex h-[30px] w-[30px] items-center justify-center rounded-[9px] text-white/45" onClick={() => remove(reference.referenceKey)} type="button"><Trash2 aria-hidden="true" size={14} /></button>
        </div>
      ))}
      {imageCount < maxImages ? <button aria-label="添加参考图" className="inline-flex h-[38px] items-center rounded-[10px] border border-white/10 px-2 text-xs font-bold" onClick={() => setPickerKind("image")} type="button"><ImagePlus size={14} />添加参考图</button> : null}
      {videoCount < maxVideos ? <button aria-label={capabilities.referenceSemantics === "style_images_and_source_video" ? "添加源视频" : "添加参考视频"} className="inline-flex h-[38px] items-center rounded-[10px] border border-white/10 px-2 text-xs font-bold" onClick={() => setPickerKind("video")} type="button"><ImagePlus size={14} />{capabilities.referenceSemantics === "style_images_and_source_video" ? "添加源视频" : "添加参考视频"}</button> : null}
      {audioCount < maxAudios ? <button aria-label="添加参考音频" className="inline-flex h-[38px] items-center rounded-[10px] border border-white/10 px-2 text-xs font-bold" onClick={() => setPickerKind("audio")} type="button"><ImagePlus size={14} />添加参考音频</button> : null}
      <input accept={pickerKind === "audio" ? "audio/*" : pickerKind === "video" ? "video/*" : "image/*"} className="hidden" onChange={handleUpload} ref={fileInputRef} type="file" />
      {uploadError ? <span className="text-[9px] font-medium text-rose-300">{uploadError}</span> : null}
      <ReferenceSourcePicker
        allowedKinds={pickerKind ? [pickerKind] : ["image"]}
        currentNodeId={currentNodeId}
        onClose={() => setPickerKind(null)}
        onPickAsset={(assetId, mediaKind) => {
          appendReference(mediaKind, { kind: "asset", id: assetId });
          setPickerKind(null);
        }}
        onPickCanvasNode={(nodeId, mediaKind) => {
          const role = referenceRoleFor(value, capabilities, mediaKind);
          onConnectCanvasReference({ mediaKind, referenceKey: `upstream:${nodeId}:${value.referenceInputs.length}`, role, sourceNodeId: nodeId });
          appendReference(mediaKind, { kind: "upstream", id: nodeId });
          setPickerKind(null);
        }}
        onUploadReference={() => fileInputRef.current?.click()}
        open={pickerKind !== null}
      />
    </div>
  );
}

function referenceRoleFor(
  value: VideoGenerationParamsV2,
  capabilities: VideoGenerationCapabilities,
  mediaKind: VideoReferenceInputV2["mediaKind"],
): VideoReferenceInputV2["role"] {
  if (mediaKind === "audio") return "reference_audio";
  if (mediaKind === "video") return capabilities.referenceSemantics === "style_images_and_source_video" ? "source_video" : "reference_video";
  if (value.mode === "first_last_frame") return value.referenceInputs.some((reference) => reference.role === "first_frame") ? "last_frame" : "first_frame";
  if (value.mode === "image_to_video") return capabilities.referenceSemantics === "ordered_first_last_frames" ? "first_frame" : "main_image";
  return "reference_image";
}

function canonicalReferenceRole(role: VideoReferenceRole, mode: VideoGenerationMode): VideoReferenceInputV2["role"] {
  if (role === "first_frame" || role === "last_frame") return role;
  if (role === "source_video") return role;
  return mode === "image_to_video" ? "main_image" : "reference_image";
}

function isSafeReferenceId(value: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(value)
    && !/^(?:blob:|data:|https?:)/i.test(value);
}
