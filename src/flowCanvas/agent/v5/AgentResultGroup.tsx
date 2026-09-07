import React from "react";
import { getAssetVariantUrl } from "../../../services/v2AssetsApi";
import type { ResultRef } from "./agentV5Types";

function ResultTile(props: { result: ResultRef; onAction: (action: "refine" | "variant" | "place") => void }) {
  const [previewUrl, setPreviewUrl] = React.useState<string | null>(null);
  React.useEffect(() => {
    if (!props.result.assetId) return;
    let disposed = false;
    void getAssetVariantUrl(props.result.assetId, "thumb").then((response) => {
      if (!disposed) setPreviewUrl(response.url);
    }).catch(() => undefined);
    return () => { disposed = true; };
  }, [props.result.assetId]);
  return <article><div className="agent-v5-result-placeholder">{previewUrl ? <img alt={props.result.label} src={previewUrl} /> : props.result.label}</div><div className="agent-v5-result-actions"><button aria-label={`继续编辑 ${props.result.label}`} onClick={() => props.onAction("refine")} type="button">继续编辑</button><button aria-label={`生成变体 ${props.result.label}`} onClick={() => props.onAction("variant")} type="button">生成变体</button><button aria-label={`放入画布 ${props.result.label}`} onClick={() => props.onAction("place")} type="button">放入画布</button></div></article>;
}

export function AgentResultGroup(props: { results: ResultRef[]; title?: string; onAction: (resultId: string, action: "refine" | "variant" | "place") => void }) {
  return <section className="agent-v5-card agent-v5-result-card"><h3>{props.title ?? "结果"}</h3><div className="agent-v5-result-grid">{props.results.map((result) => <ResultTile key={result.id} result={result} onAction={(action) => props.onAction(result.id, action)} />)}</div></section>;
}
