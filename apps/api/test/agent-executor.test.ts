import { describe, expect, it, vi } from "vitest";

import type { ApiEnv } from "../src/config/env.js";
import { buildAgentExecutorService } from "../src/app.js";
import {
  AgentReferenceAssetRepository,
  AgentReferenceResolutionError,
} from "../src/modules/agent/agent-reference-context.js";
import { buildAgentExecutorSystemPrompt } from "../src/modules/agent/agent-executor-prompt.js";
import { AgentExecutorService } from "../src/modules/agent/agent-executor.service.js";
import { AgentApiError, AgentService } from "../src/modules/agent/agent.service.js";
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

const testEnv: ApiEnv = {
  accessTokenTtlSeconds: 900,
  adminEmails: [],
  agentDirectorEnabled: false,
  agentExecutorEnabled: true,
  agentPlannerFallbackEnabled: false,
  agentPlannerEnabled: false,
  agentPlannerRepairAttempts: 1,
  agentPlannerTimeoutMs: 45_000,
  agentTextRouteKey: "text.default",
  credentialKeyVersion: "v1",
  credentialMasterKey: "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=",
  jwtAccessSecret: "test_access_secret_1234567890",
  jwtRefreshSecret: "test_refresh_secret_1234567890",
  nodeEnv: "test",
  queuePrefix: "test-prefix",
  redisUrl: "redis://localhost:6379",
  refreshTokenTtlSeconds: 604800,
  s3AccessKeyId: "test-access",
  s3Bucket: "test-bucket",
  s3Endpoint: "http://localhost:9000",
  s3ForcePathStyle: true,
  s3Region: "us-east-1",
  s3SecretAccessKey: "test-secret",
};

function createExecutorRepository(overrides: Record<string, unknown> = {}) {
  return {
    createAssistantMessage: vi.fn(),
    createTurn: vi.fn().mockResolvedValue({ turnId: "turn-1" }),
    createUserMessage: vi.fn().mockResolvedValue({ messageId: "message-1" }),
    listSessionAssetRefs: vi.fn().mockResolvedValue([]),
    markTurnFailed: vi.fn(),
    markTurnSucceeded: vi.fn(),
    readPendingApproval: vi.fn(),
    readSessionScope: vi.fn().mockResolvedValue({ projectId: snapshot.projectId }),
    ...overrides,
  };
}

describe("agent executor prompt and registry", () => {
  it("describes production tools without provider internals", () => {
    const prompt = buildAgentExecutorSystemPrompt(getAgentToolRegistryForModel());
    expect(prompt).toContain("generate_image");
    expect(prompt).toContain("generate_image_batch");
    expect(prompt).toContain("Never invent referenceRefs");
    expect(prompt).not.toMatch(/baseUrl|apiKey|provider_key|upstream_model|route_key/i);
  });
});

describe("AgentExecutorService", () => {
  it("app construction seam wires reference asset validation into the executor", () => {
    const executor = buildAgentExecutorService({
      costEstimator: {
        estimateGenerateImage: vi.fn(),
        estimateGenerateImageBatch: vi.fn(),
      },
      env: testEnv,
      pool: { query: vi.fn() } as never,
      textRuntime: {
        generateText: vi.fn(),
      },
      toolRunner: {
        runToolCall: vi.fn(),
      },
    });

    expect((executor as never as { options: { referenceAssetRepository?: unknown } }).options.referenceAssetRepository)
      .toBeInstanceOf(AgentReferenceAssetRepository);
  });

  it("converts reference validation failures in execute streams to structured API errors", async () => {
    const service = new AgentService({
      env: testEnv,
      executorService: {
        executeTurn: vi.fn().mockRejectedValue(
          new AgentReferenceResolutionError(
            "bad-asset-id",
            "AGENT_REFERENCE_INVALID_ASSET_ID",
            "Agent reference asset id is invalid: bad-asset-id",
          ),
        ),
        approveToolCall: vi.fn(),
      },
      flowsService: {
        getFlowDraft: vi.fn(),
        saveFlowDraft: vi.fn(),
      },
      pool: { query: vi.fn() } as never,
      runSettingsService: {
        estimateImageRunSettings: vi.fn(),
        listImageRunSettings: vi.fn(),
      },
    });

    let caught: unknown;
    try {
      await service.buildExecuteTurnStream(context, "session-1", {
        prompt: "Use bad reference",
        referenceContext: {
          items: [
            { assetId: "bad-asset-id", kind: "upload", label: "Bad", refId: "upload-1" },
          ],
        },
        snapshot,
      });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(AgentApiError);
    expect(caught).toMatchObject({
      code: "AGENT_REFERENCE_INVALID_ASSET_ID",
      statusCode: 400,
    });
  });

  it("returns a text-only answer without running tools", async () => {
    const executor = new AgentExecutorService({
      costEstimator: {
        estimateGenerateImage: vi.fn(),
        estimateGenerateImageBatch: vi.fn(),
      },
      repository: createExecutorRepository(),
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
      runToolCall: vi.fn().mockImplementation(async (_context, input) => {
        await input.onEvent?.({
          taskId: "tool-db-1",
          title: "Image generation",
          toolCallKey: "tool-call-1",
          toolName: "generate_image",
          type: "task_created",
        });
        await input.onEvent?.({
          nodeRunId: "node-1",
          toolCallKey: "tool-call-1",
          type: "workflow_run_linked",
          workflowRunId: "workflow-1",
        });
        await input.onEvent?.({
          assetRef: { assetId: "asset-1", kind: "image", label: "Round 1 image 1", promptSummary: "", refId: "round-1-image-1" },
          taskId: "tool-db-1",
          toolCallKey: "tool-call-1",
          type: "artifact_created",
        });
        return {
          assetRefs: [{ assetId: "asset-1", kind: "image", label: "Round 1 image 1", promptSummary: "", refId: "round-1-image-1" }],
          status: "succeeded",
          toolCallId: "tool-db-1",
          workflowRunIds: ["workflow-1"],
          workflowRuns: [{ nodeRunId: "node-1", workflowRunId: "workflow-1" }],
        };
      }),
    };

    const executor = new AgentExecutorService({
      costEstimator: {
        estimateGenerateImage: vi.fn().mockResolvedValue({ totalCredits: 4 }),
        estimateGenerateImageBatch: vi.fn(),
      },
      repository: createExecutorRepository(),
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
    expect(events.findIndex((event) => (event as { type?: string }).type === "task_created"))
      .toBeLessThan(events.findIndex((event) => (event as { type?: string }).type === "tool_result"));
    expect(JSON.stringify(result)).not.toMatch(/baseUrl|apiKey|Authorization|provider_key|upstream_model/);
  });

  it("passes previous results and current references to tool execution", async () => {
    const repository = createExecutorRepository({
      listSessionAssetRefs: vi.fn().mockResolvedValue([
        {
          assetId: "asset-previous-1",
          kind: "image",
          label: "Round 1 image 1",
          promptSummary: "previous secret prompt",
          refId: "round-1-image-1",
        },
      ]),
    });
    const toolRunner = {
      runToolCall: vi.fn().mockResolvedValue({
        assetRefs: [],
        status: "succeeded",
        toolCallId: "tool-db-1",
        workflowRunIds: [],
        workflowRuns: [],
      }),
    };
    const executor = new AgentExecutorService({
      costEstimator: {
        estimateGenerateImage: vi.fn().mockResolvedValue({ totalCredits: 4 }),
        estimateGenerateImageBatch: vi.fn(),
      },
      repository,
      textRuntime: {
        generateText: vi
          .fn()
          .mockResolvedValueOnce({
            outputText: JSON.stringify({
              toolCalls: [
                {
                  arguments: {
                    prompt: "make a new image with the uploaded reference",
                    referenceRefs: ["upload-1", "round-1-image-1"],
                    size: "1K",
                  },
                  toolCallKey: "tool-call-1",
                  toolName: "generate_image",
                },
              ],
            }),
          })
          .mockResolvedValueOnce({ outputText: JSON.stringify({ reply: "Started." }) }),
      },
      toolRunner,
    });

    await executor.executeTurn(context, {
      prompt: "Use my uploaded image",
      referenceContext: {
        items: [
          { assetId: "asset-upload-1", kind: "upload", label: "Upload 1", refId: "upload-1" },
        ],
      },
      sessionId: "session-1",
      snapshot,
    });

    expect(toolRunner.runToolCall).toHaveBeenCalledWith(context, expect.objectContaining({
      previousResults: [expect.objectContaining({ refId: "round-1-image-1" })],
      referenceContext: { items: [expect.objectContaining({ assetId: "asset-upload-1", refId: "upload-1" })] },
    }));
    const callInput = toolRunner.runToolCall.mock.calls[0]?.[1];
    expect(callInput.previousResults?.[0]).not.toHaveProperty("promptSummary");
  });

  it("validates references against the server session project when the snapshot project is missing", async () => {
    const referenceAssetRepository = {
      validateImageReferences: vi.fn().mockResolvedValue(undefined),
    };
    const repository = createExecutorRepository({
      readSessionScope: vi.fn().mockResolvedValue({ projectId: "server-project-1" }),
    });
    const toolRunner = {
      runToolCall: vi.fn().mockResolvedValue({
        assetRefs: [],
        status: "succeeded",
        toolCallId: "tool-db-1",
        workflowRunIds: [],
        workflowRuns: [],
      }),
    };
    const executor = new AgentExecutorService({
      costEstimator: {
        estimateGenerateImage: vi.fn().mockResolvedValue({ totalCredits: 4 }),
        estimateGenerateImageBatch: vi.fn(),
      },
      referenceAssetRepository,
      repository,
      textRuntime: {
        generateText: vi
          .fn()
          .mockResolvedValueOnce({
            outputText: JSON.stringify({
              toolCalls: [
                {
                  arguments: { prompt: "use upload", referenceRefs: ["upload-1"], size: "1K" },
                  toolCallKey: "tool-call-1",
                  toolName: "generate_image",
                },
              ],
            }),
          })
          .mockResolvedValueOnce({ outputText: JSON.stringify({ reply: "Started." }) }),
      },
      toolRunner,
    });

    await executor.executeTurn(context, {
      prompt: "Use my uploaded image",
      referenceContext: {
        items: [
          { assetId: "asset-upload-1", kind: "upload", label: "Upload 1", refId: "upload-1" },
        ],
      },
      sessionId: "session-1",
      snapshot: { ...snapshot, projectId: null },
    });

    expect(repository.readSessionScope).toHaveBeenCalledWith({
      sessionId: "session-1",
      tenantId: "tenant-1",
    });
    expect(referenceAssetRepository.validateImageReferences).toHaveBeenCalledWith({
      continuationContext: undefined,
      projectId: "server-project-1",
      referenceContext: {
        items: [
          { assetId: "asset-upload-1", kind: "upload", label: "Upload 1", refId: "upload-1" },
        ],
      },
      tenantId: "tenant-1",
    });
  });

  it("rejects a spoofed snapshot project id before model execution", async () => {
    const referenceAssetRepository = {
      validateImageReferences: vi.fn(),
    };
    const repository = createExecutorRepository({
      readSessionScope: vi.fn().mockResolvedValue({ projectId: "server-project-1" }),
    });
    const generateText = vi.fn();
    const toolRunner = {
      runToolCall: vi.fn(),
    };
    const executor = new AgentExecutorService({
      costEstimator: {
        estimateGenerateImage: vi.fn(),
        estimateGenerateImageBatch: vi.fn(),
      },
      referenceAssetRepository,
      repository,
      textRuntime: { generateText },
      toolRunner,
    });

    await expect(executor.executeTurn(context, {
      prompt: "Use a spoofed project",
      referenceContext: {
        items: [
          { assetId: "asset-upload-1", kind: "upload", label: "Upload 1", refId: "upload-1" },
        ],
      },
      sessionId: "session-1",
      snapshot: { ...snapshot, projectId: "client-project-2" },
    })).rejects.toMatchObject({
      code: "AGENT_SESSION_PROJECT_MISMATCH",
      statusCode: 400,
    });
    expect(referenceAssetRepository.validateImageReferences).not.toHaveBeenCalled();
    expect(generateText).not.toHaveBeenCalled();
    expect(toolRunner.runToolCall).not.toHaveBeenCalled();
  });

  it("rejects malformed continuation asset ids before model execution", async () => {
    const pool = { query: vi.fn() };
    const repository = createExecutorRepository({
      readSessionScope: vi.fn().mockResolvedValue({ projectId: "server-project-1" }),
    });
    const generateText = vi.fn();
    const toolRunner = {
      runToolCall: vi.fn(),
    };
    const executor = new AgentExecutorService({
      costEstimator: {
        estimateGenerateImage: vi.fn(),
        estimateGenerateImageBatch: vi.fn(),
      },
      referenceAssetRepository: new AgentReferenceAssetRepository({ pool: pool as never }),
      repository,
      textRuntime: { generateText },
      toolRunner,
    });

    await expect(executor.executeTurn(context, {
      continuationContext: {
        action: "continue-edit",
        assetId: "asset-continuation-1",
        assetLabel: "Continuation",
        assetRefId: "round-1-image-1",
      },
      prompt: "Continue editing this result",
      sessionId: "session-1",
      snapshot: { ...snapshot, projectId: null },
    })).rejects.toMatchObject({
      code: "AGENT_REFERENCE_INVALID_ASSET_ID",
      statusCode: 400,
    });

    expect(pool.query).not.toHaveBeenCalled();
    expect(repository.createUserMessage).not.toHaveBeenCalled();
    expect(generateText).not.toHaveBeenCalled();
    expect(toolRunner.runToolCall).not.toHaveBeenCalled();
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
      repository: createExecutorRepository(),
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
    const repository = createExecutorRepository();
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
      repository: createExecutorRepository(),
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
      repository: createExecutorRepository(),
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

  it("stores reference context and safe previous results when approval is required", async () => {
    const repository = createExecutorRepository({
      listSessionAssetRefs: vi.fn().mockResolvedValue([
        {
          assetId: "asset-previous-1",
          kind: "image",
          label: "Round 1 image 1",
          promptSummary: "previous secret prompt",
          refId: "round-1-image-1",
        },
      ]),
    });
    const executor = new AgentExecutorService({
      costEstimator: {
        estimateGenerateImage: vi.fn().mockResolvedValue({ totalCredits: 4 }),
        estimateGenerateImageBatch: vi.fn(),
      },
      limits: { requireApproval: true },
      repository,
      textRuntime: {
        generateText: vi.fn().mockResolvedValue({
          outputText: JSON.stringify({
            toolCalls: [
              {
                arguments: {
                  prompt: "use references",
                  referenceRefs: ["upload-1", "round-1-image-1"],
                  size: "1K",
                },
                toolCallKey: "tool-call-1",
                toolName: "generate_image",
              },
            ],
          }),
        }),
      },
      toolRunner: {
        runToolCall: vi.fn(),
      },
    });

    await executor.executeTurn(context, {
      prompt: "Generate one image",
      referenceContext: {
        items: [
          { assetId: "asset-upload-1", kind: "upload", label: "Upload 1", refId: "upload-1" },
        ],
      },
      sessionId: "session-1",
      snapshot,
    });

    expect(repository.markTurnSucceeded).toHaveBeenCalledWith(expect.objectContaining({
      planJson: expect.objectContaining({
        previousResults: [
          expect.objectContaining({
            assetId: "asset-previous-1",
            kind: "image",
            label: "Round 1 image 1",
            refId: "round-1-image-1",
          }),
        ],
        referenceContext: {
          items: [expect.objectContaining({ assetId: "asset-upload-1", refId: "upload-1" })],
        },
      }),
    }));
    const planJson = repository.markTurnSucceeded.mock.calls[0]?.[0]?.planJson;
    expect(planJson.previousResults?.[0]).not.toHaveProperty("promptSummary");
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
    const repository = createExecutorRepository({
      readPendingApproval: vi.fn().mockResolvedValue({
        costEstimate: { totalCredits: 4 },
        pendingToolCall: {
          arguments: { prompt: "forest sports day", size: "1K" },
          toolCallKey: "tool-call-1",
          toolName: "generate_image",
        },
        snapshot,
      }),
    });
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

  it("passes stored reference context and previous results when approving a pending tool", async () => {
    const toolRunner = {
      runToolCall: vi.fn().mockResolvedValue({
        assetRefs: [],
        status: "succeeded",
        toolCallId: "tool-db-1",
        workflowRunIds: [],
        workflowRuns: [],
      }),
    };
    const repository = createExecutorRepository({
      readPendingApproval: vi.fn().mockResolvedValue({
        costEstimate: { totalCredits: 4 },
        pendingToolCall: {
          arguments: {
            prompt: "use references",
            referenceRefs: ["upload-1", "round-1-image-1"],
            size: "1K",
          },
          toolCallKey: "tool-call-1",
          toolName: "generate_image",
        },
        previousResults: [
          { assetId: "asset-previous-1", kind: "image", label: "Round 1 image 1", refId: "round-1-image-1" },
        ],
        referenceContext: {
          items: [
            { assetId: "asset-upload-1", kind: "upload", label: "Upload 1", refId: "upload-1" },
          ],
        },
        snapshot,
      }),
    });
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

    await executor.approveToolCall(context, {
      sessionId: "session-1",
      toolCallKey: "tool-call-1",
      turnId: "turn-1",
    });

    expect(toolRunner.runToolCall).toHaveBeenCalledWith(context, expect.objectContaining({
      previousResults: [expect.objectContaining({ refId: "round-1-image-1" })],
      referenceContext: { items: [expect.objectContaining({ assetId: "asset-upload-1", refId: "upload-1" })] },
    }));
  });

  it("revalidates pending approval references against the server session project before running the tool", async () => {
    const referenceAssetRepository = {
      validateImageReferences: vi.fn().mockResolvedValue(undefined),
    };
    const toolRunner = {
      runToolCall: vi.fn().mockResolvedValue({
        assetRefs: [],
        status: "succeeded",
        toolCallId: "tool-db-1",
        workflowRunIds: [],
        workflowRuns: [],
      }),
    };
    const repository = createExecutorRepository({
      readPendingApproval: vi.fn().mockResolvedValue({
        costEstimate: { totalCredits: 4 },
        pendingToolCall: {
          arguments: {
            prompt: "use references",
            referenceRefs: ["upload-1"],
            size: "1K",
          },
          toolCallKey: "tool-call-1",
          toolName: "generate_image",
        },
        referenceContext: {
          items: [
            { assetId: "asset-upload-1", kind: "upload", label: "Upload 1", refId: "upload-1" },
          ],
        },
        snapshot,
      }),
      readSessionScope: vi.fn().mockResolvedValue({ projectId: "server-project-1" }),
    });
    const executor = new AgentExecutorService({
      costEstimator: {
        estimateGenerateImage: vi.fn().mockResolvedValue({ totalCredits: 4 }),
        estimateGenerateImageBatch: vi.fn(),
      },
      referenceAssetRepository,
      repository,
      textRuntime: {
        generateText: vi.fn(),
      },
      toolRunner,
    });

    await executor.approveToolCall(context, {
      sessionId: "session-1",
      toolCallKey: "tool-call-1",
      turnId: "turn-1",
    });

    expect(repository.readSessionScope).toHaveBeenCalledWith({
      sessionId: "session-1",
      tenantId: "tenant-1",
    });
    expect(referenceAssetRepository.validateImageReferences).toHaveBeenCalledWith({
      continuationContext: null,
      projectId: "server-project-1",
      referenceContext: {
        items: [
          { assetId: "asset-upload-1", kind: "upload", label: "Upload 1", refId: "upload-1" },
        ],
      },
      tenantId: "tenant-1",
    });
    expect(referenceAssetRepository.validateImageReferences.mock.invocationCallOrder[0])
      .toBeLessThan(toolRunner.runToolCall.mock.invocationCallOrder[0]);
  });

  it("revalidates pending approval continuation references before running the tool", async () => {
    const referenceAssetRepository = {
      validateImageReferences: vi.fn().mockResolvedValue(undefined),
    };
    const toolRunner = {
      runToolCall: vi.fn().mockResolvedValue({
        assetRefs: [],
        status: "succeeded",
        toolCallId: "tool-db-1",
        workflowRunIds: [],
        workflowRuns: [],
      }),
    };
    const continuationContext = {
      action: "continue-edit" as const,
      assetId: "00000000-0000-0000-0000-000000000105",
      assetLabel: "Continuation",
      assetRefId: "round-1-image-1",
    };
    const repository = createExecutorRepository({
      readPendingApproval: vi.fn().mockResolvedValue({
        continuationContext,
        costEstimate: { totalCredits: 4 },
        pendingToolCall: {
          arguments: {
            prompt: "continue from previous",
            referenceRefs: ["round-1-image-1"],
            size: "1K",
          },
          toolCallKey: "tool-call-1",
          toolName: "generate_image",
        },
        snapshot,
      }),
      readSessionScope: vi.fn().mockResolvedValue({ projectId: "server-project-1" }),
    });
    const executor = new AgentExecutorService({
      costEstimator: {
        estimateGenerateImage: vi.fn().mockResolvedValue({ totalCredits: 4 }),
        estimateGenerateImageBatch: vi.fn(),
      },
      referenceAssetRepository,
      repository,
      textRuntime: {
        generateText: vi.fn(),
      },
      toolRunner,
    });

    await executor.approveToolCall(context, {
      sessionId: "session-1",
      toolCallKey: "tool-call-1",
      turnId: "turn-1",
    });

    expect(referenceAssetRepository.validateImageReferences).toHaveBeenCalledWith({
      continuationContext,
      projectId: "server-project-1",
      referenceContext: undefined,
      tenantId: "tenant-1",
    });
    expect(referenceAssetRepository.validateImageReferences.mock.invocationCallOrder[0])
      .toBeLessThan(toolRunner.runToolCall.mock.invocationCallOrder[0]);
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
    const repository = createExecutorRepository({
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
    });
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
    const repository = createExecutorRepository({
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
    });
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
      repository: createExecutorRepository(),
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

  it("injects previous successful session asset refs into the next executor turn context", async () => {
    const generateText = vi
      .fn()
      .mockResolvedValueOnce({
        outputText: JSON.stringify({
          reply: "Continue from the last generated image.",
          toolCalls: [
            {
              arguments: {
                prompt: "Turn the previous output into a poster",
                referenceRefs: ["round-1-image-1"],
                size: "1K",
              },
              toolCallKey: "tool-call-1",
              toolName: "edit_image",
            },
          ],
        }),
      })
      .mockResolvedValueOnce({
        outputText: JSON.stringify({
          reply: "Editing has started.",
        }),
      });
    const repository = {
      createAssistantMessage: vi.fn(),
      createTurn: vi.fn().mockResolvedValue({ turnId: "turn-2" }),
      createUserMessage: vi.fn().mockResolvedValue({ messageId: "message-2" }),
      listSessionAssetRefs: vi.fn().mockResolvedValue([
        {
          assetId: "asset-1",
          kind: "image",
          label: "Round 1 image 1",
          promptSummary: "forest sports day",
          refId: "round-1-image-1",
        },
      ]),
      markTurnFailed: vi.fn(),
      markTurnSucceeded: vi.fn(),
      readPendingApproval: vi.fn(),
      readSessionScope: vi.fn().mockResolvedValue({ projectId: snapshot.projectId }),
    };
    const toolRunner = {
      runToolCall: vi.fn().mockResolvedValue({
        assetRefs: [{ assetId: "asset-edit-1", kind: "image", label: "Edited image 1", promptSummary: "", refId: "round-2-image-1" }],
        failures: [],
        status: "succeeded",
        toolCallId: "tool-db-2",
        workflowRunIds: ["workflow-2"],
        workflowRuns: [{ nodeRunId: "node-2", workflowRunId: "workflow-2" }],
      }),
    };

    const executor = new AgentExecutorService({
      costEstimator: {
        estimateGenerateImage: vi.fn().mockResolvedValue({ totalCredits: 5 }),
        estimateGenerateImageBatch: vi.fn(),
      },
      limits: { allowImageEdit: true },
      repository,
      textRuntime: { generateText },
      toolRunner,
    });

    await executor.executeTurn(context, {
      prompt: "Use the last generated result and turn it into a poster",
      sessionId: "session-1",
      snapshot,
    });

    const contextPayload = JSON.parse(generateText.mock.calls[0]?.[1]?.messages?.[1]?.content ?? "{}");
    expect(contextPayload.previousResults).toEqual([
      expect.objectContaining({
        assetId: "asset-1",
        kind: "image",
        label: "Round 1 image 1",
        refId: "round-1-image-1",
      }),
    ]);
    expect(contextPayload.previousResults?.[0]).not.toHaveProperty("promptSummary");
    expect(repository.listSessionAssetRefs).toHaveBeenCalledWith({
      sessionId: "session-1",
      tenantId: "tenant-1",
    });
  });

  it("injects active continuation context into the next executor turn and stores it on the user message", async () => {
    const repository = createExecutorRepository({
      listSessionAssetRefs: vi.fn().mockResolvedValue([
        {
          assetId: "asset-1",
          kind: "image",
          label: "Round 1 image 1",
          promptSummary: "forest sports day",
          refId: "round-1-image-1",
        },
      ]),
    });
    const generateText = vi
      .fn()
      .mockResolvedValueOnce({
        outputText: JSON.stringify({
          reply: "Continue from the chosen result.",
          toolCalls: [
            {
              arguments: {
                prompt: "Turn the chosen result into a poster",
                referenceRefs: ["round-1-image-1"],
                size: "1K",
              },
              toolCallKey: "tool-call-1",
              toolName: "edit_image",
            },
          ],
        }),
      })
      .mockResolvedValueOnce({
        outputText: JSON.stringify({
          reply: "Editing has started.",
        }),
      });
    const toolRunner = {
      runToolCall: vi.fn().mockResolvedValue({
        assetRefs: [{ assetId: "asset-edit-1", kind: "image", label: "Edited image 1", promptSummary: "", refId: "round-2-image-1" }],
        failures: [],
        status: "succeeded",
        toolCallId: "tool-db-2",
        workflowRunIds: ["workflow-2"],
        workflowRuns: [{ nodeRunId: "node-2", workflowRunId: "workflow-2" }],
      }),
    };
    const executor = new AgentExecutorService({
      costEstimator: {
        estimateGenerateImage: vi.fn().mockResolvedValue({ totalCredits: 5 }),
        estimateGenerateImageBatch: vi.fn(),
      },
      limits: { allowImageEdit: true },
      repository,
      textRuntime: { generateText },
      toolRunner,
    });

    await executor.executeTurn(context, {
      continuationContext: {
        action: "make-poster",
        assetLabel: "Round 1 image 1",
        assetRefId: "round-1-image-1",
        promptSummary: "forest sports day",
      },
      prompt: "Turn this result into a poster",
      sessionId: "session-1",
      snapshot,
    });

    const contextPayload = JSON.parse(generateText.mock.calls[0]?.[1]?.messages?.[1]?.content ?? "{}");
    expect(contextPayload.activeContinuation).toEqual(
      expect.objectContaining({
        action: "make-poster",
        assetLabel: "Round 1 image 1",
        assetRefId: "round-1-image-1",
      }),
    );
    expect(contextPayload.activeContinuation).not.toHaveProperty("promptSummary");
    expect(contextPayload.previousResults?.[0]).toEqual(
      expect.objectContaining({
        assetId: "asset-1",
        kind: "image",
        label: "Round 1 image 1",
        refId: "round-1-image-1",
      }),
    );
    expect(contextPayload.previousResults?.[0]).not.toHaveProperty("promptSummary");
    expect(repository.createUserMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          continuationContext: expect.objectContaining({
            action: "make-poster",
            assetRefId: "round-1-image-1",
          }),
        }),
      }),
    );
  });

  it("injects safe current references into context and stores them on the user message", async () => {
    const repository = createExecutorRepository();
    const generateText = vi.fn().mockResolvedValue({
      outputText: "I can use the listed references by refId.",
    });
    const executor = new AgentExecutorService({
      costEstimator: {
        estimateGenerateImage: vi.fn(),
        estimateGenerateImageBatch: vi.fn(),
      },
      repository,
      textRuntime: { generateText },
      toolRunner: {
        runToolCall: vi.fn(),
      },
    });

    await executor.executeTurn(context, {
      prompt: "Use these references for the next image",
      referenceContext: {
        items: [
          {
            assetId: "asset-ref-1",
            kind: "artifact",
            label: "Reference image 1",
            previewUrl: "https://cdn.example.test/signed-preview",
            refId: "current-ref-1",
            signed: true,
          },
          {
            assetId: "asset-ref-2",
            baseUrl: "https://provider.example.test",
            kind: "canvas_node",
            label: "Reference image 2",
            nodeId: "node-ref-2",
            refId: "current-ref-2",
            headers: {
              Authorization: "Bearer secret-token",
            },
            apiKey: "secret-api-key",
          },
        ],
      },
      sessionId: "session-1",
      snapshot,
    });

    const contextPayload = JSON.parse(generateText.mock.calls[0]?.[1]?.messages?.[1]?.content ?? "{}");
    expect(contextPayload.references).toEqual([
      {
        assetId: "asset-ref-1",
        kind: "artifact",
        label: "Reference image 1",
        refId: "current-ref-1",
      },
      {
        assetId: "asset-ref-2",
        kind: "canvas_node",
        label: "Reference image 2",
        refId: "current-ref-2",
      },
    ]);
    expect(JSON.stringify(contextPayload)).not.toMatch(/previewUrl|signed|baseUrl|apiKey|Authorization|secret-token|secret-api-key/);
    expect(repository.createUserMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          referenceContext: expect.objectContaining({
            items: [
              expect.objectContaining({
                assetId: "asset-ref-1",
                kind: "artifact",
                label: "Reference image 1",
                refId: "current-ref-1",
              }),
              expect.objectContaining({
                assetId: "asset-ref-2",
                kind: "canvas_node",
                label: "Reference image 2",
                refId: "current-ref-2",
              }),
            ],
          }),
        }),
      }),
    );
    const metadata = repository.createUserMessage.mock.calls[0]?.[0]?.metadata;
    expect(JSON.stringify(metadata)).not.toMatch(/previewUrl|signed|baseUrl|apiKey|Authorization|secret-token|secret-api-key/);
  });
});
