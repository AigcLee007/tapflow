import { apiGet, apiPost, apiPut } from "../../services/v2HttpClient";
import type { WorkspaceFlow, WorkspaceProject } from "../../workspace/workspaceApi";

export type FlowDraftGraph = {
  edges: Record<string, unknown>[];
  nodes: Record<string, unknown>[];
  viewport: {
    x: number;
    y: number;
    zoom: number;
  };
};

export type FlowDraft = {
  createdAt: string;
  flowId: string;
  graph: FlowDraftGraph;
  id: string;
  lastSavedBy: string | null;
  projectId: string;
  revision: number;
  tenantId: string;
  updatedAt: string;
};

export async function getProject(projectId: string): Promise<WorkspaceProject> {
  return apiGet<WorkspaceProject>(`/projects/${projectId}`);
}

export async function listProjectFlows(projectId: string): Promise<WorkspaceFlow[]> {
  return apiGet<WorkspaceFlow[]>(`/projects/${projectId}/flows`);
}

export async function createDefaultFlow(project: WorkspaceProject): Promise<WorkspaceFlow> {
  return apiPost<WorkspaceFlow>(`/projects/${project.id}/flows`, {
    description: "Default project canvas",
    title: `${project.name} Flow`,
  });
}

export async function getFlowDraft(flowId: string): Promise<FlowDraft> {
  return apiGet<FlowDraft>(`/flows/${flowId}/draft`);
}

export async function saveFlowDraft(
  flowId: string,
  input: {
    expectedRevision?: number;
    graph: FlowDraftGraph;
  },
): Promise<FlowDraft> {
  return apiPut<FlowDraft>(`/flows/${flowId}/draft`, input);
}
