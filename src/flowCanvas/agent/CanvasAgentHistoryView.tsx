import React from "react";

import type { AgentSessionView } from "./canvasAgentApi";

export function CanvasAgentHistoryView(props: {
  activeSessionId?: string | null;
  onNewChat: () => void;
  onOpenSession: (sessionId: string) => void;
  sessions: AgentSessionView[];
}) {
  return (
    <div style={{ display: "grid", gap: 12, height: "100%", overflowY: "auto", padding: 16 }}>
      <div style={{ alignItems: "center", display: "flex", justifyContent: "space-between" }}>
        <div>
          <div style={{ color: "#f8fafc", fontSize: 14, fontWeight: 800 }}>对话历史</div>
          <div style={{ color: "rgba(148,163,184,0.9)", fontSize: 12 }}>按当前项目与画布范围管理会话。</div>
        </div>
        <button
          onClick={props.onNewChat}
          style={{
            background: "#f8fafc",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 14,
            color: "#09090f",
            cursor: "pointer",
            fontSize: 12,
            fontWeight: 800,
            minHeight: 34,
            padding: "0 12px",
          }}
          type="button"
        >
          新对话
        </button>
      </div>

      {props.sessions.length === 0 ? (
        <div
          style={{
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 18,
            color: "rgba(148,163,184,0.92)",
            fontSize: 13,
            lineHeight: 1.7,
            padding: 16,
          }}
        >
          当前项目下还没有 Agent 对话历史，可以直接开启新的生产对话。
        </div>
      ) : (
        props.sessions.map((session) => {
          const active = props.activeSessionId === session.id;
          return (
            <button
              key={session.id}
              onClick={() => props.onOpenSession(session.id)}
              style={{
                background: active ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.03)",
                border: `1px solid ${active ? "rgba(255,255,255,0.18)" : "rgba(255,255,255,0.08)"}`,
                borderRadius: 18,
                color: "#f8fafc",
                cursor: "pointer",
                display: "grid",
                gap: 6,
                padding: 14,
                textAlign: "left",
              }}
              type="button"
            >
              <div style={{ fontSize: 13, fontWeight: 800 }}>{session.title || "未命名对话"}</div>
              <div style={{ color: "rgba(148,163,184,0.9)", fontSize: 11 }}>
                创建于 {new Date(session.createdAt).toLocaleString("zh-CN")}
              </div>
            </button>
          );
        })
      )}
    </div>
  );
}
