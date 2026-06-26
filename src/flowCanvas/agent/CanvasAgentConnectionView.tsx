import React from "react";

import type { AgentImageRunSettingsModel } from "./agentRunSettings";

export function CanvasAgentConnectionView(props: {
  models: AgentImageRunSettingsModel[];
}) {
  const uniqueModels = React.useMemo(() => {
    const map = new Map<string, AgentImageRunSettingsModel>();
    for (const model of props.models) {
      if (!map.has(model.modelKey)) {
        map.set(model.modelKey, model);
      }
    }
    return Array.from(map.values());
  }, [props.models]);

  return (
    <div style={{ display: "grid", gap: 12, height: "100%", overflowY: "auto", padding: 16 }}>
      <section
        style={{
          background: "rgba(255,255,255,0.03)",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 18,
          display: "grid",
          gap: 8,
          padding: 14,
        }}
      >
        <div style={{ color: "#f8fafc", fontSize: 14, fontWeight: 800 }}>可用模型与线路</div>
        <div style={{ color: "rgba(226,232,240,0.72)", fontSize: 12, lineHeight: 1.6 }}>
          这里只展示用户真正需要理解和选择的产品模型、线路与尺寸能力。
        </div>
      </section>

      {uniqueModels.length === 0 ? (
        <div style={{ color: "rgba(148,163,184,0.88)", fontSize: 13 }}>当前还没有可用的图片模型。</div>
      ) : (
        uniqueModels.map((model) => (
          <section
            key={model.modelKey}
            style={{
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 16,
              display: "grid",
              gap: 10,
              padding: 14,
            }}
          >
            <div style={{ color: "#f8fafc", fontSize: 14, fontWeight: 800 }}>{model.displayName}</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {model.routes.map((route) => (
                <div
                  key={route.routeKey}
                  style={{
                    background: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(255,255,255,0.08)",
                    borderRadius: 14,
                    display: "grid",
                    gap: 4,
                    minWidth: 148,
                    padding: "10px 12px",
                  }}
                >
                  <div style={{ color: "#e2e8f0", fontSize: 12, fontWeight: 700 }}>{route.routeLabel}</div>
                  <div style={{ color: "rgba(148,163,184,0.9)", fontSize: 11 }}>
                    支持 {route.sizes.map((tier) => tier.size).join(" / ")}
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
