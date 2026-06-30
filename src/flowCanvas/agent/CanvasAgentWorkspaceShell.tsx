import React from "react";
import { History, PanelRightClose, Plug, Plus, ScrollText, Sparkles } from "lucide-react";

import type { AgentWorkspaceTab } from "./CanvasAgentWorkspaceTypes";
import type { CanvasAgentWorkspaceState } from "./canvasAgentStateMachine";
import { CANVAS_AGENT_STATE_LABELS } from "./canvasAgentStateMachine";

const CANVAS_TOP_CHROME_CLEARANCE = 16;

const utilityItems: Array<{ icon: React.ElementType; id: Exclude<AgentWorkspaceTab, "chat">; label: string }> = [
  { icon: History, id: "history", label: "History" },
  { icon: Plug, id: "connections", label: "Connections" },
  { icon: ScrollText, id: "logs", label: "Logs" },
];

export function CanvasAgentWorkspaceShell(props: {
  activeTab: AgentWorkspaceTab;
  busy: boolean;
  children: React.ReactNode;
  onChangeTab: (tab: AgentWorkspaceTab) => void;
  onCollapse: () => void;
  onNewChat: () => void;
  workspaceState?: CanvasAgentWorkspaceState;
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
        gridTemplateRows: "auto 1fr",
        overflow: "hidden",
        position: "absolute",
        right: 0,
        top: CANVAS_TOP_CHROME_CLEARANCE,
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
          padding: "18px 16px 10px",
        }}
      >
        <div style={{ alignItems: "center", display: "flex", gap: 12, minWidth: 0 }}>
          <div
            style={{
              background: "rgba(255,255,255,0.08)",
              borderRadius: 15,
              color: "#f8fafc",
              display: "grid",
              flex: "0 0 auto",
              height: 36,
              placeItems: "center",
              width: 36,
            }}
          >
            <Sparkles size={17} />
          </div>
          <div style={{ display: "grid", gap: 2, minWidth: 0 }}>
            <div style={{ color: "#f8fafc", fontSize: 15, fontWeight: 800, lineHeight: 1.1 }}>TapFlow Agent</div>
            <div style={{ color: "rgba(226,232,240,0.68)", fontSize: 12, fontWeight: 700, lineHeight: 1.15 }}>
              Canvas Copilot
            </div>
            <div
              style={{
                color: props.busy ? "#93c5fd" : "rgba(148,163,184,0.84)",
                fontSize: 11,
                lineHeight: 1.2,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {props.workspaceState
                ? CANVAS_AGENT_STATE_LABELS[props.workspaceState]
                : props.busy
                  ? "Working"
                  : "Ready for the selected canvas context"}
            </div>
          </div>
        </div>

        <div style={{ alignItems: "center", display: "flex", flex: "0 0 auto", gap: 8 }}>
          <button aria-label="New chat" onClick={props.onNewChat} style={iconButtonStyle()} type="button">
            <Plus size={16} />
          </button>
          <button aria-label="Collapse Agent" onClick={props.onCollapse} style={iconButtonStyle()} type="button">
            <PanelRightClose size={16} />
          </button>
        </div>
      </header>

      <div style={{ display: "grid", gridTemplateRows: "auto 1fr", minHeight: 0, overflow: "hidden" }}>
        <div
          data-testid="agent-shell-utility-nav"
          style={{ alignItems: "center", display: "flex", gap: 8, padding: "0 16px 10px" }}
        >
          {utilityItems.map((item) => {
            const active = props.activeTab === item.id;
            const Icon = item.icon;
            return (
              <button
                aria-label={item.label}
                key={item.id}
                onClick={() => props.onChangeTab(active ? "chat" : item.id)}
                style={{
                  alignItems: "center",
                  background: active ? "rgba(255,255,255,0.1)" : "rgba(255,255,255,0.035)",
                  border: `1px solid ${active ? "rgba(255,255,255,0.16)" : "rgba(255,255,255,0.07)"}`,
                  borderRadius: 13,
                  color: active ? "#f8fafc" : "rgba(226,232,240,0.7)",
                  cursor: "pointer",
                  display: "inline-flex",
                  height: 30,
                  justifyContent: "center",
                  width: 34,
                }}
                title={item.label}
                type="button"
              >
                <Icon size={15} />
              </button>
            );
          })}
        </div>

        <div data-testid="agent-shell-composer-dock" style={{ minHeight: 0, overflow: "hidden" }}>
          {props.children}
        </div>
      </div>
    </aside>
  );
}

function iconButtonStyle(): React.CSSProperties {
  return {
    alignItems: "center",
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 16,
    color: "#f8fafc",
    cursor: "pointer",
    display: "inline-flex",
    height: 32,
    justifyContent: "center",
    width: 32,
  };
}
