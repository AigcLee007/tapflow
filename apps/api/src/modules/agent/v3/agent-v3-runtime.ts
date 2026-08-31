import { AgentApiError } from "../agent.service.js";
import type { AgentV3TaskRepository } from "./agent-v3-task-store.js";

export type AgentV3TurnInput = {
  prompt: string;
  [key: string]: unknown;
};

export type AgentV3RuntimeAdapter = {
  startTurn(input: {
    sessionId: string;
    input: AgentV3TurnInput;
    writeChunk: (chunk: string) => void | Promise<void>;
  }): Promise<unknown>;
};

export class AgentV3RuntimeService {
  private readonly enabled: boolean;
  private readonly adapter: AgentV3RuntimeAdapter | null;

  constructor(options: { enabled: boolean; adapter?: AgentV3RuntimeAdapter | null; repository?: { getEvents?: AgentV3TaskRepository["getEvents"] } | null }) {
    this.enabled = options.enabled;
    this.adapter = options.adapter ?? null;
    this.repository = options.repository ?? null;
  }

  private readonly repository: { getEvents?: AgentV3TaskRepository["getEvents"] } | null;

  async startTurn(input: Parameters<AgentV3RuntimeAdapter["startTurn"]>[0]): Promise<unknown> {
    if (!this.enabled || !this.adapter) {
      throw Object.assign(new AgentApiError(503, "AGENT_V3_UNAVAILABLE", "Canvas Agent V3 is not available."), { statusCode: 503 });
    }
    return this.adapter.startTurn(input);
  }

  async replayEvents(input: { tenantId: string; taskId: string; afterSeq: number }) {
    if (!this.enabled || !this.repository?.getEvents) {
      throw Object.assign(new AgentApiError(503, "AGENT_V3_EVENT_REPLAY_UNAVAILABLE", "Canvas Agent V3 event replay is not available."), { statusCode: 503 });
    }
    return this.repository.getEvents(input);
  }
}
