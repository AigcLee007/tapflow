import { describe, expect, it, vi } from "vitest";

import { AgentWorkflowLauncher, AgentWorkflowLauncherError } from "../src/modules/agent/agent-workflow-launcher.js";
import { AgentToolRunner } from "../src/modules/agent/agent-tool-runner.js";

const context = {
  requestId: "req-1",
  tenantId: "tenant-1",
  traceId: "trace-1",
  userId: "user-1",
};

describe("AgentWorkflowLauncher", () => {
  it("launches a target-node image workflow with safe reference asset input", async () => {
    const createWorkflowRun = vi.fn().mockResolvedValue({ runId: "run-1", status: "pending" });
    const getWorkflowRun = vi.fn().mockResolvedValue({
      nodeRuns: [
        {
          id: "node-run-1",
          nodeId: "image-node-1",
          outputJson: {
            assets: [
              {
                assetId: "asset-1",
                height: 1024,
                kind: "image",
                prompt: "safe prompt",
                width: 1024,
              },
            ],
          },
          status: "succeeded",
        },
      ],
      workflowRun: { id: "run-1", status: "succeeded" },
    });

    const launcher = new AgentWorkflowLauncher({
      workflowRunsService: { createWorkflowRun, getWorkflowRun },
    });

    const result = await launcher.launchImageGeneration(context, {
      flowId: "flow-1",
      prompt: "make a poster",
      referenceAssetIds: ["asset-ref-1"],
      roundIndex: 2,
      size: "2K",
      targetNodeId: "image-node-1",
      toolCallId: "tool-1",
      toolCallKey: "call-1",
    });

    expect(createWorkflowRun).toHaveBeenCalledWith(context, "flow-1", {
      idempotencyKey: "agent:tool-1:call-1",
      input: {
        agentTool: {
          prompt: "make a poster",
          referenceAssetIds: ["asset-ref-1"],
          size: "2K",
          toolCallId: "tool-1",
          toolCallKey: "call-1",
        },
        runMode: "target_node",
        targetNodeId: "image-node-1",
      },
    });
    expect(result).toMatchObject({
      assetRefs: [{ assetId: "asset-1", label: "Round 2 image 1" }],
      nodeRunId: "node-run-1",
      status: "succeeded",
      workflowRunId: "run-1",
    });
    expect(JSON.stringify(result)).not.toMatch(/baseUrl|provider|route_key|upstream_model|Authorization/i);
  });

  it("fails closed when no flow target is available", async () => {
    const launcher = new AgentWorkflowLauncher({
      workflowRunsService: {
        createWorkflowRun: vi.fn(),
        getWorkflowRun: vi.fn(),
      },
    });

    await expect(launcher.launchImageGeneration(context, {
      flowId: null,
      prompt: "make a poster",
      roundIndex: 1,
      targetNodeId: null,
      toolCallId: "tool-1",
      toolCallKey: "call-1",
    })).rejects.toMatchObject({
      code: "AGENT_WORKFLOW_TARGET_REQUIRED",
    });
  });
});

describe("AgentToolRunner", () => {
  it("persists status transitions for a single image tool call", async () => {
    const repository = {
      createToolCall: vi.fn().mockResolvedValue({ id: "tool-db-1" }),
      updateToolCall: vi.fn().mockResolvedValue(undefined),
    };
    const launcher = {
      launchImageGeneration: vi.fn().mockResolvedValue({
        assetRefs: [{ assetId: "asset-1", kind: "image", label: "Round 1 image 1", promptSummary: "", refId: "round-1-image-1" }],
        nodeRunId: "node-run-1",
        status: "succeeded",
        workflowRunId: "run-1",
      }),
    };
    const runner = new AgentToolRunner({ launcher, repository });

    const result = await runner.runToolCall(context, {
      call: {
        arguments: { prompt: "make a poster", referenceRefs: ["asset-ref-1"], size: "1K" },
        toolCallKey: "call-1",
        toolName: "generate_image",
      },
      executionTarget: { flowId: "flow-1", targetNodeId: "image-node-1" },
      roundIndex: 1,
      sessionId: "session-1",
      turnId: "turn-1",
    });

    expect(repository.createToolCall).toHaveBeenCalledWith(expect.objectContaining({
      argumentsJson: { prompt: "make a poster", referenceRefs: ["asset-ref-1"], size: "1K" },
      sessionId: "session-1",
      status: "planned",
      toolCallKey: "call-1",
      toolName: "generate_image",
      turnId: "turn-1",
    }));
    expect(repository.updateToolCall).toHaveBeenCalledWith("tool-db-1", expect.objectContaining({ status: "running" }));
    expect(repository.updateToolCall).toHaveBeenCalledWith("tool-db-1", expect.objectContaining({ status: "succeeded" }));
    expect(result.status).toBe("succeeded");
  });

  it("returns partial success for batch image tool calls", async () => {
    const repository = {
      createToolCall: vi.fn().mockResolvedValue({ id: "tool-db-1" }),
      updateToolCall: vi.fn().mockResolvedValue(undefined),
    };
    const launcher = {
      launchImageGeneration: vi
        .fn()
        .mockResolvedValueOnce({
          assetRefs: [{ assetId: "asset-1", kind: "image", label: "Round 1 image 1", promptSummary: "", refId: "round-1-image-1" }],
          nodeRunId: "node-run-1",
          status: "succeeded",
          workflowRunId: "run-1",
        })
        .mockRejectedValueOnce(new AgentWorkflowLauncherError(502, "WORKFLOW_FAILED", "Workflow failed.")),
    };
    const runner = new AgentToolRunner({ launcher, repository });

    const result = await runner.runToolCall(context, {
      call: {
        arguments: {
          images: [
            { prompt: "one", size: "1K" },
            { prompt: "two", size: "1K" },
          ],
        },
        toolCallKey: "batch-1",
        toolName: "generate_image_batch",
      },
      executionTarget: { flowId: "flow-1", targetNodeId: "image-node-1" },
      roundIndex: 1,
      sessionId: "session-1",
      turnId: "turn-1",
    });

    expect(result.status).toBe("partial_success");
    expect(result.assetRefs).toHaveLength(1);
    expect(result.failures).toHaveLength(1);
    expect(repository.updateToolCall).toHaveBeenLastCalledWith("tool-db-1", expect.objectContaining({ status: "succeeded" }));
  });
});
