import { useCallback, useState } from "react";
import { nanoid } from "nanoid";

import { runBackendWorkflow } from "../runtime/v2WorkflowRunner";
import { useFlowCanvasStore } from "../store/flowCanvasStore";
import type { ImageWorkbenchDraft } from "./imageWorkbenchTypes";
import { buildWorkbenchImageSizeParamPatch, markWorkbenchNodeData } from "./imageWorkbenchUtils";

type UseImageWorkbenchGenerationInput = {
  saveNow: () => Promise<void>;
};

export function useImageWorkbenchGeneration({ saveNow }: UseImageWorkbenchGenerationInput) {
  const addNode = useFlowCanvasStore((state) => state.addNode);
  const nodes = useFlowCanvasStore((state) => state.nodes);
  const [isGenerating, setIsGenerating] = useState(false);

  const generate = useCallback(async (draft: ImageWorkbenchDraft) => {
    const prompt = draft.prompt.trim();
    if (!prompt || isGenerating) return null;

    setIsGenerating(true);
    try {
      const createdAt = Date.now();
      const batchId = nanoid(12);
      const node = addNode(
        "image",
        { x: nodes.length * 36, y: nodes.length * 36 },
        markWorkbenchNodeData(
          {
            batchCount: draft.batchCount,
            generationPrompt: prompt,
            modelId: draft.modelId,
            multiImageDisplayMode: draft.batchCount > 1 ? "combined" : undefined,
            params: {
              ...buildWorkbenchImageSizeParamPatch(draft.modelId, draft.size),
              aspect_ratio: draft.aspectRatio,
              moderation: draft.moderation,
              output_format: draft.outputFormat,
              quality: draft.quality,
            },
            referenceAssetItemIds: draft.referenceAssetItemIds,
            routeKey: draft.routeKey,
            status: "idle",
            title: prompt.slice(0, 36) || "Workbench image",
          },
          { batchId, createdAt },
        ),
        { selected: false },
      );

      await saveNow();
      await runBackendWorkflow({ runMode: "target_node", targetNodeId: node.id });
      return node.id;
    } finally {
      setIsGenerating(false);
    }
  }, [addNode, isGenerating, nodes.length, saveNow]);

  return { generate, isGenerating };
}
