import { describe, expect, it, vi } from "vitest";

import { AgentWorkflowLauncher, AgentWorkflowLauncherError } from "../src/modules/agent/agent-workflow-launcher.js";
import { AgentToolRunner, DatabaseAgentToolRunnerRepository } from "../src/modules/agent/agent-tool-runner.js";

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
      aspectRatio: "16:9",
      format: "png",
      flowId: "flow-1",
      modelDisplayName: "Nano Banana Pro",
      n: 2,
      prompt: "make a poster",
      quality: "high",
      referenceAssetIds: ["asset-ref-1"],
      roundIndex: 2,
      routeKey: "image.mouxihub.nano-banana-pro.t3",
      routeLabel: "线路二（官方T3）",
      size: "2K",
      targetNodeId: "image-node-1",
      toolCallId: "tool-1",
      toolCallKey: "call-1",
    });

    expect(createWorkflowRun).toHaveBeenCalledWith(context, "flow-1", {
      idempotencyKey: "agent:tool-1:call-1",
      input: {
        agentTool: {
          aspectRatio: "16:9",
          format: "png",
          modelDisplayName: "Nano Banana Pro",
          n: 2,
          prompt: "make a poster",
          quality: "high",
          referenceAssetIds: ["asset-ref-1"],
          routeKey: "image.mouxihub.nano-banana-pro.t3",
          routeLabel: "线路二（官方T3）",
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

  it("waits for the target workflow to finish before extracting generated assets", async () => {
    const createWorkflowRun = vi.fn().mockResolvedValue({ runId: "run-1", status: "pending" });
    const getWorkflowRun = vi
      .fn()
      .mockResolvedValueOnce({
        nodeRuns: [
          {
            id: "node-run-1",
            nodeId: "image-node-1",
            outputJson: null,
            status: "running",
          },
        ],
        workflowRun: { id: "run-1", status: "running" },
      })
      .mockResolvedValueOnce({
        nodeRuns: [
          {
            id: "node-run-1",
            nodeId: "image-node-1",
            outputJson: {
              assets: [
                {
                  assetId: "asset-1",
                  kind: "image",
                  prompt: "safe prompt",
                },
              ],
            },
            status: "succeeded",
          },
        ],
        workflowRun: { id: "run-1", status: "succeeded" },
      });

    const launcher = new AgentWorkflowLauncher({
      pollIntervalMs: 1,
      workflowRunsService: { createWorkflowRun, getWorkflowRun },
    });

    const result = await launcher.launchImageGeneration(context, {
      flowId: "flow-1",
      prompt: "make a poster",
      roundIndex: 1,
      targetNodeId: "image-node-1",
      toolCallId: "tool-1",
      toolCallKey: "call-1",
    });

    expect(getWorkflowRun).toHaveBeenCalledTimes(2);
    expect(result.assetRefs).toEqual([
      expect.objectContaining({ assetId: "asset-1", refId: "round-1-image-1" }),
    ]);
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
  function createRunnerRepositoryMock(toolCallId = "tool-db-1", taskId = "task-db-1") {
    return {
      createTask: vi.fn().mockResolvedValue({ id: taskId }),
      createToolCall: vi.fn().mockResolvedValue({ id: toolCallId }),
      updateTask: vi.fn().mockResolvedValue(undefined),
      updateToolCall: vi.fn().mockResolvedValue(undefined),
    };
  }

  it("creates a durable image task before launching the workflow", async () => {
    const operations: string[] = [];
    const repository = {
      createTask: vi.fn().mockImplementation(async (input) => {
        operations.push(`task:${input.taskKey}`);
        return { id: "task-db-1" };
      }),
      createToolCall: vi.fn().mockResolvedValue({ id: "tool-db-1" }),
      updateTask: vi.fn().mockResolvedValue(undefined),
      updateToolCall: vi.fn().mockResolvedValue(undefined),
    };
    const launcher = {
      launchImageGeneration: vi.fn().mockImplementation(async (_context, input) => {
        operations.push("launch");
        return {
          assetRefs: [{ assetId: "asset-1", kind: "image", label: "Round 1 image 1", promptSummary: "", refId: "round-1-image-1" }],
          nodeRunId: "node-run-1",
          status: "succeeded",
          workflowRunId: "run-1",
        };
      }),
    };
    const runner = new AgentToolRunner({ launcher, repository });

    const result = await runner.runToolCall(context, {
      call: {
        arguments: { prompt: "make a poster", size: "1K" },
        toolCallKey: "call-1",
        toolName: "generate_image",
      },
      executionTarget: { flowId: "flow-1", targetNodeId: "image-node-1" },
      roundIndex: 1,
      sessionId: "session-1",
      turnId: "turn-1",
    });

    expect(repository.createTask).toHaveBeenCalledWith(expect.objectContaining({
      inputJson: expect.objectContaining({
        prompt: "make a poster",
        settings: expect.objectContaining({ size: "1K" }),
        toolCallKey: "call-1",
      }),
      sessionId: "session-1",
      status: "queued",
      taskKey: "call-1",
      taskType: "generate_image",
      tenantId: "tenant-1",
      title: "Image generation",
      turnId: "turn-1",
    }));
    expect(operations).toEqual(["task:call-1", "launch"]);
    expect(launcher.launchImageGeneration).toHaveBeenCalledWith(
      context,
      expect.objectContaining({
        toolCallId: "task-db-1",
        toolCallKey: "call-1",
      }),
    );
    expect(result.toolCallId).toBe("task-db-1");
  });

  it("links workflow and asset output back to the durable image task", async () => {
    const repository = {
      createTask: vi.fn().mockResolvedValue({ id: "task-db-1" }),
      createToolCall: vi.fn().mockResolvedValue({ id: "tool-db-1" }),
      updateTask: vi.fn().mockResolvedValue(undefined),
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

    await runner.runToolCall(context, {
      call: {
        arguments: { prompt: "make a poster", size: "1K" },
        toolCallKey: "call-1",
        toolName: "generate_image",
      },
      executionTarget: { flowId: "flow-1", targetNodeId: "image-node-1" },
      roundIndex: 1,
      sessionId: "session-1",
      turnId: "turn-1",
    });

    expect(repository.updateTask).toHaveBeenCalledWith("task-db-1", expect.objectContaining({
      outputJson: expect.objectContaining({
        assetRefs: [expect.objectContaining({ assetId: "asset-1" })],
        nodeRunId: "node-run-1",
        workflowRunId: "run-1",
      }),
      status: "succeeded",
      tenantId: "tenant-1",
    }));
  });

  it("creates every batch child task before the first workflow launch", async () => {
    const operations: string[] = [];
    const repository = {
      createTask: vi.fn().mockImplementation(async (input) => {
        operations.push(`task:${input.taskKey}`);
        return { id: input.taskKey === "batch-1:1" ? "task-db-1" : "task-db-2" };
      }),
      createToolCall: vi.fn().mockResolvedValue({ id: "tool-db-batch" }),
      updateTask: vi.fn().mockResolvedValue(undefined),
      updateToolCall: vi.fn().mockResolvedValue(undefined),
    };
    const launcher = {
      launchImageGeneration: vi.fn().mockImplementation(async (_context, input) => {
        operations.push(`launch:${input.toolCallKey}`);
        return {
          assetRefs: [{ assetId: `asset-${input.toolCallKey}`, kind: "image", label: "Batch image", promptSummary: "", refId: `ref-${input.toolCallKey}` }],
          nodeRunId: `node-${input.toolCallKey}`,
          status: "succeeded",
          workflowRunId: `run-${input.toolCallKey}`,
        };
      }),
    };
    const runner = new AgentToolRunner({ launcher, repository });

    const result = await runner.runToolCall(context, {
      call: {
        arguments: {
          images: [
            { prompt: "one", size: "1K" },
            { prompt: "two", size: "2K" },
          ],
          sharedStyle: "commercial poster",
        },
        toolCallKey: "batch-1",
        toolName: "generate_image_batch",
      },
      executionTarget: { flowId: "flow-1", targetNodeId: "image-node-1" },
      roundIndex: 1,
      sessionId: "session-1",
      turnId: "turn-1",
    });

    expect(repository.createTask).toHaveBeenCalledTimes(2);
    expect(repository.createTask).toHaveBeenNthCalledWith(1, expect.objectContaining({
      inputJson: expect.objectContaining({ prompt: "commercial poster\none" }),
      taskKey: "batch-1:1",
      taskType: "generate_image_batch_child",
      title: "Batch image 1",
    }));
    expect(repository.createTask).toHaveBeenNthCalledWith(2, expect.objectContaining({
      inputJson: expect.objectContaining({ prompt: "commercial poster\ntwo" }),
      taskKey: "batch-1:2",
      taskType: "generate_image_batch_child",
      title: "Batch image 2",
    }));
    expect(operations.slice(0, 2)).toEqual(["task:batch-1:1", "task:batch-1:2"]);
    expect(operations[2]?.startsWith("launch:")).toBe(true);
    expect((result as { tasks?: unknown[] }).tasks).toEqual([
      expect.objectContaining({ taskId: "task-db-1", toolCallKey: "batch-1:1", status: "succeeded" }),
      expect.objectContaining({ taskId: "task-db-2", toolCallKey: "batch-1:2", status: "succeeded" }),
    ]);
  });

  it("runs batch workflow launches concurrently within the configured limit", async () => {
    let activeLaunches = 0;
    let maxActiveLaunches = 0;
    const repository = {
      createTask: vi.fn().mockImplementation(async (input) => ({
        id: `task-${String(input.taskKey).split(":").at(-1)}`,
      })),
      createToolCall: vi.fn().mockResolvedValue({ id: "tool-db-batch" }),
      updateTask: vi.fn().mockResolvedValue(undefined),
      updateToolCall: vi.fn().mockResolvedValue(undefined),
    };
    const launcher = {
      launchImageGeneration: vi.fn().mockImplementation(async (_context, input) => {
        activeLaunches += 1;
        maxActiveLaunches = Math.max(maxActiveLaunches, activeLaunches);
        await new Promise((resolve) => setTimeout(resolve, 10));
        activeLaunches -= 1;
        return {
          assetRefs: [{ assetId: `asset-${input.toolCallKey}`, kind: "image", label: "Batch image", promptSummary: "", refId: `ref-${input.toolCallKey}` }],
          nodeRunId: `node-${input.toolCallKey}`,
          status: "succeeded",
          workflowRunId: `run-${input.toolCallKey}`,
        };
      }),
    };
    const runner = new AgentToolRunner({ batchConcurrency: 2, launcher, repository });

    const result = await runner.runToolCall(context, {
      call: {
        arguments: {
          images: [
            { prompt: "one", size: "1K" },
            { prompt: "two", size: "1K" },
            { prompt: "three", size: "1K" },
            { prompt: "four", size: "1K" },
          ],
        },
        toolCallKey: "batch-concurrent",
        toolName: "generate_image_batch",
      },
      executionTarget: { flowId: "flow-1", targetNodeId: "image-node-1" },
      roundIndex: 1,
      sessionId: "session-1",
      turnId: "turn-1",
    });

    expect(maxActiveLaunches).toBe(2);
    expect(result.status).toBe("succeeded");
    expect(result.assetRefs).toHaveLength(4);
  });

  it("preserves failed durable task error details for retry", async () => {
    const repository = {
      createTask: vi.fn().mockResolvedValue({ id: "task-db-fail" }),
      createToolCall: vi.fn().mockResolvedValue({ id: "tool-db-fail" }),
      updateTask: vi.fn().mockResolvedValue(undefined),
      updateToolCall: vi.fn().mockResolvedValue(undefined),
    };
    const launcher = {
      launchImageGeneration: vi.fn().mockRejectedValue(new AgentWorkflowLauncherError(502, "WORKFLOW_FAILED", "Workflow failed.")),
    };
    const runner = new AgentToolRunner({ launcher, repository });

    const result = await runner.runToolCall(context, {
      call: {
        arguments: { prompt: "make a poster", size: "1K" },
        toolCallKey: "call-fail",
        toolName: "generate_image",
      },
      executionTarget: { flowId: "flow-1", targetNodeId: "image-node-1" },
      roundIndex: 1,
      sessionId: "session-1",
      turnId: "turn-1",
    });

    expect(repository.updateTask).toHaveBeenCalledWith("task-db-fail", expect.objectContaining({
      errorJson: {
        code: "WORKFLOW_FAILED",
        message: "Workflow failed.",
      },
      status: "failed",
      tenantId: "tenant-1",
    }));
    expect(result).toMatchObject({
      failures: [{ code: "WORKFLOW_FAILED", message: "Workflow failed.", toolCallKey: "call-fail" }],
      status: "failed",
      tasks: [expect.objectContaining({
        error: { code: "WORKFLOW_FAILED", message: "Workflow failed." },
        status: "failed",
        taskId: "task-db-fail",
        toolCallKey: "call-fail",
      })],
    });
  });

  it("persists status transitions for a single image tool call", async () => {
    const repository = {
      createTask: vi.fn().mockResolvedValue({ id: "task-db-legacy" }),
      createToolCall: vi.fn().mockResolvedValue({ id: "tool-db-1" }),
      updateTask: vi.fn().mockResolvedValue(undefined),
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
      referenceContext: {
        items: [
          { assetId: "asset-ref-1", kind: "upload", label: "Reference", refId: "upload-1" },
        ],
      },
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

  it("resolves generate_image referenceRefs before workflow launch and stores safe task input", async () => {
    const repository = createRunnerRepositoryMock("tool-db-ref", "task-db-ref");
    const launcher = {
      launchImageGeneration: vi.fn().mockResolvedValue({
        assetRefs: [{ assetId: "asset-1", kind: "image", label: "Round 1 image 1", promptSummary: "", refId: "round-1-image-1" }],
        nodeRunId: "node-run-ref",
        status: "succeeded",
        workflowRunId: "run-ref",
      }),
    };
    const runner = new AgentToolRunner({ launcher, repository });

    await runner.runToolCall(context, {
      call: {
        arguments: { prompt: "make a poster", referenceRefs: ["upload-1"], size: "1K" },
        toolCallKey: "call-ref",
        toolName: "generate_image",
      },
      executionTarget: { flowId: "flow-1", targetNodeId: "image-node-1" },
      referenceContext: {
        items: [
          { assetId: "asset-upload-1", kind: "upload", label: "Upload 1", refId: "upload-1" },
        ],
      },
      roundIndex: 1,
      sessionId: "session-1",
      turnId: "turn-1",
    });

    expect(launcher.launchImageGeneration).toHaveBeenCalledWith(
      context,
      expect.objectContaining({
        referenceAssetIds: ["asset-upload-1"],
      }),
    );
    expect(repository.createTask).toHaveBeenCalledWith(expect.objectContaining({
      inputJson: expect.objectContaining({
        referenceAssetIds: ["asset-upload-1"],
        referenceRefs: ["upload-1"],
      }),
    }));
  });

  it("fails generate_image without launching when a reference ref is unknown", async () => {
    const repository = createRunnerRepositoryMock("tool-db-unknown", "task-db-unknown");
    const launcher = {
      launchImageGeneration: vi.fn(),
    };
    const runner = new AgentToolRunner({ launcher, repository });

    const result = await runner.runToolCall(context, {
      call: {
        arguments: { prompt: "make a poster", referenceRefs: ["missing-ref"], size: "1K" },
        toolCallKey: "call-unknown",
        toolName: "generate_image",
      },
      executionTarget: { flowId: "flow-1", targetNodeId: "image-node-1" },
      referenceContext: {
        items: [
          { assetId: "asset-upload-1", kind: "upload", label: "Upload 1", refId: "upload-1" },
        ],
      },
      roundIndex: 1,
      sessionId: "session-1",
      turnId: "turn-1",
    });

    expect(result).toMatchObject({
      failures: [{ code: "AGENT_REFERENCE_NOT_FOUND", toolCallKey: "call-unknown" }],
      status: "failed",
    });
    expect(launcher.launchImageGeneration).not.toHaveBeenCalled();
  });

  it("passes approved image settings through to the workflow launcher", async () => {
    const repository = createRunnerRepositoryMock("tool-db-settings", "task-db-settings");
    const launcher = {
      launchImageGeneration: vi.fn().mockResolvedValue({
        assetRefs: [{ assetId: "asset-settings", kind: "image", label: "Round 1 image 1", promptSummary: "", refId: "round-1-image-1" }],
        nodeRunId: "node-run-settings",
        status: "succeeded",
        workflowRunId: "run-settings",
      }),
    };
    const runner = new AgentToolRunner({ launcher, repository });

    await runner.runToolCall(context, {
      call: {
        arguments: {
          aspectRatio: "16:9",
          format: "jpeg",
          modelDisplayName: "GPT-Image-2",
          moderation: "low",
          n: 3,
          prompt: "make three poster options",
          quality: "high",
          routeKey: "image.gpt-image-2.line2",
          routeLabel: "线路二",
          size: "4K",
        },
        toolCallKey: "call-settings",
        toolName: "generate_image",
      },
      executionTarget: { flowId: "flow-1", targetNodeId: "image-node-1" },
      roundIndex: 1,
      sessionId: "session-1",
      turnId: "turn-1",
    });

    expect(launcher.launchImageGeneration).toHaveBeenCalledWith(
      context,
      expect.objectContaining({
        aspectRatio: "16:9",
        format: "jpeg",
        modelDisplayName: "GPT-Image-2",
        moderation: "low",
        n: 3,
        quality: "high",
        routeKey: "image.gpt-image-2.line2",
        routeLabel: "线路二",
        size: "4K",
      }),
    );
  });

  it("returns partial success for batch image tool calls", async () => {
    const repository = createRunnerRepositoryMock("tool-db-1", "task-db-batch");
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

  it("passes per-image approved batch settings through to the workflow launcher", async () => {
    const repository = createRunnerRepositoryMock("tool-db-batch-settings", "task-db-batch-settings");
    const launcher = {
      launchImageGeneration: vi
        .fn()
        .mockResolvedValue({
          assetRefs: [{ assetId: "asset-batch-settings", kind: "image", label: "Round 1 image 1", promptSummary: "", refId: "round-1-image-1" }],
          nodeRunId: "node-run-batch-settings",
          status: "succeeded",
          workflowRunId: "run-batch-settings",
        }),
    };
    const runner = new AgentToolRunner({ launcher, repository });

    await runner.runToolCall(context, {
      call: {
        arguments: {
          images: [
            {
              aspectRatio: "1:1",
              n: 2,
              prompt: "one",
              routeKey: "image.nano.line1",
              routeLabel: "线路一",
              size: "2K",
            },
            {
              aspectRatio: "9:16",
              n: 1,
              prompt: "two",
              routeKey: "image.nano.line2",
              routeLabel: "线路二",
              size: "4K",
            },
          ],
          sharedStyle: "commercial poster",
        },
        toolCallKey: "batch-settings",
        toolName: "generate_image_batch",
      },
      executionTarget: { flowId: "flow-1", targetNodeId: "image-node-1" },
      roundIndex: 1,
      sessionId: "session-1",
      turnId: "turn-1",
    });

    expect(launcher.launchImageGeneration).toHaveBeenNthCalledWith(
      1,
      context,
      expect.objectContaining({
        aspectRatio: "1:1",
        n: 2,
        prompt: "commercial poster\none",
        routeKey: "image.nano.line1",
        routeLabel: "线路一",
        size: "2K",
        toolCallKey: "batch-settings:1",
      }),
    );
    expect(launcher.launchImageGeneration).toHaveBeenNthCalledWith(
      2,
      context,
      expect.objectContaining({
        aspectRatio: "9:16",
        n: 1,
        prompt: "commercial poster\ntwo",
        routeKey: "image.nano.line2",
        routeLabel: "线路二",
        size: "4K",
        toolCallKey: "batch-settings:2",
      }),
    );
  });

  it("injects active continuation ref into image execution when explicit reference refs are missing", async () => {
    const repository = createRunnerRepositoryMock("tool-db-3", "task-db-3");
    const launcher = {
      launchImageGeneration: vi.fn().mockResolvedValue({
        assetRefs: [{ assetId: "asset-3", kind: "image", label: "Round 2 image 1", promptSummary: "", refId: "round-2-image-1" }],
        nodeRunId: "node-run-3",
        status: "succeeded",
        workflowRunId: "run-3",
      }),
    };
    const runner = new AgentToolRunner({ launcher, repository });

    await runner.runToolCall(context, {
      call: {
        arguments: { prompt: "turn this into a poster", size: "1K" },
        toolCallKey: "call-3",
        toolName: "generate_image",
      },
      continuationContext: {
        action: "make-poster",
        assetId: "asset-previous",
        assetLabel: "Round 1 image 2",
        assetRefId: "round-1-image-2",
        promptSummary: "poster variant",
      },
      executionTarget: { flowId: "flow-1", targetNodeId: "image-node-1" },
      roundIndex: 2,
      sessionId: "session-1",
      turnId: "turn-2",
    });

    expect(launcher.launchImageGeneration).toHaveBeenCalledWith(
      context,
      expect.objectContaining({
        prompt: "turn this into a poster",
        referenceAssetIds: ["asset-previous"],
      }),
    );
  });

  it("resolves batch child image refs independently", async () => {
    const repository = {
      createTask: vi.fn().mockImplementation(async (input) => ({
        id: input.taskKey === "batch-refs:1" ? "task-db-1" : "task-db-2",
      })),
      createToolCall: vi.fn().mockResolvedValue({ id: "tool-db-batch-refs" }),
      updateTask: vi.fn().mockResolvedValue(undefined),
      updateToolCall: vi.fn().mockResolvedValue(undefined),
    };
    const launcher = {
      launchImageGeneration: vi.fn().mockImplementation(async (_context, input) => ({
        assetRefs: [{ assetId: `asset-${input.toolCallKey}`, kind: "image", label: "Batch image", promptSummary: "", refId: `ref-${input.toolCallKey}` }],
        nodeRunId: `node-${input.toolCallKey}`,
        status: "succeeded",
        workflowRunId: `run-${input.toolCallKey}`,
      })),
    };
    const runner = new AgentToolRunner({ batchConcurrency: 1, launcher, repository });

    await runner.runToolCall(context, {
      call: {
        arguments: {
          images: [
            { prompt: "one", referenceRefs: ["upload-1"], size: "1K" },
            { prompt: "two", referenceRefs: ["round-1-image-1"], size: "1K" },
          ],
        },
        toolCallKey: "batch-refs",
        toolName: "generate_image_batch",
      },
      executionTarget: { flowId: "flow-1", targetNodeId: "image-node-1" },
      previousResults: [
        { assetId: "asset-previous-1", refId: "round-1-image-1" },
      ],
      referenceContext: {
        items: [
          { assetId: "asset-upload-1", kind: "upload", label: "Upload 1", refId: "upload-1" },
        ],
      },
      roundIndex: 2,
      sessionId: "session-1",
      turnId: "turn-2",
    });

    expect(launcher.launchImageGeneration).toHaveBeenNthCalledWith(
      1,
      context,
      expect.objectContaining({
        referenceAssetIds: ["asset-upload-1"],
        toolCallKey: "batch-refs:1",
      }),
    );
    expect(launcher.launchImageGeneration).toHaveBeenNthCalledWith(
      2,
      context,
      expect.objectContaining({
        referenceAssetIds: ["asset-previous-1"],
        toolCallKey: "batch-refs:2",
      }),
    );
    expect(repository.createTask).toHaveBeenNthCalledWith(1, expect.objectContaining({
      inputJson: expect.objectContaining({
        referenceAssetIds: ["asset-upload-1"],
        referenceRefs: ["upload-1"],
      }),
    }));
    expect(repository.createTask).toHaveBeenNthCalledWith(2, expect.objectContaining({
      inputJson: expect.objectContaining({
        referenceAssetIds: ["asset-previous-1"],
        referenceRefs: ["round-1-image-1"],
      }),
    }));
  });

  it("validates every batch child ref before creating child tasks", async () => {
    const repository = {
      createTask: vi.fn().mockResolvedValue({ id: "task-should-not-exist" }),
      createToolCall: vi.fn().mockResolvedValue({ id: "tool-db-batch-invalid-ref" }),
      updateTask: vi.fn().mockResolvedValue(undefined),
      updateToolCall: vi.fn().mockResolvedValue(undefined),
    };
    const launcher = {
      launchImageGeneration: vi.fn(),
    };
    const runner = new AgentToolRunner({ launcher, repository });

    const result = await runner.runToolCall(context, {
      call: {
        arguments: {
          images: [
            { prompt: "one", referenceRefs: ["upload-1"], size: "1K" },
            { prompt: "two", referenceRefs: ["missing-ref"], size: "1K" },
          ],
        },
        toolCallKey: "batch-invalid-ref",
        toolName: "generate_image_batch",
      },
      executionTarget: { flowId: "flow-1", targetNodeId: "image-node-1" },
      referenceContext: {
        items: [
          { assetId: "asset-upload-1", kind: "upload", label: "Upload 1", refId: "upload-1" },
        ],
      },
      roundIndex: 2,
      sessionId: "session-1",
      turnId: "turn-2",
    });

    expect(result).toMatchObject({
      failures: [{ code: "AGENT_REFERENCE_NOT_FOUND", toolCallKey: "batch-invalid-ref" }],
      status: "failed",
    });
    expect(repository.createTask).not.toHaveBeenCalled();
    expect(launcher.launchImageGeneration).not.toHaveBeenCalled();
  });
});

describe("DatabaseAgentToolRunnerRepository", () => {
  function createMockPool(rowsByQuery: Array<unknown[]> = []) {
    const queries: Array<{ params?: unknown[]; sql: string }> = [];
    const client = {
      query: vi.fn(async (sql: string, params?: unknown[]) => {
        queries.push({ params, sql });
        if (
          sql === "BEGIN" ||
          sql === "COMMIT" ||
          sql === "ROLLBACK" ||
          sql.includes("set_config('app.tenant_id'") ||
          sql.includes("set_config('app.user_id'")
        ) {
          return { rows: [] };
        }
        const placeholderMatches = [...sql.matchAll(/\$(\d+)/g)];
        const expectedParamCount = placeholderMatches.reduce((max, match) => Math.max(max, Number(match[1])), 0);
        if ((params?.length ?? 0) !== expectedParamCount) {
          throw new Error(`Expected ${expectedParamCount} params but received ${params?.length ?? 0}`);
        }
        const rows = rowsByQuery.shift() ?? [];
        return { rows };
      }),
      release: vi.fn(),
    };

    return {
      client,
      pool: {
        connect: vi.fn(async () => client),
      },
      queries,
    };
  }

  it("persists tool calls with aligned SQL placeholders for permission level and payload json", async () => {
    const { pool, queries } = createMockPool([[{ id: "tool-db-1" }]]);
    const repository = new DatabaseAgentToolRunnerRepository({ pool: pool as never });

    const result = await repository.createToolCall({
      argumentsJson: { prompt: "make a poster", size: "1K" },
      costEstimateJson: { totalCredits: 5 },
      createdBy: "33333333-3333-4333-8333-333333333333",
      permissionLevel: "safe_write",
      sessionId: "11111111-1111-4111-8111-111111111111",
      status: "planned",
      tenantId: "22222222-2222-4222-8222-222222222222",
      toolCallKey: "call-1",
      toolName: "generate_image",
      turnId: "44444444-4444-4444-8444-444444444444",
    });

    expect(result).toEqual({ id: "tool-db-1" });
    const insertQuery = queries.find((entry) => entry.sql.includes("INSERT INTO agent_tool_calls"));
    expect(insertQuery?.params).toEqual([
      "22222222-2222-4222-8222-222222222222",
      "11111111-1111-4111-8111-111111111111",
      "44444444-4444-4444-8444-444444444444",
      "call-1",
      "generate_image",
      "safe_write",
      "planned",
      JSON.stringify({ prompt: "make a poster", size: "1K" }),
      JSON.stringify({ totalCredits: 5 }),
      "33333333-3333-4333-8333-333333333333",
    ]);
  });
});
