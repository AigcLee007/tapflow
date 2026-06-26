import React from "react";

import type { CanvasAgentActivityItem } from "./CanvasAgentActivityTimeline";

function sanitizeLogText(value: string) {
  return value
    .replace(/route[_ ]?key/gi, "已隐藏字段")
    .replace(/provider[_ ]?key/gi, "已隐藏字段")
    .replace(/baseurl/gi, "已隐藏字段")
    .replace(/upstream[_ ]?model/gi, "已隐藏字段")
    .replace(/adapter[_ ]?kind/gi, "已隐藏字段");
}

export function CanvasAgentLogView(props: {
  activityItems: CanvasAgentActivityItem[];
  error: string | null;
}) {
  return (
    <div style={{ display: "grid", gap: 12, height: "100%", overflowY: "auto", padding: 16 }}>
      <section
        style={{
          background: "rgba(255,255,255,0.03)",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 18,
          display: "grid",
          gap: 10,
          padding: 14,
        }}
      >
        <div style={{ color: "#f8fafc", fontSize: 14, fontWeight: 800 }}>运行日志</div>
        <div style={{ color: "rgba(226,232,240,0.72)", fontSize: 12, lineHeight: 1.6 }}>
          这里只保留对排查有帮助的安全信息，不展示供应商、线路密钥或上游模型细节。
        </div>
      </section>

      {props.error ? (
        <section
          style={{
            background: "rgba(127,29,29,0.32)",
            border: "1px solid rgba(248,113,113,0.26)",
            borderRadius: 16,
            color: "#fecaca",
            display: "grid",
            gap: 6,
            padding: 12,
          }}
        >
          <div style={{ fontSize: 12, fontWeight: 800 }}>最近一次错误</div>
          <div style={{ fontSize: 12, lineHeight: 1.6 }}>{sanitizeLogText(props.error)}</div>
        </section>
      ) : null}

      <div style={{ display: "grid", gap: 8 }}>
        {props.activityItems.map((item) => (
          <div
            key={item.id}
            style={{
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 14,
              display: "grid",
              gap: 4,
              padding: 12,
            }}
          >
            <div style={{ color: "#f8fafc", fontSize: 12, fontWeight: 700 }}>{sanitizeLogText(item.label)}</div>
            {item.detail ? (
              <div style={{ color: "rgba(226,232,240,0.68)", fontSize: 12, lineHeight: 1.5 }}>
                {sanitizeLogText(item.detail)}
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}
