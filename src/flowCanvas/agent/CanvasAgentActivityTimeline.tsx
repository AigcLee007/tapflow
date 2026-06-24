import React from "react";

export type CanvasAgentActivityItem = {
  detail?: string;
  id: string;
  label: string;
  state: "active" | "completed" | "failed";
};

function getTone(state: CanvasAgentActivityItem["state"]) {
  if (state === "completed") {
    return {
      background: "rgba(34,197,94,0.14)",
      border: "rgba(74,222,128,0.22)",
      text: "#bbf7d0",
    };
  }
  if (state === "failed") {
    return {
      background: "rgba(239,68,68,0.14)",
      border: "rgba(248,113,113,0.22)",
      text: "#fecaca",
    };
  }
  return {
    background: "rgba(59,130,246,0.12)",
    border: "rgba(96,165,250,0.2)",
    text: "#dbeafe",
  };
}

export function CanvasAgentActivityTimeline(props: {
  items: CanvasAgentActivityItem[];
}) {
  if (props.items.length === 0) return null;

  return (
    <section aria-label="Agent activity timeline" style={{ display: "grid", gap: 8 }}>
      {props.items.map((item, index) => {
        const tone = getTone(item.state);
        return (
          <div
            key={item.id}
            style={{
              display: "grid",
              gridTemplateColumns: "18px 1fr",
              gap: 10,
              alignItems: "start",
            }}
          >
            <div style={{ display: "grid", justifyItems: "center", gap: 4, paddingTop: 2 }}>
              <div
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: 999,
                  background: tone.text,
                  boxShadow: item.state === "active" ? `0 0 0 4px ${tone.background}` : "none",
                }}
              />
              {index < props.items.length - 1 ? (
                <div style={{ width: 1, minHeight: 26, background: "rgba(148,163,184,0.28)" }} />
              ) : null}
            </div>

            <div
              style={{
                borderRadius: 14,
                border: `1px solid ${tone.border}`,
                background: tone.background,
                padding: "10px 12px",
                display: "grid",
                gap: 4,
              }}
            >
              <div style={{ color: tone.text, fontSize: 12, fontWeight: 800 }}>{item.label}</div>
              {item.detail ? (
                <div style={{ color: "rgba(226,232,240,0.72)", fontSize: 12, lineHeight: 1.5 }}>{item.detail}</div>
              ) : null}
            </div>
          </div>
        );
      })}
    </section>
  );
}
