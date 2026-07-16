import { useEffect, useMemo, useRef, useState } from "react";
import { Camera, CheckCircle2, Coins, Palette, SlidersHorizontal, Sparkles } from "lucide-react";

import type { FlowNodeData } from "../types";
import { normalizeVideoGenerationParams } from "./videoGenerationParams";
import { getCameraMotionById, loadVideoCameraManifest, type VideoCameraManifest } from "./videoCameraManifest";
import { VideoCameraLibrary } from "./VideoCameraLibrary";
import { VideoHumanReviewControl } from "./VideoHumanReviewControl";
import { VideoModeMenu } from "./VideoModeMenu";
import { VideoModelMenu } from "./VideoModelMenu";
import { VideoPalettePopover } from "./VideoPalettePopover";
import { VideoParameterPanel } from "./VideoParameterPanel";
import { VideoReferenceStrip } from "./VideoReferenceStrip";
import { useVideoGenerationCatalog } from "./useVideoGenerationCatalog";
import { correctVideoGenerationParams } from "./videoGenerationCapabilities";
import { emitVideoComposerDiagnostic } from "./videoComposerDiagnostics";
import type { VideoGenerationParamsV1 } from "./videoTypes";
import { useDismissibleLayer } from "../../components/menu/useDismissibleLayer";

type Props = { catalog?: ReturnType<typeof useVideoGenerationCatalog>; data: FlowNodeData; generating: boolean; nodeId: string; onGenerate: () => void; onUpdate: (patch: Partial<FlowNodeData>) => void; selected: boolean };

export function VideoNodeComposer({ catalog: catalogOverride, data, generating, nodeId, onGenerate, onUpdate, selected }: Props) {
  const loadedCatalog = useVideoGenerationCatalog();
  const catalog = catalogOverride ?? loadedCatalog;
  const [modelOpen, setModelOpen] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [manifest, setManifest] = useState<VideoCameraManifest>({ version: 1, attribution: "TapFlow original", items: [] });
  const cameraButtonRef = useRef<HTMLButtonElement>(null);
  const modelButtonRef = useRef<HTMLButtonElement>(null);
  const parameterButtonRef = useRef<HTMLButtonElement>(null);
  const parameterLayer = useDismissibleLayer("video-parameter-panel", {
    // Parameter selects are nested dismissible layers. Keep this parent mounted while
    // one opens so its option menu remains interactive.
    closeOnOtherLayer: false,
    onDismiss: () => parameterButtonRef.current?.focus(),
  });
  const params = useMemo(() => normalizeVideoGenerationParams(data).params, [data]);
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

  if (!selected) return null;
  const setParams = (next: VideoGenerationParamsV1) => onUpdate({ params: { ...(data.params ?? {}), videoGeneration: next } });
  const updateReference = (next: { referenceAssetItemIds: string[]; referenceOrder: string[]; videoGeneration: VideoGenerationParamsV1 }) => onUpdate({ params: { ...(data.params ?? {}), videoGeneration: next.videoGeneration }, referenceAssetItemIds: next.referenceAssetItemIds, referenceOrder: next.referenceOrder });
  const selectedMotion = getCameraMotionById(params.cameraMotionId, manifest);
  const cost = option?.estimatedCredits ?? option?.minChargeCredits ?? 0;
  const closeModel = () => {
    setModelOpen(false);
    modelButtonRef.current?.focus();
  };
  const handleModelChange = (modelId: string) => {
    const nextOption = catalog.models.find((model) => model.id === modelId) ?? null;
    const nextParams = nextOption?.capabilities.confirmedByRoute
      ? correctVideoGenerationParams(params, nextOption.capabilities).params
      : params;
    onUpdate({ modelId, params: { ...(data.params ?? {}), videoGeneration: nextParams } });
    closeModel();
  };

  return <div aria-label="Video composer" className="absolute left-1/2 top-[calc(100%+14px)] z-40 flex w-[calc(100vw-32px)] max-w-[980px] -translate-x-1/2 flex-col rounded-[18px] border border-white/10 bg-[#17171b] p-3 text-white shadow-[0_18px_42px_rgba(0,0,0,0.45)] md:w-[clamp(640px,52vw,980px)] max-md:left-0 max-md:translate-x-0 max-md:flex-col">
    <div className="flex flex-wrap items-center gap-2 max-md:flex-col max-md:items-stretch">
      <VideoReferenceStrip currentNodeId={nodeId} onChange={updateReference} onUploadReference={() => undefined} value={{ referenceAssetItemIds: data.referenceAssetItemIds ?? [], referenceOrder: data.referenceOrder ?? [], videoGeneration: params }} />
      <VideoModeMenu capabilities={capabilities} onChange={(mode) => setParams({ ...params, mode })} value={params.mode} />
      <button aria-label="Camera motion library" className="inline-flex h-[38px] items-center gap-[7px] rounded-[10px] border border-white/10 bg-[#17171b] px-2 text-xs font-bold" onClick={() => setCameraOpen(true)} ref={cameraButtonRef} type="button"><Camera size={16} />{selectedMotion?.label ?? "运镜"}</button>
    </div>
    <textarea aria-label="Video prompt" className="mt-2 min-h-[72px] w-full resize-y bg-transparent text-sm outline-none placeholder:text-white/35" onChange={(event) => onUpdate({ generationPrompt: event.target.value })} placeholder="描述任何你想要生成的内容" value={data.generationPrompt || ""} />
    <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-white/10 pt-2 max-md:flex-col max-md:items-stretch">
      <div className="relative"><button ref={modelButtonRef} aria-expanded={modelOpen} aria-label="Choose video model" className="inline-flex h-[38px] items-center gap-[7px] rounded-[10px] border border-white/10 bg-black/20 px-2 text-xs font-bold" onClick={() => { if (modelOpen) closeModel(); else { parameterLayer.dismissLayer(); setModelOpen(true); } }} type="button"><Sparkles size={16} />{option?.label ?? "选择模型"}</button>{modelOpen ? <div className="absolute bottom-[calc(100%+8px)] left-0 z-[1300]"><VideoModelMenu error={catalog.error} loading={catalog.loading} onChange={handleModelChange} onClose={closeModel} onRetry={catalog.retry} options={catalog.models} value={data.modelId ?? null} /></div> : null}</div>
      <div className="relative"><button ref={parameterButtonRef} aria-expanded={parameterLayer.open} aria-label="Video parameters" className="inline-flex h-[38px] items-center gap-[7px] rounded-[10px] border border-white/10 bg-black/20 px-2 text-xs font-bold" onClick={() => { if (parameterLayer.open) parameterLayer.dismissLayer(); else { setModelOpen(false); parameterLayer.openLayer(); } }} type="button"><SlidersHorizontal size={16} />参数</button>{parameterLayer.open ? <div ref={parameterLayer.ref as React.RefObject<HTMLDivElement>} aria-label="Video parameters" className="absolute bottom-[calc(100%+8px)] left-0 z-[1300] w-[min(480px,calc(100vw-32px))] rounded-[16px] border border-white/10 bg-[#1c1c20] p-3 shadow-2xl" role="dialog"><VideoParameterPanel capabilities={capabilities} onChange={setParams} value={params} /></div> : null}</div>
      <VideoPalettePopover onChange={setParams} value={params} />
      <VideoHumanReviewControl onRequestVerification={() => setParams({ ...params, humanReview: { ...params.humanReview, status: "verified", verifiedAt: new Date().toISOString() } })} value={params.humanReview} />
      <span className="ml-auto inline-flex h-[38px] items-center gap-1 text-xs font-bold text-white/55"><Coins size={15} />{cost > 0 ? `${cost} 点数` : "未配置"}</span>
      <button aria-label="Generate video" className="inline-flex h-[38px] items-center gap-1 rounded-[10px] bg-sky-300 px-3 text-xs font-bold text-slate-950 disabled:opacity-50" disabled={generating} onClick={onGenerate} type="button"><CheckCircle2 size={16} />{generating ? "生成中" : "生成"}</button>
    </div>
    {cameraOpen ? <VideoCameraLibrary manifest={manifest} onChange={(cameraMotionId) => setParams({ ...params, cameraMotionId })} onClose={() => setCameraOpen(false)} triggerRef={cameraButtonRef} value={params.cameraMotionId} /> : null}
  </div>;
}
