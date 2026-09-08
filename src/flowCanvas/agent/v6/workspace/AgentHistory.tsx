import { X } from "lucide-react";
import { useEffect, type RefObject } from "react";
import { useDismissibleLayer } from "../../../../components/menu/useDismissibleLayer";

export type AgentHistoryItem = { id: string; title: string; summary?: string; date: string; selected?: boolean };

export function dateLabel(date: string, now = new Date()) {
  const parsed = new Date(`${date}T00:00:00`);
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const delta = Math.round((today.getTime() - parsed.getTime()) / 86400000);
  if (delta === 0) return "今天";
  if (delta === 1) return "昨天";
  return `${parsed.getFullYear()}年${parsed.getMonth() + 1}月${parsed.getDate()}日`;
}

export function AgentHistory({ items, loading = false, now, onSelect, onClose, triggerRef }: { items: readonly AgentHistoryItem[]; loading?: boolean; now?: Date; onSelect: (id: string) => void; onClose: () => void; triggerRef?: RefObject<HTMLButtonElement> }) {
  const layer = useDismissibleLayer("agent-v6-history", { onDismiss: onClose });

  useEffect(() => {
    if (triggerRef) {
      layer.triggerRef.current = triggerRef.current;
    }
    layer.openLayer();
    return () => layer.closeLayer();
  }, [layer.closeLayer, layer.openLayer, layer.triggerRef, triggerRef]);

  const groups = items.reduce<Record<string, AgentHistoryItem[]>>((result, item) => {
    (result[item.date] ??= []).push(item);
    return result;
  }, {});
  return (
    <aside ref={layer.ref as RefObject<HTMLElement>} aria-label="对话历史" className="agent-v6-history">
      <div className="agent-v6-history-heading"><strong>对话历史</strong><button aria-label="关闭历史" type="button" onClick={onClose}><X size={16} /></button></div>
      {loading ? <div className="agent-v6-history-state">正在加载历史...</div> : items.length === 0 ? <div className="agent-v6-history-state">暂无对话历史</div> : (
        <div className="agent-v6-history-list">
          {Object.entries(groups).map(([date, entries]) => <section key={date}><h2>{dateLabel(date, now)}</h2>{entries.map((item) => <button aria-current={item.selected ? "true" : undefined} aria-label={`${item.title}${item.summary ? `，${item.summary}` : ""}`} className={`agent-v6-history-item ${item.selected ? "is-selected" : ""}`} key={item.id} type="button" onClick={() => { onSelect(item.id); layer.dismissLayer(); }}><strong>{item.title}</strong>{item.summary ? <span>{item.summary}</span> : null}</button>)}</section>)}
        </div>
      )}
    </aside>
  );
}
