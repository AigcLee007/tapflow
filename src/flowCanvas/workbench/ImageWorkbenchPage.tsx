import React from "react";

import { useImageModelCatalog } from "../../hooks/useImageModelCatalog";
import { BrandTransition } from "../../app/brand/BrandTransition";
import { useRemoteFlowAutosave } from "../hooks/useRemoteFlowAutosave";
import { useRemoteFlowProject } from "../hooks/useRemoteFlowProject";
import { registerRemoteDraftSaveBarrier } from "../runtime/remoteDraftSaveBarrier";
import { useFlowCanvasStore } from "../store/flowCanvasStore";
import type { FlowImageResultItem } from "../types";
import { ImageWorkbenchBatchFeed } from "./ImageWorkbenchBatchFeed";
import { ImageWorkbenchComposer } from "./ImageWorkbenchComposer";
import { ImageWorkbenchHeader } from "./ImageWorkbenchHeader";
import { ImageWorkbenchResultSheet } from "./ImageWorkbenchResultSheet";
import type { ImageWorkbenchDraft, WorkbenchProjectMode } from "./imageWorkbenchTypes";
import {
  buildWorkbenchModelOptions,
  deriveWorkbenchBatches,
  getDefaultWorkbenchDraft,
  getProjectCanvasPath,
  getProjectWorkbenchPath,
} from "./imageWorkbenchUtils";
import { useImageWorkbenchGeneration } from "./useImageWorkbenchGeneration";

function getProjectIdFromLocation() {
  if (typeof window === "undefined") return "";
  const match = window.location.pathname.match(/^\/projects\/([^/]+)/);
  return decodeURIComponent(match?.[1] ?? "");
}

export function ImageWorkbenchPage() {
  const projectId = getProjectIdFromLocation();
  const projectState = useRemoteFlowProject(projectId);
  const autosave = useRemoteFlowAutosave({
    draft: projectState.draft,
    enabled: !projectState.loading && !projectState.error,
    flowId: projectState.flow?.id ?? null,
  });
  const imageCatalogState = useImageModelCatalog();
  const nodes = useFlowCanvasStore((state) => state.nodes);
  const nodeOutputByNodeId = useFlowCanvasStore((state) => state.nodeOutputByNodeId);
  const nodeRunStatusByNodeId = useFlowCanvasStore((state) => state.nodeRunStatusByNodeId);
  const workflowRunIdByNodeId = useFlowCanvasStore((state) => state.workflowRunIdByNodeId);

  const [selectedResult, setSelectedResult] = React.useState<FlowImageResultItem | null>(null);
  const [draft, setDraft] = React.useState<ImageWorkbenchDraft>(() => getDefaultWorkbenchDraft());

  React.useEffect(() => registerRemoteDraftSaveBarrier(autosave.saveNow), [autosave.saveNow]);

  React.useEffect(() => {
    const modelOptions = buildWorkbenchModelOptions(imageCatalogState.models || []);
    const firstModel = modelOptions[0];
    if (!firstModel) return;
    setDraft((current) => {
      const next = current.modelId ? current : {
        ...current,
        modelId: firstModel.id,
        size: firstModel.defaultSize,
      };
      return next;
    });
  }, [imageCatalogState.models]);

  const generation = useImageWorkbenchGeneration({ saveNow: autosave.saveNow });
  const batches = React.useMemo(() => deriveWorkbenchBatches({
    nodeOutputByNodeId,
    nodeRunStatusByNodeId,
    nodes,
    workflowRunIdByNodeId,
  }), [nodeOutputByNodeId, nodeRunStatusByNodeId, nodes, workflowRunIdByNodeId]);

  const switchMode = React.useCallback((mode: WorkbenchProjectMode) => {
    if (!projectId || typeof window === "undefined") return;
    const path = mode === "workbench" ? getProjectWorkbenchPath(projectId) : getProjectCanvasPath(projectId);
    window.history.pushState(null, "", path);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }, [projectId]);

  const composerDraft = draft.modelId
    ? draft
    : {
        ...draft,
        ...getDefaultWorkbenchDraft(imageCatalogState.models || []),
      };

  if (projectState.loading) {
    return (
      <BrandTransition
        label="正在打开创作工作台..."
        sublabel="正在恢复项目、素材与生成批次"
        variant="canvas"
      />
    );
  }

  if (projectState.error) {
    return (
      <main
        data-testid="image-workbench-page"
        style={{
          alignItems: "center",
          background: "#09090f",
          color: "#f8fafc",
          display: "grid",
          minHeight: "100vh",
          padding: 24,
        }}
      >
        <section
          style={{
            background: "rgba(127,29,29,0.22)",
            border: "1px solid rgba(248,113,113,0.26)",
            borderRadius: 18,
            maxWidth: 520,
            padding: 20,
            width: "100%",
          }}
        >
          <div style={{ fontSize: 14, fontWeight: 800 }}>项目工作台打开失败</div>
          <div style={{ color: "#fecaca", fontSize: 13, lineHeight: 1.6, marginTop: 10 }}>
            {projectState.error}
          </div>
        </section>
      </main>
    );
  }

  return (
    <main
      data-testid="image-workbench-page"
      style={{
        background: "#09090f",
        color: "#f8fafc",
        minHeight: "100vh",
      }}
    >
      <ImageWorkbenchHeader
        mode="workbench"
        onSwitchMode={switchMode}
        projectName={projectState.project?.name || "Image Workbench"}
      />

      <div className="image-workbench-layout" style={{
        display: "grid",
        gridTemplateColumns: "minmax(360px, 400px) minmax(0, 1fr)",
        height: "calc(100vh - 58px)",
        minHeight: 0,
      }}>
        <ImageWorkbenchComposer
          catalogItems={imageCatalogState.models || []}
          draft={composerDraft}
          isGenerating={generation.isGenerating}
          onChangeDraft={(patch) => setDraft((current) => ({ ...current, ...patch }))}
          onGenerate={() => void generation.generate(composerDraft)}
        />
        <ImageWorkbenchBatchFeed batches={batches} onSelectResult={setSelectedResult} />
      </div>

      <ImageWorkbenchResultSheet
        item={selectedResult}
        onClose={() => setSelectedResult(null)}
        onUseAsReference={(item) => {
          setDraft((current) => ({
            ...current,
            referenceAssetItemIds: current.referenceAssetItemIds.includes(item.id)
              ? current.referenceAssetItemIds
              : [...current.referenceAssetItemIds, item.id],
          }));
          setSelectedResult(null);
        }}
      />

      <style>{`
        @media (max-width: 767px) {
          .image-workbench-layout {
            display: block !important;
            height: calc(100vh - 58px);
            overflow: hidden;
          }
          .image-workbench-layout [data-testid="image-workbench-composer"] {
            position: fixed;
            left: 0;
            right: 0;
            bottom: 0;
            z-index: 40;
            border-radius: 22px 22px 0 0;
            border-right: none !important;
            border-top: 1px solid rgba(255,255,255,0.1);
          }
          .image-workbench-layout [data-testid="image-workbench-batch-feed"] {
            height: 100%;
            padding-bottom: 300px !important;
          }
        }
      `}</style>
    </main>
  );
}
