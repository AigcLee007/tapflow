import React from "react";
import { History, MessageCircle, PanelRightClose, Plus, ScrollText, Sparkles } from "lucide-react";

import type { AgentWorkspaceTab } from "./CanvasAgentWorkspaceTypes";
import type { CanvasAgentWorkspaceState } from "./canvasAgentStateMachine";
import { CANVAS_AGENT_STATE_LABELS } from "./canvasAgentStateMachine";

const CANVAS_TOP_CHROME_CLEARANCE = 16;

const toolbarItems: Array<{
  icon: React.ElementType;
  label: string;
  onClickKind: "collapse" | "new" | "tab";
  tab?: AgentWorkspaceTab;
}> = [
  { icon: ScrollText, label: "日志", onClickKind: "tab", tab: "logs" },
  { icon: MessageCircle, label: "对话", onClickKind: "tab", tab: "chat" },
  { icon: History, label: "历史", onClickKind: "tab", tab: "history" },
  { icon: Plus, label: "新对话", onClickKind: "new" },
  { icon: PanelRightClose, label: "收起 Agent", onClickKind: "collapse" },
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
  const width = props.width ?? 520;

  return (
    <aside
      className="nodrag nopan nowheel canvas-agent-workspace-shell"
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

        <div
          data-testid="agent-shell-toolbar"
          style={{ alignItems: "center", display: "flex", flex: "0 0 auto", gap: 8 }}
        >
          {toolbarItems.map((item) => {
            const Icon = item.icon;
            const active = item.tab ? props.activeTab === item.tab : false;
            return (
              <button
                aria-label={item.label}
                key={item.label}
                onClick={() => {
                  if (item.onClickKind === "collapse") {
                    props.onCollapse();
                    return;
                  }
                  if (item.onClickKind === "new") {
                    props.onNewChat();
                    return;
                  }
                  if (item.tab) {
                    props.onChangeTab(item.tab);
                  }
                }}
                style={iconButtonStyle(active)}
                title={item.label}
                type="button"
              >
                <Icon size={16} />
              </button>
            );
          })}
        </div>
      </header>

      <div data-testid="agent-shell-composer-dock" style={{ minHeight: 0, overflow: "hidden" }}>
        {props.children}
      </div>
    </aside>
  );
}

function iconButtonStyle(active = false): React.CSSProperties {
  return {
    alignItems: "center",
    background: active ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.04)",
    border: `1px solid ${active ? "rgba(255,255,255,0.18)" : "rgba(255,255,255,0.08)"}`,
    borderRadius: 16,
    color: "#f8fafc",
    cursor: "pointer",
    display: "inline-flex",
    height: 32,
    justifyContent: "center",
    width: 32,
  };
}
