import { useState } from "react";
import type { AgentBlockAction } from "../BlockRenderer";
export function QuestionBlock({ block, onAction }: { block: { id: string; title?: string; prompt: string; options: string[]; locked?: boolean }; onAction: (action: AgentBlockAction) => void }) {
  const locked = block.locked === true;
  const [answer, setAnswer] = useState("");
  const label = block.title ?? block.prompt;
  return <section className={`agent-v6-question ${locked ? "is-locked" : ""}`} aria-label={block.title ?? block.prompt} aria-disabled={locked} data-state={locked ? "locked" : "interactive"}>
    {block.title ? <h3>{block.title}</h3> : null}
    <p>{block.prompt}</p>
    {block.options.length ? <div className="agent-v6-question-options" role="group" aria-label={label}>
      {block.options.map((option) => <button key={option} type="button" disabled={locked} aria-disabled={locked} onClick={() => { if (!locked) onAction({ type: "answer_question", blockId: block.id, value: option }); }}>{option}</button>)}
    </div> : <form className="agent-v6-question-options" onSubmit={(event) => { event.preventDefault(); if (!locked && answer.trim()) onAction({ type: "answer_question", blockId: block.id, value: answer.trim() }); }}>
      <input aria-label={`${label} 回答`} disabled={locked} value={answer} onChange={(event) => setAnswer(event.target.value)} />
      <button type="submit" disabled={locked || !answer.trim()}>提交</button>
    </form>}
  </section>;
}
