import React from "react";

import { buildAgentArtifactRefChips } from "./agentArtifactRefs";
import { buildAgentWorkspaceTimeline } from "./agentWorkspaceTimeline";
import { OPEN_AGENT_SESSION_EVENT, type OpenAgentSessionDetail } from "./agentSessionEvents";
import { getAgentImageRunSettings, listAgentSessions } from "./canvasAgentApi";
import type { CanvasAgentContinuationAction, CanvasAgentToolAssetRef } from "./canvasAgentToolTypes";
import type { CanvasAgentPlannerOutput } from "./canvasAgentTypes";
import { CanvasAgentComposer } from "./CanvasAgentComposer";
import { CanvasAgentConnectionView } from "./CanvasAgentConnectionView";
import { CanvasAgentConversationView } from "./CanvasAgentConversationView";
import { CanvasAgentHistoryView } from "./CanvasAgentHistoryView";
import { CanvasAgentLogView } from "./CanvasAgentLogView";
import { CanvasAgentPlanCard } from "./CanvasAgentPlanCard";
import type { AgentReferenceChip } from "./CanvasAgentWorkspaceTypes";
import { getCanvasAgentBusyHint, isCanvasAgentBusyState } from "./canvasAgentStateMachine";
import { CanvasAgentWorkspaceShell } from "./CanvasAgentWorkspaceShell";
import { useAgentConversationHistory } from "./useAgentConversationHistory";
import { useAgentEventStream } from "./useAgentEventStream";
import { useAgentWorkspacePanel } from "./useAgentWorkspacePanel";
import { useCanvasAgentSession } from "./useCanvasAgentSession";
import { useFlowCanvasStore } from "../store/flowCanvasStore";

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
      } satisfies AgentReferenceChip;
    });
}

export function CanvasAgentPanel(props: {
  initialSessionId?: string | null;
  onClose: () => void;
  onConfirmPlan: (plan: CanvasAgentPlannerOutput) => Promise<ApplyResult>;
  onCreateOnlyPlan?: (plan: CanvasAgentPlannerOutput) => Promise<ApplyResult>;
  onServerDraftApplied?: () => void | Promise<void>;
  open: boolean;
}) {
  const sessionActions = useCanvasAgentSession({
    onServerDraftApplied: props.onServerDraftApplied,
  });
  const workspace = useAgentWorkspacePanel();
  const [composerDraft, setComposerDraft] = React.useState("");
  const backendFlowId = useFlowCanvasStore((state) => state.backendFlowId);
  const backendProjectId = useFlowCanvasStore((state) => state.backendProjectId);
  const selectedNodeCount = useFlowCanvasStore((state) => state.selectedNodeCount);
  const history = useAgentConversationHistory(sessionActions.sessionId);
  const eventStream = useAgentEventStream(sessionActions.sessionId);
  const [availableModels, setAvailableModels] = React.useState<ReturnType<typeof getEmptyModels>>([]);
  const [sessionList, setSessionList] = React.useState<Array<{
    createdAt: string;
    flowId: string | null;
    id: string;
    projectId: string | null;
    status?: string;
    title: string;
    updatedAt?: string;
  }>>([]);
  const replayHydratedSessionIdRef = React.useRef<string | null>(null);

  const busy = isCanvasAgentBusyState(sessionActions.workspaceState);
  const activeContinuation = sessionActions.pendingContinuation ?? sessionActions.lastContinuation;

  React.useEffect(() => {
    if (props.initialSessionId) {
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
        if (!sessionActions.sessionId && sessions[0]) {
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
    if (!sessionActions.sessionId) return;
    void history.refresh();
    void eventStream.connect().catch(() => {});
  }, [eventStream.connect, history.refresh, sessionActions.sessionId]);

  React.useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const handleOpen = (event: Event) => {
      const detail = (event as CustomEvent<OpenAgentSessionDetail>).detail;
      if (!detail?.sessionId) return;
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

  const selectedReferenceChips = React.useMemo(() => buildSelectedCanvasReferenceChips(), [selectedNodeCount]);

  const continuationChips = React.useMemo(() => {
    if (!activeContinuation) return [];

    const refs = (
      activeContinuation.assetRefIds?.length ? activeContinuation.assetRefIds : [activeContinuation.assetRefId]
    ).map((refId, index) => ({
      assetId: activeContinuation.assetIds?.[index] ?? activeContinuation.assetId,
      label: activeContinuation.assetLabels?.[index] ?? activeContinuation.assetLabel,
      refId,
    }));

    return buildAgentArtifactRefChips(refs).map((ref, index) => ({
      id: `continuation-${ref.refId}-${index}`,
      kind: "artifact" as const,
      label: `上一轮结果 ${index + 1}`,
      refId: ref.refId,
    }));
  }, [activeContinuation]);

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
        sessionActions.setSessionId?.(null);
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
          />

          {sessionActions.currentPlan ? (
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

          <CanvasAgentComposer
            draftValue={composerDraft}
            models={modelOptions}
            onChangeDraft={setComposerDraft}
            onSend={async (prompt) => {
              setComposerDraft("");
              await sessionActions.sendPrompt(prompt);
            }}
            referenceChips={[...selectedReferenceChips, ...continuationChips]}
            workspaceState={sessionActions.workspaceState}
          />
        </div>
      ) : null}

      {workspace.activeTab === "history" ? (
        <CanvasAgentHistoryView
          activeSessionId={sessionActions.sessionId}
          onNewChat={() => {
            sessionActions.setSessionId?.(null);
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
        <CanvasAgentLogView activityItems={sessionActions.activityTimeline ?? []} error={sessionActions.error} />
      ) : null}
    </CanvasAgentWorkspaceShell>
  );
}

function getEmptyModels() {
  return [] as Awaited<ReturnType<typeof getAgentImageRunSettings>>["models"];
}
