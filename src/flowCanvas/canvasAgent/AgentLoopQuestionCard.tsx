import { Check } from "lucide-react";
import { useState } from "react";

import type { TranscriptItem } from "./canvasAgentTranscript";
import type { CanvasAgentAnswersPayload } from "./canvasAgentTypes";

type QuestionsItem = Extract<TranscriptItem, { kind: "questions" }>;

const STATE_NOTE: Partial<Record<QuestionsItem["state"], string>> = { cancelled: "已取消", skipped: "已跳过" };

/** Collapsed "question → answer" summary shown once the card is no longer open. */
function QuestionSummary({ item }: { item: QuestionsItem }) {
  const note = STATE_NOTE[item.state];
  return (
    <section aria-label="已确认的问题" className={`agent-loop-card agent-loop-qsummary ${note ? "is-muted" : ""}`}>
      {item.questions.map((question) => {
        const answer = item.answers?.find((entry) => entry.questionId === question.id);
        const value = answer ? answer.text ?? answer.selected.join("、") : note ?? "未回答";
        return (
          <div className="agent-loop-qsummary-row" key={question.id}>
            {question.tag ? <span className="agent-loop-tag">{question.tag}</span> : null}
            <span className="agent-loop-qsummary-question">{question.prompt}</span>
            <strong className="agent-loop-qsummary-answer">{value}</strong>
          </div>
        );
      })}
    </section>
  );
}

export function AgentLoopQuestionCard({ disabled, item, onSubmit }: { disabled?: boolean; item: QuestionsItem; onSubmit: (payload: CanvasAgentAnswersPayload) => void }) {
  const [index, setIndex] = useState(0);
  // Single-select questions start on the recommended option, as in TapNow.
  const [selected, setSelected] = useState<Record<string, string[]>>(() => Object.fromEntries(item.questions.map((question) => {
    const recommended = question.selection === "single" ? question.options.find((option) => option.recommended) : undefined;
    return [question.id, recommended ? [recommended.id] : []];
  })));
  const [texts, setTexts] = useState<Record<string, string>>({});

  if (item.state !== "open") return <QuestionSummary item={item} />;

  const question = item.questions[index]!;
  const total = item.questions.length;
  const chosen = selected[question.id] ?? [];
  const last = index === total - 1;

  const toggle = (optionId: string) => setSelected((current) => {
    const now = current[question.id] ?? [];
    const next = question.selection === "single" ? [optionId] : now.includes(optionId) ? now.filter((id) => id !== optionId) : [...now, optionId];
    return { ...current, [question.id]: next };
  });

  const submit = () => onSubmit({
    answers: item.questions.flatMap((entry) => {
      const optionIds = selected[entry.id] ?? [];
      const text = texts[entry.id]?.trim();
      return optionIds.length || text ? [{ questionId: entry.id, ...(optionIds.length ? { optionIds } : {}), ...(text ? { text } : {}) }] : [];
    }),
  });

  return (
    <section aria-label="需要你确认" className="agent-loop-card agent-loop-question">
      <header className="agent-loop-question-head">
        {question.tag ? <span className="agent-loop-tag">{question.tag}</span> : null}
        <span className="agent-loop-question-prompt" id={`q-${item.callId}-${question.id}`}>{question.prompt}</span>
        {total > 1 ? <span className="agent-loop-question-count">{index + 1}/{total}</span> : null}
      </header>
      <div aria-labelledby={`q-${item.callId}-${question.id}`} className="agent-loop-options" role="group">
        {question.options.map((option, optionIndex) => {
          const active = chosen.includes(option.id);
          return (
            <button aria-pressed={active} className={`agent-loop-option ${active ? "is-active" : ""}`} disabled={disabled} key={option.id} type="button" onClick={() => toggle(option.id)}>
              <span className="agent-loop-option-index">{optionIndex + 1}</span>
              <span className="agent-loop-option-label">{option.label}{option.recommended ? " (推荐)" : ""}</span>
              {option.description ? <span className="agent-loop-option-desc">{option.description}</span> : null}
              {active ? <Check aria-hidden className="agent-loop-option-check" size={15} /> : null}
            </button>
          );
        })}
        {question.allowFreeText ? (
          <input
            aria-label={`直接回答：${question.prompt}`}
            className="agent-loop-option-input"
            disabled={disabled}
            placeholder="或直接打字回答"
            value={texts[question.id] ?? ""}
            onChange={(event) => setTexts((current) => ({ ...current, [question.id]: event.target.value }))}
          />
        ) : null}
      </div>
      <footer className="agent-loop-card-actions">
        {total > 1 ? <button className="agent-loop-button" disabled={index === 0 || disabled} type="button" onClick={() => setIndex(index - 1)}>上一题</button> : <span />}
        {last
          ? <button className="agent-loop-button is-primary" disabled={disabled} type="button" onClick={submit}>提交</button>
          : <button className="agent-loop-button is-primary" disabled={disabled} type="button" onClick={() => setIndex(index + 1)}>下一题</button>}
      </footer>
    </section>
  );
}
