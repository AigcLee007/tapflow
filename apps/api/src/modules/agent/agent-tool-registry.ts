import type { AgentToolName } from "./agent-tool-schemas.js";

export type AgentToolDefinition = {
  description: string;
  name: AgentToolName;
  parameters: Record<string, unknown>;
};

export function getAgentToolRegistryForModel(): AgentToolDefinition[] {
  return [
    {
      description: "Generate one image through the existing TapFlow workflow, billing, and asset pipeline.",
      name: "generate_image",
      parameters: {
        prompt: "Production prompt for one image.",
        referenceRefs: "Optional friendly asset references from previous tool results.",
        size: "Optional quality tier: 1K, 2K, or 4K.",
      },
    },
    {
      description: "Generate multiple independent images with bounded server-side execution.",
      name: "generate_image_batch",
      parameters: {
        images: "Two to eight image prompts.",
        sharedStyle: "Optional style applied to all images.",
      },
    },
    {
      description: "Continue the same production turn after observing generated assets.",
      name: "continue_generation",
      parameters: {
        reason: "Why another production step is needed.",
      },
    },
  ];
}
