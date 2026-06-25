import { describe, expect, it } from "vitest";

import type { AgentSessionEvent } from "./canvasAgentApi";
import { buildToolTimelineFromSessionEvents } from "./agentReplayState";

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
          title: "Image generation",
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
        title: "Image generation",
        toolCallKey: "tool-1",
        toolName: "generate_image",
      }),
    ]);
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
        title: "Image edit",
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
