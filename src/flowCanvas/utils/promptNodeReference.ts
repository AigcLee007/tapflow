import type { FlowNodeData } from "../types";

export type PromptReferenceInput = {
  promptId: string;
  promptInsertRequestId: string;
  promptText: string;
  promptTitle: string;
};

export function buildPromptReferenceNodeData(input: PromptReferenceInput): Partial<FlowNodeData> {
  return {
    generationPrompt: input.promptText,
    sourcePromptId: input.promptId,
    sourcePromptInsertRequestId: input.promptInsertRequestId,
    sourcePromptSnapshot: input.promptText,
    sourcePromptTitle: input.promptTitle,
    title: input.promptTitle || "图片生成",
  };
}

export function hasPromptInsertRequest(
  nodes: Array<{ data?: { sourcePromptInsertRequestId?: unknown } }>,
  requestId: string,
): boolean {
  return nodes.some((node) => node.data?.sourcePromptInsertRequestId === requestId);
}
