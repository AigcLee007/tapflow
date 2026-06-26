import React from "react";

import type { AgentImageRunSettingsModel } from "./agentRunSettings";

export function CanvasAgentModelRoutePicker(props: {
  models: AgentImageRunSettingsModel[];
  routeKey: string | null;
  selectedModelKey: string | null;
  onSelectModel: (modelKey: string) => void;
  onSelectRoute: (routeKey: string) => void;
}) {
  const activeModel =
    props.models.find((model) => model.modelKey === props.selectedModelKey) ?? props.models[0] ?? null;

  return (
    <div style={{ display: "grid", gap: 10 }}>
      <div style={{ display: "grid", gap: 6 }}>
        <div style={{ color: "#cbd5e1", fontSize: 12, fontWeight: 700 }}>模型</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {props.models.map((model) => {
            const active = model.modelKey === (activeModel?.modelKey ?? "");
            return (
              <button
                key={model.modelKey}
                onClick={() => props.onSelectModel(model.modelKey)}
                style={chipStyle(active)}
                type="button"
              >
                {model.displayName}
              </button>
            );
          })}
        </div>
      </div>

      {activeModel ? (
        <div style={{ display: "grid", gap: 6 }}>
          <div style={{ color: "#cbd5e1", fontSize: 12, fontWeight: 700 }}>线路</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {activeModel.routes.map((route) => {
              const active = route.routeKey === props.routeKey;
              return (
                <button
                  key={route.routeKey}
                  onClick={() => props.onSelectRoute(route.routeKey)}
                  style={chipStyle(active)}
                  type="button"
                >
                  {route.routeLabel}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function chipStyle(active: boolean): React.CSSProperties {
  return {
    background: active ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.04)",
    border: `1px solid ${active ? "rgba(255,255,255,0.18)" : "rgba(255,255,255,0.08)"}`,
    borderRadius: 14,
    color: "#f8fafc",
    cursor: "pointer",
    fontSize: 12,
    fontWeight: 700,
    minHeight: 36,
    padding: "0 12px",
  };
}
