import { useEffect, useMemo, useRef, useState } from "react";
import { Camera, CheckCircle2, ChevronDown, ChevronUp, Coins, RectangleHorizontal, Sparkles, Volume2, VolumeX } from "lucide-react";

import type { FlowNodeData } from "../types";
import { normalizeVideoGenerationParams } from "./videoGenerationParams";
import { getCameraMotionLabel, loadVideoCameraManifest, type VideoCameraManifest } from "./videoCameraManifest";
import { VideoCameraLibrary } from "./VideoCameraLibrary";
import { VideoHumanReviewControl } from "./VideoHumanReviewControl";
import { VideoModeMenu } from "./VideoModeMenu";
import { VideoModelMenu } from "./VideoModelMenu";
import { VideoPalettePopover } from "./VideoPalettePopover";
import { VideoParameterPanel } from "./VideoParameterPanel";
import { VideoParameterPopover } from "./VideoParameterPopover";
import { VideoReferenceStrip } from "./VideoReferenceStrip";
import { useVideoGenerationCatalog } from "./useVideoGenerationCatalog";
import { correctVideoGenerationParams, createSafeDefaultVideoCapabilities } from "./videoGenerationCapabilities";
import { emitVideoComposerDiagnostic } from "./videoComposerDiagnostics";
import { createVideoModelSelectionPatch } from "./videoModelSelection";
import type { VideoGenerationParamsV1, VideoReferenceInputV2, VideoReferenceRole } from "./videoTypes";
import type { VideoPaletteSourceDisplay } from "./VideoPalettePopover";
import { VIDEO_UI_COPY, VIDEO_UI_REFERENCE_ROLE_COPY } from "./videoUiCopy";
import { useDismissibleLayer } from "../../components/menu/useDismissibleLayer";

type Props = {
  catalog?: ReturnType<typeof useVideoGenerationCatalog>;
  data: FlowNodeData;
  generating: boolean;
  nodeId: string;
  onGenerate: () => void;
  onConnectCanvasReference?: (input: Pick<VideoReferenceInputV2, "mediaKind" | "referenceKey" | "role"> & { sourceNodeId: string }) => void;
  onUpdate: (patch: Partial<FlowNodeData>) => void;
  onUploadReference?: (file: File, mediaKind: VideoReferenceInputV2["mediaKind"]) => Promise<{ id: string; kind: string }>;
  referencePreviewUrlsBySource?: Record<string, string | undefined>;
  selected: boolean;
};

export function VideoNodeComposer({ catalog: catalogOverride, data, generating, nodeId, onConnectCanvasReference = () => undefined, onGenerate, onUpdate, onUploadReference = async () => { throw new Error("REFERENCE_UPLOAD_UNAVAILABLE"); }, referencePreviewUrlsBySource, selected }: Props) {
  const loadedCatalog = useVideoGenerationCatalog();
  const catalog = catalogOverride ?? loadedCatalog;
  const [modelOpen, setModelOpen] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [manifest, setManifest] = useState<VideoCameraManifest>({ version: 2, attribution: "DramaClaw commercial license", items: [] });
  const cameraButtonRef = useRef<HTMLButtonElement>(null);
  const modelButtonRef = useRef<HTMLButtonElement>(null);
  const parameterTriggerRef = useRef<HTMLButtonElement>(null);
  const parameterLayer = useDismissibleLayer("video-parameter-panel", {
    // Parameter selects are nested dismissible layers. Keep this parent mounted while
    // one opens so its option menu remains interactive.
    closeOnOtherLayer: false,
    onDismiss: () => parameterTriggerRef.current?.focus(),
  });
  const params = useMemo(() => normalizeVideoGenerationParams(data).params, [data]);
  const sourceDisplayByRole = useMemo(
    () => resolvePaletteSourceDisplays(params, referencePreviewUrlsBySource),
    [params, referencePreviewUrlsBySource],
  );
  const option = catalog.models.find((model) => model.id === data.modelId) ?? null;
  const capabilities = option?.capabilities ?? null;
  const capabilityCorrection = useMemo(
    () => correctVideoGenerationParams(params, capabilities),
    [capabilities, params],
  );
  const appliedCorrectionRef = useRef<string | null>(null);

  useEffect(() => {
    if (!catalog.error) return;
    emitVideoComposerDiagnostic("catalog_error", { errorCode: "CATALOG_LOADING", modelId: data.modelId, motionId: params.cameraMotionId });
  }, [catalog.error, data.modelId, params.cameraMotionId]);

  useEffect(() => {
    // Route-confirmed capabilities are authoritative. Patch once per source
    // state so a delayed or no-op update callback cannot create an update loop.
    if (!capabilities?.confirmedByRoute || !capabilityCorrection.diagnostics.length) return;
    const signature = JSON.stringify({ capabilities, modelId: data.modelId, params });
    if (appliedCorrectionRef.current === signature) return;
    appliedCorrectionRef.current = signature;
    emitVideoComposerDiagnostic("capability_corrected", { errorCode: "CAPABILITY_CORRECTED", modelId: data.modelId, motionId: params.cameraMotionId });
    onUpdate({ params: { ...(data.params ?? {}), videoGeneration: capabilityCorrection.params } });
  }, [capabilities, capabilityCorrection, data.modelId, data.params, onUpdate, params]);

  useEffect(() => {
    let active = true;
    void fetch("/video-camera-library/manifest.v1.json").then((response) => response.json()).then((value) => {
      if (active) setManifest(loadVideoCameraManifest(value));
    }).catch(() => {
      emitVideoComposerDiagnostic("manifest_error", { errorCode: "MANIFEST_LOAD_FAILED", modelId: data.modelId, motionId: params.cameraMotionId });
    });
    return () => { active = false; };
  }, [data.modelId, params.cameraMotionId]);

  useEffect(() => {
    if (!generating) return;
    setModelOpen(false);
    setCameraOpen(false);
    parameterLayer.dismissLayer();
  }, [generating, parameterLayer.dismissLayer]);

  if (!selected) return null;
  const setParams = (next: VideoGenerationParamsV1) => onUpdate({ params: { ...(data.params ?? {}), videoGeneration: next } });
  const selectedMotionLabel = getCameraMotionLabel(params.cameraMotionId);
  const cost = option?.pricing ? Math.max(option.pricing.minChargeCredits, option.pricing.unitCredits * params.durationSeconds) : null;
  const parameterSummary = `${params.aspectRatio === "auto" ? "自动" : params.aspectRatio} · ${params.resolution} · ${params.durationSeconds} 秒 · ${params.count} 个`;
  const audioStatusLabel = params.generateAudio ? "音频开启" : "音频关闭";
  const closeModel = () => {
    setModelOpen(false);
    modelButtonRef.current?.focus();
  };
  const handleModelChange = (modelId: string) => {
    const option = catalog.models.find((model) => model.id === modelId);
    if (!option || option.blocker !== null) return;
    const patch = createVideoModelSelectionPatch(data, option);
    onUpdate(patch);
    closeModel();
  };

  const selectedModelUsable = option?.blocker === null;
  const modelButtonLabel = catalog.loading
    ? VIDEO_UI_COPY.loadingModels
    : catalog.error
      ? VIDEO_UI_COPY.modelCatalogError
      : option?.label ?? VIDEO_UI_COPY.chooseModel;
  const generationDisabled = generating || !selectedModelUsable || catalog.loading || Boolean(catalog.error);

  return <div aria-busy={generating} aria-label={VIDEO_UI_COPY.videoComposer} className="flex w-full flex-col text-white">
    <div className="flex flex-nowrap items-center gap-2" data-testid="video-composer-tools">
      <VideoModeMenu capabilities={capabilities} disabled={generating} onChange={(mode) => setParams({ ...params, mode })} value={params.mode} />
      <button aria-label={VIDEO_UI_COPY.cameraLibrary} className="inline-flex h-[38px] min-w-0 items-center gap-[7px] rounded-[10px] border border-white/10 bg-[#17171b] px-2 text-xs font-bold disabled:cursor-not-allowed disabled:opacity-45" disabled={generating} onClick={() => setCameraOpen(true)} ref={cameraButtonRef} type="button"><Camera className="shrink-0" size={16} /><span className="truncate">{selectedMotionLabel ?? "运镜"}</span></button>
      <VideoPalettePopover disabled={generating} onChange={setParams} sourceDisplayByRole={sourceDisplayByRole} value={params} />
    </div>

    {params.mode !== "text_to_video" ? <div className="mt-2 flex min-w-0 flex-wrap gap-2" data-testid="video-composer-references">
      <VideoReferenceStrip capabilities={capabilities ?? createSafeDefaultVideoCapabilities()} currentNodeId={nodeId} disabled={generating} onChange={(next) => setParams({ ...params, ...next })} onConnectCanvasReference={onConnectCanvasReference} onUploadReference={onUploadReference} value={params} />
    </div> : null}

    <textarea aria-label={VIDEO_UI_COPY.videoPrompt} className="mt-2 min-h-[72px] w-full resize-y bg-transparent text-sm outline-none placeholder:text-white/35 disabled:cursor-not-allowed disabled:opacity-55" disabled={generating} onChange={(event) => onUpdate({ generationPrompt: event.target.value })} placeholder={VIDEO_UI_COPY.promptPlaceholder} value={data.generationPrompt || ""} />
    <div className="mt-2 flex flex-col gap-2 border-t border-white/10 pt-2 md:flex-row md:flex-nowrap md:items-center" data-testid="video-composer-actions">
      <div className="flex min-w-0 flex-1 flex-nowrap items-center gap-2" data-testid="video-composer-settings-group">
        <div className="relative max-w-[150px] min-w-0">
          <button ref={modelButtonRef} aria-expanded={modelOpen} aria-label={VIDEO_UI_COPY.chooseVideoModel} className="inline-flex h-[38px] max-w-full min-w-0 items-center gap-[7px] rounded-[10px] border border-white/10 bg-black/20 px-2 text-xs font-bold disabled:cursor-not-allowed disabled:opacity-45" disabled={generating || catalog.loading} onClick={() => { if (modelOpen) closeModel(); else { parameterLayer.dismissLayer(); setModelOpen(true); } }} type="button"><Sparkles className="shrink-0" size={16} /><span className="min-w-0 truncate" title={option?.label}>{modelButtonLabel}</span></button>
          {modelOpen ? <div className="absolute bottom-[calc(100%+8px)] left-0 z-[1300]"><VideoModelMenu error={catalog.error} loading={catalog.loading} onChange={handleModelChange} onClose={closeModel} onRetry={catalog.retry} options={catalog.models} value={data.modelId ?? null} /></div> : null}
        </div>
        <div className="relative min-w-0 flex-1">
        <button
          ref={(element) => {
            parameterTriggerRef.current = element;
            parameterLayer.triggerRef.current = element;
          }}
          aria-expanded={parameterLayer.open}
          aria-label="视频参数摘要"
          className="inline-flex h-[38px] w-full max-w-full min-w-0 items-center gap-2 rounded-[10px] border border-white/10 bg-[#303036] px-3 text-xs font-bold text-white/90 transition hover:border-white/25 hover:bg-[#383840] focus:border-sky-300/50 focus:outline-none disabled:cursor-not-allowed disabled:opacity-45"
          disabled={generating}
          onClick={() => {
            setModelOpen(false);
            if (parameterLayer.open) parameterLayer.dismissLayer();
            else parameterLayer.openLayer();
          }}
          type="button"
        >
          <RectangleHorizontal aria-hidden="true" className="shrink-0" size={16} />
          <span className="min-w-0 truncate">{parameterSummary}</span>
          {params.generateAudio ? <Volume2 aria-label={audioStatusLabel} className="shrink-0" size={16} title={audioStatusLabel} /> : <VolumeX aria-label={audioStatusLabel} className="shrink-0" size={16} title={audioStatusLabel} />}
          {parameterLayer.open ? <ChevronUp aria-hidden="true" className="shrink-0 text-white/55" size={15} /> : <ChevronDown aria-hidden="true" className="shrink-0 text-white/55" size={15} />}
        </button>
          {parameterLayer.open ? <VideoParameterPopover anchorRef={parameterTriggerRef} layerRef={parameterLayer.ref}><VideoParameterPanel capabilities={capabilities} onChange={setParams} pricing={option?.pricing ?? null} value={params} /></VideoParameterPopover> : null}
        </div>
      </div>
      <div className="flex shrink-0 items-center justify-between gap-2 md:justify-end" data-testid="video-composer-submit-group">
        <VideoHumanReviewControl compact disabled={generating} onRequestVerification={() => setParams({ ...params, humanReview: { ...params.humanReview, status: "verified", verifiedAt: new Date().toISOString() } })} value={params.humanReview} />
        <span className="inline-flex h-[38px] items-center gap-1 whitespace-nowrap text-xs font-bold text-white/55"><Coins size={15} />{cost !== null ? `预计 ${formatCredits(cost)} 金币` : "未配置"}</span>
        <button aria-label={VIDEO_UI_COPY.generateVideo} className="inline-flex h-[38px] items-center gap-1 rounded-[10px] bg-sky-300 px-3 text-xs font-bold text-slate-950 disabled:cursor-not-allowed disabled:opacity-50" disabled={generationDisabled} onClick={onGenerate} type="button"><CheckCircle2 size={16} />{generating ? VIDEO_UI_COPY.generating : VIDEO_UI_COPY.generate}</button>
      </div>
    </div>
    {cameraOpen ? <VideoCameraLibrary manifest={manifest} onChange={(cameraMotionId) => setParams({ ...params, cameraMotionId })} onClose={() => setCameraOpen(false)} triggerRef={cameraButtonRef} value={params.cameraMotionId} /> : null}
  </div>;
}

function formatCredits(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Math.round(value * 100) / 100);
}

function resolvePaletteSourceDisplays(
  params: VideoGenerationParamsV1,
  previewUrlsBySource?: Record<string, string | undefined>,
): Partial<Record<VideoReferenceRole, VideoPaletteSourceDisplay>> | undefined {
  if (!previewUrlsBySource) return undefined;
  const displays: Partial<Record<VideoReferenceRole, VideoPaletteSourceDisplay>> = {};
  Object.values(params.referenceRolesByKey).forEach((assignment) => {
    if (!assignment) return;
    const sourceKey = `${assignment.source.kind === "asset" ? "asset" : "upstream"}:${assignment.source.id}`;
    const thumbnailUrl = previewUrlsBySource[sourceKey];
    if (!thumbnailUrl) return;
    displays[assignment.role] = { label: getPaletteRoleLabel(assignment.role), thumbnailUrl };
  });
  return Object.keys(displays).length > 0 ? displays : undefined;
}

function getPaletteRoleLabel(role: VideoReferenceRole): string {
  const roleLabel = VIDEO_UI_REFERENCE_ROLE_COPY[role];
  return role === "reference" ? roleLabel : `${roleLabel}参考`;
}
