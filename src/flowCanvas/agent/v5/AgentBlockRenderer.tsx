import React from "react";
import type { ConversationBlock, AgentDecision } from "./agentV5Types";
import { AgentResultGroup } from "./AgentResultGroup";

export type AgentBlockAction = AgentDecision | { type: "select_choice"; blockId: string; optionId: string } | { type: "result"; resultId: string; action: "refine" | "variant" | "place" };

export function AgentBlockRenderer(props: { block: ConversationBlock; onAction: (action: AgentBlockAction) => void }) {
  const { block } = props;
  if (block.type === "paragraph") return <p className="agent-v5-paragraph">{block.text}</p>;
  if (block.type === "heading") {
    const Heading = `h${block.level}` as keyof JSX.IntrinsicElements;
    return <Heading className={`agent-v5-heading agent-v5-heading-${block.level}`}>{block.text}</Heading>;
  }
  if (block.type === "quote") return <blockquote className="agent-v5-quote">{block.text}</blockquote>;
  if (block.type === "bullet_list" || block.type === "numbered_list") {
    const List = block.type === "bullet_list" ? "ul" : "ol";
    return <List className="agent-v5-list">{block.items.map((item) => <li key={item}>{item}</li>)}</List>;
  }
  if (block.type === "divider") return <hr className="agent-v5-divider" />;
  if (block.type === "choice_grid") return <section className="agent-v5-card agent-v5-choice-card"><h3>{block.title ?? "请选择一个方向"}</h3><div className="agent-v5-choice-grid">{block.options.map((option) => <button aria-label={option.label} className="agent-v5-choice" key={option.id} onClick={() => props.onAction({ type: "select_choice", blockId: block.id ?? "choice", optionId: option.id })} type="button"><strong>{option.label}</strong>{option.description ? <small>{option.description}</small> : null}</button>)}</div></section>;
  if (block.type === "comparison_table") return <section className="agent-v5-card agent-v5-table-card">{block.title ? <h3>{block.title}</h3> : null}<div className="agent-v5-table-scroll"><table><thead><tr>{block.columns.map((column) => <th key={column}>{column}</th>)}</tr></thead><tbody>{block.rows.map((row, index) => <tr key={`${row[0] ?? "row"}-${index}`}>{row.map((cell, cellIndex) => <td key={`${cell}-${cellIndex}`}>{cell}</td>)}</tr>)}</tbody></table></div></section>;
  if (block.type === "brief_card") return <section className="agent-v5-card agent-v5-brief-card"><div className="agent-v5-card-kicker">Agent 理解</div><h3>{block.title ?? "共创 Brief"}</h3>{block.fields.map((field) => <div className="agent-v5-brief-row" key={field.label}><span>{field.label}</span><strong>{field.value}</strong></div>)}</section>;
  if (block.type === "skill_card" || block.type === "app_card") return <section className="agent-v5-card agent-v5-capability-card"><span className="agent-v5-capability-icon">✦</span><span><strong>{block.capability.name}</strong><small>{block.capability.description}</small></span></section>;
  if (block.type === "confirmation_card") return <section className="agent-v5-card agent-v5-confirmation-card"><div className="agent-v5-card-kicker">需要你的确认</div><h3>{block.title ?? "准备开始"}</h3><p>{block.text}</p>{block.plan.costCredits !== undefined ? <div className="agent-v5-cost">预计消耗：{block.plan.costCredits} 积分</div> : null}<button className="agent-v5-primary" onClick={() => props.onAction({ type: "confirm" })} type="button">{block.title?.includes("设计") ? "确认并开始设计" : "确认并开始"}</button></section>;
  if (block.type === "progress_card") return <section className="agent-v5-card agent-v5-progress-card"><h3>{block.title ?? "正在执行"}</h3><div className="agent-v5-progress-list">{block.steps.map((step) => <div className={`agent-v5-progress-step is-${step.status}`} key={step.id}><span aria-hidden="true" />{step.label}</div>)}</div></section>;
  if (block.type === "result_group") return <AgentResultGroup results={block.results} title={block.title} onAction={(resultId, action) => props.onAction({ type: "result", resultId, action })} />;
  return null;
}
