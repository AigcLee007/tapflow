import type { AgentBlockAction } from "../BlockRenderer";
export function ConfirmationBlock({ block, onAction }: { block: { id?: string; title?: string; text: string; plan: { costCredits?: number; summary?: string; batch?: boolean; writesCanvas?: boolean; skill?: boolean; app?: boolean } }; onAction: (action: AgentBlockAction) => void }) {
  const blockId = block.id ?? "confirmation";
  const risks = [block.plan.batch ? "批量执行" : null, block.plan.writesCanvas ? "写入当前画布" : null, block.plan.skill ? "使用 Skill" : null, block.plan.app ? "调用 App" : null].filter(Boolean);
  return <section className="agent-v6-confirmation" aria-label={block.title ?? "执行确认"}>
    <span className="agent-v6-eyebrow">需要确认</span><h3>{block.title ?? "准备执行"}</h3><p>{block.text}</p>
    <dl className="agent-v6-confirmation-details"><div><dt>费用</dt><dd>{block.plan.costCredits === undefined ? "待估算" : `${block.plan.costCredits} 积分`}</dd></div><div><dt>范围</dt><dd>{block.plan.summary ?? "当前任务"}</dd></div><div><dt>风险</dt><dd>{risks.length ? risks.join("、") : "低风险"}</dd></div></dl>
    <div className="agent-v6-actions"><button type="button" className="is-primary" onClick={() => onAction({ type: "confirm_execution", blockId })}>确认并执行</button><button type="button" onClick={() => onAction({ type: "revise_plan", blockId })}>修改计划</button></div>
  </section>;
}
