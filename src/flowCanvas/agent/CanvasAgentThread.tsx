import React from "react";

import type { AgentHistoryMessage, AgentSessionEvent } from "./canvasAgentApi";

export function CanvasAgentThread(props: {
  events: AgentSessionEvent[];
  messages: AgentHistoryMessage[];
}) {
  return (
    <section
      aria-label="Agent thread"
      style={{ display: "grid", gap: 10 }}
    >
      {props.messages.map((message) => (
        <div
          key={message.id}
          style={{
            justifySelf: message.role === "user" ? "end" : "stretch",
            maxWidth: message.role === "user" ? "88%" : "100%",
            padding: "12px 14px",
            borderRadius: 16,
            background:
              message.role === "user"
                ? "rgba(248,250,252,0.92)"
                : message.role === "system"
                  ? "rgba(249,115,22,0.12)"
                  : "rgba(255,255,255,0.04)",
            color:
              message.role === "user"
                ? "#09090f"
                : message.role === "system"
                  ? "#fdba74"
                  : "#f8fafc",
            fontSize: 13,
            lineHeight: 1.6,
            whiteSpace: "pre-wrap",
          }}
        >
          {message.content}
        </div>
      ))}

      {props.events.length > 0 ? (
        <div
          style={{
            borderRadius: 16,
            border: "1px solid rgba(255,255,255,0.08)",
            background: "rgba(255,255,255,0.03)",
            padding: 12,
            display: "grid",
            gap: 8,
          }}
        >
          <div style={{ color: "#f8fafc", fontSize: 12, fontWeight: 800 }}>Replay Events</div>
          {props.events.map((event) => (
            <div key={event.id} style={{ color: "rgba(226,232,240,0.74)", fontSize: 12 }}>
              #{event.seq} {event.eventType}
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}
