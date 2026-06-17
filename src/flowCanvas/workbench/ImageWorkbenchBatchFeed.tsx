import React from "react";

import type { FlowImageResultItem } from "../types";
import type { ImageWorkbenchBatch } from "./imageWorkbenchTypes";

type ImageWorkbenchBatchFeedProps = {
  batches: ImageWorkbenchBatch[];
  onSelectResult?: (item: FlowImageResultItem) => void;
};

function statusLabel(status: ImageWorkbenchBatch["status"]): string {
  if (status === "success") return "已完成";
  if (status === "error" || status === "failed") return "失败";
  if (status === "running" || status === "waiting_provider") return "生成中";
  if (status === "pending" || status === "queued" || status === "runnable") return "排队中";
  return "待生成";
}

export function ImageWorkbenchBatchFeed({
  batches,
  onSelectResult,
}: ImageWorkbenchBatchFeedProps) {
  return (
    <section
      data-testid="image-workbench-batch-feed"
      style={{
        minHeight: 0,
        overflowY: "auto",
        padding: 22,
      }}
    >
      {batches.length === 0 ? (
        <div style={{ color: "#94a3b8", display: "grid", minHeight: 360, placeItems: "center" }}>
          Start by describing an image.
        </div>
      ) : (
        <div style={{ display: "grid", gap: 16 }}>
          {batches.map((batch) => (
            <article
              key={batch.batchId}
              style={{
                background: "rgba(255,255,255,0.045)",
                border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: 18,
                padding: 14,
              }}
            >
              <div style={{ alignItems: "flex-start", display: "flex", gap: 12, justifyContent: "space-between" }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ color: "#f8fafc", fontSize: 14, fontWeight: 800 }}>{batch.prompt || "Untitled prompt"}</div>
                  <div style={{ color: "#94a3b8", fontSize: 12, marginTop: 6 }}>
                    {batch.modelId} · {batch.routeKey} · {batch.aspectRatio} · {batch.size} · {batch.batchCount} 张
                  </div>
                </div>
                <div style={{ color: "#cbd5e1", fontSize: 12, fontWeight: 700, whiteSpace: "nowrap" }}>
                  {statusLabel(batch.status)}
                </div>
              </div>

              {batch.results.length > 0 ? (
                <div
                  style={{
                    display: "grid",
                    gap: 10,
                    gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
                    marginTop: 12,
                  }}
                >
                  {batch.results.map((result) => (
                    <button
                      key={result.id}
                      onClick={() => onSelectResult?.(result)}
                      style={{ background: "transparent", border: "none", padding: 0 }}
                      type="button"
                    >
                      <img alt="" src={result.url} style={{ borderRadius: 14, display: "block", width: "100%" }} />
                    </button>
                  ))}
                </div>
              ) : (
                <div style={{ color: "#94a3b8", marginTop: 12 }}>{statusLabel(batch.status)}</div>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
