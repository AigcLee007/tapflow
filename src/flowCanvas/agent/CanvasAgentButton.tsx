import React from "react";
import { Bot, Loader2, Sparkles } from "lucide-react";

type CanvasAgentButtonStatus = "idle" | "thinking" | "awaiting" | "running" | "error";

const statusIconByState: Record<CanvasAgentButtonStatus, React.ReactNode> = {
  awaiting: <Sparkles size={18} />,
  error: <Bot size={18} />,
  idle: <Bot size={18} />,
  running: <Loader2 className="animate-spin" size={18} />,
  thinking: <Loader2 className="animate-spin" size={18} />,
};

export function CanvasAgentButton(props: {
  onClick: () => void;
  status?: CanvasAgentButtonStatus;
}) {
  const status = props.status ?? "idle";

  return (
    <div
      className="nodrag nopan nowheel"
      style={{
        position: "absolute",
        right: 18,
        bottom: 66,
        zIndex: 70,
      }}
    >
      <button
        aria-label="打开 Agent"
        onClick={props.onClick}
        style={{
          width: 52,
          height: 52,
          borderRadius: 26,
          border: "1px solid rgba(255,255,255,0.12)",
          background: "linear-gradient(180deg, rgba(35,35,42,0.98) 0%, rgba(20,20,26,0.98) 100%)",
          color: "#f8fafc",
          display: "grid",
          placeItems: "center",
          cursor: "pointer",
          boxShadow: "0 20px 48px rgba(0,0,0,0.42)",
          position: "relative",
        }}
        type="button"
      >
        {statusIconByState[status]}
        {status === "awaiting" ? (
          <span
            style={{
              position: "absolute",
              top: 7,
              right: 7,
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: "#f97316",
              boxShadow: "0 0 0 4px rgba(249,115,22,0.18)",
            }}
          />
        ) : null}
      </button>
    </div>
  );
}
