/**
 * Canonical Agent client boundary. Legacy V6 wire normalization stays behind
 * this adapter until the server envelope migration is complete.
 */
export { agentV6Api as agentRuntimeApi } from "../v6/orchestration/agentV6Api";
export type {
  AgentV6Api as AgentRuntimeApi,
  AgentV6Response as AgentRuntimeResponse,
  AgentV6Scope as AgentRuntimeScope,
} from "../v6/orchestration/agentV6Api";
