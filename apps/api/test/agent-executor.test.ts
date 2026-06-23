import { describe, expect, it, vi } from "vitest";

import { buildAgentExecutorSystemPrompt } from "../src/modules/agent/agent-executor-prompt.js";
import { getAgentToolRegistryForModel } from "../src/modules/agent/agent-tool-registry.js";
import { AgentExecutorService } from "../src/modules/agent/agent-executor.service.js";

const context = {
  tenantId: "tenant-1",
  userId: "user-1",
};

const snapshot = {
  edges: [],
  flowId: "flow-1",
  nodeOutputs: {},
  nodes: [
    {
      id: "image-node-1",
      kind: "image" as const,
      position: { x: 0, y: 0 },
      selected: true,
      title: "Image Node",
    },
  ],
  projectId: "00000000-0000-0000-0000-000000000001",
  selectedNodeIds: ["image-node-1"],
  viewport: { x: 0, y: 0, zoom: 1 },
};

describe("agent executor prompt and registry", () => {
  it("describes production tools without provider internals", () => {
    const prompt = buildAgentExecutorSystemPrompt(getAgentToolRegistryForModel());
    expect(prompt).toContain("generate_image");
    expect(prompt).toContain("generate_image_batch");
    expect(prompt).not.toMatch(/baseUrl|apiKey|Authorization|provider_key|upstream_model|route_key/i);
  });
});

describe("AgentExecutorService", () => {
  it("returns a text-only answer without running tools", async () => {
    const executor = new AgentExecutorService({
      costEstimator: {
        estimateGenerateImage: vi.fn(),
        estimateGenerateImageBatch: vi.fn(),
      },
      repository: {
        createAssistantMessage: vi.fn(),
        createTurn: vi.fn().mockResolvedValue({ turnId: "turn-1" }),
        createUserMessage: vi.fn().mockResolvedValue({ messageId: "message-1" }),
        markTurnFailed: vi.fn(),
        markTurnSucceeded: vi.fn(),
      },
      textRuntime: {
        generateText: vi.fn().mockResolvedValue({ outputText: "我会先帮你梳理生产步骤。" }),
      },
      toolRunner: {
        runToolCall: vi.fn(),
      },
    });

    const result = await executor.executeTurn(context, {
      prompt: "帮我规划",
      sessionId: "session-1",
      snapshot,
    });

    expect(result.finalText).toContain("生产步骤");
    expect(result.toolResults).toHaveLength(0);
  });

  it("executes a single image tool call and continues with safe tool context", async () => {
    const generateText = vi
      .fn()
      .mockResolvedValueOnce({
        outputText: JSON.stringify({
          reply: "先生成基础图。",
          toolCalls: [
            {
              arguments: { prompt: "forest sports day", size: "1K" },
              toolCallKey: "tool-call-1",
              toolName: "generate_image",
            },
          ],
        }),
      })
      .mockResolvedValueOnce({
        outputText: JSON.stringify({
          final: true,
          reply: "基础图已提交生成。",
        }),
      });
    const toolRunner = {
      runToolCall: vi.fn().mockResolvedValue({
        assetRefs: [{ assetId: "asset-1", kind: "image", label: "Round 1 image 1", promptSummary: "", refId: "round-1-image-1" }],
        status: "succeeded",
        toolCallId: "tool-db-1",
      }),
    };

    const executor = new AgentExecutorService({
      costEstimator: {
        estimateGenerateImage: vi.fn().mockResolvedValue({ totalCredits: 4 }),
        estimateGenerateImageBatch: vi.fn(),
      },
      repository: {
        createAssistantMessage: vi.fn(),
        createTurn: vi.fn().mockResolvedValue({ turnId: "turn-1" }),
        createUserMessage: vi.fn().mockResolvedValue({ messageId: "message-1" }),
        markTurnFailed: vi.fn(),
        markTurnSucceeded: vi.fn(),
      },
      textRuntime: { generateText },
      toolRunner,
    });

    const result = await executor.executeTurn(context, {
      prompt: "生成森林运动会",
      sessionId: "session-1",
      snapshot,
    });

    expect(toolRunner.runToolCall).toHaveBeenCalledWith(context, expect.objectContaining({
      executionTarget: { flowId: "flow-1", targetNodeId: "image-node-1" },
    }));
    expect(generateText).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(result)).not.toMatch(/baseUrl|apiKey|Authorization|provider_key|upstream_model/);
  });

  it("stops when max rounds is exceeded", async () => {
    const executor = new AgentExecutorService({
      costEstimator: {
        estimateGenerateImage: vi.fn().mockResolvedValue({ totalCredits: 4 }),
        estimateGenerateImageBatch: vi.fn(),
      },
      limits: { maxToolRounds: 1 },
      repository: {
        createAssistantMessage: vi.fn(),
        createTurn: vi.fn().mockResolvedValue({ turnId: "turn-1" }),
        createUserMessage: vi.fn().mockResolvedValue({ messageId: "message-1" }),
        markTurnFailed: vi.fn(),
        markTurnSucceeded: vi.fn(),
      },
      textRuntime: {
        generateText: vi.fn().mockResolvedValue({
          outputText: JSON.stringify({
            toolCalls: [
              {
                arguments: { prompt: "one", size: "1K" },
                toolCallKey: "tool-call-1",
                toolName: "generate_image",
              },
            ],
          }),
        }),
      },
      toolRunner: {
        runToolCall: vi.fn().mockResolvedValue({ assetRefs: [], status: "succeeded", toolCallId: "tool-db-1" }),
      },
    });

    await expect(executor.executeTurn(context, {
      prompt: "一直生成",
      sessionId: "session-1",
      snapshot,
    })).rejects.toMatchObject({
      code: "AGENT_EXECUTOR_MAX_ROUNDS",
    });
  });

  it("pauses before credit tools when approval is required", async () => {
    const events: unknown[] = [];
    const toolRunner = {
      runToolCall: vi.fn(),
    };
    const executor = new AgentExecutorService({
      costEstimator: {
        estimateGenerateImage: vi.fn().mockResolvedValue({ totalCredits: 4 }),
        estimateGenerateImageBatch: vi.fn(),
      },
      limits: { requireApproval: true },
      repository: {
        createAssistantMessage: vi.fn(),
        createTurn: vi.fn().mockResolvedValue({ turnId: "turn-1" }),
        createUserMessage: vi.fn().mockResolvedValue({ messageId: "message-1" }),
        markTurnFailed: vi.fn(),
        markTurnSucceeded: vi.fn(),
      },
      textRuntime: {
        generateText: vi.fn().mockResolvedValue({
          outputText: JSON.stringify({
            toolCalls: [
              {
                arguments: { prompt: "one", size: "1K" },
                toolCallKey: "tool-call-1",
                toolName: "generate_image",
              },
            ],
          }),
        }),
      },
      toolRunner,
    });

    const result = await executor.executeTurn(context, {
      onEvent: (event) => events.push(event),
      prompt: "生成",
      sessionId: "session-1",
      snapshot,
    });

    expect(toolRunner.runToolCall).not.toHaveBeenCalled();
    expect(events).toContainEqual(expect.objectContaining({
      toolCallKey: "tool-call-1",
      turnId: "turn-1",
      type: "approval_required",
    }));
    expect(result.finalText).toContain("Confirm");
  });

  it("resumes an approved credit tool from the stored pending turn", async () => {
    const toolRunner = {
      runToolCall: vi.fn().mockResolvedValue({
        assetRefs: [{ assetId: "asset-1", kind: "image", label: "Round 1 image 1", promptSummary: "", refId: "round-1-image-1" }],
        failures: [],
        status: "succeeded",
        toolCallId: "tool-db-1",
        workflowRunIds: ["workflow-1"],
      }),
    };
    const repository = {
      createAssistantMessage: vi.fn(),
      createTurn: vi.fn().mockResolvedValue({ turnId: "turn-1" }),
      createUserMessage: vi.fn().mockResolvedValue({ messageId: "message-1" }),
      markTurnFailed: vi.fn(),
      markTurnSucceeded: vi.fn(),
      readPendingApproval: vi.fn().mockResolvedValue({
        costEstimate: { totalCredits: 4 },
        pendingToolCall: {
          arguments: { prompt: "forest sports day", size: "1K" },
          toolCallKey: "tool-call-1",
          toolName: "generate_image",
        },
        snapshot,
      }),
    };
    const executor = new AgentExecutorService({
      costEstimator: {
        estimateGenerateImage: vi.fn().mockResolvedValue({ totalCredits: 4 }),
        estimateGenerateImageBatch: vi.fn(),
      },
      limits: { requireApproval: true },
      repository,
      textRuntime: {
        generateText: vi.fn(),
      },
      toolRunner,
    });

    const events: unknown[] = [];
    const result = await executor.approveToolCall(context, {
      onEvent: (event) => events.push(event),
      sessionId: "session-1",
      toolCallKey: "tool-call-1",
      turnId: "turn-1",
    });

    expect(repository.readPendingApproval).toHaveBeenCalledWith({
      sessionId: "session-1",
      tenantId: "tenant-1",
      toolCallKey: "tool-call-1",
      turnId: "turn-1",
    });
    expect(toolRunner.runToolCall).toHaveBeenCalledWith(context, expect.objectContaining({
      executionTarget: { flowId: "flow-1", targetNodeId: "image-node-1" },
      turnId: "turn-1",
    }));
    expect(events).toContainEqual(expect.objectContaining({ toolCallKey: "tool-call-1", type: "tool_started" }));
    expect(events).toContainEqual(expect.objectContaining({ toolCallKey: "tool-call-1", type: "tool_result" }));
    expect(result.toolResults[0]?.assetRefs[0]?.assetId).toBe("asset-1");
  });
});
