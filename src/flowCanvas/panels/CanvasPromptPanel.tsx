import React, { useEffect, useState } from "react";
import { Copy, Plus, Search } from "lucide-react";

import { listPrompts, type PromptEntry } from "../../services/v2PromptsApi";
import { copyPromptText } from "../../prompts/promptUi";
import { CanvasDockEmptyState } from "./CanvasDockDrawer";

export function CanvasPromptPanel({ onReference }: { onReference: (prompt: PromptEntry) => void }) {
  const [items, setItems] = useState<PromptEntry[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setLoading(true);
      setError(null);
      void listPrompts({ limit: 20, query: query || undefined })
        .then((result) => setItems(result.items))
        .catch((reason) => setError(reason instanceof Error ? reason.message : "提示词加载失败"))
        .finally(() => setLoading(false));
    }, 180);
    return () => window.clearTimeout(timer);
  }, [query]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <label style={{ display: "flex", alignItems: "center", gap: 8, height: 36, padding: "0 10px", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, background: "rgba(0,0,0,0.16)", color: "#a1a1aa" }}>
        <Search size={14} />
        <input aria-label="搜索提示词" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索提示词" style={{ minWidth: 0, flex: 1, border: 0, outline: 0, background: "transparent", color: "#f8fafc", fontSize: 12 }} />
      </label>
      {loading ? <CanvasDockEmptyState message="提示词加载中..." /> : null}
      {error ? <CanvasDockEmptyState message={error} /> : null}
      {!loading && !error && items.length === 0 ? <CanvasDockEmptyState message="没有匹配的提示词。" /> : null}
      {items.map((prompt) => (
        <article key={prompt.id} style={{ padding: 10, border: "1px solid rgba(255,255,255,0.09)", borderRadius: 10, background: "rgba(255,255,255,0.035)" }}>
          <div style={{ color: "#f8fafc", fontSize: 12, fontWeight: 700, lineHeight: 1.3 }}>{prompt.title}</div>
          <div style={{ marginTop: 4, color: "#a1a1aa", fontSize: 10 }}>{prompt.category}</div>
          <div style={{ marginTop: 8, display: "flex", gap: 6 }}>
            <button aria-label={`复制 ${prompt.title}`} onClick={() => void copyPromptText(prompt)} type="button" style={iconButtonStyle} title="复制提示词"><Copy size={14} /></button>
            <button aria-label={`引用 ${prompt.title}`} onClick={() => onReference(prompt)} type="button" style={{ ...iconButtonStyle, flex: 1, gap: 5, color: "#06101a", background: "#67e8f9" }} title="引用到画布"><Plus size={14} />引用</button>
          </div>
        </article>
      ))}
    </div>
  );
}

const iconButtonStyle: React.CSSProperties = {
  height: 30,
  minWidth: 30,
  border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: 8,
  padding: "0 8px",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  cursor: "pointer",
  color: "#e4e4e7",
  background: "rgba(255,255,255,0.06)",
  fontSize: 11,
  fontWeight: 700,
};
