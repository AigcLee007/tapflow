import React from "react";
import { Bot, X } from "lucide-react";

import { CanvasAgentConversationList } from "./CanvasAgentConversationList";
import { CanvasAgentActivityTimeline } from "./CanvasAgentActivityTimeline";
import { CanvasAgentComposer } from "./CanvasAgentComposer";
import { CanvasAgentPlanCard } from "./CanvasAgentPlanCard";
import { CanvasAgentTaskCard } from "./CanvasAgentTaskCard";
import { CanvasAgentThread } from "./CanvasAgentThread";
import { CanvasAgentToolTimeline } from "./CanvasAgentToolTimeline";
import { buildAgentArtifactRefChips } from "./agentArtifactRefs";
import { OPEN_AGENT_SESSION_EVENT, type OpenAgentSessionDetail } from "./agentSessionEvents";
import { listAgentSessions } from "./canvasAgentApi";
import type { CanvasAgentContinuationAction, CanvasAgentToolAssetRef } from "./canvasAgentToolTypes";
import type { CanvasAgentPlannerOutput } from "./canvasAgentTypes";
import { useAgentConversationHistory } from "./useAgentConversationHistory";
import { useAgentEventStream } from "./useAgentEventStream";
import { useCanvasAgentSession } from "./useCanvasAgentSession";

type ApplyResult = {
  createdNodeIds: string[];
  errors: Array<{ message: string }>;
  ok: boolean;
  ranNodeIds: string[];
};

function getStatusCopy(
  status: "awaiting_approval" | "error" | "executing" | "idle" | "thinking",
  usedOfflineFallback: boolean,
) {
  if (status === "thinking") {
    return usedOfflineFallback ? "正在使用基础规划模式..." : "正在使用真实大模型理解画布并制定计划...";
  }
  if (status === "awaiting_approval") {
    return usedOfflineFallback ? "基础规划已生成，等待你确认。" : "真实 Agent 计划已生成，等待你确认。";
  }
  if (status === "executing") {
    return "正在执行已确认的画布操作...";
  }
  if (status === "error") {
    return usedOfflineFallback ? "基础规划执行失败。" : "真实大模型 Agent 调用失败。";
  }
  return usedOfflineFallback ? "当前处于基础规划模式。" : "由真实大模型负责规划，执行前仍由你确认。";
}

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
    return `基于这些结果做高质量变体：${selectedSummary}。保持主题一致，但在细节、镜头、氛围上拉开差异。`;
  }
  if (action === "make-poster") {
    return `把这些结果升级成海报级成品：${selectedSummary}。强化视觉中心、留白、版式和广告感。`;
  }
  return `基于这些结果生成一组对比图：${selectedSummary}。突出不同风格、构图或色彩方案。`;
}

export function CanvasAgentPanel(props: {
  initialSessionId?: string | null;
  onClose: () => void;
  onConfirmPlan: (plan: CanvasAgentPlannerOutput) => Promise<ApplyResult>;
  onCreateOnlyPlan?: (plan: CanvasAgentPlannerOutput) => Promise<ApplyResult>;
  open: boolean;
}) {
  const sessionActions = useCanvasAgentSession();
  const [composerDraft, setComposerDraft] = React.useState("");
  const directorEnabled = import.meta.env.VITE_AGENT_DIRECTOR_ENABLED === "true";
  const history = useAgentConversationHistory(sessionActions.sessionId);
  const eventStream = useAgentEventStream(sessionActions.sessionId);
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

  const busy = sessionActions.status === "thinking" || sessionActions.status === "executing";
  const statusCopy = getStatusCopy(sessionActions.status, sessionActions.usedOfflineFallback);
  const activeContinuation = sessionActions.pendingContinuation ?? sessionActions.lastContinuation;

  React.useEffect(() => {
    if (props.initialSessionId) {
      sessionActions.setSessionId?.(props.initialSessionId);
    }
  }, [props.initialSessionId, sessionActions.setSessionId]);

  React.useEffect(() => {
    void listAgentSessions({ limit: 10 })
      .then((sessions) => {
        setSessionList(sessions);
        if (!directorEnabled || sessionActions.sessionId || sessions.length === 0) return;
        sessionActions.setSessionId?.(sessions[0]!.id);
      })
      .catch(() => setSessionList([]));
  }, [directorEnabled, sessionActions.sessionId, sessionActions.setSessionId]);

  React.useEffect(() => {
    if (!sessionActions.sessionId || !directorEnabled) return;
    void history.refresh();
    void eventStream.connect().catch(() => {});
  }, [directorEnabled, eventStream, history, sessionActions.sessionId]);

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
    if (!directorEnabled) return;
    if (!sessionActions.sessionId) return;
    if (eventStream.events.length === 0) return;
    if (replayHydratedSessionIdRef.current === sessionActions.sessionId) return;
    sessionActions.hydrateReplayEvents(eventStream.events);
    replayHydratedSessionIdRef.current = sessionActions.sessionId;
  }, [directorEnabled, eventStream.events, sessionActions.hydrateReplayEvents, sessionActions.sessionId]);

  React.useEffect(() => {
    if (replayHydratedSessionIdRef.current && replayHydratedSessionIdRef.current !== sessionActions.sessionId) {
      replayHydratedSessionIdRef.current = null;
    }
  }, [sessionActions.sessionId]);

  if (!props.open) return null;

  return (
    <aside
      className="nodrag nopan nowheel"
      style={{
        backdropFilter: "blur(18px)",
        background: "rgba(10,10,15,0.97)",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: 24,
        bottom: 14,
        boxShadow: "0 26px 80px rgba(0,0,0,0.5)",
        display: "grid",
        gridTemplateRows: "auto 1fr auto",
        overflow: "hidden",
        position: "absolute",
        right: 14,
        top: 14,
        width: "min(480px, calc(100vw - 28px))",
        zIndex: 80,
      }}
    >
      <header
        style={{
          alignItems: "center",
          borderBottom: "1px solid rgba(255,255,255,0.08)",
          display: "flex",
          gap: 12,
          justifyContent: "space-between",
          padding: "16px 16px 14px",
        }}
      >
        <div style={{ alignItems: "center", display: "flex", gap: 12 }}>
          <div
            style={{
              background: "rgba(255,255,255,0.08)",
              borderRadius: 18,
              color: "#f8fafc",
              display: "grid",
              height: 36,
              placeItems: "center",
              width: 36,
            }}
          >
            <Bot size={18} />
          </div>
          <div>
            <div style={{ color: "#f8fafc", fontSize: 16, fontWeight: 800 }}>TapFlow Agent</div>
            <div style={{ color: "rgba(226,232,240,0.58)", fontSize: 12 }}>{statusCopy}</div>
            <div style={{ color: "rgba(148,163,184,0.9)", fontSize: 11, marginTop: 4 }}>
              {directorEnabled ? "Director Runtime (preview)" : "Classic Agent"}
            </div>
          </div>
        </div>
        <button
          aria-label="关闭 Agent"
          onClick={props.onClose}
          style={{
            background: "transparent",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 17,
            color: "#f8fafc",
            cursor: "pointer",
            display: "grid",
            height: 34,
            placeItems: "center",
            width: 34,
          }}
          type="button"
        >
          <X size={16} />
        </button>
      </header>

      <div style={{ alignContent: "start", display: "grid", gap: 14, overflowY: "auto", padding: 16 }}>
        {directorEnabled ? (
          <CanvasAgentConversationList activeSessionId={sessionActions.sessionId} sessions={sessionList} />
        ) : null}

        {sessionActions.messages.length === 0 ? (
          <section
            style={{
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 18,
              display: "grid",
              gap: 8,
              padding: 16,
            }}
          >
            <div style={{ color: "#f8fafc", fontSize: 15, fontWeight: 800 }}>从一句目标开始</div>
            <div style={{ color: "rgba(226,232,240,0.72)", fontSize: 13, lineHeight: 1.6 }}>
              例如：帮我搭一个森林运动会的文生图流程，或者把当前选中的图做成视频。
            </div>
          </section>
        ) : null}

        <CanvasAgentThread
          events={directorEnabled ? eventStream.events : []}
          messages={directorEnabled && history.messages.length > 0 ? history.messages : sessionActions.messages}
        />

        <CanvasAgentActivityTimeline items={sessionActions.activityTimeline ?? []} />

        <CanvasAgentToolTimeline
          items={sessionActions.toolTimeline}
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
          onSelectAssetRef={sessionActions.selectToolAssetRef}
        />

        {activeContinuation ? (
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
        ) : null}

        {sessionActions.currentPlan ? (
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
        ) : null}

        {sessionActions.error ? (
          <CanvasAgentTaskCard detail={sessionActions.error} status="error" title="最近一次执行失败" />
        ) : null}
      </div>

      <CanvasAgentComposer
        disabled={busy}
        draftValue={composerDraft}
        referenceRefs={activeContinuation
          ? buildAgentArtifactRefChips(
              (activeContinuation.assetRefIds?.length ? activeContinuation.assetRefIds : [activeContinuation.assetRefId]).map((refId, index) => ({
                assetId: activeContinuation.assetIds?.[index] ?? activeContinuation.assetId,
                label: activeContinuation.assetLabels?.[index] ?? activeContinuation.assetLabel,
                refId,
              })),
            )
          : undefined}
        onChangeDraft={setComposerDraft}
        onSend={async (prompt) => {
          setComposerDraft("");
          await sessionActions.sendPrompt(prompt);
        }}
      />
    </aside>
  );
}
