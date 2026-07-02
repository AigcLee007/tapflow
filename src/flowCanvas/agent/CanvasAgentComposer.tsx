import React, { useMemo, useState } from "react";

import { buildAgentArtifactRefChips, type CanvasAgentArtifactRefChip } from "./agentArtifactRefs";
import { CanvasAgentModelRoutePicker } from "./CanvasAgentModelRoutePicker";
import { CanvasAgentReferenceChips } from "./CanvasAgentReferenceChips";
import { CanvasAgentReferenceUploadButton } from "./CanvasAgentReferenceUploadButton";
import type { AgentReferenceChip } from "./CanvasAgentWorkspaceTypes";
import type { AgentImageRunSettingsModel } from "./agentRunSettings";
import { getRouteTierCredits } from "./agentRunSettings";
import {
  getCanvasAgentBusyHint,
  shouldDisableCanvasAgentComposer,
  type CanvasAgentWorkspaceState,
} from "./canvasAgentStateMachine";

const PROMPT_PLACEHOLDER = "描述你想完成的创作任务，或继续刚才的结果...";

function findDefaultModel(models: AgentImageRunSettingsModel[]) {
  return models[0] ?? null;
}

function findDefaultRoute(model: AgentImageRunSettingsModel | null) {
  if (!model) return null;
  if (model.defaultRouteKey) {
    return model.routes.find((route) => route.routeKey === model.defaultRouteKey) ?? model.routes[0] ?? null;
  }
  return model.routes[0] ?? null;
}

function normalizeArtifactRefs(referenceRefs?: CanvasAgentArtifactRefChip[]): AgentReferenceChip[] {
  return (referenceRefs ?? []).map((ref) => ({
    id: `artifact-${ref.refId}`,
    kind: "artifact" as const,
    label: ref.label,
    refId: ref.refId,
  }));
}

export function CanvasAgentComposer(props: {
  disabled?: boolean;
  draftValue?: string;
  estimatedCreditsOverride?: number | null;
  models?: AgentImageRunSettingsModel[];
  onChangeDraft?: (value: string) => void;
  onRemoveReference?: (chip: AgentReferenceChip) => void;
  onSend: (prompt: string) => Promise<void> | void;
  onUploadError?: (message: string) => void;
  onUploadReferences?: (chips: AgentReferenceChip[]) => void;
  projectId?: string | null;
  referenceChips?: AgentReferenceChip[];
  referenceRefs?: CanvasAgentArtifactRefChip[];
  workspaceState?: CanvasAgentWorkspaceState;
}) {
  const [internalValue, setInternalValue] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [selectedModelKey, setSelectedModelKey] = useState<string | null>(props.models?.[0]?.modelKey ?? null);
  const [selectedRouteKey, setSelectedRouteKey] = useState<string | null>(
    findDefaultRoute(findDefaultModel(props.models ?? []))?.routeKey ?? null,
  );
  const [selectedSize, setSelectedSize] = useState<"1K" | "2K" | "4K">("1K");
  const value = props.draftValue ?? internalValue;

  const availableModels = props.models ?? [];
  const activeModel = useMemo(
    () => availableModels.find((model) => model.modelKey === selectedModelKey) ?? availableModels[0] ?? null,
    [availableModels, selectedModelKey],
  );
  const activeRoute = useMemo(
    () => activeModel?.routes.find((route) => route.routeKey === selectedRouteKey) ?? findDefaultRoute(activeModel),
    [activeModel, selectedRouteKey],
  );
  const estimatedCredits = props.estimatedCreditsOverride ?? getRouteTierCredits(activeRoute, selectedSize);
  const disabled =
    props.disabled ?? (props.workspaceState ? shouldDisableCanvasAgentComposer(props.workspaceState) : false);
  const busyHint = props.workspaceState ? getCanvasAgentBusyHint(props.workspaceState) : null;

  const mergedReferenceChips = useMemo(() => {
    const base = props.referenceChips ?? [];
    const artifacts = normalizeArtifactRefs(props.referenceRefs);
    return [...base, ...artifacts];
  }, [props.referenceChips, props.referenceRefs]);

  const updateValue = (nextValue: string) => {
    props.onChangeDraft?.(nextValue);
    if (props.draftValue === undefined) {
      setInternalValue(nextValue);
    }
  };

  const insertReference = (refId: string) => {
    const nextValue = value.trim().length > 0 ? `${value.trim()} ${refId}` : refId;
    updateValue(nextValue);
  };

  const handleSend = async () => {
    const prompt = value.trim();
    if (!prompt || disabled) return;
    updateValue("");
    await props.onSend(prompt);
  };

  return (
    <div
      data-testid="agent-composer-dock"
      style={{
        background: "rgba(10,10,15,0.96)",
        borderTop: "1px solid rgba(255,255,255,0.08)",
        display: "grid",
        gap: 10,
        padding: 14,
      }}
    >
      {mergedReferenceChips.length > 0 ? (
        <div data-testid="agent-composer-reference-strip">
          <CanvasAgentReferenceChips
            chips={mergedReferenceChips}
            disabled={disabled}
            onInsertRef={(chip) => {
              if (chip.refId) insertReference(chip.refId);
            }}
            onRemoveRef={props.onRemoveReference}
            removableKinds={["upload"]}
          />
        </div>
      ) : null}

      <textarea
        aria-label="Agent prompt"
        disabled={disabled}
        onChange={(event) => updateValue(event.target.value)}
        placeholder={PROMPT_PLACEHOLDER}
        rows={4}
        style={{
          background: "rgba(255,255,255,0.045)",
          border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: 16,
          color: "#f8fafc",
          fontSize: 14,
          lineHeight: 1.5,
          minHeight: 112,
          outline: "none",
          padding: "12px 14px",
          resize: "none",
          width: "100%",
        }}
        value={value}
      />

      <div style={{ alignItems: "center", display: "flex", gap: 8, justifyContent: "space-between" }}>
        <div style={{ display: "grid", gap: 4, minWidth: 0 }}>
          <div style={{ color: "rgba(226,232,240,0.62)", fontSize: 12, lineHeight: 1.25 }}>
            {busyHint ?? "Tell Agent what to change on the canvas."}
          </div>
          {activeModel && activeRoute ? (
            <div style={{ color: "#f8fafc", fontSize: 12, fontWeight: 700, lineHeight: 1.25 }}>
              {activeModel.displayName} · {selectedSize} · Estimated credits {estimatedCredits}
            </div>
          ) : null}
        </div>

        {availableModels.length > 0 ? (
          <button
            aria-label={settingsOpen ? "Collapse model settings" : "Expand model settings"}
            onClick={() => setSettingsOpen((open) => !open)}
            style={compactButtonStyle()}
            type="button"
          >
            Model
          </button>
        ) : null}

        <CanvasAgentReferenceUploadButton
          disabled={disabled || !props.onUploadReferences}
          existingCount={mergedReferenceChips.length}
          onError={props.onUploadError}
          onUploaded={(chips) => props.onUploadReferences?.(chips)}
          projectId={props.projectId}
        />

        <button
          disabled={disabled || !value.trim()}
          onClick={() => {
            void handleSend();
          }}
          style={{
            background: disabled || !value.trim() ? "rgba(255,255,255,0.08)" : "#f8fafc",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 18,
            color: disabled || !value.trim() ? "rgba(248,250,252,0.55)" : "#09090f",
            cursor: disabled || !value.trim() ? "not-allowed" : "pointer",
            fontSize: 13,
            fontWeight: 800,
            height: 36,
            minWidth: 76,
          }}
          type="button"
        >
          发送
        </button>
      </div>

      {settingsOpen && activeModel ? (
        <div
          data-testid="agent-composer-settings-panel"
          style={{
            background: "rgba(255,255,255,0.035)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 14,
            display: "grid",
            gap: 10,
            padding: 10,
          }}
        >
          <CanvasAgentModelRoutePicker
            models={availableModels}
            onSelectModel={(modelKey) => {
              setSelectedModelKey(modelKey);
              const nextModel = availableModels.find((model) => model.modelKey === modelKey) ?? null;
              setSelectedRouteKey(findDefaultRoute(nextModel)?.routeKey ?? null);
            }}
            onSelectRoute={setSelectedRouteKey}
            routeKey={selectedRouteKey}
            selectedModelKey={selectedModelKey}
          />
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {activeModel.sizes.map((size) => {
              const active = size === selectedSize;
              return (
                <button
                  aria-label={size}
                  key={size}
                  onClick={() => setSelectedSize(size)}
                  style={{
                    background: active ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.04)",
                    border: `1px solid ${active ? "rgba(255,255,255,0.18)" : "rgba(255,255,255,0.08)"}`,
                    borderRadius: 12,
                    color: "#f8fafc",
                    cursor: "pointer",
                    fontSize: 12,
                    fontWeight: 700,
                    minHeight: 32,
                    padding: "0 10px",
                  }}
                  type="button"
                >
                  {size}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function compactButtonStyle(): React.CSSProperties {
  return {
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 17,
    color: "#f8fafc",
    cursor: "pointer",
    flex: "0 0 auto",
    fontSize: 12,
    fontWeight: 800,
    height: 34,
    padding: "0 10px",
  };
}

export function buildComposerArtifactRefs(
  refs: Array<{
    assetId: string;
    label: string;
    refId: string;
  }>,
) {
  return buildAgentArtifactRefChips(refs);
}
