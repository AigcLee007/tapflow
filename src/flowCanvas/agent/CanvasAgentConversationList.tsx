import React from "react";

import type { AgentSessionView } from "./canvasAgentApi";

export function CanvasAgentConversationList(props: {
  activeSessionId: string | null;
  sessions: AgentSessionView[];
}) {
  return (
    <section
      aria-label="Agent conversations"
      style={{
        borderRadius: 16,
        border: "1px solid rgba(255,255,255,0.08)",
        background: "rgba(255,255,255,0.03)",
        padding: 12,
        display: "grid",
        gap: 8,
      }}
    >
      <div style={{ color: "#f8fafc", fontSize: 12, fontWeight: 800 }}>Conversation History</div>
      {props.sessions.length === 0 ? (
        <div style={{ color: "rgba(226,232,240,0.56)", fontSize: 12 }}>No saved sessions yet.</div>
      ) : props.sessions.map((session) => (
        <div
          key={session.id}
          style={{
            borderRadius: 12,
            padding: "8px 10px",
            background: session.id === props.activeSessionId ? "rgba(248,250,252,0.12)" : "rgba(255,255,255,0.02)",
            color: "#f8fafc",
            fontSize: 12,
          }}
        >
          {session.title}
        </div>
      ))}
    </section>
  );
}
