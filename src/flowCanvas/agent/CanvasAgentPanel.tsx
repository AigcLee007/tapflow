import React from "react";
import { Bot, X } from "lucide-react";

import { CanvasAgentComposer } from "./CanvasAgentComposer";
import { CanvasAgentPlanCard } from "./CanvasAgentPlanCard";
import { CanvasAgentTaskCard } from "./CanvasAgentTaskCard";
import type { CanvasAgentPlannerOutput } from "./canvasAgentTypes";
import { useCanvasAgentSession } from "./useCanvasAgentSession";

type ApplyResult = {
  createdNodeIds: string[];
  errors: Array<{ message: string }>;
  ok: boolean;
  ranNodeIds: string[];
};

function getStatusCopy(status: "awaiting_approval" | "error" | "executing" | "idle" | "thinking", usedOfflineFallback: boolean) {
  if (status === "thinking") {
    return usedOfflineFallback ? "正在使用基础规划模式…" : "正在使用真实大模型理解画布并制定计划…";
  }
  if (status === "awaiting_approval") {
    return usedOfflineFallback ? "基础规划已生成，等待你确认。" : "真实 Agent 计划已生成，等待你确认。";
  }
  if (status === "executing") {
    return "正在执行已确认的画布操作…";
  }
  if (status === "error") {
    return usedOfflineFallback ? "基础规划执行失败。" : "真实大模型 Agent 调用失败。";
  }
  return usedOfflineFallback ? "当前处于基础规划模式。" : "由真实大模型负责规划，执行前仍由你确认。";
}

export function CanvasAgentPanel(props: {
  onClose: () => void;
  onConfirmPlan: (plan: CanvasAgentPlannerOutput) => Promise<ApplyResult>;
  onCreateOnlyPlan?: (plan: CanvasAgentPlannerOutput) => Promise<ApplyResult>;
  open: boolean;
}) {
  const session = useCanvasAgentSession();

  if (!props.open) return null;

  const busy = session.status === "thinking" || session.status === "executing";
  const statusCopy = getStatusCopy(session.status, session.usedOfflineFallback);

  return (
    <aside
      className="nodrag nopan nowheel"
      style={{
        position: "absolute",
        top: 14,
        right: 14,
        bottom: 14,
        width: "min(480px, calc(100vw - 28px))",
        borderRadius: 24,
        border: "1px solid rgba(255,255,255,0.08)",
        background: "rgba(10,10,15,0.97)",
        boxShadow: "0 26px 80px rgba(0,0,0,0.5)",
        backdropFilter: "blur(18px)",
        zIndex: 80,
        display: "grid",
        gridTemplateRows: "auto 1fr auto",
        overflow: "hidden",
      }}
    >
      <header
        style={{
          padding: "16px 16px 14px",
          borderBottom: "1px solid rgba(255,255,255,0.08)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 18,
              background: "rgba(255,255,255,0.08)",
              display: "grid",
              placeItems: "center",
              color: "#f8fafc",
            }}
          >
            <Bot size={18} />
          </div>
          <div>
            <div style={{ color: "#f8fafc", fontSize: 16, fontWeight: 800 }}>TapFlow Agent</div>
            <div style={{ color: "rgba(226,232,240,0.58)", fontSize: 12 }}>{statusCopy}</div>
          </div>
        </div>
        <button
          aria-label="关闭 Agent"
          onClick={props.onClose}
          style={{
            width: 34,
            height: 34,
            borderRadius: 17,
            border: "1px solid rgba(255,255,255,0.08)",
            background: "transparent",
            color: "#f8fafc",
            cursor: "pointer",
            display: "grid",
            placeItems: "center",
          }}
          type="button"
        >
          <X size={16} />
        </button>
      </header>

      <div style={{ overflowY: "auto", padding: 16, display: "grid", gap: 14, alignContent: "start" }}>
        {session.messages.length === 0 ? (
          <section
            style={{
              borderRadius: 18,
              border: "1px solid rgba(255,255,255,0.08)",
              background: "rgba(255,255,255,0.03)",
              padding: 16,
              display: "grid",
              gap: 8,
            }}
          >
            <div style={{ color: "#f8fafc", fontSize: 15, fontWeight: 800 }}>从一句目标开始</div>
            <div style={{ color: "rgba(226,232,240,0.72)", fontSize: 13, lineHeight: 1.6 }}>
              例如：帮我搭一个森林运动会的文生图流程，或者把当前选中的图做成视频。
            </div>
          </section>
        ) : null}

        {session.messages.map((message) => (
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

        {session.currentPlan ? (
          <CanvasAgentPlanCard
            busy={busy}
            onCancel={session.cancelCurrentPlan}
            onConfirm={() => {
              void session.executeCurrentPlan(props.onConfirmPlan);
            }}
            onCreateOnly={
              props.onCreateOnlyPlan
                ? () => {
                    void session.executeCurrentPlan(props.onCreateOnlyPlan, { omitRunNode: true });
                  }
                : undefined
            }
            plan={session.currentPlan}
          />
        ) : null}

        {session.error ? <CanvasAgentTaskCard detail={session.error} status="error" title="最近一次执行失败" /> : null}
      </div>

      <CanvasAgentComposer
        disabled={busy}
        onSend={async (prompt) => {
          await session.sendPrompt(prompt);
        }}
      />
    </aside>
  );
}
