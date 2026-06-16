import type { CanvasAgentPlannerOutput, CanvasAgentSnapshot } from "./canvasAgentTypes";

type OfflinePlannerInput = {
  prompt: string;
  snapshot: CanvasAgentSnapshot;
};

function getCanvasCenter(snapshot: CanvasAgentSnapshot) {
  return {
    x: -snapshot.viewport.x / snapshot.viewport.zoom + 160,
    y: -snapshot.viewport.y / snapshot.viewport.zoom + 120,
  };
}

export function planOfflineCanvasAgentTurn(input: OfflinePlannerInput): CanvasAgentPlannerOutput {
  const prompt = input.prompt.trim();
  const selectedImage = input.snapshot.nodes.find((node) => node.selected && node.kind === "image" && node.assetId);
  const center = getCanvasCenter(input.snapshot);

  if (selectedImage && /video/i.test(prompt)) {
    return {
      approvalRequired: true,
      evidence: [{ summary: `Selected reference image: ${selectedImage.title}`, type: "selection" }],
      plan: [
        {
          reason: "The user asked to create a video from the current image selection.",
          step: "Create a video generation node.",
        },
        {
          reason: "The selected image should remain as a visible upstream reference.",
          step: "Connect the selected image to the video node.",
        },
      ],
      proposedOps: [
        {
          clientId: "video-target",
          data: { generationPrompt: prompt, title: "Image to Video" },
          kind: "video",
          position: { x: selectedImage.position.x + 420, y: selectedImage.position.y },
          selected: true,
          type: "add_node",
        },
        {
          source: selectedImage.id,
          sourceHandle: "out",
          target: "client:video-target",
          targetHandle: "in",
          type: "connect_nodes",
        },
      ],
      reply: "Prepare an image-to-video flow from the selected reference image. Confirm to write it to the canvas.",
    };
  }

  return {
    approvalRequired: true,
    evidence: [
      {
        summary: input.snapshot.nodes.length === 0 ? "The current canvas is empty." : `The current canvas has ${input.snapshot.nodes.length} nodes.`,
        type: "canvas",
      },
    ],
    plan: [
      {
        reason: "Keep the user's goal as editable text for later refinement.",
        step: "Create a text prompt node.",
      },
      {
        reason: "Use an image node to hold generation settings and results.",
        step: "Create an image generation node.",
      },
      {
        reason: "Make the workflow dependency explicit on the canvas.",
        step: "Connect the text node to the image node.",
      },
    ],
    proposedOps: [
      {
        clientId: "prompt",
        data: { text: prompt, title: "Agent Prompt" },
        kind: "text",
        position: center,
        type: "add_node",
      },
      {
        clientId: "image-target",
        data: {
          batchCount: 1,
          generationPrompt: prompt,
          params: { imageSize: "1K" },
          title: "Agent Image Generation",
        },
        kind: "image",
        position: { x: center.x + 380, y: center.y },
        selected: true,
        type: "add_node",
      },
      {
        source: "client:prompt",
        sourceHandle: "out",
        target: "client:image-target",
        targetHandle: "in",
        type: "connect_nodes",
      },
    ],
    reply: "Prepare a basic text-to-image production flow. Confirm to create the nodes and connection.",
  };
}
