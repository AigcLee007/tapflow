import type { AgentBlockAction } from "../BlockRenderer";
export function QuestionBlock({ block, onAction }: { block: { id: string; title?: string; prompt: string; options: string[]; locked?: boolean }; onAction: (action: AgentBlockAction) => void }) {
  const locked = block.locked === true;
  return <section className={`agent-v6-question ${locked ? "is-locked" : ""}`} aria-label={block.title ?? block.prompt} aria-disabled={locked} data-state={locked ? "locked" : "interactive"}>
    {block.title ? <h3>{block.title}</h3> : null}
    <p>{block.prompt}</p>
    <div className="agent-v6-question-options" role="group" aria-label={block.title ?? block.prompt}>
      {block.options.map((option) => <button key={option} type="button" disabled={locked} aria-disabled={locked} onClick={() => { if (!locked) onAction({ type: "answer_question", blockId: block.id, value: option }); }}>{option}</button>)}
    </div>
  </section>;
}
