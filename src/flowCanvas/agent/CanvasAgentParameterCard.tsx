import React from "react";

import { GptImage2ParamPanel } from "../nodes/GptImage2ParamPanel";
import { NanoBananaParamPanel } from "../nodes/NanoBananaParamPanel";
import type {
  AgentImageRunSettingsModel,
  AgentImageRunSettingsRoute,
  AgentImageRunSettingsSelection,
} from "./agentRunSettings";
import { getRouteTierCredits } from "./agentRunSettings";

function chipStyle(active: boolean): React.CSSProperties {
  return {
    background: active ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.04)",
    border: `1px solid ${active ? "rgba(255,255,255,0.18)" : "rgba(255,255,255,0.08)"}`,
    borderRadius: 14,
    color: "#f8fafc",
    cursor: "pointer",
    fontSize: 12,
    fontWeight: 700,
    minHeight: 38,
    padding: "0 12px",
  };
}

function findDefaultRoute(model: AgentImageRunSettingsModel): AgentImageRunSettingsRoute | null {
  if (model.defaultRouteKey) {
    const matched = model.routes.find((route) => route.routeKey === model.defaultRouteKey);
    if (matched) return matched;
  }
  return model.routes[0] ?? null;
}

function isGptImageModel(model: AgentImageRunSettingsModel): boolean {
  return model.displayName === "GPT-Image-2" || model.modelFamily === "gpt-image-2" || model.modelKey === "gpt-image-2";
}

export function CanvasAgentParameterCard(props: {
  models: AgentImageRunSettingsModel[];
  onCancel: () => void;
  onConfirm: (selection: AgentImageRunSettingsSelection) => void;
  referenceRefs?: string[];
}) {
  const initialModel = props.models[0] ?? null;
  const [modelKey, setModelKey] = React.useState(initialModel?.modelKey ?? "");
  const activeModel = React.useMemo(
    () => props.models.find((item) => item.modelKey === modelKey) ?? props.models[0] ?? null,
    [modelKey, props.models],
  );

  const [routeKey, setRouteKey] = React.useState(initialModel ? (findDefaultRoute(initialModel)?.routeKey ?? "") : "");
  const [size, setSize] = React.useState<"1K" | "2K" | "4K">(initialModel?.sizes[0] ?? "1K");
  const [aspectRatio, setAspectRatio] = React.useState(initialModel?.aspectRatios[0] ?? "1:1");
  const [quality, setQuality] = React.useState<"auto" | "high" | "low" | "medium">("auto");
  const [format, setFormat] = React.useState<"jpeg" | "png" | "webp">("png");
  const [moderation, setModeration] = React.useState<"auto" | "low">("auto");

  React.useEffect(() => {
    if (!activeModel) return;
    const nextRoute = findDefaultRoute(activeModel);
    setRouteKey(nextRoute?.routeKey ?? "");
    setSize(activeModel.sizes[0] ?? "1K");
    setAspectRatio(activeModel.aspectRatios[0] ?? "1:1");
    setQuality("auto");
    setFormat("png");
    setModeration("auto");
  }, [activeModel?.modelKey]);

  const activeRoute = React.useMemo<AgentImageRunSettingsRoute | null>(
    () => activeModel?.routes.find((route) => route.routeKey === routeKey) ?? null,
    [activeModel, routeKey],
  );
  const estimatedCredits = getRouteTierCredits(activeRoute, size);

  if (!activeModel) return null;

  const gptModel = isGptImageModel(activeModel);

  return (
    <article
      style={{
        background: "rgba(15,23,42,0.78)",
        border: "1px solid rgba(148,163,184,0.16)",
        borderRadius: 18,
        display: "grid",
        gap: 14,
        padding: 14,
      }}
    >
      <div style={{ display: "grid", gap: 4 }}>
        <div style={{ color: "#f8fafc", fontSize: 14, fontWeight: 800 }}>{activeModel.displayName}</div>
        <div style={{ color: "#94a3b8", fontSize: 12 }}>生成前确认模型、线路与参数</div>
      </div>

      <section style={{ display: "grid", gap: 8 }}>
        <div style={{ color: "#cbd5e1", fontSize: 12, fontWeight: 700 }}>模型</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {props.models.map((model) => (
            <button
              aria-label={model.displayName}
              aria-pressed={model.modelKey === activeModel.modelKey}
              key={model.modelKey}
              onClick={() => setModelKey(model.modelKey)}
              style={chipStyle(model.modelKey === activeModel.modelKey)}
              type="button"
            >
              {model.displayName}
            </button>
          ))}
        </div>
      </section>

      <section style={{ display: "grid", gap: 8 }}>
        <div style={{ color: "#cbd5e1", fontSize: 12, fontWeight: 700 }}>线路</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {activeModel.routes.map((route) => (
            <button
              aria-label={route.routeLabel}
              aria-pressed={route.routeKey === routeKey}
              key={route.routeKey}
              onClick={() => setRouteKey(route.routeKey)}
              style={chipStyle(route.routeKey === routeKey)}
              type="button"
            >
              {route.routeLabel}
            </button>
          ))}
        </div>
      </section>

      {props.referenceRefs?.length ? (
        <section style={{ display: "grid", gap: 8 }}>
          <div style={{ color: "#cbd5e1", fontSize: 12, fontWeight: 700 }}>Reference images</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {props.referenceRefs.map((ref) => (
              <span
                key={ref}
                style={{
                  border: "1px solid rgba(148,163,184,0.22)",
                  borderRadius: 999,
                  color: "#cbd5e1",
                  fontSize: 11,
                  padding: "4px 8px",
                }}
              >
                {ref}
              </span>
            ))}
          </div>
        </section>
      ) : null}

      {gptModel ? (
        <GptImage2ParamPanel
          format={format}
          moderation={moderation}
          onChangeFormat={setFormat}
          onChangeModeration={setModeration}
          onChangeQuality={setQuality}
          onChangeRatio={setAspectRatio}
          onChangeSize={(value) => setSize(value as "1K" | "2K" | "4K")}
          quality={quality}
          ratio={aspectRatio}
          ratios={activeModel.aspectRatios}
          size={size}
          sizes={activeModel.sizes}
        />
      ) : (
        <NanoBananaParamPanel
          onChangeRatio={setAspectRatio}
          onChangeSize={(value) => setSize(value as "1K" | "2K" | "4K")}
          ratio={aspectRatio}
          ratios={activeModel.aspectRatios}
          size={size}
          sizes={activeModel.sizes}
        />
      )}

      <div
        style={{
          alignItems: "center",
          background: "rgba(255,255,255,0.05)",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 16,
          display: "flex",
          justifyContent: "space-between",
          padding: "12px 14px",
        }}
      >
        <div>
          <div style={{ color: "#94a3b8", fontSize: 11, fontWeight: 700 }}>预计点数</div>
          <div style={{ color: "#f8fafc", fontSize: 18, fontWeight: 800 }}>{estimatedCredits}</div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={props.onCancel} style={chipStyle(false)} type="button">
            取消
          </button>
          <button
            onClick={() => {
              if (!activeRoute) return;
              props.onConfirm({
                aspectRatio,
                estimatedCredits,
                format: gptModel ? format : undefined,
                modelDisplayName: activeModel.displayName,
                moderation: gptModel ? moderation : undefined,
                modality: "image",
                n: 1,
                quality: gptModel ? quality : undefined,
                routeKey: activeRoute.routeKey,
                routeLabel: activeRoute.routeLabel,
                size,
              });
            }}
            style={chipStyle(true)}
            type="button"
          >
            确认生成
          </button>
        </div>
      </div>
    </article>
  );
}
