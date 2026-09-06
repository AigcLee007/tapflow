import React from "react";

import { AGENT_REFERENCE_LIMIT, buildAgentReferenceContext } from "./agentReferenceContext";
import { buildAgentArtifactRefChips } from "./agentArtifactRefs";
import { buildAgentWorkspaceTimeline } from "./agentWorkspaceTimeline";
import { OPEN_AGENT_SESSION_EVENT, type OpenAgentSessionDetail } from "./agentSessionEvents";
import { approveAgentSkillRun, cancelAgentSkillRun, getAgentCapabilities, getAgentImageRunSettings, getAgentSkillRun, listAgentSessions, listAgentSkills, type AgentCapabilities, type AgentSkillPreview, type AgentSkillRun } from "./canvasAgentApi";
import type { CanvasAgentContinuationAction, CanvasAgentToolAssetRef } from "./canvasAgentToolTypes";
import type { CanvasAgentPlannerOutput } from "./canvasAgentTypes";
import { CanvasAgentComposer } from "./CanvasAgentComposer";
import { CanvasAgentConnectionView } from "./CanvasAgentConnectionView";
import { CanvasAgentConversationView } from "./CanvasAgentConversationView";
import { CanvasAgentHistoryView } from "./CanvasAgentHistoryView";
import { CanvasAgentLogView } from "./CanvasAgentLogView";
import { CanvasAgentPlanCard } from "./CanvasAgentPlanCard";
import { CanvasAgentSkillAuthoring } from "./CanvasAgentSkillAuthoring";
import { CanvasAgentSkillDetail } from "./CanvasAgentSkillDetail";
import { CanvasAgentSkillPicker } from "./CanvasAgentSkillPicker";
import { CanvasAgentSkillBar } from "./CanvasAgentSkillBar";
import { CanvasAgentSkillPlan } from "./CanvasAgentSkillPlan";
import type { AgentSkillPlan } from "./canvasAgentSkillTypes";
import type { AgentReferenceChip } from "./CanvasAgentWorkspaceTypes";
import { getCanvasAgentBusyHint, isCanvasAgentBusyState } from "./canvasAgentStateMachine";
import { CanvasAgentWorkspaceShell } from "./CanvasAgentWorkspaceShell";
import { CanvasAgentV4Workspace } from "./CanvasAgentV4Workspace";
import { useAgentConversationHistory } from "./useAgentConversationHistory";
import { useAgentEventStream } from "./useAgentEventStream";
import { useAgentWorkspacePanel } from "./useAgentWorkspacePanel";
import { useCanvasAgentSessionV2 } from "./v2/useCanvasAgentSessionV2";
import { useFlowCanvasStore } from "../store/flowCanvasStore";
import { MenuSelect } from "../../components/menu/MenuSelect";

type ApplyResult = {
  createdNodeIds: string[];
  errors: Array<{ message: string }>;
  ok: boolean;
  ranNodeIds: string[];
};

function buildContinuationPrompt(
  asset: CanvasAgentToolAssetRef,
  action: CanvasAgentContinuationAction,
  assets?: CanvasAgentToolAssetRef[],
) {
  const selectedAssets = assets && assets.length > 0 ? assets : [asset];
  const selectedSummary = selectedAssets.map((item) => item.label).join("、");

  if (action === "continue-edit") {
    return `基于这些结果继续编辑：${selectedSummary}。保留主体和核心构图，按当前目标继续深化。`;
  }
  if (action === "make-variant") {
    return `基于这些结果做高质量变体：${selectedSummary}。保持主题一致，但在细节、镜头和氛围上拉开差异。`;
  }
  if (action === "make-poster") {
    return `把这些结果升级成海报级成品：${selectedSummary}。强化视觉中心、留白、版式和广告感。`;
  }
  return `基于这些结果生成一组对比图：${selectedSummary}。突出不同风格、构图或色彩方案。`;
}

function buildSelectedCanvasReferenceChips(): AgentReferenceChip[] {
  const state = useFlowCanvasStore.getState();
  let imageIndex = 0;
  let textIndex = 0;
  let otherIndex = 0;

  return state.nodes
    .filter((node) => node.selected)
    .map((node) => {
      const kind = node.data.kind;
      let label = "选中素材";

      if (kind === "image") {
        imageIndex += 1;
        label = `选中图片 ${imageIndex}`;
      } else if (kind === "text") {
        textIndex += 1;
        label = `画布文本 ${textIndex}`;
      } else {
        otherIndex += 1;
        label = `选中素材 ${otherIndex}`;
      }

      return {
        assetId: typeof node.data.assetId === "string" ? node.data.assetId : undefined,
        id: node.id,
        kind: "canvas_node",
        label,
        nodeId: node.id,
        refId: kind === "image" && typeof node.data.assetId === "string" ? `canvas-${imageIndex}` : undefined,
      } satisfies AgentReferenceChip;
    });
}

function readRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function readId(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function findSkillRunId(input: {
  pendingApproval: Record<string, unknown> | null;
  toolTimeline: Array<{ result?: unknown; toolName: string }>;
}): string | null {
  const pending = input.pendingApproval;
  if (pending) {
    const pendingName = readId(pending.name);
    const pendingResult = readRecord(pending.result);
    const pendingId = readId(pending.skillRunId) ?? readId(pending.approvalId) ?? readId(pendingResult?.skillRunId) ?? readId(pendingResult?.approvalId);
    if (pendingId && (pendingName === "skill.run" || pendingName?.startsWith("skill."))) return pendingId;
  }

  for (const item of [...input.toolTimeline].reverse()) {
    if (item.toolName !== "skill.run") continue;
    const result = readRecord(item.result);
    const runId = readId(result?.skillRunId) ?? readId(result?.approvalId);
    if (runId) return runId;
  }
  return null;
}

export function CanvasAgentPanel(props: {
  initialSessionId?: string | null;
  onClose: () => void;
  onConfirmPlan: (plan: CanvasAgentPlannerOutput) => Promise<ApplyResult>;
  onCreateOnlyPlan?: (plan: CanvasAgentPlannerOutput) => Promise<ApplyResult>;
  onServerDraftApplied?: () => void | Promise<void>;
  open: boolean;
}) {
  const [serverCapabilities, setServerCapabilities] = React.useState<AgentCapabilities | null>(null);
  const sessionActions = useCanvasAgentSessionV2({
    onServerDraftApplied: props.onServerDraftApplied,
    v2Enabled: import.meta.env.VITE_AGENT_V2_ENABLED === "true"
      && serverCapabilities?.agentV2Enabled === true
      && serverCapabilities.agentV2RuntimeEnabled === true,
  });
  const workspace = useAgentWorkspacePanel();
  const [composerDraft, setComposerDraft] = React.useState("");
  const [v4ResetKey, setV4ResetKey] = React.useState(0);
  const [uploadedReferences, setUploadedReferences] = React.useState<AgentReferenceChip[]>([]);
  const [uploadError, setUploadError] = React.useState<string | null>(null);
  const backendFlowId = useFlowCanvasStore((state) => state.backendFlowId);
  const backendProjectId = useFlowCanvasStore((state) => state.backendProjectId);
  const selectedReferenceKey = useFlowCanvasStore((state) =>
    JSON.stringify(
      state.nodes
        .filter((node) => node.selected)
        .map((node) => ({
          assetId: typeof node.data.assetId === "string" ? node.data.assetId : null,
          id: node.id,
          kind: node.data.kind,
        })),
    ),
  );
  const history = useAgentConversationHistory(sessionActions.sessionId);
  const eventStream = useAgentEventStream(sessionActions.sessionId);
  const [availableModels, setAvailableModels] = React.useState<ReturnType<typeof getEmptyModels>>([]);
  const [availableSkills, setAvailableSkills] = React.useState<AgentSkillPreview[]>([]);
  const [selectedSkillId, setSelectedSkillId] = React.useState<string | null>(null);
  const [skillModality, setSkillModality] = React.useState<"" | AgentSkillPreview["modality"]>("");
  const [skillQuery, setSkillQuery] = React.useState("");
  const [skillScope, setSkillScope] = React.useState<"available" | "mine">("available");
  const [skillView, setSkillView] = React.useState<"picker" | "detail" | "authoring">("picker");
  const [skillRefreshToken, setSkillRefreshToken] = React.useState(0);
  const [skillPickerOpen, setSkillPickerOpen] = React.useState(false);
  const [skillListLoading, setSkillListLoading] = React.useState(false);
  const [skillListError, setSkillListError] = React.useState<string | null>(null);
  const [sessionList, setSessionList] = React.useState<Array<{
    createdAt: string;
    flowId: string | null;
    id: string;
    projectId: string | null;
    status?: string;
    title: string;
    updatedAt?: string;
  }>>([]);
  const autoOpenLatestSessionRef = React.useRef(true);
  const sessionScopeRef = React.useRef<string | null>(null);
  const replayHydratedSessionIdRef = React.useRef<string | null>(null);

  const skillUiEnabled = import.meta.env.VITE_AGENT_SKILLS_ENABLED === "true"
    && serverCapabilities?.skillsEnabled === true
    && serverCapabilities.skillRuntimeEnabled === true;
  const skillAuthoringUiEnabled = skillUiEnabled
    && import.meta.env.VITE_AGENT_SKILL_AUTHORING_ENABLED === "true"
    && serverCapabilities?.skillAuthoringEnabled === true;

  React.useEffect(() => {
    setSelectedSkillId(sessionActions.selectedSkill?.id ?? null);
  }, [sessionActions.selectedSkill]);

  const busy = isCanvasAgentBusyState(sessionActions.workspaceState);
  const activeContinuation = sessionActions.pendingContinuation ?? sessionActions.lastContinuation;

  const skillRunId = React.useMemo(
    () => findSkillRunId({ pendingApproval: sessionActions.pendingApproval, toolTimeline: sessionActions.toolTimeline }),
    [sessionActions.pendingApproval, sessionActions.toolTimeline],
  );
  const [skillRun, setSkillRun] = React.useState<AgentSkillRun | null>(null);
  const [skillRunError, setSkillRunError] = React.useState<string | null>(null);

  const refreshSkillRun = React.useCallback(async (runId: string) => {
    try {
      const next = await getAgentSkillRun(runId);
      setSkillRun(next);
      setSkillRunError(null);
    } catch (error) {
      setSkillRun(null);
      setSkillRunError(error instanceof Error ? error.message : "Skill 执行状态暂不可用");
    }
  }, []);

  React.useEffect(() => {
    if (!skillRunId) {
      setSkillRun(null);
      setSkillRunError(null);
      return;
    }
    void refreshSkillRun(skillRunId);
  }, [refreshSkillRun, skillRunId]);

  const skillPlan: AgentSkillPlan | null = skillRun;

  React.useEffect(() => {
    void getAgentCapabilities().then(setServerCapabilities).catch(() => setServerCapabilities(null));
  }, []);

  React.useEffect(() => {
    const scopeKey = `${backendProjectId ?? ""}:${backendFlowId ?? ""}`;
    if (sessionScopeRef.current !== scopeKey) {
      sessionScopeRef.current = scopeKey;
      autoOpenLatestSessionRef.current = true;
    }
  }, [backendFlowId, backendProjectId]);

  React.useEffect(() => {
    if (props.initialSessionId) {
      autoOpenLatestSessionRef.current = false;
      sessionActions.setSessionId?.(props.initialSessionId);
    }
  }, [props.initialSessionId, sessionActions.setSessionId]);

  React.useEffect(() => {
    void listAgentSessions({
      flowId: backendFlowId,
      limit: 10,
      projectId: backendProjectId,
    })
      .then((sessions) => {
        setSessionList(sessions);
        if (!sessionActions.sessionId && autoOpenLatestSessionRef.current && sessions[0]) {
          autoOpenLatestSessionRef.current = false;
          sessionActions.setSessionId?.(sessions[0].id);
        }
      })
      .catch(() => setSessionList([]));
  }, [backendFlowId, backendProjectId, sessionActions.sessionId, sessionActions.setSessionId]);

  React.useEffect(() => {
    void getAgentImageRunSettings()
      .then((response) => {
        setAvailableModels(response.models);
      })
      .catch(() => setAvailableModels([]));
  }, []);

  React.useEffect(() => {
    if (!skillPickerOpen || !skillUiEnabled) return;
    setSkillListLoading(true);
    setSkillListError(null);
    const timer = window.setTimeout(() => {
      void listAgentSkills({ modality: skillModality || undefined, q: skillQuery || undefined, scope: skillScope })
        .then((skills) => { setAvailableSkills(skills); setSkillListError(null); })
        .catch(() => { setAvailableSkills([]); setSkillListError("Skill 暂不可用"); })
        .finally(() => setSkillListLoading(false));
    }, 160);
    return () => window.clearTimeout(timer);
  }, [skillModality, skillQuery, skillScope, skillRefreshToken, skillPickerOpen, skillUiEnabled]);

  React.useEffect(() => {
    if (!sessionActions.sessionId) return;
    void history.refresh();
    void eventStream.connect().catch(() => {});
  }, [eventStream.connect, history.refresh, sessionActions.sessionId]);

  React.useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const handleOpen = (event: Event) => {
      const detail = (event as CustomEvent<OpenAgentSessionDetail>).detail;
      if (!detail?.sessionId) return;
      autoOpenLatestSessionRef.current = false;
      sessionActions.setSessionId?.(detail.sessionId);
    };

    window.addEventListener(OPEN_AGENT_SESSION_EVENT, handleOpen as EventListener);
    return () => window.removeEventListener(OPEN_AGENT_SESSION_EVENT, handleOpen as EventListener);
  }, [sessionActions.setSessionId]);

  React.useEffect(() => {
    if (!sessionActions.sessionId) return;
    if (eventStream.events.length === 0) return;
    if (replayHydratedSessionIdRef.current === sessionActions.sessionId) return;
    sessionActions.hydrateReplayEvents(eventStream.events);
    replayHydratedSessionIdRef.current = sessionActions.sessionId;
  }, [eventStream.events, sessionActions.hydrateReplayEvents, sessionActions.sessionId]);

  React.useEffect(() => {
    if (replayHydratedSessionIdRef.current && replayHydratedSessionIdRef.current !== sessionActions.sessionId) {
      replayHydratedSessionIdRef.current = null;
    }
  }, [sessionActions.sessionId]);

  const selectedReferenceChips = React.useMemo(() => buildSelectedCanvasReferenceChips(), [selectedReferenceKey]);

  const continuationChips = React.useMemo(() => {
    if (!activeContinuation) return [];

    const refs = (
      activeContinuation.assetRefIds?.length ? activeContinuation.assetRefIds : [activeContinuation.assetRefId]
    ).map((refId, index) => ({
      assetId: activeContinuation.assetIds?.[index] ?? activeContinuation.assetId,
      label: activeContinuation.assetLabels?.[index] ?? activeContinuation.assetLabel,
      refId,
    }));

    const artifactChips = buildAgentArtifactRefChips(refs);
    return artifactChips.map((ref, index) => ({
      assetId: refs[index]?.assetId,
      id: `continuation-${ref.refId}-${index}`,
      kind: "artifact" as const,
      label: `上一轮结果 ${index + 1}`,
      refId: ref.refId,
    }));
  }, [activeContinuation]);

  const composerReferenceChips = React.useMemo(
    () => [...selectedReferenceChips, ...continuationChips, ...uploadedReferences],
    [continuationChips, selectedReferenceChips, uploadedReferences],
  );

  const timelineItems = React.useMemo(
    () =>
      buildAgentWorkspaceTimeline({
        activityItems: sessionActions.activityTimeline ?? [],
        currentPlanOps: sessionActions.currentPlan?.proposedOps,
        error: sessionActions.error,
        messages:
          history.messages.length > 0
            ? history.messages.map((message) => ({
                content: message.content,
                id: message.id,
                metadata: message.metadata,
                role: message.role,
              }))
            : sessionActions.messages,
        toolItems: sessionActions.toolTimeline,
        workspaceState: sessionActions.workspaceState,
      }),
    [
      history.messages,
      sessionActions.activityTimeline,
      sessionActions.currentPlan,
      sessionActions.error,
      sessionActions.messages,
      sessionActions.toolTimeline,
      sessionActions.workspaceState,
    ],
  );

  const modelOptions = React.useMemo(() => {
    const map = new Map<string, (typeof sessionActions.toolTimeline)[number]["estimate"]["imageRunSettings"][number]>();

    for (const model of availableModels) {
      map.set(model.modelKey, model);
    }

    for (const item of sessionActions.toolTimeline) {
      const settings = item.estimate?.imageRunSettings ?? [];
      for (const model of settings) {
        if (!map.has(model.modelKey)) {
          map.set(model.modelKey, model);
        }
      }
    }

    return Array.from(map.values());
  }, [availableModels, sessionActions.toolTimeline]);

  if (!props.open) return null;

  return (
    <CanvasAgentWorkspaceShell
      activeTab={workspace.activeTab}
      busy={busy}
      onChangeTab={workspace.setActiveTab}
      onCollapse={props.onClose}
      onNewChat={() => {
        autoOpenLatestSessionRef.current = false;
        replayHydratedSessionIdRef.current = null;
        sessionActions.resetSession?.();
        setV4ResetKey((value) => value + 1);
        setUploadedReferences([]);
        setUploadError(null);
        setComposerDraft("");
        workspace.setActiveTab("chat");
      }}
      workspaceState={sessionActions.workspaceState}
      width={workspace.width}
    >
      {workspace.activeTab === "chat" ? (
        <div
          data-testid="agent-panel-conversation"
          style={{ display: "grid", gridTemplateRows: "1fr auto auto", height: "100%", minHeight: 0 }}
        >
          <CanvasAgentV4Workspace
            key={v4ResetKey}
            onExecute={async (brief) => {
              const referenceContext = buildAgentReferenceContext({
                chips: composerReferenceChips,
                continuationContext: activeContinuation,
              });
              await sessionActions.sendPrompt(brief, { referenceContext });
            }}
          >
          <CanvasAgentConversationView
            busy={busy}
            busyLabel={getCanvasAgentBusyHint(sessionActions.workspaceState)}
            items={timelineItems}
            onApprove={sessionActions.approveToolCall}
            onCancel={sessionActions.cancelToolCall}
            onContinueFromAsset={(asset, action, assets) => {
              const selectedAssets = assets && assets.length > 0 ? assets : [asset];
              const continuation = {
                action,
                assetId: asset.assetId,
                assetIds: selectedAssets.map((item) => item.assetId),
                assetLabel: asset.label,
                assetLabels: selectedAssets.map((item) => item.label),
                assetRefId: asset.refId,
                assetRefIds: selectedAssets.map((item) => item.refId),
              };
              setComposerDraft(buildContinuationPrompt(asset, action, selectedAssets));
              sessionActions.setPendingContinuation?.(continuation);
            }}
            onPlaceAssets={sessionActions.placeToolAssetsOnCanvas}
            onRetryTool={() => {
              void sessionActions.retryLastPrompt?.();
            }}
            onViewRun={(workflowRunId) => {
              workspace.setSelectedRunId(workflowRunId);
              workspace.setActiveTab("logs");
            }}
          />

          {skillPlan ? (
            <div style={{ padding: "0 16px 12px" }}>
              <CanvasAgentSkillPlan
                onApprove={async () => {
                  if (!skillRunId || !sessionActions.sessionId) return;
                  try {
                    const response = await approveAgentSkillRun(sessionActions.sessionId, skillRunId);
                    if (!response.ok) throw new Error(`Skill 批准失败（${response.status}）`);
                    await refreshSkillRun(skillRunId);
                  } catch (error) {
                    setSkillRunError(error instanceof Error ? error.message : "Skill 批准失败");
                  }
                }}
                onCancel={async () => {
                  if (!skillRunId || !sessionActions.sessionId) return;
                  try {
                    await cancelAgentSkillRun(sessionActions.sessionId, skillRunId, "用户取消 Skill 执行");
                    await refreshSkillRun(skillRunId);
                  } catch (error) {
                    setSkillRunError(error instanceof Error ? error.message : "Skill 取消失败");
                  }
                }}
                plan={skillPlan}
              />
              {skillRunError ? <div role="alert" style={{ color: "#fca5a5", fontSize: 11, paddingTop: 6 }}>{skillRunError}</div> : null}
            </div>
          ) : skillRunId && skillRunError ? (
            <div role="alert" style={{ color: "#fca5a5", fontSize: 11, padding: "0 16px 12px" }}>{skillRunError}</div>
          ) : sessionActions.currentPlan ? (
            <div style={{ padding: "0 16px 12px" }}>
              <CanvasAgentPlanCard
                busy={busy}
                onCancel={sessionActions.cancelCurrentPlan}
                onConfirm={() => {
                  void sessionActions.executeCurrentPlan(props.onConfirmPlan);
                }}
                onCreateOnly={
                  props.onCreateOnlyPlan
                    ? () => {
                        void sessionActions.executeCurrentPlan(props.onCreateOnlyPlan, { omitRunNode: true });
                      }
                    : undefined
                }
                plan={sessionActions.currentPlan}
              />
            </div>
          ) : null}

          {activeContinuation ? (
            <div style={{ padding: "0 16px 12px" }}>
              <section
                style={{
                  background: "rgba(56,189,248,0.08)",
                  border: "1px solid rgba(56,189,248,0.2)",
                  borderRadius: 16,
                  display: "grid",
                  gap: 6,
                  padding: 12,
                }}
              >
                <div style={{ color: "#bae6fd", fontSize: 12, fontWeight: 800 }}>建议下一步</div>
                <div style={{ color: "#e0f2fe", fontSize: 12, lineHeight: 1.6 }}>
                  可以直接继续发送，沿用这组历史结果做下一步生产，不需要重新选择参考结果。
                </div>
              </section>
            </div>
          ) : null}

          {uploadError ? (
            <div role="alert" style={{ color: "#fecaca", fontSize: 12, padding: "0 16px 8px" }}>
              {uploadError}
            </div>
          ) : null}

          <CanvasAgentSkillBar
            enabled={skillUiEnabled}
            onClear={() => { setSelectedSkillId(null); sessionActions.selectSkill(null); }}
            onOpenPicker={() => setSkillPickerOpen((open) => !open)}
            onRetry={() => { void getAgentCapabilities().then(setServerCapabilities).catch(() => setServerCapabilities(null)); }}
            selectedSkill={availableSkills.find((skill) => skill.id === selectedSkillId) ?? null}
            unavailableReason={!skillUiEnabled && skillPickerOpen ? "Skill 暂不可用" : undefined}
          />

          {skillPickerOpen ? (
            <div style={{ display: "grid", gap: 7, padding: "0 16px 10px" }}>
              {!skillUiEnabled ? <div role="status" style={{ color: "#fbbf24", fontSize: 11, padding: "8px 2px" }}>当前运行环境未启用 Skill</div> : null}
              {skillUiEnabled ? <>
              {skillView === "picker" ? <>
                <div style={{ display: "grid", gap: 6, gridTemplateColumns: "1fr 1fr" }}>
                  <MenuSelect fullWidth label="技能来源" onChange={(value) => setSkillScope(value === "mine" ? "mine" : "available")} options={[{ label: "技能库", value: "available" }, { label: "我的技能", value: "mine" }]} size="compact" value={skillScope} />
                  <MenuSelect fullWidth label="类型" onChange={(value) => setSkillModality(value as "" | AgentSkillPreview["modality"])} options={[{ label: "全部", value: "" }, { label: "文本", value: "text" }, { label: "图片", value: "image" }, { label: "视频", value: "video" }]} size="compact" value={skillModality} />
                </div>
                <input aria-label="搜索技能" onChange={(event) => setSkillQuery(event.target.value)} placeholder="搜索技能" style={{ background: "rgba(15,23,42,0.54)", border: "1px solid rgba(148,163,184,0.18)", borderRadius: 8, color: "#e2e8f0", fontSize: 12, height: 34, outline: "none", padding: "0 10px", width: "100%" }} value={skillQuery} />
                <CanvasAgentSkillPicker canCreate={skillAuthoringUiEnabled} loading={skillListLoading} onClose={() => setSkillPickerOpen(false)} onCreate={() => setSkillView("authoring")} onOpenDetail={(skill) => { setSelectedSkillId(skill.id); setSkillView("detail"); }} onRetry={() => setSkillRefreshToken((value) => value + 1)} onSelect={(skill) => { setSelectedSkillId(skill.id); sessionActions.selectSkill(skill); setSkillPickerOpen(false); }} selectedId={selectedSkillId} skills={availableSkills} unavailableReason={skillListError ?? undefined} />
              </> : null}
              {skillView === "detail" && selectedSkillId ? (() => {
                const selected = availableSkills.find((skill) => skill.id === selectedSkillId);
                return selected ? <CanvasAgentSkillDetail onBack={() => setSkillView("picker")} onSaved={() => { setSkillRefreshToken((value) => value + 1); setSkillView("picker"); }} skill={selected} /> : null;
              })() : null}
              {skillView === "authoring" && skillAuthoringUiEnabled ? <CanvasAgentSkillAuthoring onBack={() => setSkillView("picker")} onCreated={() => { setSkillRefreshToken((value) => value + 1); setSkillView("picker"); }} /> : null}
              </> : null}
            </div>
          ) : null}
          <CanvasAgentComposer
            draftValue={composerDraft}
            models={modelOptions}
            onChangeDraft={setComposerDraft}
            onRemoveReference={(chip) => {
              setUploadedReferences((refs) => refs.filter((item) => item.id !== chip.id));
            }}
            onSend={async (prompt) => {
              setComposerDraft("");
              const referenceContext = buildAgentReferenceContext({
                chips: composerReferenceChips,
                continuationContext: activeContinuation,
              });
              await sessionActions.sendPrompt(prompt, { referenceContext });
              setUploadedReferences([]);
            }}
            onUploadError={setUploadError}
            onUploadReferences={(chips) => {
              setUploadError(null);
              setUploadedReferences((refs) => [...refs, ...chips].slice(0, AGENT_REFERENCE_LIMIT));
            }}
            projectId={backendProjectId}
            referenceChips={composerReferenceChips}
            workspaceState={sessionActions.workspaceState}
          />
          </CanvasAgentV4Workspace>
        </div>
      ) : null}

      {workspace.activeTab === "history" ? (
        <CanvasAgentHistoryView
          activeSessionId={sessionActions.sessionId}
          onNewChat={() => {
            sessionActions.setSessionId?.(null);
            sessionActions.clearContinuation?.();
            setUploadedReferences([]);
            setUploadError(null);
            setComposerDraft("");
            workspace.setActiveTab("chat");
          }}
          onOpenSession={(sessionId) => {
            sessionActions.setSessionId?.(sessionId);
            workspace.setActiveTab("chat");
          }}
          sessions={sessionList}
        />
      ) : null}

      {workspace.activeTab === "connections" ? <CanvasAgentConnectionView models={modelOptions} /> : null}

      {workspace.activeTab === "logs" ? (
        <CanvasAgentLogView activityItems={sessionActions.activityTimeline ?? []} error={sessionActions.error} selectedRunId={workspace.selectedRunId} />
      ) : null}
    </CanvasAgentWorkspaceShell>
  );
}

function getEmptyModels() {
  return [] as Awaited<ReturnType<typeof getAgentImageRunSettings>>["models"];
}
