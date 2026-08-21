import type { Pool } from "pg";

import { createPgPool } from "@aigc-flow/db";

import type {
  AgentSessionEventRecord,
  AgentSessionRepository,
  AppendAgentSessionEventInput,
} from "./agent-session.repository.js";
import { AgentApiError } from "./agent.service.js";
import type { AgentToolEvent } from "./agent-tool-events.js";

type AgentContext = {
  tenantId: string;
  userId: string | null;
};

export class AgentEventService {
  readonly pool: Pool;
  readonly repository: Pick<AgentSessionRepository, "appendSessionEvent" | "getSessionEvents"> & {
    assertTurnActive?: AgentSessionRepository["assertTurnActive"];
  };

  constructor(options: {
    pool?: Pool;
    repository: Pick<AgentSessionRepository, "appendSessionEvent" | "getSessionEvents"> & {
      assertTurnActive?: AgentSessionRepository["assertTurnActive"];
    };
  }) {
    this.pool = options.pool ?? createPgPool();
    this.repository = options.repository;
  }

  async getReplay(context: AgentContext, sessionId: string, afterSeq = 0) {
    return {
      events: await this.repository.getSessionEvents(context, sessionId, afterSeq),
    };
  }

  async buildReplayStream(context: AgentContext, sessionId: string, afterSeq = 0) {
    const events = await this.repository.getSessionEvents(context, sessionId, afterSeq);
    const chunks = events.map((event) => this.formatEvent("event", event));
    chunks.push(this.formatEvent("done", { afterSeq, sessionId }));
    return chunks.join("");
  }

  async appendToolEvent(context: AgentContext, sessionId: string, event: AgentToolEvent) {
    if (event.agentVersion === "v2" && event.turnId && this.repository.assertTurnActive) {
      await this.repository.assertTurnActive(context, event.turnId);
    }
    const persisted = mapToolEventToSessionEvent(sessionId, event);
    if (!persisted) return null;
    return this.repository.appendSessionEvent(context, persisted);
  }

  private formatEvent(eventName: string, payload: AgentSessionEventRecord | { afterSeq: number; sessionId: string }) {
    return `event: ${eventName}\ndata: ${JSON.stringify(payload)}\n\n`;
  }
}

function mapToolEventToSessionEvent(
  sessionId: string,
  event: AgentToolEvent,
): AppendAgentSessionEventInput | null {
  const persisted = (() => {
    switch (event.type) {
    case "message_delta":
    case "thinking_status":
      return null;
    case "tool_started":
      return {
        eventJson: {
          toolCallKey: event.toolCallKey,
          toolName: event.toolName,
        },
        eventType: event.type,
        sessionId,
      };
    case "task_created":
      return {
        eventJson: {
          taskId: event.taskId,
          title: event.title,
          toolCallKey: event.toolCallKey,
          toolName: event.toolName,
        },
        eventType: event.type,
        sessionId,
        taskId: event.taskId,
      };
    case "workflow_run_linked":
      return {
        eventJson: {
          nodeRunId: event.nodeRunId ?? null,
          toolCallKey: event.toolCallKey,
          workflowRunId: event.workflowRunId,
        },
        eventType: event.type,
        sessionId,
      };
    case "artifact_created":
      return {
        eventJson: {
          assetRef: toJsonRecord(event.assetRef),
          taskId: event.taskId,
          toolCallKey: event.toolCallKey,
        },
        eventType: event.type,
        sessionId,
        taskId: event.taskId,
      };
    case "task_completed":
      return {
        eventJson: {
          result: toJsonRecord(event.result),
          taskId: event.taskId,
          toolCallKey: event.toolCallKey,
        },
        eventType: event.type,
        sessionId,
        taskId: event.taskId,
      };
    case "task_failed":
      return {
        eventJson: {
          code: event.code,
          message: event.message,
          taskId: event.taskId,
          toolCallKey: event.toolCallKey,
        },
        eventType: event.type,
        sessionId,
        taskId: event.taskId,
      };
    case "tool_progress":
      return {
        eventJson: {
          message: event.message,
          toolCallKey: event.toolCallKey,
        },
        eventType: event.type,
        sessionId,
      };
    case "tool_result":
      return {
        eventJson: {
          result: toJsonRecord(event.result),
          toolCallKey: event.toolCallKey,
        },
        eventType: event.type,
        sessionId,
        taskId: getTaskIdFromToolResult(event.result),
      };
    case "canvas_op_applied":
      return {
        eventJson: {
          createdNodeIds: event.createdNodeIds,
          edgeIds: event.edgeIds,
          flowId: event.flowId,
          toolCallKey: event.toolCallKey ?? null,
          runNodeIds: event.runNodeIds ?? [],
          updatedNodeIds: event.updatedNodeIds,
        },
        eventType: event.type,
        sessionId,
        turnId: event.turnId ?? null,
      };
    case "approval_required":
      return {
        eventJson: {
          estimate: toJsonRecord(event.estimate),
          toolCallKey: event.toolCallKey,
          turnId: event.turnId,
        },
        eventType: event.type,
        sessionId,
        turnId: event.turnId,
      };
    case "turn_completed":
      return {
        eventJson: {
          finalText: event.finalText,
          turnId: event.turnId,
        },
        eventType: event.type,
        sessionId,
        turnId: event.turnId,
      };
    case "turn_failed":
      return {
        eventJson: {
          code: event.code,
          message: event.message,
          turnId: event.turnId ?? null,
        },
        eventType: event.type,
        sessionId,
        turnId: event.turnId ?? null,
      };
      default:
        return null;
    }
  })();
  if (!persisted || !event.agentVersion) return persisted;
  const metadata = {
    agentNamespace: event.agentNamespace ?? null,
    agentVersion: event.agentVersion,
    graphRevision: event.graphRevision ?? null,
    idempotencyKey: event.idempotencyKey ?? null,
    redactionVersion: event.redactionVersion ?? null,
    skillVersionId: event.skillVersionId ?? null,
  };
  return {
    ...persisted,
    agentNamespace: event.agentNamespace ?? null,
    agentVersion: event.agentVersion,
    eventJson: { ...persisted.eventJson, ...metadata },
    graphRevision: event.graphRevision ?? null,
    idempotencyKey: event.idempotencyKey ?? null,
    taskId: persisted.taskId ?? event.taskId ?? null,
    turnId: persisted.turnId ?? event.turnId ?? null,
  };
}

function getTaskIdFromToolResult(result: unknown): string | null {
  if (!result || typeof result !== "object") return null;
  const value = (result as Record<string, unknown>).toolCallId;
  return typeof value === "string" && value.length > 0 ? value : null;
}

function toJsonRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

export function toAgentRepositoryError(error: unknown): never {
  if (error instanceof Error && error.message === "AGENT_SESSION_NOT_FOUND") {
    throw new AgentApiError(404, "AGENT_SESSION_NOT_FOUND", "Agent session not found.");
  }
  throw error;
}
