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
      description: "Edit an image using one or more existing reference images through the existing TapFlow workflow pipeline.",
      name: "edit_image",
      parameters: {
        prompt: "Editing prompt describing the requested transformation.",
        referenceRefs: "One or more friendly asset references used as editing inputs.",
        size: "Optional quality tier: 1K, 2K, or 4K.",
      },
    },
    {
      description: "Create editable canvas nodes for planning, prompts, image targets, groups, uploads, or video targets.",
      name: "create_canvas_nodes",
      parameters: {
        nodes: "One to twelve nodes with kind, position, data, optional clientId, and optional selected flag.",
      },
    },
    {
      description: "Update visible editable data on one existing canvas node. Do not write secrets, raw provider credentials, base64 media, data URLs, blob URLs, or signed URLs.",
      name: "update_canvas_node",
      parameters: {
        nodeId: "Existing node id.",
        patch: "Small data patch for visible node fields.",
      },
    },
    {
      description: "Connect existing or client-created canvas nodes to make graph dependencies explicit.",
      name: "connect_canvas_nodes",
      parameters: {
        connections: "One or more source/target node references. Client-created node ids use client:<clientId>.",
      },
    },
    {
      description: "Select one or more existing or client-created nodes on the canvas.",
      name: "select_canvas_nodes",
      parameters: {
        nodeIds: "Node ids to select. Client-created node ids use client:<clientId>.",
      },
    },
    {
      description: "Run an existing canvas node through the TapFlow workflow pipeline. This can consume credits and may require approval.",
      name: "run_canvas_node",
      parameters: {
        nodeId: "Existing node id or client:<clientId> created earlier in the same turn.",
        runMode: "target_node",
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
