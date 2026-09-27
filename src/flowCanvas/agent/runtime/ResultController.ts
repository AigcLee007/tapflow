import type { AgentResultGroupBlock, AgentResultRef } from "./agentProtocol";

export class ResultController {
  results(blocks: readonly unknown[]): AgentResultRef[] {
    return blocks.flatMap((block) => {
      const value = block as AgentResultGroupBlock;
      return value?.type === "result_group" && Array.isArray(value.results) ? value.results : [];
    });
  }
}
