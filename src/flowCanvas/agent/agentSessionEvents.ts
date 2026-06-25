export const OPEN_AGENT_SESSION_EVENT = "tapflow:open-agent-session";

export type OpenAgentSessionDetail = {
  sessionId: string;
  turnId?: string;
};

export function dispatchOpenAgentSession(detail: OpenAgentSessionDetail) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<OpenAgentSessionDetail>(OPEN_AGENT_SESSION_EVENT, {
      detail,
    }),
  );
}
