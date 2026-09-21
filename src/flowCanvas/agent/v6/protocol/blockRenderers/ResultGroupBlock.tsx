import { useEffect, useState } from "react";

import { getAssetVariantUrl } from "../../../../../services/v2AssetsApi";
import type { AgentBlockAction } from "../BlockRenderer";
import type { ResultRef } from "../conversationTypes";

type ResultGroup = { title?: string; results: ResultRef[]; locked?: boolean };

function ResultPreview({ result, expanded }: { result: ResultRef; expanded: boolean }) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewFailed, setPreviewFailed] = useState(false);
  const kind = result.kind ?? (result.assetId ? "image" : "text");

  useEffect(() => {
    if (!result.assetId || kind === "text") {
      setPreviewUrl(null);
      setPreviewFailed(false);
      return;
    }
    let disposed = false;
    setPreviewFailed(false);
    void getAssetVariantUrl(result.assetId, kind === "image" ? "thumb" : undefined)
      .then(({ url }) => { if (!disposed) setPreviewUrl(url); })
      .catch(() => { if (!disposed) setPreviewFailed(true); });
    return () => { disposed = true; };
  }, [kind, result.assetId]);

  if (kind === "text") return <pre className="agent-v6-result-text" data-testid={`agent-result-text-${result.id}`}>{result.contentText ?? "文本结果暂不可用。"}</pre>;
  if (!previewUrl || previewFailed) return <div className="agent-v6-result-preview-placeholder" role="status">{previewFailed ? "预览暂不可用" : "正在加载预览…"}</div>;
  if (kind === "video") return <video aria-label={result.label} className="agent-v6-result-media" controls={expanded} muted={!expanded} preload="metadata" src={previewUrl}>你的浏览器不支持视频预览。</video>;
  return <img alt={result.label} className="agent-v6-result-media" onError={() => setPreviewFailed(true)} src={previewUrl} />;
}

export function ResultGroupBlock({ block, onAction }: { block: ResultGroup; onAction: (action: AgentBlockAction) => void }) {
  const locked = block.locked === true;
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set(block.results.filter((result) => result.status === "selected").map((result) => result.id)));
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set());
  const choose = (result: ResultRef) => {
    setSelectedIds((current) => new Set(current).add(result.id));
    onAction({ type: "select_result", resultId: result.id });
  };
  const preview = (result: ResultRef) => {
    setExpandedIds((current) => {
      const next = new Set(current);
      if (next.has(result.id)) next.delete(result.id); else next.add(result.id);
      return next;
    });
    onAction({ type: "preview_result", resultId: result.id });
  };

  return <section className={`agent-v6-results ${locked ? "is-locked" : ""}`} aria-label={block.title ?? "结果"} aria-disabled={locked} data-state={locked ? "locked" : "interactive"}>
    <h3>{block.title ?? "结果"}</h3>
    <div className="agent-v6-result-grid">
      {block.results.map((result) => {
        const kind = result.kind ?? (result.assetId ? "image" : "text");
        const selected = selectedIds.has(result.id) || result.status === "selected";
        const placed = Boolean(result.placedNodeId);
        return <article className={selected ? "is-selected" : ""} data-status={result.status ?? "ready"} key={result.id}>
          <div className="agent-v6-result-meta"><span>{kind === "text" ? "文本" : kind === "video" ? "视频" : "图片"}</span>{placed ? <span>已放入画布</span> : null}</div>
          <h4>{result.label}</h4>
          <ResultPreview expanded={expandedIds.has(result.id)} result={result} />
          <div className="agent-v6-actions">
            <button aria-label={`选择${result.label}`} aria-pressed={selected} disabled={locked} onClick={() => { if (!locked) choose(result); }} type="button">选择</button>
            <button aria-label={`预览${result.label}`} disabled={locked} onClick={() => { if (!locked) preview(result); }} type="button">预览</button>
            <button aria-label={`继续编辑${result.label}`} disabled={locked} onClick={() => { if (!locked) onAction({ type: "refine_result", resultId: result.id }); }} type="button">继续编辑</button>
            <button aria-label={`生成${result.label}的变体`} disabled={locked} onClick={() => { if (!locked) onAction({ type: "variant_result", resultId: result.id }); }} type="button">变体</button>
            <button aria-label={`设置${result.label}为参考`} disabled={locked} onClick={() => { if (!locked) onAction({ type: "set_reference", resultId: result.id }); }} type="button">设为参考</button>
            <button aria-label={`放入画布${result.label}`} disabled={locked || placed} onClick={() => { if (!locked && !placed) onAction({ type: "place_result", resultId: result.id }); }} type="button">{placed ? "已放入画布" : "放入画布"}</button>
          </div>
        </article>;
      })}
    </div>
  </section>;
}
