import type { AgentBlockAction } from "../BlockRenderer";
export function ProgressBlock({ block, onAction }: { block: { id?: string; title?: string; steps: { id: string; label: string; status: "pending" | "running" | "completed" | "failed"; detail?: string }[] }; onAction: (action: AgentBlockAction) => void }) {
  const blockId = block.id ?? "progress";
  const failedSteps = block.steps.filter((step) => step.status === "failed");
  return <section className="agent-v6-progress" aria-label={block.title ?? "执行进度"}>
    <h3>{block.title ?? "正在执行"}</h3><ol>{block.steps.map((step) => <li key={step.id} data-status={step.status} className={`is-${step.status}`}><span aria-hidden="true" /> <span>{step.label}</span>{step.detail ? <small>{step.detail}</small> : null}{step.status === "failed" ? <span className="agent-v6-progress-recovery"><button type="button" onClick={() => onAction({ type: "retry_progress", blockId, stepId: step.id })} aria-label={`重试${step.label}`}>重试</button><button type="button" onClick={() => onAction({ type: "revise_progress", blockId, stepId: step.id })} aria-label={`修改${step.label}`}>修改</button><button type="button" onClick={() => onAction({ type: "recover_progress", blockId, stepId: step.id })} aria-label={`恢复${step.label}`}>恢复</button></span> : null}</li>)}</ol>
    {failedSteps.length === 0 ? <button type="button" onClick={() => onAction({ type: "cancel_progress", blockId })}>取消执行</button> : null}
  </section>;
}
