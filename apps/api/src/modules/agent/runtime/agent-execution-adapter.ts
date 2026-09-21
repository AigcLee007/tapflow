import { createHash } from "node:crypto";
import { compileGraph, type FlowGraph } from "@aigc-flow/workflow-core";
import type { VideoGenerationParams, VideoMediaKind, VideoReferenceRole } from "@aigc-flow/ai-gateway-core";
import {
  WorkflowRunsApiError,
  type WorkflowRunContext,
  type WorkflowRunsService,
} from "../../workflow-runs/workflow-runs.service.js";

/** Internal, resolved plan. Never deserialize route keys or this shape from a public decision body. */
export type AgentExecutionStep = {
  stepId: string;
  kind: "image" | "video" | "text";
  prompt: string;
  routeKey: string;
  dependsOn?: string[];
  referenceAssetIds?: string[];
  image?: { aspectRatio?: string; size?: string };
  text?: { maxTokens?: number; temperature?: number };
  video?: VideoGenerationParams & {
    referenceInputs: Array<{
      source: { kind: "asset" | "step"; id: string };
      mediaKind: VideoMediaKind;
      role: VideoReferenceRole;
    }>;
  };
};

export type AgentExecutionInput = { flowId: string; graphRevision: number; steps: AgentExecutionStep[] };
type WorkflowOperations = Pick<WorkflowRunsService, "quoteAgentWorkflowRun" | "createAgentWorkflowRun" | "getWorkflowRun" | "cancelWorkflowRun">;

function nodeIdFor(value: string): string {
  return `agent-${createHash("sha256").update(value).digest("hex").slice(0, 24)}`;
}

export function buildAgentExecutionGraph(steps: AgentExecutionStep[]): { graph: FlowGraph; nodeIdsByStepId: Record<string, string> } {
  if (!Array.isArray(steps) || steps.length < 1 || steps.length > 32) {
    throw new WorkflowRunsApiError(400, "AGENT_PLAN_INVALID", "The plan must contain between 1 and 32 steps.");
  }
  const nodeIdsByStepId: Record<string, string> = Object.create(null);
  for (const step of steps) {
    if (!step.stepId?.trim() || step.stepId.length > 160 || nodeIdsByStepId[step.stepId]
      || !step.prompt?.trim() || step.prompt.length > 32_000 || !step.routeKey?.trim()
      || !["image", "video", "text"].includes(step.kind)) {
      throw new WorkflowRunsApiError(400, "AGENT_PLAN_INVALID", "Every plan step needs a unique ID, prompt and resolved model route.");
    }
    nodeIdsByStepId[step.stepId] = nodeIdFor(`step:${step.stepId}`);
  }
  const graph: FlowGraph = { nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 } };
  const assetNodes = new Set<string>();
  const edges = new Set<string>();
  const connect = (source: string, target: string) => {
    const key = `${source}:${target}`;
    if (!edges.has(key)) { graph.edges.push({ source, target }); edges.add(key); }
  };
  const resolveStep = (id: string): string => {
    const source = nodeIdsByStepId[id];
    if (!source) throw new WorkflowRunsApiError(400, "AGENT_PLAN_INVALID", "A step dependency was not found.");
    return source;
  };
  for (const step of steps) {
    const id = nodeIdsByStepId[step.stepId]!;
    const data: Record<string, unknown> = { generationPrompt: step.prompt.trim(), routeKey: step.routeKey.trim() };
    const orderedInputs: string[] = [];
    for (const dependency of step.dependsOn ?? []) {
      const source = resolveStep(dependency);
      connect(source, id);
      orderedInputs.push(`upstream:${source}`);
    }
    for (const assetId of step.referenceAssetIds ?? []) {
      const source = nodeIdFor(`asset:${assetId}`);
      if (!assetNodes.has(assetId)) {
        graph.nodes.push({ id: source, type: "image.asset", data: { assetId } });
        assetNodes.add(assetId);
      }
      connect(source, id);
      orderedInputs.push(`upstream:${source}`);
    }
    if (orderedInputs.length) data.inputOrder = [...new Set(orderedInputs)];
    if (step.kind === "image") {
      data.batchCount = 1;
      data.params = { n: 1, ...(step.image?.aspectRatio ? { aspectRatio: step.image.aspectRatio } : {}), ...(step.image?.size ? { size: step.image.size } : {}) };
    }
    if (step.kind === "text") {
      // Existing Worker uses systemPrompt alongside upstream generated text.
      data.systemPrompt = step.prompt.trim();
      if (step.text?.maxTokens !== undefined) data.maxTokens = step.text.maxTokens;
      if (step.text?.temperature !== undefined) data.temperature = step.text.temperature;
    }
    if (step.kind === "video") {
      if (!step.video || step.video.count !== 1 || (step.referenceAssetIds?.length ?? 0) > 0) {
        throw new WorkflowRunsApiError(400, "AGENT_PLAN_INVALID", "Video generation requires explicit structured reference roles and parameters.");
      }
      const video = step.video;
      const referenceInputs = video.referenceInputs.map((reference, order) => {
        const source = reference.source.kind === "step"
          ? { kind: "upstream", id: resolveStep(reference.source.id) }
          : { kind: "asset", id: reference.source.id };
        if (source.kind === "upstream") connect(source.id, id);
        return { source, mediaKind: reference.mediaKind, role: reference.role, order, referenceKey: `reference-${order}` };
      });
      data.params = { videoGeneration: {
        schemaVersion: 2, mode: video.mode, aspectRatio: video.aspectRatio, resolution: video.resolution,
        durationSeconds: video.durationSeconds, generateAudio: video.generateAudio, count: 1, referenceInputs,
      } };
    }
    graph.nodes.push({ id, type: `${step.kind}.generate`, data });
  }
  compileGraph(graph);
  return { graph, nodeIdsByStepId };
}

export class AgentExecutionAdapter {
  constructor(private readonly options: { workflowRuns: WorkflowOperations }) {}

  async quote(context: WorkflowRunContext, input: AgentExecutionInput) {
    const built = buildAgentExecutionGraph(input.steps);
    const quote = await this.options.workflowRuns.quoteAgentWorkflowRun(context, input.flowId, { graph: built.graph, graphRevision: input.graphRevision });
    return {
      credits: quote.credits,
      fingerprint: quote.fingerprint,
      steps: input.steps.map((step) => {
        const node = quote.nodes.find((item) => item.nodeId === built.nodeIdsByStepId[step.stepId])!;
        return { stepId: step.stepId, credits: node.credits, modelKey: node.modelKey, modelDisplayName: node.modelDisplayName };
      }),
    };
  }

  async start(context: WorkflowRunContext, input: AgentExecutionInput & { executionKey: string; expectedQuoteFingerprint: string }) {
    if (!input.executionKey?.trim() || !/^[a-f0-9]{64}$/i.test(input.expectedQuoteFingerprint)) {
      throw new WorkflowRunsApiError(400, "AGENT_APPROVAL_REQUIRED", "A durable execution key and approved quote are required.");
    }
    const built = buildAgentExecutionGraph(input.steps);
    const idempotencyKey = `agent:${createHash("sha256").update(JSON.stringify([context.tenantId, context.userId, input.flowId, input.executionKey])).digest("hex")}`;
    const run = await this.options.workflowRuns.createAgentWorkflowRun(context, input.flowId, {
      graph: built.graph, graphRevision: input.graphRevision, idempotencyKey, expectedQuoteFingerprint: input.expectedQuoteFingerprint,
    });
    return { ...run, nodeIdsByStepId: built.nodeIdsByStepId };
  }

  async get(context: WorkflowRunContext, input: { flowId: string; runId: string }) {
    if (!context.userId) throw new WorkflowRunsApiError(401, "AUTH_REQUIRED", "Authentication is required.");
    const run = await this.options.workflowRuns.getWorkflowRun(context, input.runId);
    if (run.workflowRun.flowId !== input.flowId || run.workflowRun.tenantId !== context.tenantId
      || run.workflowRun.createdBy !== context.userId || !run.workflowRun.inputJson.agentExecution) {
      throw new WorkflowRunsApiError(404, "WORKFLOW_RUN_NOT_FOUND", "The Agent execution was not found.");
    }
    return run;
  }

  async cancel(context: WorkflowRunContext, input: { flowId: string; runId: string }) {
    await this.get(context, input);
    return this.options.workflowRuns.cancelWorkflowRun(context, input.runId);
  }
}
