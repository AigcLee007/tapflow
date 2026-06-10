import { useCallback, useEffect, useState } from "react";

import { useFlowCanvasStore } from "../store/flowCanvasStore";
import {
  createDefaultFlow,
  getFlowDraft,
  getProject,
  listProjectFlows,
  type FlowDraft,
} from "../services/flowProjectApi";
import { isLocalDraftNewer, readLocalFlowDraft } from "../services/localFlowDraft";
import { recoverFlowTargetNodeRuns } from "../runtime/v2WorkflowRunner";
import type { WorkspaceFlow, WorkspaceProject } from "../../workspace/workspaceApi";
import { normalizeViewportForCanvasDensity } from "../utils/viewportDensity";

type RemoteFlowProjectState = {
  draft: FlowDraft | null;
  error: string | null;
  flow: WorkspaceFlow | null;
  loading: boolean;
  project: WorkspaceProject | null;
  reload: () => Promise<void>;
};

async function getOrCreateDefaultFlow(project: WorkspaceProject): Promise<WorkspaceFlow> {
  const existingFlows = await listProjectFlows(project.id);
  if (existingFlows[0]) return existingFlows[0];

  await createDefaultFlow(project);

  const refreshedFlows = await listProjectFlows(project.id);
  const defaultFlow = refreshedFlows[0];
  if (!defaultFlow) {
    throw new Error("当前项目的默认画布创建失败。");
  }
  return defaultFlow;
}

function resolveDraftForCanvas(serverDraft: FlowDraft): FlowDraft {
  const localDraft = readLocalFlowDraft({
    flowId: serverDraft.flowId,
    tenantId: serverDraft.tenantId,
  });

  if (
    !isLocalDraftNewer({
      localDraft,
      serverGraph: serverDraft.graph,
      serverUpdatedAt: serverDraft.updatedAt,
    }) ||
    !localDraft
  ) {
    return {
      ...serverDraft,
      graph: {
        ...serverDraft.graph,
        viewport: normalizeViewportForCanvasDensity(serverDraft.graph.viewport),
      },
    };
  }

  const resolvedDraft = {
    ...serverDraft,
    graph: localDraft.canonicalGraph,
    revision: localDraft.lastServerRevision ?? serverDraft.revision,
    needsCloudSync: true,
    updatedAt: localDraft.updatedAt,
  };

  return {
    ...resolvedDraft,
    graph: {
      ...resolvedDraft.graph,
      viewport: normalizeViewportForCanvasDensity(resolvedDraft.graph.viewport),
    },
  };
}

export function useRemoteFlowProject(projectId: string): RemoteFlowProjectState {
  const loadProject = useFlowCanvasStore((state) => state.loadProject);
  const [project, setProject] = useState<WorkspaceProject | null>(null);
  const [flow, setFlow] = useState<WorkspaceFlow | null>(null);
  const [draft, setDraft] = useState<FlowDraft | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!projectId) {
      setLoading(false);
      setError("链接中缺少项目 ID。");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const nextProject = await getProject(projectId);
      const nextFlow = await getOrCreateDefaultFlow(nextProject);
      const nextDraft = await getFlowDraft(nextFlow.id);
      const canvasDraft = resolveDraftForCanvas(nextDraft);

      loadProject({
        backendCurrentVersionId: nextFlow.currentVersionId,
        backendFlowId: nextFlow.id,
        backendProjectId: nextProject.id,
        edges: canvasDraft.graph.edges,
        id: nextProject.id,
        nodes: canvasDraft.graph.nodes,
        title: nextProject.name,
        updatedAt: Date.parse(canvasDraft.updatedAt) || Date.now(),
        version: canvasDraft.revision,
        viewport: canvasDraft.graph.viewport,
      });

      setProject(nextProject);
      setFlow(nextFlow);
      setDraft(canvasDraft);
      void recoverFlowTargetNodeRuns(nextFlow.id);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "项目画布加载失败。");
    } finally {
      setLoading(false);
    }
  }, [loadProject, projectId]);

  useEffect(() => {
    let active = true;

    if (!projectId) {
      setProject(null);
      setFlow(null);
      setDraft(null);
      setLoading(false);
      setError("链接中缺少项目 ID。");
      return () => {
        active = false;
      };
    }

    setLoading(true);
    setError(null);

    void (async () => {
      try {
        const nextProject = await getProject(projectId);
        const nextFlow = await getOrCreateDefaultFlow(nextProject);
        const nextDraft = await getFlowDraft(nextFlow.id);
        const canvasDraft = resolveDraftForCanvas(nextDraft);

        if (!active) return;
        loadProject({
          backendCurrentVersionId: nextFlow.currentVersionId,
          backendFlowId: nextFlow.id,
          backendProjectId: nextProject.id,
          edges: canvasDraft.graph.edges,
          id: nextProject.id,
          nodes: canvasDraft.graph.nodes,
          title: nextProject.name,
          updatedAt: Date.parse(canvasDraft.updatedAt) || Date.now(),
          version: canvasDraft.revision,
          viewport: canvasDraft.graph.viewport,
        });
        setProject(nextProject);
        setFlow(nextFlow);
        setDraft(canvasDraft);
        void recoverFlowTargetNodeRuns(nextFlow.id);
      } catch (loadError) {
        if (active) {
          setError(loadError instanceof Error ? loadError.message : "项目画布加载失败。");
        }
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [loadProject, projectId]);

  return {
    draft,
    error,
    flow,
    loading,
    project,
    reload: load,
  };
}
