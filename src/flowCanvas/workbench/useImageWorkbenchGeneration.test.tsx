import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { useFlowCanvasStore } from "../store/flowCanvasStore";
import { useImageWorkbenchGeneration } from "./useImageWorkbenchGeneration";

const runBackendWorkflowMock = vi.fn();

vi.mock("../runtime/v2WorkflowRunner", () => ({
  runBackendWorkflow: (...args: unknown[]) => runBackendWorkflowMock(...args),
}));

describe("useImageWorkbenchGeneration", () => {
  beforeEach(() => {
    runBackendWorkflowMock.mockReset();
    useFlowCanvasStore.getState().newProject();
    useFlowCanvasStore.getState().setBackendFlowBinding({
      backendFlowId: "flow-1",
      backendProjectId: "project-1",
    });
  });

  test("creates a workbench image node and runs it as target node", async () => {
    const saveNow = vi.fn(async () => undefined);
    const { result } = renderHook(() => useImageWorkbenchGeneration({ saveNow }));

    await act(async () => {
      await result.current.generate({
        aspectRatio: "16:9",
        batchCount: 2,
        modelId: "pixellelabs.nano-banana-pro",
        moderation: "auto",
        outputFormat: "png",
        prompt: "A neon product photo",
        quality: "auto",
        referenceAssetItemIds: [],
        routeKey: "image.pixellelabs.nano-banana-pro",
        size: "2k",
      });
    });

    const node = useFlowCanvasStore.getState().nodes.find((item) => item.type === "image");
    expect(node?.data).toMatchObject({
      batchCount: 2,
      generationPrompt: "A neon product photo",
      modelId: "pixellelabs.nano-banana-pro",
      routeKey: "image.pixellelabs.nano-banana-pro",
      workbench: { source: "image-workbench" },
    });
    expect(saveNow).toHaveBeenCalledTimes(1);
    expect(runBackendWorkflowMock).toHaveBeenCalledWith({ runMode: "target_node", targetNodeId: node?.id });
  });
});
