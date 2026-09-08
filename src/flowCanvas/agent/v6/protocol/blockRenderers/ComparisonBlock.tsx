export function ComparisonBlock({ block }: { block: { title?: string; columns: string[]; rows: string[][] } }) {
  return <section className="agent-v6-comparison" aria-label={block.title ?? "比较"}>
    {block.title ? <h3>{block.title}</h3> : null}
    <div className="agent-v6-table-scroll"><table aria-label={block.title ?? "比较表"}><thead><tr>{block.columns.map((column) => <th key={column} scope="col">{column}</th>)}</tr></thead><tbody>{block.rows.map((row, rowIndex) => <tr key={rowIndex}>{block.columns.map((_, cellIndex) => <td key={cellIndex}>{row[cellIndex] ?? ""}</td>)}</tr>)}</tbody></table></div>
  </section>;
}
