import React from "react";

import type { AgentHistoryMessage, AgentSessionEvent } from "./canvasAgentApi";

function getContinuationActionLabel(action: string) {
  if (action === "continue-edit") return "继续编辑";
  if (action === "make-variant") return "做变体";
  if (action === "make-poster") return "做海报";
  if (action === "compare") return "做对比图";
  return action;
}

function readContinuationContext(message: AgentHistoryMessage) {
  const value = message.metadata?.continuationContext;
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (typeof record.assetLabel !== "string") return null;
  if (typeof record.assetRefId !== "string") return null;
  if (typeof record.actionLabel !== "string" && typeof record.action !== "string") return null;
  const assetLabels = Array.isArray(record.assetLabels)
    ? record.assetLabels.filter((item): item is string => typeof item === "string")
    : [];
  const assetRefIds = Array.isArray(record.assetRefIds)
    ? record.assetRefIds.filter((item): item is string => typeof item === "string")
    : [];
  return {
    actionLabel:
      typeof record.actionLabel === "string"
        ? record.actionLabel
        : getContinuationActionLabel(String(record.action)),
    assetLabel: record.assetLabel,
    assetLabels,
    assetRefId: record.assetRefId,
    assetRefIds,
    promptSummary: typeof record.promptSummary === "string" ? record.promptSummary : "",
  };
}

export function CanvasAgentThread(props: {
  events: AgentSessionEvent[];
  messages: AgentHistoryMessage[];
}) {
  return (
    <section aria-label="Agent thread" style={{ display: "grid", gap: 10 }}>
      {props.messages.map((message) => {
        const continuation = readContinuationContext(message);
        return (
          <div
            key={message.id}
            style={{
              background:
                message.role === "user"
                  ? "rgba(248,250,252,0.92)"
                  : message.role === "system"
                    ? "rgba(249,115,22,0.12)"
                    : "rgba(255,255,255,0.04)",
              borderRadius: 16,
              color:
                message.role === "user"
                  ? "#09090f"
                  : message.role === "system"
                    ? "#fdba74"
                    : "#f8fafc",
              display: "grid",
              fontSize: 13,
              gap: 8,
              justifySelf: message.role === "user" ? "end" : "stretch",
              lineHeight: 1.6,
              maxWidth: message.role === "user" ? "88%" : "100%",
              padding: "12px 14px",
              whiteSpace: "pre-wrap",
            }}
          >
            {continuation ? (
              <div
                style={{
                  background: message.role === "user" ? "rgba(15,23,42,0.08)" : "rgba(255,255,255,0.06)",
                  borderRadius: 12,
                  display: "grid",
                  gap: 4,
                  padding: "8px 10px",
                }}
              >
                <div style={{ fontSize: 11, fontWeight: 700 }}>继续基于历史结果</div>
                <div style={{ fontSize: 12 }}>
                  {(continuation.assetLabels.length > 0 ? continuation.assetLabels : [continuation.assetLabel]).join("、")}
                  {" · "}
                  {continuation.actionLabel}
                </div>
                <div style={{ fontSize: 11, opacity: 0.72 }}>
                  {(continuation.assetRefIds.length > 0 ? continuation.assetRefIds : [continuation.assetRefId]).join("、")}
                </div>
              </div>
            ) : null}
            <div>{message.content}</div>
          </div>
        );
      })}

      {props.events.length > 0 ? (
        <div
          style={{
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 16,
            display: "grid",
            gap: 8,
            padding: 12,
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
