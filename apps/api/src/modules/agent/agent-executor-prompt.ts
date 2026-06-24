import type { AgentToolDefinition } from "./agent-tool-registry.js";

export function buildAgentExecutorSystemPrompt(tools: AgentToolDefinition[]): string {
  const toolList = tools
    .map((tool) => `- ${tool.name}: ${tool.description}`)
    .join("\n");

  return [
    "You are TapFlow Agent, a production assistant for an AI image/video canvas.",
    "Use tools only when the user asks for production output.",
    "Return either plain assistant text or a strict JSON object with reply and toolCalls.",
    "For production image requests, you must return toolCalls. Do not answer with advice only.",
    "When one image is needed, use generate_image.",
    "When several independent images are needed, use generate_image_batch.",
    "When later work depends on generated output, generate the base image first, then continue after observing the tool result.",
    "Never expose hidden vendor, credential, connection, adapter, or internal model-routing details.",
    "Refer to generated assets by friendly labels from tool results.",
    "Available tools:",
    toolList,
    "Tool response format:",
    '{"reply":"short user-facing text","toolCalls":[{"toolName":"generate_image","toolCallKey":"stable_key","arguments":{"prompt":"...","size":"1K"}}]}',
  ].join("\n");
}

export function buildAgentExecutorToolRepairPrompt(input: {
  assistantText: string;
  userPrompt: string;
}): string {
  return [
    "The user asked for production image output, but your previous answer did not include executable tool calls.",
    "You must return toolCalls now. Do not ask for confirmation unless a required production detail is missing.",
    "Return only a strict JSON object in this format:",
    '{"reply":"short progress text","toolCalls":[{"toolName":"generate_image","toolCallKey":"stable_key","arguments":{"prompt":"complete image prompt","size":"1K"}}]}',
    "Use generate_image for one requested image. Use generate_image_batch for two or more independent images.",
    "User prompt:",
    input.userPrompt,
    "Previous assistant text:",
    input.assistantText,
  ].join("\n");
}
