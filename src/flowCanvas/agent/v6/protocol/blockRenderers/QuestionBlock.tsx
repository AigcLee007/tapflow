import type { AgentBlockAction } from "../BlockRenderer";
export function QuestionBlock({ block, onAction }: { block: { id: string; title?: string; prompt: string; options: string[] }; onAction: (action: AgentBlockAction) => void }) {
  return <section className="agent-v6-question" aria-label={block.title ?? block.prompt}>
    {block.title ? <h3>{block.title}</h3> : null}
    <p>{block.prompt}</p>
    <div className="agent-v6-question-options" role="group" aria-label={block.title ?? block.prompt}>
      {block.options.map((option) => <button key={option} type="button" onClick={() => onAction({ type: "answer_question", blockId: block.id, value: option })}>{option}</button>)}
    </div>
  </section>;
}
