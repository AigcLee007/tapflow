export function UnderstandingBlock({ block }: { block: { title?: string; text: string } }) {
  return <section className="agent-v6-understanding" aria-label={block.title ?? "理解"}>
    <span className="agent-v6-eyebrow">理解</span>
    {block.title ? <h3>{block.title}</h3> : null}
    <p>{block.text}</p>
  </section>;
}
