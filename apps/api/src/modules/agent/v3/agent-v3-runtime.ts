import { AgentApiError } from "../agent.service.js";

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

  constructor(options: { enabled: boolean; adapter?: AgentV3RuntimeAdapter | null }) {
    this.enabled = options.enabled;
    this.adapter = options.adapter ?? null;
  }

  async startTurn(input: Parameters<AgentV3RuntimeAdapter["startTurn"]>[0]): Promise<unknown> {
    if (!this.enabled || !this.adapter) {
      throw Object.assign(new AgentApiError(503, "AGENT_V3_UNAVAILABLE", "Canvas Agent V3 is not available."), { statusCode: 503 });
    }
    return this.adapter.startTurn(input);
  }
}
