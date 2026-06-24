import { describe, expect, it, vi } from "vitest";

import { buildAgentExecutorSystemPrompt } from "../src/modules/agent/agent-executor-prompt.js";
import { AgentExecutorService } from "../src/modules/agent/agent-executor.service.js";
import { getAgentToolRegistryForModel } from "../src/modules/agent/agent-tool-registry.js";

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
        readPendingApproval: vi.fn(),
      },
      textRuntime: {
        generateText: vi.fn().mockResolvedValue({ outputText: "I will first organize the production steps." }),
      },
      toolRunner: {
        runToolCall: vi.fn(),
      },
    });

    const result = await executor.executeTurn(context, {
      prompt: "Help me plan the next step",
      sessionId: "session-1",
      snapshot,
    });

    expect(result.finalText).toContain("production steps");
    expect(result.toolResults).toHaveLength(0);
  });

  it("emits visible status events and workflow linkage during image execution", async () => {
    const generateText = vi
      .fn()
      .mockResolvedValueOnce({
        outputText: JSON.stringify({
          reply: "Starting the first image generation.",
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
          reply: "The base image has been submitted.",
        }),
      });
    const toolRunner = {
      runToolCall: vi.fn().mockResolvedValue({
        assetRefs: [{ assetId: "asset-1", kind: "image", label: "Round 1 image 1", promptSummary: "", refId: "round-1-image-1" }],
        status: "succeeded",
        toolCallId: "tool-db-1",
        workflowRunIds: ["workflow-1"],
        workflowRuns: [{ nodeRunId: "node-1", workflowRunId: "workflow-1" }],
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
        readPendingApproval: vi.fn(),
      },
      textRuntime: { generateText },
      toolRunner,
    });

    const events: unknown[] = [];
    const result = await executor.executeTurn(context, {
      onEvent: (event) => events.push(event),
      prompt: "Generate a forest sports day image",
      sessionId: "session-1",
      snapshot,
    });

    expect(toolRunner.runToolCall).toHaveBeenCalledWith(context, expect.objectContaining({
      executionTarget: { flowId: "flow-1", targetNodeId: "image-node-1" },
    }));
    expect(generateText).toHaveBeenCalledTimes(2);
    expect(events).toContainEqual(expect.objectContaining({
      label: "Understanding request",
      type: "thinking_status",
    }));
    expect(events).toContainEqual(expect.objectContaining({
      label: "Creating task card",
      type: "thinking_status",
    }));
    expect(events).toContainEqual(expect.objectContaining({
      taskId: "tool-db-1",
      title: "Image generation",
      toolCallKey: "tool-call-1",
      type: "task_created",
    }));
    expect(events).toContainEqual(expect.objectContaining({
      toolCallKey: "tool-call-1",
      type: "workflow_run_linked",
      workflowRunId: "workflow-1",
    }));
    expect(events).toContainEqual(expect.objectContaining({
      assetRef: expect.objectContaining({ assetId: "asset-1" }),
      taskId: "tool-db-1",
      toolCallKey: "tool-call-1",
      type: "artifact_created",
    }));
    expect(JSON.stringify(result)).not.toMatch(/baseUrl|apiKey|Authorization|provider_key|upstream_model/);
  });

  it("repairs a production image answer that forgot to call tools", async () => {
    const generateText = vi
      .fn()
      .mockResolvedValueOnce({
        outputText: "I can help you generate that image. Please confirm the style.",
      })
      .mockResolvedValueOnce({
        outputText: JSON.stringify({
          reply: "Starting image generation.",
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
          reply: "Image generation has started.",
        }),
      });
    const toolRunner = {
      runToolCall: vi.fn().mockResolvedValue({
        assetRefs: [{ assetId: "asset-1", kind: "image", label: "Round 1 image 1", promptSummary: "", refId: "round-1-image-1" }],
        failures: [],
        status: "succeeded",
        toolCallId: "tool-db-1",
        workflowRunIds: ["workflow-1"],
        workflowRuns: [{ nodeRunId: "node-1", workflowRunId: "workflow-1" }],
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
        readPendingApproval: vi.fn(),
      },
      textRuntime: { generateText },
      toolRunner,
    });

    await executor.executeTurn(context, {
      prompt: "Generate an image of a forest sports day",
      sessionId: "session-1",
      snapshot,
    });

    expect(generateText).toHaveBeenCalledTimes(3);
    expect(generateText.mock.calls[1]?.[1].messages.some((message) =>
      message.content.includes("must return toolCalls"),
    )).toBe(true);
    expect(toolRunner.runToolCall).toHaveBeenCalledTimes(1);
  });

  it("fails a production image answer when repair still does not produce tools", async () => {
    const toolRunner = {
      runToolCall: vi.fn(),
    };
    const repository = {
      createAssistantMessage: vi.fn(),
      createTurn: vi.fn().mockResolvedValue({ turnId: "turn-1" }),
      createUserMessage: vi.fn().mockResolvedValue({ messageId: "message-1" }),
      markTurnFailed: vi.fn(),
      markTurnSucceeded: vi.fn(),
      readPendingApproval: vi.fn(),
    };
    const executor = new AgentExecutorService({
      costEstimator: {
        estimateGenerateImage: vi.fn(),
        estimateGenerateImageBatch: vi.fn(),
      },
      repository,
      textRuntime: {
        generateText: vi
          .fn()
          .mockResolvedValueOnce({ outputText: "Sure, here is a suggested prompt." })
          .mockResolvedValueOnce({ outputText: "Please add an image node first." }),
      },
      toolRunner,
    });

    await expect(executor.executeTurn(context, {
      prompt: "Generate an image of a forest sports day",
      sessionId: "session-1",
      snapshot,
    })).rejects.toMatchObject({
      code: "AGENT_EXECUTOR_REQUIRES_TOOL_CALL",
    });
    expect(toolRunner.runToolCall).not.toHaveBeenCalled();
    expect(repository.markTurnFailed).toHaveBeenCalledWith(expect.objectContaining({
      error: expect.objectContaining({ code: "AGENT_EXECUTOR_REQUIRES_TOOL_CALL" }),
    }));
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
        readPendingApproval: vi.fn(),
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
        runToolCall: vi.fn().mockResolvedValue({ assetRefs: [], status: "succeeded", toolCallId: "tool-db-1", workflowRunIds: [], workflowRuns: [] }),
      },
    });

    await expect(executor.executeTurn(context, {
      prompt: "Keep generating forever",
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
        readPendingApproval: vi.fn(),
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
      prompt: "Generate one image",
      sessionId: "session-1",
      snapshot,
    });

    expect(toolRunner.runToolCall).not.toHaveBeenCalled();
    expect(events).toContainEqual(expect.objectContaining({
      estimate: expect.objectContaining({
        referenceRefs: [],
      }),
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
        workflowRuns: [{ nodeRunId: "node-1", workflowRunId: "workflow-1" }],
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
      settings: {
        aspectRatio: "16:9",
        modelDisplayName: "Nano Banana Pro",
        routeKey: "image.mouxihub.nano-banana-pro.t3",
        routeLabel: "线路二（官方T3）",
        size: "4K",
      },
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
      call: expect.objectContaining({
        arguments: expect.objectContaining({
          aspectRatio: "16:9",
          modelDisplayName: "Nano Banana Pro",
          routeKey: "image.mouxihub.nano-banana-pro.t3",
          routeLabel: "线路二（官方T3）",
          size: "4K",
        }),
      }),
      executionTarget: { flowId: "flow-1", targetNodeId: "image-node-1" },
      turnId: "turn-1",
    }));
    expect(events).toContainEqual(expect.objectContaining({ toolCallKey: "tool-call-1", type: "tool_started" }));
    expect(events).toContainEqual(expect.objectContaining({ toolCallKey: "tool-call-1", type: "tool_result" }));
    expect(result.toolResults[0]?.assetRefs[0]?.assetId).toBe("asset-1");
  });

  it("applies approved settings to every image in a pending batch generation", async () => {
    const toolRunner = {
      runToolCall: vi.fn().mockResolvedValue({
        assetRefs: [{ assetId: "asset-batch-1", kind: "image", label: "Batch image 1", promptSummary: "", refId: "round-1-image-1" }],
        failures: [],
        status: "succeeded",
        toolCallId: "tool-db-batch-1",
        workflowRunIds: ["workflow-batch-1"],
        workflowRuns: [{ nodeRunId: "node-batch-1", workflowRunId: "workflow-batch-1" }],
      }),
    };
    const repository = {
      createAssistantMessage: vi.fn(),
      createTurn: vi.fn().mockResolvedValue({ turnId: "turn-1" }),
      createUserMessage: vi.fn().mockResolvedValue({ messageId: "message-1" }),
      markTurnFailed: vi.fn(),
      markTurnSucceeded: vi.fn(),
      readPendingApproval: vi.fn().mockResolvedValue({
        costEstimate: { totalCredits: 8 },
        pendingToolCall: {
          arguments: {
            images: [
              { prompt: "image one", size: "1K" },
              { prompt: "image two", size: "2K" },
            ],
            sharedStyle: "forest sports day",
          },
          toolCallKey: "tool-batch-1",
          toolName: "generate_image_batch",
        },
        snapshot,
      }),
    };
    const executor = new AgentExecutorService({
      costEstimator: {
        estimateGenerateImage: vi.fn().mockResolvedValue({ totalCredits: 4 }),
        estimateGenerateImageBatch: vi.fn().mockResolvedValue({ totalCredits: 8 }),
      },
      limits: { requireApproval: true },
      repository,
      textRuntime: {
        generateText: vi.fn(),
      },
      toolRunner,
    });

    await executor.approveToolCall(context, {
      sessionId: "session-1",
      settings: {
        aspectRatio: "16:9",
        modelDisplayName: "Nano Banana Pro",
        routeKey: "image.mouxihub.nano-banana-pro.t3",
        routeLabel: "线路二（官方T3）",
        size: "4K",
      },
      toolCallKey: "tool-batch-1",
      turnId: "turn-1",
    });

    expect(toolRunner.runToolCall).toHaveBeenCalledWith(context, expect.objectContaining({
      call: expect.objectContaining({
        arguments: expect.objectContaining({
          images: [
            expect.objectContaining({
              aspectRatio: "16:9",
              modelDisplayName: "Nano Banana Pro",
              routeKey: "image.mouxihub.nano-banana-pro.t3",
              routeLabel: "线路二（官方T3）",
              size: "4K",
            }),
            expect.objectContaining({
              aspectRatio: "16:9",
              modelDisplayName: "Nano Banana Pro",
              routeKey: "image.mouxihub.nano-banana-pro.t3",
              routeLabel: "线路二（官方T3）",
              size: "4K",
            }),
          ],
        }),
      }),
    }));
  });

  it("applies approved settings to a pending edit image tool call", async () => {
    const toolRunner = {
      runToolCall: vi.fn().mockResolvedValue({
        assetRefs: [{ assetId: "asset-edit-1", kind: "image", label: "Edited image 1", promptSummary: "", refId: "round-1-image-1" }],
        failures: [],
        status: "succeeded",
        toolCallId: "tool-db-edit-1",
        workflowRunIds: ["workflow-edit-1"],
        workflowRuns: [{ nodeRunId: "node-edit-1", workflowRunId: "workflow-edit-1" }],
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
          arguments: {
            prompt: "turn this into a poster",
            referenceRefs: ["asset:1"],
            size: "1K",
          },
          toolCallKey: "tool-edit-1",
          toolName: "edit_image",
        },
        snapshot,
      }),
    };
    const executor = new AgentExecutorService({
      costEstimator: {
        estimateGenerateImage: vi.fn().mockResolvedValue({ totalCredits: 5 }),
        estimateGenerateImageBatch: vi.fn(),
      },
      limits: { allowImageEdit: true, requireApproval: true },
      repository,
      textRuntime: {
        generateText: vi.fn(),
      },
      toolRunner,
    });

    await executor.approveToolCall(context, {
      sessionId: "session-1",
      settings: {
        aspectRatio: "16:9",
        modelDisplayName: "Nano Banana Pro",
        routeKey: "image.pixellelabs.nano-banana-pro",
        routeLabel: "线路一",
        size: "4K",
      },
      toolCallKey: "tool-edit-1",
      turnId: "turn-1",
    });

    expect(toolRunner.runToolCall).toHaveBeenCalledWith(context, expect.objectContaining({
      call: expect.objectContaining({
        arguments: expect.objectContaining({
          aspectRatio: "16:9",
          prompt: "turn this into a poster",
          referenceRefs: ["asset:1"],
          routeKey: "image.pixellelabs.nano-banana-pro",
          routeLabel: "线路一",
          size: "4K",
        }),
      }),
    }));
  });

  it("includes reference refs in approval events for edit image tasks", async () => {
    const events: unknown[] = [];
    const toolRunner = {
      runToolCall: vi.fn(),
    };
    const executor = new AgentExecutorService({
      costEstimator: {
        estimateGenerateImage: vi.fn().mockResolvedValue({ totalCredits: 5 }),
        estimateGenerateImageBatch: vi.fn(),
      },
      limits: { allowImageEdit: true, requireApproval: true },
      repository: {
        createAssistantMessage: vi.fn(),
        createTurn: vi.fn().mockResolvedValue({ turnId: "turn-1" }),
        createUserMessage: vi.fn().mockResolvedValue({ messageId: "message-1" }),
        markTurnFailed: vi.fn(),
        markTurnSucceeded: vi.fn(),
        readPendingApproval: vi.fn(),
      },
      textRuntime: {
        generateText: vi.fn().mockResolvedValue({
          outputText: JSON.stringify({
            toolCalls: [
              {
                arguments: {
                  prompt: "turn this into a poster",
                  referenceRefs: ["round-1-image-1", "asset:2"],
                  size: "1K",
                },
                toolCallKey: "tool-edit-1",
                toolName: "edit_image",
              },
            ],
          }),
        }),
      },
      toolRunner,
    });

    await executor.executeTurn(context, {
      onEvent: (event) => events.push(event),
      prompt: "Edit the selected image into a poster",
      sessionId: "session-1",
      snapshot,
    });

    expect(events).toContainEqual(expect.objectContaining({
      estimate: expect.objectContaining({
        referenceRefs: ["round-1-image-1", "asset:2"],
        totalCredits: 5,
      }),
      toolCallKey: "tool-edit-1",
      turnId: "turn-1",
      type: "approval_required",
    }));
    expect(toolRunner.runToolCall).not.toHaveBeenCalled();
  });
});
