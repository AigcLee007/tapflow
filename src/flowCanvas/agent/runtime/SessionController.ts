import type { AgentRuntimeApi, AgentRuntimeHistory, AgentRuntimeSession } from "./agentRuntimeApi";

export class SessionController {
  private current: AgentRuntimeSession | null = null;
  constructor(private readonly api: AgentRuntimeApi) {}
  get session() { return this.current; }
  async create(input: { title?: string; projectId: string | null; flowId: string | null; mode?: "auto" | "manual_confirmation" }) { this.current = await this.api.createSession(input); return this.current; }
  async open(id: string): Promise<AgentRuntimeHistory> { const history = await this.api.getHistory(id); this.current = history.session; return history; }
  async list(input?: { projectId?: string | null; flowId?: string | null }) { return this.api.listSessions(input); }
  async setMode(mode: "auto" | "manual_confirmation") { if (!this.current) return null; this.current = await this.api.setMode(this.current.id, mode); return this.current; }
  clear() { this.current = null; }
}
