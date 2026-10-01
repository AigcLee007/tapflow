import { Check, ChevronDown, ChevronRight, CircleSlash, Loader2, Pencil, SquareTerminal, X } from "lucide-react";
import { useEffect, useState } from "react";

import type { AgentStep } from "./canvasAgentTranscript";
import type { AgentPhase } from "./useCanvasAgent";

const formatSeconds = (ms: number | undefined) => (ms === undefined ? "" : ms < 1000 ? "<1s" : `${Math.round(ms / 1000)}s`);

function StepIcon({ step }: { step: AgentStep }) {
  if (step.status === "running") return <Loader2 aria-hidden className="agent-loop-spin" size={14} />;
  if (step.name === "file_write") return <Pencil aria-hidden size={14} />;
  return <SquareTerminal aria-hidden size={14} />;
}

function StepStatus({ status }: { status: AgentStep["status"] }) {
  if (status === "failed") return <X aria-label="失败" className="agent-loop-step-bad" size={13} />;
  if (status === "stopped") return <CircleSlash aria-label="已停止" size={13} />;
  if (status === "ok") return <Check aria-label="完成" className="agent-loop-step-ok" size={13} />;
  return null;
}

/** "已完成 N 个操作" group of tool steps. */
export function AgentLoopSteps({ steps }: { steps: AgentStep[] }) {
  const running = steps.some((step) => step.status === "running");
  const [open, setOpen] = useState(true);
  const done = steps.filter((step) => step.status !== "running").length;
  const heading = running ? `正在执行 ${steps.length} 个操作` : `已完成 ${done} 个操作`;
  return (
    <section className="agent-loop-steps" aria-label={heading}>
      <button aria-expanded={open} className="agent-loop-steps-head" type="button" onClick={() => setOpen((value) => !value)}>
        {running ? <Loader2 aria-hidden className="agent-loop-spin" size={14} /> : <SquareTerminal aria-hidden size={14} />}
        <span>{heading}</span>
        {open ? <ChevronDown aria-hidden size={13} /> : <ChevronRight aria-hidden size={13} />}
      </button>
      {open ? (
        <ol className="agent-loop-step-list">
          {steps.map((step) => (
            <li className={`agent-loop-step is-${step.status}`} key={step.callId}>
              <StepIcon step={step} />
              <span className="agent-loop-step-title">{step.status === "ok" && step.name === "file_write" ? step.summary ?? step.title : step.title}</span>
              {step.summary && step.name !== "file_write" ? <span className="agent-loop-step-summary">{step.summary}</span> : null}
              {step.durationMs !== undefined ? <span className="agent-loop-step-time">{formatSeconds(step.durationMs)}</span> : null}
              <StepStatus status={step.status} />
            </li>
          ))}
        </ol>
      ) : null}
    </section>
  );
}

const PHASE_LABEL: Record<AgentPhase, string> = { idle: "", organizing: "整理中…", running_tools: "运行中…", thinking: "思考中…" };

/** Live status line with an elapsed-seconds counter. */
export function AgentLoopStatus({ phase, startedAt }: { phase: AgentPhase; startedAt: number | null }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!startedAt) return undefined;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [startedAt]);
  if (phase === "idle" || !startedAt) return null;
  return (
    <div aria-live="polite" className="agent-loop-status" role="status">
      <Loader2 aria-hidden className="agent-loop-spin" size={14} />
      <span>{PHASE_LABEL[phase]}</span>
      <span className="agent-loop-status-time">· {Math.max(0, Math.floor((now - startedAt) / 1000))}s</span>
    </div>
  );
}
