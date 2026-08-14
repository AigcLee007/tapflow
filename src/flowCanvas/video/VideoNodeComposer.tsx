import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Camera, ChevronDown, ChevronUp, RectangleHorizontal, Sparkles, Volume2 } from "lucide-react";

import type { FlowNodeData } from "../types";
import type { CanvasInputItem } from "../inputs/canvasInputProjection";
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
import { evaluateVideoModeAvailability, resolveAvailableVideoMode } from "./videoModeAvailability";
import { normalizeReferenceRolesForMode } from "./videoReferenceRules";
import type { VideoGenerationParamsV1, VideoReferenceInputV2, VideoReferenceRole } from "./videoTypes";
import type { LexicalEditor } from "lexical";
import type { VideoPaletteSourceDisplay } from "./VideoPalettePopover";
import { getVideoModeSwitchMessage, VIDEO_UI_COPY, VIDEO_UI_REFERENCE_ROLE_COPY } from "./videoUiCopy";
import { useDismissibleLayer } from "../../components/menu/useDismissibleLayer";
import { VIDEO_COMPOSER_CAPSULE_CLASS, videoComposerDensity } from "../utils/promptBarDensity";
import { ImageGenerateToolbar } from "../nodes/ImageGenerateToolbar";
import { MediaMentionPromptEditor, type ActivatedMediaMention } from "../mentions/MediaMentionPromptEditor";
import type { MediaMentionCandidate } from "../mentions/mediaMentionCandidates";

type Props = {
  catalog?: ReturnType<typeof useVideoGenerationCatalog>;
  data: FlowNodeData;
  generating: boolean;
  inputsUpdated?: boolean;
  inputItems?: CanvasInputItem[];
  mentionCandidates?: MediaMentionCandidate[];
  /** Integration-test bridge for the shared prompt editor. */
  onMentionEditorReady?: (editor: LexicalEditor) => void;
  allowMediaAdd?: boolean;
  nodeId: string;
  onGenerate: () => void;
  onActivateMentionCandidate?: (candidate: MediaMentionCandidate) => Promise<ActivatedMediaMention> | ActivatedMediaMention;
  onConnectCanvasReference?: (input: Pick<VideoReferenceInputV2, "mediaKind" | "referenceKey" | "role"> & { sourceNodeId: string }) => void;
  onFocusInput?: (inputKey: string) => void;
  onRemoveInput?: (inputKey: string) => void;
  onRemoveAllText?: () => void;
  onReorderInputs?: (inputKeys: string[]) => void;
  onRetryInputPreview?: (inputKey: string) => void;
  onUpdate: (patch: Partial<FlowNodeData>) => void;
  onUploadReference?: (file: File, mediaKind: VideoReferenceInputV2["mediaKind"]) => Promise<{ id: string; kind: string }>;
  referencePreviewUrlsBySource?: Record<string, string | undefined>;
  selected: boolean;
};

export function VideoNodeComposer({ allowMediaAdd = true, catalog: catalogOverride, data, generating, inputItems, inputsUpdated = false, mentionCandidates = [], nodeId, onActivateMentionCandidate, onMentionEditorReady, onConnectCanvasReference = () => undefined, onFocusInput, onGenerate, onRemoveInput, onRemoveAllText, onReorderInputs, onRetryInputPreview, onUpdate, onUploadReference = async () => { throw new Error("REFERENCE_UPLOAD_UNAVAILABLE"); }, referencePreviewUrlsBySource, selected }: Props) {
  const loadedCatalog = useVideoGenerationCatalog();
  const catalog = catalogOverride ?? loadedCatalog;
  const [modelOpen, setModelOpen] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [capabilityNotice, setCapabilityNotice] = useState<string | null>(null);
  const [modeNotice, setModeNotice] = useState<string | null>(null);
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
  const effectiveCapabilities = capabilities ?? createSafeDefaultVideoCapabilities();
  const modeInputs = useMemo(
    () => (inputItems ?? []).map(({ inputKey, kind }) => ({ inputKey, kind })),
    [inputItems],
  );
  const modeAvailability = useMemo(
    () => evaluateVideoModeAvailability(modeInputs, effectiveCapabilities),
    [effectiveCapabilities, modeInputs],
  );
  const modeResolution = useMemo(
    () => resolveAvailableVideoMode(params.mode, modeInputs, effectiveCapabilities),
    [effectiveCapabilities, modeInputs, params.mode],
  );
  const selectedModeAvailability = modeAvailability.items.find((item) => item.mode === params.mode);
  const appliedModeCorrectionRef = useRef<string | null>(null);
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
    if (capabilityCorrection.diagnostics.some((diagnostic) => diagnostic.field === "resolution")) {
      setCapabilityNotice(`当前模型仅支持 ${capabilityCorrection.params.resolution}，已自动调整。`);
    }
    emitVideoComposerDiagnostic("capability_corrected", { errorCode: "CAPABILITY_CORRECTED", modelId: data.modelId, motionId: params.cameraMotionId });
    onUpdate({ params: { ...(data.params ?? {}), videoGeneration: capabilityCorrection.params } });
  }, [capabilities, capabilityCorrection, data.modelId, data.params, onUpdate, params]);

  useEffect(() => {
    if (!modeResolution.switched || modeResolution.mode === params.mode) return;
    const signature = JSON.stringify({
      inputs: modeInputs.map(({ inputKey, kind }) => ({ inputKey, kind })),
      newMode: modeResolution.mode,
      oldMode: params.mode,
    });
    if (appliedModeCorrectionRef.current === signature) return;
    appliedModeCorrectionRef.current = signature;
    const referenceInputs = normalizeReferenceRolesForMode(
      params.referenceInputs,
      modeResolution.mode,
      effectiveCapabilities.referenceSemantics,
    );
    setModeNotice(getVideoModeSwitchMessage(modeAvailability.counts, modeResolution.mode, modeResolution.incompatible));
    onUpdate({
      params: {
        ...(data.params ?? {}),
        videoGeneration: { ...params, mode: modeResolution.mode, referenceInputs },
      },
    });
  }, [data.params, effectiveCapabilities.referenceSemantics, modeInputs, modeResolution.incompatible, modeResolution.mode, modeResolution.switched, onUpdate, params]);

  useEffect(() => {
    if (!capabilityNotice) return;
    const timeout = window.setTimeout(() => setCapabilityNotice(null), 4_000);
    return () => window.clearTimeout(timeout);
  }, [capabilityNotice]);

  useEffect(() => {
    if (!modeNotice) return;
    const timeout = window.setTimeout(() => setModeNotice(null), 4_000);
    return () => window.clearTimeout(timeout);
  }, [modeNotice]);

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

  const activeMentionInputKeys = useMemo(
    () => new Set((inputItems ?? []).filter((item) => item.kind !== "text").map((item) => item.inputKey)),
    [inputItems],
  );
  const activateMention = onActivateMentionCandidate ?? (() => { throw new Error("MEDIA_MENTION_UNAVAILABLE"); });

  if (!selected) return null;
  const setParams = (next: VideoGenerationParamsV1) => onUpdate({ params: { ...(data.params ?? {}), videoGeneration: next } });
  const selectedMotionLabel = getCameraMotionLabel(params.cameraMotionId);
  const cost = option?.pricing ? Math.max(option.pricing.minChargeCredits, option.pricing.unitCredits * params.durationSeconds) : null;
  const showParameterCount = params.count > 1 && (!capabilities?.confirmedByRoute || capabilities.maxCount > 1);
  const parameterSummary = `${params.aspectRatio === "auto" ? "自动" : params.aspectRatio} · ${params.resolution} · ${params.durationSeconds} 秒${showParameterCount ? ` · ${params.count} 个` : ""}`;
  const audioStatusLabel = "音频自动生成";
  const showAudioIndicator = option?.capabilities.audioControlMode === "always_on_implicit" && params.generateAudio;
  const capsuleStyle = {
    borderRadius: videoComposerDensity.capsuleRadius,
    height: videoComposerDensity.capsuleHeight,
  };
  const parameterCapsuleStyle = {
    ...capsuleStyle,
    "--video-composer-mobile-parameter-max-width": `${videoComposerDensity.mobileParameterMaxWidth}px`,
  } as CSSProperties;
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
  const selectedModeEnabled = selectedModeAvailability?.enabled ?? true;
  const generationDisabled = generating || !selectedModelUsable || !selectedModeEnabled || catalog.loading || Boolean(catalog.error);
  const handleModeChange = (mode: VideoGenerationParamsV1["mode"]) => {
    setModeNotice(null);
    setParams({
      ...params,
      mode,
      referenceInputs: normalizeReferenceRolesForMode(params.referenceInputs, mode, effectiveCapabilities.referenceSemantics),
    });
  };

  return <div aria-busy={generating} aria-label={VIDEO_UI_COPY.videoComposer} className="flex w-full flex-col text-white">
    <div className="flex flex-nowrap items-center gap-2" data-testid="video-composer-tools">
      <VideoModeMenu availability={modeAvailability} disabled={generating} onChange={handleModeChange} value={params.mode} />
      <button aria-label={VIDEO_UI_COPY.cameraLibrary} className={`inline-flex min-w-0 items-center gap-1.5 px-[9px] ${VIDEO_COMPOSER_CAPSULE_CLASS}`} disabled={generating} onClick={() => setCameraOpen(true)} ref={cameraButtonRef} style={capsuleStyle} type="button"><Camera className="shrink-0" size={14} /><span className="truncate">{selectedMotionLabel ?? "运镜"}</span></button>
      <VideoPalettePopover disabled={generating} onChange={setParams} sourceDisplayByRole={sourceDisplayByRole} value={params} />
    </div>

    <div className="mt-2 flex min-w-0 flex-wrap gap-2" data-testid="video-composer-references">
      <VideoReferenceStrip allowMediaAdd={allowMediaAdd} capabilities={capabilities ?? createSafeDefaultVideoCapabilities()} currentNodeId={nodeId} disabled={generating} inputItems={inputItems} onChange={(next) => setParams({ ...params, ...next })} onConnectCanvasReference={onConnectCanvasReference} onFocusInput={onFocusInput} onRemoveInput={onRemoveInput} onRemoveAllText={onRemoveAllText} onReorderInputs={onReorderInputs} onRetryInputPreview={onRetryInputPreview} onUploadReference={onUploadReference} value={params} />
    </div>

    {capabilityNotice ? <div className="mt-2 text-xs font-bold text-amber-300" role="status">{capabilityNotice}</div> : null}
    {modeNotice ? <div className="mt-2 text-xs font-bold text-amber-300" role="status">{modeNotice}</div> : null}
    {!selectedModeEnabled && !modeNotice ? <div className="mt-2 text-xs font-bold text-amber-300" role="status">{VIDEO_UI_COPY.unsupportedByCurrentModel}</div> : null}
    {inputsUpdated ? <div className="mt-2 text-xs font-bold text-amber-300" role="status">输入已更新</div> : null}

    <div className="mt-2">
      <MediaMentionPromptEditor
        activeInputKeys={activeMentionInputKeys}
        ariaLabel={VIDEO_UI_COPY.videoPrompt}
        bindings={data.mediaMentionBindings ?? []}
        candidates={mentionCandidates}
        previewUrlsByInputKey={Object.fromEntries((inputItems ?? []).map((item) => [
          item.inputKey,
          item.kind === "video" ? item.thumbnailUrl : item.thumbnailUrl ?? item.previewUrl,
        ]))}
        densityVariant="video"
        disabled={generating}
        onActivateCandidate={activateMention}
        onChange={({ bindings, value }) => onUpdate({ generationPrompt: value, mediaMentionBindings: bindings })}
        onEditorReady={onMentionEditorReady}
        placeholder={VIDEO_UI_COPY.promptPlaceholder}
        value={data.generationPrompt || ""}
      />
    </div>
    <div className="mt-2 flex flex-col gap-2 border-t border-white/10 pt-2 md:flex-row md:flex-nowrap md:items-center" data-testid="video-composer-actions">
      <div className="flex min-w-0 flex-1 flex-nowrap items-center gap-2" data-testid="video-composer-settings-group">
        <div className="relative min-w-0" data-testid="video-capsule-model" style={{ maxWidth: videoComposerDensity.modelMaxWidth }}>
          <button ref={modelButtonRef} aria-expanded={modelOpen} aria-label={VIDEO_UI_COPY.chooseVideoModel} className={`inline-flex max-w-full min-w-0 items-center gap-1.5 px-[9px] ${VIDEO_COMPOSER_CAPSULE_CLASS}`} disabled={generating || catalog.loading} onClick={() => { if (modelOpen) closeModel(); else { parameterLayer.dismissLayer(); setModelOpen(true); } }} style={capsuleStyle} type="button"><Sparkles className="shrink-0" size={14} /><span className="min-w-0 truncate" title={modelButtonLabel}>{modelButtonLabel}</span></button>
          {modelOpen ? <div className="absolute bottom-[calc(100%+8px)] left-0 z-[1300]"><VideoModelMenu error={catalog.error} loading={catalog.loading} onChange={handleModelChange} onClose={closeModel} onRetry={catalog.retry} options={catalog.models} value={data.modelId ?? null} /></div> : null}
        </div>
        <div className="relative min-w-0" data-testid="video-capsule-parameters" style={{ maxWidth: videoComposerDensity.parameterMaxWidth }}>
        <button
          ref={(element) => {
            parameterTriggerRef.current = element;
            parameterLayer.triggerRef.current = element;
          }}
          aria-expanded={parameterLayer.open}
          aria-label="视频参数摘要"
          className={`inline-flex w-max max-w-full min-w-0 items-center gap-1.5 px-[9px] max-md:max-w-[var(--video-composer-mobile-parameter-max-width)] ${VIDEO_COMPOSER_CAPSULE_CLASS}`}
          disabled={generating}
          onClick={() => {
            setModelOpen(false);
            if (parameterLayer.open) parameterLayer.dismissLayer();
            else parameterLayer.openLayer();
          }}
          style={parameterCapsuleStyle}
          type="button"
        >
          <RectangleHorizontal aria-hidden="true" className="shrink-0" size={14} />
          <span className="min-w-0 truncate">{parameterSummary}</span>
          {showAudioIndicator ? <Volume2 aria-label={audioStatusLabel} className="shrink-0" size={14} title={audioStatusLabel} /> : null}
          {parameterLayer.open ? <ChevronUp aria-hidden="true" className="shrink-0 text-white/55" size={14} /> : <ChevronDown aria-hidden="true" className="shrink-0 text-white/55" size={14} />}
        </button>
          {parameterLayer.open ? <VideoParameterPopover anchorRef={parameterTriggerRef} layerRef={parameterLayer.ref}><VideoParameterPanel capabilities={capabilities} onChange={setParams} pricing={option?.pricing ?? null} value={params} /></VideoParameterPopover> : null}
        </div>
      </div>
      <div className="flex shrink-0 items-center justify-between gap-2 md:justify-end" data-testid="video-composer-submit-group">
        <VideoHumanReviewControl compact disabled={generating} onRequestVerification={() => setParams({ ...params, humanReview: { ...params.humanReview, status: "verified", verifiedAt: new Date().toISOString() } })} value={params.humanReview} />
        <ImageGenerateToolbar
          creditsLabel={"\u70b9\u6570"}
          creditsValue={cost !== null ? formatCredits(cost) : "\u672a\u914d\u7f6e"}
          disabled={generationDisabled && !generating}
          generateLabel={VIDEO_UI_COPY.generateVideo}
          generatingLabel={VIDEO_UI_COPY.generating}
          isGenerating={generating}
          onGenerate={onGenerate}
        />
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
