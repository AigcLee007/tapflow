import { useMemo, useState } from "react";
import type { AgentDecisionType, AgentQuestionSetBlock, ConversationBlock } from "./agentProtocol";

type PendingDecisionView = { blockId: string; type: AgentDecisionType; allowedTypes?: AgentDecisionType[]; decisionId?: string; graphRevision?: number };
type DecisionHandler = (input: { blockId: string; type: AgentDecisionType; payload: Record<string, unknown>; graphRevision?: number; decisionId?: string }) => Promise<unknown> | unknown;

export function ConversationRenderer(props: { blocks: readonly ConversationBlock[]; pendingDecision?: PendingDecisionView | null; submitting?: boolean; onDecision?: DecisionHandler }) {
  return <div className="agent-runtime-conversation" data-testid="agent-runtime-conversation">{props.blocks.map((block, index) => <Block key={`${block.type}-${block.id ?? index}`} block={block} pendingDecision={props.pendingDecision} submitting={props.submitting} onDecision={props.onDecision} />)}</div>;
}
function isAllowed(pending: PendingDecisionView | null | undefined, type: AgentDecisionType, blockId: string) {
  return Boolean(pending && pending.blockId === blockId && (pending.allowedTypes ? pending.allowedTypes.includes(type) : pending.type === type));
}

function Block(props: { block: ConversationBlock; pendingDecision?: PendingDecisionView | null; submitting?: boolean; onDecision?: DecisionHandler }) {
  const block = props.block;
  if (block.type === "understanding") return <article className="agent-runtime-block agent-runtime-understanding"><span className="agent-runtime-eyebrow">理解</span><p>{block.text}</p></article>;
  if (block.type === "question_set") return <QuestionSet {...props} block={block} />;
  if (block.type === "brief") return <article className="agent-runtime-block"><span className="agent-runtime-eyebrow">Brief</span>{block.fields.map((field) => <p key={field.key ?? field.label}><strong>{field.label}</strong>：{field.value}</p>)}</article>;
  if (block.type === "plan") return <article className="agent-runtime-block"><span className="agent-runtime-eyebrow">计划</span><p>{block.summary ?? "已整理执行计划"}</p>{block.deliverables.length ? <ul>{block.deliverables.map((item) => <li key={item.id}>{item.label}</li>)}</ul> : null}</article>;
  if (block.type === "confirmation") return <Confirmation {...props} block={block} />;
  if (block.type === "progress") return <article className="agent-runtime-block"><span className="agent-runtime-eyebrow">进度</span>{block.steps.map((step) => <p key={step.id}>{step.status === "completed" ? "✓" : step.status === "failed" ? "!" : "•"} {step.label}</p>)}</article>;
  if (block.type === "result_group") return <article className="agent-runtime-block"><span className="agent-runtime-eyebrow">结果</span>{block.results.map((result) => <p key={result.id}>{result.label}</p>)}</article>;
  return <Recovery {...props} block={block} />;
}

function Confirmation(props: { block: Extract<ConversationBlock, { type: "confirmation" }>; pendingDecision?: PendingDecisionView | null; submitting?: boolean; onDecision?: DecisionHandler }) {
  const [clicked, setClicked] = useState<string | null>(null);
  const blockId = props.block.id ?? "confirmation";
  const invoke = async (type: AgentDecisionType) => {
    if (clicked || props.submitting || !isAllowed(props.pendingDecision, type, blockId)) return;
    setClicked(type);
    try { await props.onDecision?.({ blockId, type, payload: {}, graphRevision: props.pendingDecision?.graphRevision, decisionId: props.pendingDecision?.decisionId }); } catch { setClicked(null); }
  };
  return <article className="agent-runtime-block" data-testid="agent-runtime-confirmation"><span className="agent-runtime-eyebrow">确认</span><p>{props.block.text}</p><div className="agent-runtime-block-actions">
    {isAllowed(props.pendingDecision, "approve_plan", blockId) ? <button disabled={Boolean(clicked) || props.submitting} onClick={() => void invoke("approve_plan")} type="button">{props.block.confirmLabel ?? "确认执行"}</button> : null}
    {isAllowed(props.pendingDecision, "revise_plan", blockId) ? <button disabled={Boolean(clicked) || props.submitting} onClick={() => void invoke("revise_plan")} type="button">{props.block.reviseLabel ?? "修改计划"}</button> : null}
  </div></article>;
}

function Recovery(props: { block: Extract<ConversationBlock, { type: "error_recovery" }>; pendingDecision?: PendingDecisionView | null; submitting?: boolean; onDecision?: DecisionHandler }) {
  const [clicked, setClicked] = useState<string | null>(null);
  const blockId = props.block.id ?? "error_recovery";
  const actionType = (action: Extract<typeof props.block.actions[number], { action: string }>): AgentDecisionType => action.action === "retry" ? "retry_execution" : action.action === "revise" ? "revise_plan" : "result_action";
  const invoke = async (action: typeof props.block.actions[number]) => {
    const type = actionType(action);
    if (clicked || props.submitting || !isAllowed(props.pendingDecision, type, blockId)) return;
    setClicked(action.id);
    try { await props.onDecision?.({ blockId, type, payload: { actionId: action.id }, graphRevision: props.pendingDecision?.graphRevision, decisionId: props.pendingDecision?.decisionId }); } catch { setClicked(null); }
  };
  return <article className="agent-runtime-block agent-runtime-error"><span className="agent-runtime-eyebrow">需要处理</span><p>{props.block.message}</p><div className="agent-runtime-block-actions">{props.block.actions.map((action) => <button key={action.id} disabled={Boolean(clicked) || props.submitting || !isAllowed(props.pendingDecision, actionType(action), blockId)} onClick={() => void invoke(action)} type="button">{action.label}</button>)}</div></article>;
}

function QuestionSet(props: { block: AgentQuestionSetBlock; pendingDecision?: PendingDecisionView | null; submitting?: boolean; onDecision?: DecisionHandler }) {
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [submitted, setSubmitted] = useState(false);
  const blockId = props.block.id ?? "question_set";
  const active = isAllowed(props.pendingDecision, "answer_question", blockId);
  const missing = useMemo(() => props.block.questions.some((question) => question.required && (answers[question.id] === undefined || answers[question.id] === "" || (Array.isArray(answers[question.id]) && answers[question.id].length === 0))), [answers, props.block.questions]);
  const disabled = submitted || props.submitting || !active;
  return <article className="agent-runtime-block agent-runtime-question-set"><span className="agent-runtime-eyebrow">请补充信息</span>{props.block.questions.map((question) => {
    const value = answers[question.id];
    return <fieldset disabled={disabled} key={question.id}><legend>{question.prompt}{question.required ? " *" : ""}</legend>{question.kind === "text" ? <textarea aria-label={question.prompt} maxLength={4000} value={typeof value === "string" ? value : ""} onChange={(event) => setAnswers((current) => ({ ...current, [question.id]: event.target.value }))} /> : question.options?.map((option) => question.kind === "single" ? <label key={option.id}><input aria-label={option.label} checked={value === option.id} name={question.id} onChange={() => setAnswers((current) => ({ ...current, [question.id]: option.id }))} type="radio" />{option.label}</label> : <label key={option.id}><input aria-label={option.label} checked={Array.isArray(value) && value.includes(option.id)} onChange={(event) => setAnswers((current) => ({ ...current, [question.id]: event.target.checked ? [...(Array.isArray(current[question.id]) ? current[question.id] : []), option.id] : (Array.isArray(current[question.id]) ? current[question.id] : []).filter((item) => item !== option.id) }))} type="checkbox" />{option.label}</label>)}</fieldset>;
  })}<button disabled={disabled || missing} onClick={async () => { setSubmitted(true); try { await props.onDecision?.({ blockId, type: "answer_question", payload: { answers }, graphRevision: props.pendingDecision?.graphRevision, decisionId: props.pendingDecision?.decisionId }); } catch { setSubmitted(false); } }} type="button">回答当前问题</button></article>;
}
