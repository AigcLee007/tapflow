import { AlertTriangle, LoaderCircle, RotateCcw } from "lucide-react";

import { NodeWaitingVideo } from "../nodes/NodeWaitingVideo";
import type { FlowGenerationStatus, FlowNodeStatus } from "../types";

type VideoGenerationFeedbackProps = {
  errorMessage?: string | null;
  generationStatus?: FlowGenerationStatus;
  onRetry: () => void;
  runtimeStatus?: FlowNodeStatus;
};

export type VideoGenerationFeedbackState =
  | { kind: "submitting" | "generating" | "error"; label: string }
  | null;

export function resolveVideoGenerationFeedback(
  runtimeStatus?: FlowNodeStatus,
  generationStatus?: FlowGenerationStatus,
  errorMessage?: string | null,
): VideoGenerationFeedbackState {
  if ((runtimeStatus === "error" || runtimeStatus === "failed" || generationStatus === "error") && errorMessage) {
    return { kind: "error", label: errorMessage };
  }
  if (runtimeStatus === "pending" || runtimeStatus === "runnable") {
    return { kind: "submitting", label: "正在提交任务" };
  }
  if (runtimeStatus === "running" || runtimeStatus === "waiting_provider") {
    return { kind: "generating", label: "正在生成视频" };
  }
  if (generationStatus === "generating") {
    return { kind: "generating", label: "正在生成视频" };
  }
  return null;
}

export function VideoGenerationFeedback({ errorMessage, generationStatus, onRetry, runtimeStatus }: VideoGenerationFeedbackProps) {
  const state = resolveVideoGenerationFeedback(runtimeStatus, generationStatus, errorMessage);
  if (!state) return null;

  if (state.kind === "error") {
    return <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-black/75 px-5 text-center text-white" role="alert">
      <AlertTriangle aria-hidden="true" className="text-rose-300" size={26} />
      <span className="max-w-full break-words text-xs font-bold leading-relaxed">{state.label}</span>
      <button aria-label="重试" className="inline-flex h-[34px] items-center gap-1.5 rounded-[9px] border border-white/15 bg-white/10 px-3 text-xs font-bold transition hover:bg-white/15" onClick={onRetry} type="button">
        <RotateCcw aria-hidden="true" size={14} />重试
      </button>
    </div>;
  }

  return <NodeWaitingVideo
    className="absolute inset-0 z-20 overflow-hidden [&>video]:absolute [&>video]:inset-0 [&>video]:h-full [&>video]:w-full [&>video]:object-cover"
    fallback={<div aria-live="polite" className="absolute inset-0 flex flex-col items-center justify-center gap-3 overflow-hidden bg-black/70 text-white" role="status">
      <div aria-hidden="true" className="absolute inset-4 border border-white/5 bg-white/[0.025]" />
      <span className="relative inline-flex text-sky-200 motion-safe:animate-spin" data-testid="video-generation-indicator"><LoaderCircle aria-hidden="true" size={28} /></span>
      <span className="relative text-xs font-bold">{state.label}</span>
    </div>}
    kind="video"
  />;
}
