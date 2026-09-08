import type { AgentBlockAction } from "../BlockRenderer";
export function ProgressBlock({ block, onAction }: { block: { id?: string; title?: string; steps: { id: string; label: string; status: "pending" | "running" | "completed" | "failed"; detail?: string }[] }; onAction: (action: AgentBlockAction) => void }) {
  const blockId = block.id ?? "progress";
  return <section className="agent-v6-progress" aria-label={block.title ?? "执行进度"}>
    <h3>{block.title ?? "正在执行"}</h3><ol>{block.steps.map((step) => <li key={step.id} data-status={step.status} className={`is-${step.status}`}><span aria-hidden="true" /> <span>{step.label}</span>{step.detail ? <small>{step.detail}</small> : null}</li>)}</ol>
    <button type="button" onClick={() => onAction({ type: "cancel_progress", blockId })}>取消执行</button>
  </section>;
}
