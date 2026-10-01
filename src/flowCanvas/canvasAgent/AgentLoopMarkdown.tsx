import React from "react";

/**
 * Minimal Markdown for agent replies: headings, bold, inline code, lists,
 * tables, paragraphs. Output is React elements only (no innerHTML), so model
 * text can never inject markup. Links render as plain text on purpose.
 */

function inline(text: string, keyPrefix: string): React.ReactNode[] {
  return text.split(/(\*\*[^*\n]+\*\*|`[^`\n]+`)/g).filter(Boolean).map((part, index) => {
    const key = `${keyPrefix}-${index}`;
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) return <strong key={key}>{part.slice(2, -2)}</strong>;
    if (part.startsWith("`") && part.endsWith("`") && part.length > 2) return <code key={key}>{part.slice(1, -1)}</code>;
    return <React.Fragment key={key}>{part}</React.Fragment>;
  });
}

const splitRow = (line: string) => line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((cell) => cell.trim());
const isTableSeparator = (line: string | undefined) => !!line && /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(line);
const UNORDERED = /^\s*[-*•]\s+/;
const ORDERED = /^\s*\d+[.)]\s+/;

export function AgentLoopMarkdown({ text }: { text: string }) {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const blocks: React.ReactNode[] = [];
  let paragraph: string[] = [];
  const flush = () => {
    if (!paragraph.length) return;
    const key = `p-${blocks.length}`;
    blocks.push(<p key={key}>{paragraph.flatMap((line, i) => (i ? [<br key={`${key}-br-${i}`} />, ...inline(line, `${key}-${i}`)] : inline(line, `${key}-${i}`)))}</p>);
    paragraph = [];
  };

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]!;
    if (!line.trim()) { flush(); continue; }
    const heading = /^(#{1,4})\s+(.*)$/.exec(line);
    if (heading) {
      flush();
      const level = Math.min(heading[1]!.length + 2, 6);
      blocks.push(React.createElement(`h${level}`, { key: `h-${i}` }, inline(heading[2]!, `h-${i}`)));
      continue;
    }
    if (line.trim().startsWith("|") && isTableSeparator(lines[i + 1])) {
      flush();
      const head = splitRow(line);
      const rows: string[][] = [];
      i += 2;
      while (i < lines.length && lines[i]!.trim().startsWith("|")) { rows.push(splitRow(lines[i]!)); i += 1; }
      i -= 1;
      blocks.push(
        <div className="agent-loop-table-wrap" key={`t-${i}`}>
          <table>
            <thead><tr>{head.map((cell, c) => <th key={c}>{inline(cell, `th-${i}-${c}`)}</th>)}</tr></thead>
            <tbody>{rows.map((row, r) => <tr key={r}>{head.map((_cell, c) => <td key={c}>{inline(row[c] ?? "", `td-${i}-${r}-${c}`)}</td>)}</tr>)}</tbody>
          </table>
        </div>,
      );
      continue;
    }
    if (UNORDERED.test(line) || ORDERED.test(line)) {
      flush();
      const ordered = ORDERED.test(line);
      const pattern = ordered ? ORDERED : UNORDERED;
      const entries: string[] = [];
      while (i < lines.length && pattern.test(lines[i]!)) { entries.push(lines[i]!.replace(pattern, "")); i += 1; }
      i -= 1;
      const children = entries.map((entry, e) => <li key={e}>{inline(entry, `li-${i}-${e}`)}</li>);
      blocks.push(ordered ? <ol key={`l-${i}`}>{children}</ol> : <ul key={`l-${i}`}>{children}</ul>);
      continue;
    }
    paragraph.push(line);
  }
  flush();
  return <div className="agent-loop-markdown">{blocks}</div>;
}
