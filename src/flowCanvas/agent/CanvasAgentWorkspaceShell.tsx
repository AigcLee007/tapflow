import React from "react";
import { PanelRightClose, Plus, Sparkles } from "lucide-react";

import type { AgentWorkspaceTab } from "./CanvasAgentWorkspaceTypes";
import { CanvasAgentTabs } from "./CanvasAgentTabs";

export function CanvasAgentWorkspaceShell(props: {
  activeTab: AgentWorkspaceTab;
  busy: boolean;
  children: React.ReactNode;
  onChangeTab: (tab: AgentWorkspaceTab) => void;
  onCollapse: () => void;
  onNewChat: () => void;
  width?: number;
}) {
  const width = props.width ?? 420;

  return (
    <aside
      className="nodrag nopan nowheel"
      style={{
        backdropFilter: "blur(18px)",
        background: "rgba(10,10,15,0.97)",
        borderLeft: "1px solid rgba(255,255,255,0.08)",
        bottom: 0,
        boxShadow: "-24px 0 70px rgba(0,0,0,0.38)",
        display: "grid",
        gridTemplateRows: "auto auto 1fr",
        overflow: "hidden",
        position: "absolute",
        right: 0,
        top: 0,
        width,
        zIndex: 80,
      }}
    >
      <header
        style={{
          alignItems: "center",
          display: "flex",
          gap: 12,
          justifyContent: "space-between",
          padding: "18px 16px 12px",
        }}
      >
        <div style={{ alignItems: "center", display: "flex", gap: 12 }}>
          <div
            style={{
              background: "rgba(255,255,255,0.08)",
              borderRadius: 18,
              color: "#f8fafc",
              display: "grid",
              height: 38,
              placeItems: "center",
              width: 38,
            }}
          >
            <Sparkles size={18} />
          </div>
          <div style={{ display: "grid", gap: 2 }}>
            <div style={{ color: "#f8fafc", fontSize: 16, fontWeight: 800 }}>TapFlow Agent</div>
            <div style={{ color: "rgba(226,232,240,0.68)", fontSize: 12, fontWeight: 700 }}>
              Canvas Director
            </div>
            <div style={{ color: props.busy ? "#93c5fd" : "rgba(148,163,184,0.84)", fontSize: 11 }}>
              {props.busy ? "正在处理当前任务" : "准备继续你的画布生产任务"}
            </div>
          </div>
        </div>

        <div style={{ alignItems: "center", display: "flex", gap: 8 }}>
          <button
            aria-label="新对话"
            onClick={props.onNewChat}
            style={iconButtonStyle()}
            type="button"
          >
            <Plus size={16} />
          </button>
          <button
            aria-label="收起 Agent"
            onClick={props.onCollapse}
            style={iconButtonStyle()}
            type="button"
          >
            <PanelRightClose size={16} />
          </button>
        </div>
      </header>

      <CanvasAgentTabs activeTab={props.activeTab} onChange={props.onChangeTab} />

      <div style={{ minHeight: 0, overflow: "hidden" }}>{props.children}</div>
    </aside>
  );
}

function iconButtonStyle(): React.CSSProperties {
  return {
    alignItems: "center",
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 17,
    color: "#f8fafc",
    cursor: "pointer",
    display: "inline-flex",
    height: 34,
    justifyContent: "center",
    width: 34,
  };
}
