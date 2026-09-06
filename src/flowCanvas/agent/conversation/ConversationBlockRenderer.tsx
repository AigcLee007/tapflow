import React from "react";
import type { ConversationBlock, AgentOption } from "./ConversationBlockTypes";

export type ConversationBlockAction = { type: "select" | "confirm" | "result"; id?: string; value?: string };

export function ConversationBlockRenderer(props: { blocks: ConversationBlock[]; onAction?: (action: ConversationBlockAction) => void }) {
  return <div data-testid="conversation-blocks" style={{ display: "grid", gap: 10 }}>{props.blocks.map((block, i) => <Block key={`${block.type}-${i}`} block={block} onAction={props.onAction} />)}</div>;
}

function Block({ block, onAction }: { block: ConversationBlock; onAction?: (action: ConversationBlockAction) => void }) {
  const title = "title" in block ? block.title : undefined;
  if (block.type === "paragraph") return <p style={textStyle}>{block.text}</p>;
  if (block.type === "question") return <section style={cardStyle}><strong style={headingStyle}>{block.text}</strong><OptionList options={block.options ?? []} multiple={block.multiple} onAction={onAction} /></section>;
  if (block.type === "choices") return <section style={cardStyle}>{title && <strong style={headingStyle}>{title}</strong>}<OptionList options={block.options} multiple={block.multiple} onAction={onAction} /></section>;
  if (block.type === "comparison") return <section style={cardStyle}>{title && <strong style={headingStyle}>{title}</strong>}<div style={{ overflowX: "auto" }}><table style={tableStyle}><thead><tr>{block.columns.map((c) => <th key={c} style={cellStyle}>{c}</th>)}</tr></thead><tbody>{block.rows.map((row) => <tr key={row.label}><th style={cellStyle}>{row.label}</th>{row.values.map((v, i) => <td key={`${row.label}-${i}`} style={cellStyle}>{v}</td>)}</tr>)}</tbody></table></div></section>;
  if (block.type === "brief") return <section style={cardStyle}><strong style={headingStyle}>{title ?? "设计 Brief"}</strong>{block.fields.map((field) => <div key={field.label} style={fieldStyle}><span>{field.label}</span><b>{field.value}</b></div>)}</section>;
  if (block.type === "capability") return <section style={cardStyle}><strong style={headingStyle}>{title ?? "推荐能力"}</strong>{block.capabilities.map((capability) => <div key={capability.id} style={fieldStyle}><span>✨ {capability.name}</span><small>{capability.status ?? "available"}</small></div>)}</section>;
  if (block.type === "confirmation") return <section style={{ ...cardStyle, borderColor: "rgba(251,191,36,.45)" }}><strong style={headingStyle}>{title ?? "确认后继续"}</strong><p style={textStyle}>{block.text}</p>{block.costCredits !== undefined && <small style={{ color: "#fbbf24" }}>预计消耗 {block.costCredits} credits</small>}<button style={buttonStyle} onClick={() => onAction?.({ type: "confirm" })}>确认执行</button></section>;
  if (block.type === "progress") return <section style={cardStyle}><strong style={headingStyle}>{title ?? "执行进度"}</strong>{block.steps.map((step) => <div key={step.id} style={fieldStyle}><span>{step.status === "completed" ? "✓" : step.status === "failed" ? "!" : step.status === "running" ? "●" : "○"} {step.label}</span><small>{step.status}</small></div>)}</section>;
  return <section style={cardStyle}><strong style={headingStyle}>{title ?? "生成结果"}</strong><div style={{ display: "grid", gap: 6 }}>{block.results.map((result) => <button key={result.id} style={buttonStyle} onClick={() => onAction?.({ type: "result", id: result.id })}>{result.label}<small>{result.status ?? "ready"}</small></button>)}</div></section>;
}

function OptionList({ options, multiple, onAction }: { options: AgentOption[]; multiple?: boolean; onAction?: (action: ConversationBlockAction) => void }) {
  return <div style={{ display: "grid", gap: 6, gridTemplateColumns: options.length > 2 ? "1fr 1fr" : "1fr" }}>{options.map((option) => <button key={option.id} style={buttonStyle} onClick={() => onAction?.({ type: "select", id: option.id, value: multiple ? "multiple" : "single" })}><span>{option.label}</span>{option.description && <small>{option.description}</small>}</button>)}</div>;
}

const cardStyle: React.CSSProperties = { background: "rgba(255,255,255,.045)", border: "1px solid rgba(255,255,255,.1)", borderRadius: 14, display: "grid", gap: 9, padding: 12 };
const textStyle: React.CSSProperties = { color: "rgba(226,232,240,.82)", fontSize: 13, lineHeight: 1.55, margin: 0, whiteSpace: "pre-wrap" };
const headingStyle: React.CSSProperties = { color: "#f8fafc", fontSize: 14, fontWeight: 750, lineHeight: 1.25 };
const fieldStyle: React.CSSProperties = { alignItems: "center", display: "flex", justifyContent: "space-between", gap: 10, color: "rgba(226,232,240,.78)", fontSize: 12 };
const buttonStyle: React.CSSProperties = { alignItems: "center", background: "rgba(96,165,250,.12)", border: "1px solid rgba(147,197,253,.28)", borderRadius: 10, color: "#e0f2fe", cursor: "pointer", display: "flex", justifyContent: "space-between", gap: 8, minHeight: 38, padding: "7px 9px", textAlign: "left" };
const tableStyle: React.CSSProperties = { borderCollapse: "collapse", color: "rgba(226,232,240,.78)", fontSize: 11, minWidth: 360, width: "100%" };
const cellStyle: React.CSSProperties = { borderBottom: "1px solid rgba(255,255,255,.08)", padding: "7px 6px", textAlign: "left", verticalAlign: "top" };
