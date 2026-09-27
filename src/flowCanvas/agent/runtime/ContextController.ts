import type { AgentContextSnapshot } from "./agentProtocol";

export class ContextController {
  private snapshot: AgentContextSnapshot;
  constructor(snapshot: AgentContextSnapshot) { this.snapshot = snapshot; }
  get current() { return this.snapshot; }
  update(snapshot: AgentContextSnapshot) { this.snapshot = snapshot; return this.snapshot; }
}
