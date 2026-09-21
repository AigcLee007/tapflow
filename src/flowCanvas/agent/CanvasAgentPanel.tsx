import React from "react";

import { getAgentImageRunSettings } from "./canvasAgentApi";
import { buildAgentReferenceContext, AGENT_REFERENCE_LIMIT } from "./agentReferenceContext";
import type { CanvasAgentPlannerOutput } from "./canvasAgentTypes";
import { useAgentRuntime } from "./runtime/useAgentRuntime";
import { agentV6Api } from "./v6/orchestration/agentV6Api";
import type { AgentBlockAction } from "./v6/protocol/BlockRenderer";
import type { AgentV6Phase } from "./v6/protocol/conversationTypes";
import { AgentWorkspace } from "./v6/workspace/AgentWorkspace";
import type { AgentReferenceChip } from "./v6/workspace/AgentReferenceChips";
import { applyServerDraftToCanvas } from "./canvasAgentOps";
import { getFlowDraft } from "../services/flowProjectApi";
import { useFlowCanvasStore } from "../store/flowCanvasStore";
import { uploadAssetFile } from "../../assets/assetApi";
import type { AgentReferenceRole } from "./runtime/agentProtocol";

type CanvasAgentPanelProps = {
  initialSessionId?: string | null;
  onClose: () => void;
  onConfirmPlan: (plan: CanvasAgentPlannerOutput) => Promise<unknown>;
  onCreateOnlyPlan?: (plan: CanvasAgentPlannerOutput) => Promise<unknown>;
  onServerDraftApplied?: () => void | Promise<void>;
  open: boolean;
};

function selectedReferenceChips(): AgentReferenceChip[] {
  let imageIndex = 0;
  return useFlowCanvasStore.getState().nodes.filter((node) => node.selected).map((node) => {
    const assetId = typeof node.data.assetId === "string" ? node.data.assetId : undefined;
    if (node.data.kind === "image") imageIndex += 1;
    return {
      id: node.id,
      kind: "canvas_node" as const,
      label: node.data.kind === "image" ? `选中图片 ${imageIndex}` : "选中画布内容",
      nodeId: node.id,
      ...(assetId ? { assetId, refId: `canvas-${imageIndex || node.id}` } : { refId: `canvas-${node.id}` }),
    };
  });
}

function toPhase(value: string): AgentV6Phase {
  const phases: AgentV6Phase[] = ["idle", "understanding", "waiting_for_input", "waiting_for_choice", "drafting_brief", "waiting_for_confirmation", "executing", "verifying", "presenting_results", "refining", "failed", "recoverable_error"];
  return phases.includes(value as AgentV6Phase) ? value as AgentV6Phase : "understanding";
}

/** The default Agent entry only uses the neutral canonical Runtime controller. */
export function CanvasAgentPanel(props: CanvasAgentPanelProps) {
  const runtime = useAgentRuntime();
  const backendFlowId = useFlowCanvasStore((state) => state.backendFlowId);
  const backendProjectId = useFlowCanvasStore((state) => state.backendProjectId);
  const selectedKey = useFlowCanvasStore((state) => state.nodes.filter((node) => node.selected).map((node) => `${node.id}:${node.data.assetId ?? ""}`).join(","));
  const [prompt, setPrompt] = React.useState("");
  const [models, setModels] = React.useState<Array<{ displayName: string; modelKey: string }>>([]);
  const [model, setModel] = React.useState("");
  const [modelLocked, setModelLocked] = React.useState(false);
  const [history, setHistory] = React.useState<Array<{ id: string; title: string; date: string; updatedAt?: string }>>([]);
  const [resultReferences, setResultReferences] = React.useState<AgentReferenceChip[]>([]);
  const [canvasReferences, setCanvasReferences] = React.useState<AgentReferenceChip[]>([]);
  const [referenceRoles, setReferenceRoles] = React.useState<Record<string, AgentReferenceRole | undefined>>({});
  const [removedReferenceIds, setRemovedReferenceIds] = React.useState<Set<string>>(() => new Set());
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);
  const references = React.useMemo(() => {
    const selected = selectedReferenceChips().filter((reference) => !removedReferenceIds.has(reference.id));
    const all = [...selected, ...canvasReferences, ...resultReferences];
    const seen = new Set<string>();
    return all.flatMap((reference) => {
      if (seen.has(reference.id)) return [];
      seen.add(reference.id);
      return [{ ...reference, ...(referenceRoles[reference.id] ? { role: referenceRoles[reference.id] } : {}) }];
    }).slice(0, AGENT_REFERENCE_LIMIT);
  }, [canvasReferences, referenceRoles, removedReferenceIds, resultReferences, selectedKey]);

  const addUploadedFiles = React.useCallback(async (files: FileList | null) => {
    const selected = Array.from(files ?? []).filter((file) => file.type.startsWith("image/"));
    if (!selected.length) return;
    try {
      const uploaded = await Promise.all(selected.map((file) => uploadAssetFile({ file, kind: "image", projectId: backendProjectId ?? null })));
      setResultReferences((current) => [...current, ...uploaded.map((asset, index) => ({
        id: `upload-${asset.id}`,
        kind: "upload" as const,
        label: asset.originalFilename || `上传图片 ${index + 1}`,
        assetId: asset.id,
        refId: `upload-${asset.id}`,
      }))].slice(0, AGENT_REFERENCE_LIMIT));
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }, [backendProjectId]);

  React.useEffect(() => {
    if (!props.open) return;
    void getAgentImageRunSettings().then(({ models: next }) => {
      setModels(next);
      setModel((current) => current || next[0]?.modelKey || "");
    }).catch(() => setModels([]));
  }, [props.open]);

  React.useEffect(() => {
    if (!props.open) return;
    const scope = { projectId: backendProjectId ?? null, flowId: backendFlowId ?? null, graphRevision: useFlowCanvasStore.getState().version };
    void agentV6Api.listSessions(scope).then((sessions) => setHistory(sessions.map((item) => ({
      id: item.id,
      title: item.title,
      date: item.updatedAt?.slice(0, 10) ?? new Date().toISOString().slice(0, 10),
      updatedAt: item.updatedAt,
    })))).catch(() => setHistory([]));
  }, [backendFlowId, backendProjectId, props.open, runtime.sessionId]);

  React.useEffect(() => {
    if (props.open && props.initialSessionId) void runtime.openSession(props.initialSessionId);
  }, [props.initialSessionId, props.open, runtime.openSession]);

  const modelOptions = React.useMemo(() => models.map((item) => ({ label: item.displayName, value: item.modelKey })), [models]);
  const handleBlockAction = React.useCallback((action: AgentBlockAction) => {
    if (action.type === "answer_question") {
      void runtime.submitDecision({ type: "answer_question", questionId: action.blockId, answer: action.value });
    } else if (action.type === "edit_brief") {
      // The Brief component enters local edit mode; values are sent on submit.
      return;
    } else if (action.type === "submit_brief") {
      void runtime.submitDecision({ type: "edit_brief", fields: action.fields });
    } else if (action.type === "select_choice") {
      const answer = action.optionIds.length > 1 ? action.optionIds : (action.optionIds[0] ?? "");
      if (action.blockId === "recovery") void runtime.submitDecision(answer === "retry" ? { type: "retry_execution" } : { type: "revise_plan", instruction: "修改计划" });
      else void runtime.submitDecision({ type: "answer_question", questionId: action.blockId, answer });
    } else if (action.type === "confirm_execution") {
      void runtime.submitDecision({ type: "approve_plan" });
    } else if (action.type === "cancel_progress") {
      void runtime.submitDecision({ type: "cancel_execution" });
    } else if (action.type === "retry_progress" || action.type === "recover_progress") {
      void runtime.submitDecision({ type: "retry_execution" });
    } else if (action.type === "revise_plan" || action.type === "revise_brief" || action.type === "revise_progress") {
      void runtime.submitDecision({ type: "revise_plan", instruction: "修改计划" });
    } else if (action.type === "refine_result" || action.type === "variant_result") {
      void runtime.submitDecision({ type: "result_action", action: action.type === "variant_result" ? "variant" : "edit", resultIds: [action.resultId] });
    } else if (action.type === "place_result") {
      void runtime.submitDecision({ type: "result_action", action: "place", resultIds: [action.resultId] }).then(async () => {
        const flowId = useFlowCanvasStore.getState().backendFlowId;
        if (!flowId) return;
        const draft = await getFlowDraft(flowId);
        applyServerDraftToCanvas({ draft, highlightedNodeIds: [`agent-result-${action.resultId}`] });
        await props.onServerDraftApplied?.();
      }).catch(() => undefined);
    } else if (action.type === "select_result") {
      void runtime.submitDecision({ type: "result_action", action: "select", resultIds: [action.resultId] });
    } else if (action.type === "set_reference") {
      const result = runtime.results.find((item) => item.id === action.resultId);
      if (result?.assetId) setResultReferences((current) => current.some((item) => item.assetId === result.assetId) ? current : [...current, { id: `agent-result-${result.id}`, kind: "artifact", label: result.label, assetId: result.assetId, refId: `agent-result-${result.id}` }].slice(0, AGENT_REFERENCE_LIMIT));
      void runtime.submitDecision({ type: "result_action", action: "reference", resultIds: [action.resultId] });
    }
  }, [props.onServerDraftApplied, runtime]);

  if (!props.open) return null;
  return <>
  <input ref={fileInputRef} type="file" accept="image/*" multiple hidden onChange={(event) => { void addUploadedFiles(event.currentTarget.files); }} />
  <AgentWorkspace
    blocks={runtime.blocks}
    busy={runtime.busy || runtime.phase === "understanding" || runtime.phase === "executing" || runtime.phase === "verifying"}
    error={runtime.error}
    history={history}
    model={model}
    modelOptions={modelOptions}
    onBlockAction={handleBlockAction}
    onCancel={() => { void runtime.submitDecision({ type: "cancel_execution" }); }}
    onCapability={(capability) => {
      if (capability === "upload") fileInputRef.current?.click();
      if (capability === "canvas") setCanvasReferences((current) => [...current, ...selectedReferenceChips()].slice(0, AGENT_REFERENCE_LIMIT));
    }}
    onCollapse={props.onClose}
    onHistorySelect={(sessionId) => { setResultReferences([]); setCanvasReferences([]); setRemovedReferenceIds(new Set()); void runtime.openSession(sessionId); }}
    onModeChange={runtime.setExecutionMode}
    onModelChange={(next) => { if (!modelLocked) setModel(next); }}
    onNewConversation={() => { setResultReferences([]); setCanvasReferences([]); setRemovedReferenceIds(new Set()); setModelLocked(false); runtime.newConversation(); }}
    onPromptChange={setPrompt}
    onRemoveReference={(id) => {
      setRemovedReferenceIds((current) => new Set(current).add(id));
      setResultReferences((current) => current.filter((item) => item.id !== id));
      setCanvasReferences((current) => current.filter((item) => item.id !== id));
    }}
    onRoleChange={(id, role) => setReferenceRoles((current) => ({ ...current, [id]: role }))}
    onRename={() => undefined}
    onSend={async (text) => {
      setPrompt("");
      setModelLocked(true);
      await runtime.submitText(text, { modelKey: model || null, referenceContext: buildAgentReferenceContext({ chips: references }) });
    }}
    phase={toPhase(runtime.phase)}
    prompt={prompt}
    references={references}
    title={runtime.sessionTitle}
  />
  </>;
}
