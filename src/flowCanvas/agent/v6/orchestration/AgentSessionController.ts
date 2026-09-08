import type { AgentExecutionMode } from "../protocol/conversationTypes";
import { agentV6Api, type AgentV6Api, type AgentV6History, type AgentV6Scope, type AgentV6Session } from "./agentV6Api";

export class AgentSessionController {
  private readonly api: AgentV6Api;
  private current: AgentV6Session | null = null;

  constructor(api: AgentV6Api = agentV6Api) {
    this.api = api;
  }

  get sessionId() { return this.current?.id ?? null; }
  get title() { return this.current?.title ?? "新对话"; }
  get mode(): AgentExecutionMode { return this.current?.mode ?? "manual_confirmation"; }
  get session() { return this.current; }

  async create(input: AgentV6Scope & { title?: string; mode?: AgentExecutionMode }) {
    this.current = await this.api.createSession(input);
    return this.current;
  }

  async list(input: AgentV6Scope) {
    return this.api.listSessions(input);
  }

  async get(sessionId: string, input: AgentV6Scope) {
    this.current = await this.api.getSession(sessionId, input);
    return this.current;
  }

  async history(sessionId: string, input: AgentV6Scope): Promise<AgentV6History> {
    const history = await this.api.getHistory(sessionId, input);
    this.current = history.session;
    return history;
  }

  async openHistory(sessionId: string, input: AgentV6Scope) {
    return this.history(sessionId, input);
  }

  setSession(session: AgentV6Session) {
    this.current = session;
    return session;
  }

  updateMode(mode: AgentExecutionMode) {
    if (this.current) this.current = { ...this.current, mode };
  }

  newSession() {
    this.current = null;
  }
}
