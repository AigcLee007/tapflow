import { describe, expect, it } from "vitest";

import type { AgentSessionEvent } from "./canvasAgentApi";
import {
  applyV2AgentEventToSessionState,
  createInitialV2AgentSessionState,
  buildToolTimelineFromSessionEvents,
} from "./agentReplayState";

describe("buildToolTimelineFromSessionEvents", () => {
  it("rebuilds a completed tool card from replay events", () => {
    const events: AgentSessionEvent[] = [
      {
        createdAt: "2026-06-24T00:00:00Z",
        eventJson: { toolCallKey: "tool-1", toolName: "generate_image" },
        eventType: "tool_started",
        id: "e1",
        seq: 1,
        sessionId: "session-1",
        taskId: null,
        turnId: null,
      },
      {
        createdAt: "2026-06-24T00:00:01Z",
        eventJson: {
          taskId: "task-1",
          title: "图片生成",
          toolCallKey: "tool-1",
          toolName: "generate_image",
        },
        eventType: "task_created",
        id: "e2",
        seq: 2,
        sessionId: "session-1",
        taskId: "task-1",
        turnId: null,
      },
      {
        createdAt: "2026-06-24T00:00:02Z",
        eventJson: {
          assetRef: {
            assetId: "asset-1",
            kind: "image",
            label: "Replay image",
            promptSummary: "",
            refId: "asset-ref-1",
          },
          taskId: "task-1",
          toolCallKey: "tool-1",
        },
        eventType: "artifact_created",
        id: "e3",
        seq: 3,
        sessionId: "session-1",
        taskId: "task-1",
        turnId: null,
      },
      {
        createdAt: "2026-06-24T00:00:03Z",
        eventJson: {
          result: {
            assetRefs: [
              {
                assetId: "asset-1",
                kind: "image",
                label: "Replay image",
                promptSummary: "",
                refId: "asset-ref-1",
              },
            ],
            status: "succeeded",
            toolCallId: "task-1",
          },
          toolCallKey: "tool-1",
        },
        eventType: "tool_result",
        id: "e4",
        seq: 4,
        sessionId: "session-1",
        taskId: "task-1",
        turnId: null,
      },
    ];

    expect(buildToolTimelineFromSessionEvents(events)).toEqual([
      expect.objectContaining({
        assetRefs: [expect.objectContaining({ assetId: "asset-1", label: "Replay image" })],
        status: "succeeded",
        taskId: "task-1",
        title: "图片生成",
        toolCallKey: "tool-1",
        toolName: "generate_image",
      }),
    ]);
  });

  it("rebuilds partial results without hiding the retryable status", () => {
    const items = buildToolTimelineFromSessionEvents([
      {
        createdAt: "2026-06-24T00:00:00Z",
        eventJson: { toolCallKey: "tool-partial", toolName: "skill.run" },
        eventType: "tool_started",
        id: "partial-start",
        seq: 1,
        sessionId: "session-1",
        taskId: null,
        turnId: null,
      },
      {
        createdAt: "2026-06-24T00:00:01Z",
        eventJson: {
          result: {
            assetRefs: [{ assetId: "asset-1", kind: "image", label: "Partial", promptSummary: "", refId: "ref-1" }],
            status: "partial_success",
          },
          toolCallKey: "tool-partial",
        },
        eventType: "tool_result",
        id: "partial-result",
        seq: 2,
        sessionId: "session-1",
        taskId: null,
        turnId: null,
      },
    ]);

    expect(items[0]).toMatchObject({ status: "partial_success", assetRefs: [expect.objectContaining({ assetId: "asset-1" })] });
  });

  it("rebuilds an awaiting approval tool card with estimate details", () => {
    const events: AgentSessionEvent[] = [
      {
        createdAt: "2026-06-24T00:00:00Z",
        eventJson: { toolCallKey: "tool-approve-1", toolName: "edit_image" },
        eventType: "tool_started",
        id: "a1",
        seq: 1,
        sessionId: "session-1",
        taskId: null,
        turnId: null,
      },
      {
        createdAt: "2026-06-24T00:00:01Z",
        eventJson: {
          estimate: {
            draftSelection: {
              aspectRatio: "16:9",
              estimatedCredits: 12,
              modelDisplayName: "Nano Banana Pro",
              modality: "image",
              n: 2,
              routeLabel: "线路二",
              size: "4K",
            },
            referenceRefs: ["round-1-image-1"],
            totalCredits: 4,
          },
          toolCallKey: "tool-approve-1",
          turnId: "turn-approve-1",
        },
        eventType: "approval_required",
        id: "a2",
        seq: 2,
        sessionId: "session-1",
        taskId: null,
        turnId: "turn-approve-1",
      },
    ];

    expect(buildToolTimelineFromSessionEvents(events)).toEqual([
      expect.objectContaining({
        estimate: expect.objectContaining({
          draftSelection: expect.objectContaining({
            modelDisplayName: "Nano Banana Pro",
            n: 2,
            routeLabel: "线路二",
            size: "4K",
          }),
          referenceRefs: ["round-1-image-1"],
          totalCredits: 4,
        }),
        status: "awaiting_approval",
        title: "图片编辑",
        toolCallKey: "tool-approve-1",
        toolName: "edit_image",
        turnId: "turn-approve-1",
      }),
    ]);
  });

  it("marks replayed running tasks as failed when the turn failed", () => {
    const events: AgentSessionEvent[] = [
      {
        createdAt: "2026-06-24T00:00:00Z",
        eventJson: { toolCallKey: "tool-fail-1", toolName: "generate_image" },
        eventType: "tool_started",
        id: "f1",
        seq: 1,
        sessionId: "session-1",
        taskId: null,
        turnId: null,
      },
      {
        createdAt: "2026-06-24T00:00:01Z",
        eventJson: {
          code: "AGENT_EXECUTOR_FAILED",
          message: "Provider timeout",
          turnId: "turn-fail-1",
        },
        eventType: "turn_failed",
        id: "f2",
        seq: 2,
        sessionId: "session-1",
        taskId: null,
        turnId: "turn-fail-1",
      },
    ];

    expect(buildToolTimelineFromSessionEvents(events)).toEqual([
      expect.objectContaining({
        error: "Provider timeout",
        status: "failed",
        toolCallKey: "tool-fail-1",
      }),
    ]);
  });

  it("rebuilds batch child task cards with partial success", () => {
    const events: AgentSessionEvent[] = [
      {
        createdAt: "2026-06-24T00:00:00Z",
        eventJson: { toolCallKey: "batch-1", toolName: "generate_image_batch" },
        eventType: "tool_started",
        id: "b0",
        seq: 1,
        sessionId: "session-1",
        taskId: null,
        turnId: null,
      },
      {
        createdAt: "2026-06-24T00:00:01Z",
        eventJson: {
          taskId: "task-1",
          title: "Batch image 1",
          toolCallKey: "batch-1:1",
          toolName: "generate_image_batch",
        },
        eventType: "task_created",
        id: "b1",
        seq: 2,
        sessionId: "session-1",
        taskId: "task-1",
        turnId: null,
      },
      {
        createdAt: "2026-06-24T00:00:02Z",
        eventJson: {
          taskId: "task-2",
          title: "Batch image 2",
          toolCallKey: "batch-1:2",
          toolName: "generate_image_batch",
        },
        eventType: "task_created",
        id: "b2",
        seq: 3,
        sessionId: "session-1",
        taskId: "task-2",
        turnId: null,
      },
      {
        createdAt: "2026-06-24T00:00:03Z",
        eventJson: {
          assetRef: {
            assetId: "asset-1",
            kind: "image",
            label: "Batch result 1",
            promptSummary: "",
            refId: "round-1-image-1",
          },
          taskId: "task-1",
          toolCallKey: "batch-1:1",
        },
        eventType: "artifact_created",
        id: "b3",
        seq: 4,
        sessionId: "session-1",
        taskId: "task-1",
        turnId: null,
      },
      {
        createdAt: "2026-06-24T00:00:04Z",
        eventJson: {
          result: { workflowRunId: "run-1" },
          taskId: "task-1",
          toolCallKey: "batch-1:1",
        },
        eventType: "task_completed",
        id: "b4",
        seq: 5,
        sessionId: "session-1",
        taskId: "task-1",
        turnId: null,
      },
      {
        createdAt: "2026-06-24T00:00:05Z",
        eventJson: {
          code: "WORKFLOW_FAILED",
          message: "Workflow failed.",
          taskId: "task-2",
          toolCallKey: "batch-1:2",
        },
        eventType: "task_failed",
        id: "b5",
        seq: 6,
        sessionId: "session-1",
        taskId: "task-2",
        turnId: null,
      },
    ];

    expect(buildToolTimelineFromSessionEvents(events)).toEqual([
      expect.objectContaining({
        status: "running",
        toolCallKey: "batch-1",
        title: "批量生图",
      }),
      expect.objectContaining({
        assetRefs: [expect.objectContaining({ assetId: "asset-1" })],
        status: "succeeded",
        taskId: "task-1",
        title: "Batch image 1",
        toolCallKey: "batch-1:1",
      }),
      expect.objectContaining({
        error: "Workflow failed.",
        status: "failed",
        taskId: "task-2",
        title: "Batch image 2",
        toolCallKey: "batch-1:2",
      }),
    ]);
  });
});

describe("V2 Agent session state", () => {
  it("maps tool lifecycle and approval results into visible state", () => {
    let state = createInitialV2AgentSessionState();
    state = applyV2AgentEventToSessionState(state, "agent_v2_tool_started", {
      callId: "call-1",
      name: "canvas.run_nodes",
    });
    expect(state.toolTimeline).toEqual([
      expect.objectContaining({
        status: "running",
        toolCallKey: "call-1",
        toolName: "canvas.run_nodes",
      }),
    ]);

    state = applyV2AgentEventToSessionState(state, "agent_v2_tool_result", {
      callId: "call-1",
      name: "canvas.run_nodes",
      result: { approvalRequired: true, estimate: { totalCredits: 8 }, status: "awaiting_approval" },
    });
    expect(state.pendingApproval).toEqual(
      expect.objectContaining({ callId: "call-1", estimate: { totalCredits: 8 } }),
    );
    expect(state.toolTimeline[0]).toEqual(expect.objectContaining({ status: "awaiting_approval" }));
  });

  it("maps ask_user and terminal events for live and replay consumers", () => {
    let state = createInitialV2AgentSessionState();
    state = applyV2AgentEventToSessionState(state, "agent_v2_turn_waiting", {
      details: { question: "需要补充目标受众", options: [{ id: "kids", label: "儿童", description: "低龄用户" }] },
      reason: "user_input",
    });
    expect(state.pendingQuestion).toBe("需要补充目标受众");
    expect(state.conversationBlocks).toEqual([{ type: "question", text: "需要补充目标受众", options: [{ id: "kids", label: "儿童", description: "低龄用户" }] }]);

    state = applyV2AgentEventToSessionState(state, "agent_v2_turn_completed", { text: "已完成" });
    expect(state.pendingQuestion).toBeNull();
    expect(state.pendingApproval).toBeNull();
    expect(state.status).toBe("idle");
    expect(state.finalText).toBe("已完成");

    state = applyV2AgentEventToSessionState(state, "agent_v2_turn_failed", { message: "Provider timeout" });
    expect(state.status).toBe("error");
    expect(state.error).toBe("Provider timeout");
  });

  it("preserves partial skill delivery so the UI can retry failed steps", () => {
    let state = createInitialV2AgentSessionState();
    state = applyV2AgentEventToSessionState(state, "agent_v2_tool_started", {
      callId: "skill-step-1",
      name: "skill.run",
    });
    state = applyV2AgentEventToSessionState(state, "agent_v2_tool_result", {
      callId: "skill-step-1",
      name: "skill.run",
      result: {
        assetRefs: [{ assetId: "asset-1", kind: "image", label: "Partial", promptSummary: "", refId: "ref-1" }],
        message: "1 step failed; 1 result is available.",
        status: "partial_success",
        workflowRunId: "workflow-run-42",
      },
    });

    expect(state.toolTimeline[0]).toMatchObject({
      assetRefs: [expect.objectContaining({ assetId: "asset-1" })],
      error: "1 step failed; 1 result is available.",
      result: expect.objectContaining({ workflowRunId: "workflow-run-42" }),
      status: "partial_success",
    });
  });

  it("keeps only product-safe V2 tool result fields in browser state", () => {
    let state = createInitialV2AgentSessionState();
    state = applyV2AgentEventToSessionState(state, "agent_v2_tool_result", {
      callId: "call-redaction",
      name: "canvas.await_results",
      result: {
        allTerminal: true,
        apiKey: "secret-key",
        assetRefs: [{
          assetId: "asset-1",
          kind: "image",
          label: "Banner",
          promptSummary: "Spring sale banner",
          refId: "ref-1",
          signedUrl: "https://example.invalid/signed",
        }],
        baseUrl: "https://provider.invalid",
        previewUrl: "https://example.invalid/preview",
        routeKey: "internal.route",
        runs: [{ id: "run-1", provider: "internal", status: "succeeded" }],
      },
    });

    expect(state.toolTimeline[0]?.result).toEqual({
      allTerminal: true,
      assetRefs: [{
        assetId: "asset-1",
        kind: "image",
        label: "Banner",
        promptSummary: "Spring sale banner",
        refId: "ref-1",
      }],
      runs: [{ id: "run-1", status: "succeeded" }],
    });
  });

  it("keeps bounded text Skill output without exposing provider fields", () => {
    let state = createInitialV2AgentSessionState();
    state = applyV2AgentEventToSessionState(state, "agent_v2_tool_result", {
      callId: "text-call",
      name: "skill.run",
      result: {
        apiKey: "secret",
        output: { text: "文本结果" },
        status: "succeeded",
      },
    });

    expect(state.toolTimeline[0]?.result).toEqual({ output: { text: "文本结果" }, status: "succeeded" });
  });
});
