import React from "react";

import type { AgentWorkspaceTab } from "./CanvasAgentWorkspaceTypes";

const tabs: Array<{ id: AgentWorkspaceTab; label: string }> = [
  { id: "chat", label: "对话" },
  { id: "history", label: "历史" },
  { id: "connections", label: "连接配置" },
  { id: "logs", label: "日志" },
];

export function CanvasAgentTabs(props: {
  activeTab: AgentWorkspaceTab;
  onChange: (tab: AgentWorkspaceTab) => void;
}) {
  return (
    <div
      aria-label="Agent workspace tabs"
      role="tablist"
      style={{ display: "flex", gap: 6, padding: "0 12px 10px" }}
    >
      {tabs.map((tab) => {
        const active = props.activeTab === tab.id;
        return (
          <button
            aria-selected={active}
            key={tab.id}
            onClick={() => props.onChange(tab.id)}
            role="tab"
            style={{
              background: active ? "rgba(255,255,255,0.12)" : "transparent",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 999,
              color: active ? "#f8fafc" : "rgba(226,232,240,0.68)",
              cursor: "pointer",
              fontSize: 12,
              fontWeight: 800,
              height: 30,
              padding: "0 10px",
            }}
            type="button"
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
