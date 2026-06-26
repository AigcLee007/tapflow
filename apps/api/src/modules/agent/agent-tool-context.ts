import type { AgentToolRunResult } from "./agent-tool-runner.js";

export function buildAgentToolContinuationMessage(result: AgentToolRunResult): string {
  return JSON.stringify({
    instruction: "Observe this tool result and continue only if more production work is needed.",
    toolResult: {
      assetRefs: result.assetRefs.map((asset) => ({
        assetId: asset.assetId,
        kind: asset.kind,
        label: asset.label,
        refId: asset.refId,
      })),
      failures: result.failures,
      status: result.status,
      toolCallId: result.toolCallId,
    },
  });
}
