import type { ConversationState } from "../protocol/conversationTypes";
import type { AgentV6DurableEvent, AgentV6History, AgentV6Response, AgentV6Scope } from "../orchestration/agentV6Api";
import { applyDurableEvent, applyResponse, createReplayState, restoreHistory, type ReplayState } from "./ReplayState";

export class ReplayController {
  private readonly scope: AgentV6Scope;
  private current: ReplayState;

  constructor(scope: AgentV6Scope, initial?: ReplayState) {
    this.scope = scope;
    this.current = initial ?? createReplayState(scope);
  }

  get state(): ConversationState { return this.current; }

  applyResponse(response: AgentV6Response) {
    this.current = applyResponse(this.current, response, this.scope);
    return this.current;
  }

  applyEvents(events: readonly AgentV6DurableEvent[]) {
    for (const event of events) this.current = applyDurableEvent(this.current, event, this.scope);
    return this.current;
  }

  restore(history: AgentV6History) {
    this.current = restoreHistory(history, this.scope);
    return this.current;
  }

  reset() {
    this.current = createReplayState(this.scope);
    return this.current;
  }
}
