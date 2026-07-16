import { useState } from "react";

import { MenuSelect } from "../../components/menu/MenuSelect";
import { useVideoModelCatalog } from "../../hooks/useVideoModelCatalog";
import type { FlowNodeData } from "../types";
import { getVideoModelAspectRatioOptions, getVideoModelDurationOptions } from "../../config/videoModels";

type Props = {
  data: FlowNodeData;
  generating: boolean;
  nodeId: string;
  onGenerate: () => void;
  onUpdate: (patch: Partial<FlowNodeData>) => void;
};

/** The retained v1 prompt bar, kept as a rollout rollback path. */
export function VideoNodeLegacyComposer({ data, generating, nodeId, onGenerate, onUpdate }: Props) {
  const { models } = useVideoModelCatalog();
  const [showBatchSelector, setShowBatchSelector] = useState(false);
  const modelOptions = models.length
    ? models.map((model) => ({ label: model.label, value: model.id }))
    : [{ label: "Veo 3.1 Fast", value: "veo3.1-fast" }];
  const modelId = String(data.modelId || modelOptions[0]?.value || "veo3.1-fast");
  const params = (data.params || {}) as Record<string, unknown>;
  const aspectOptions = getVideoModelAspectRatioOptions(modelId);
  const durationOptions = getVideoModelDurationOptions(modelId);
  const aspectRatio = String(params.aspect_ratio || aspectOptions[0] || "16:9");
  const duration = String(params.duration || durationOptions[0] || "4");
  const batchCount = Number(data.batchCount || 1);

  const setParam = (key: string, value: string) => {
    onUpdate({ params: { ...params, [key]: value } });
  };

  return (
    <div aria-label="Legacy video composer" className="absolute left-1/2 top-[calc(100%+14px)] z-40 w-[clamp(580px,46vw,860px)] -translate-x-1/2 rounded-[18px] border border-white/10 bg-[#17171b] p-3 text-white shadow-[0_18px_42px_rgba(0,0,0,0.45)]">
      <div className="mb-2 flex gap-2">
        <button className="rounded-lg bg-white/5 px-3 py-1.5 text-xs font-bold" type="button">首尾帧</button>
        <button className="rounded-lg bg-white/5 px-3 py-1.5 text-xs font-bold" type="button">+</button>
      </div>
      <textarea aria-label="Video prompt" className="min-h-[72px] w-full resize-y bg-transparent text-sm outline-none placeholder:text-white/35" onChange={(event) => onUpdate({ generationPrompt: event.target.value })} placeholder="描述任何你想要生成的内容" value={data.generationPrompt || ""} />
      <div className="mt-2 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-2">
        <div className="flex flex-wrap items-center gap-2 text-xs text-white/70">
          <span>模型</span>
          <div className="min-w-[156px]"><MenuSelect label={`video model ${nodeId}`} onChange={(nextModelId) => onUpdate({ modelId: nextModelId })} options={modelOptions} size="compact" value={modelId} /></div>
          <span className="text-white/15">|</span>
          <span className="text-white">首尾帧</span>
          <div className="w-[92px]"><MenuSelect label={`video aspect ratio ${nodeId}`} onChange={(value) => setParam("aspect_ratio", value)} options={aspectOptions.map((value) => ({ label: value, value }))} size="compact" value={aspectRatio} /></div>
          <span>1080p</span>
          <div className="w-[76px]"><MenuSelect label={`video duration ${nodeId}`} onChange={(value) => setParam("duration", value)} options={durationOptions.map((value) => ({ label: value, value }))} size="compact" value={duration} /></div>
          <span>秒</span>
          <span>高清</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            {showBatchSelector ? <div aria-label="Video count" className="absolute bottom-[calc(100%+8px)] right-0 z-[1200] grid min-w-11 gap-1 rounded-[12px] border border-white/10 bg-[#1c1c20] p-1 shadow-xl">{[4, 3, 2, 1].map((count) => <button className="h-8 rounded-[8px] text-xs font-bold hover:bg-white/10" key={count} onClick={() => { onUpdate({ batchCount: count }); setShowBatchSelector(false); }} type="button">{count}x</button>)}</div> : null}
            <button aria-expanded={showBatchSelector} aria-label="Video count" className="min-w-11 rounded-[10px] border border-white/10 bg-white/[0.06] px-3 py-1.5 text-xs font-bold" onClick={() => setShowBatchSelector((open) => !open)} type="button">{batchCount}x</button>
          </div>
          <div className="flex items-center gap-2 rounded-[10px] border border-white/10 bg-white/[0.06] py-1 pl-3 pr-1 text-xs font-bold"><span>点数 112</span><button aria-label={`Generate video ${nodeId}`} className="rounded-[8px] bg-sky-300 px-2 py-1 text-slate-950 disabled:opacity-50" disabled={generating} onClick={onGenerate} type="button">{generating ? "..." : "↑"}</button></div>
        </div>
      </div>
    </div>
  );
}
