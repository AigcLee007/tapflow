import { apiGet, apiPatch, apiPost } from "../services/v2HttpClient";

export type WorkspaceProject = {
  coverAssetId: string | null;
  coverUrl?: string;
  createdAt: string;
  createdBy: string | null;
  description: string | null;
  id: string;
  name: string;
  tenantId: string;
  updatedAt: string;
};

export type WorkspaceFlow = {
  createdAt: string;
  createdBy: string | null;
  currentVersionId: string | null;
  description: string | null;
  id: string;
  projectId: string;
  status: string;
  tenantId: string;
  title: string;
  updatedAt: string;
  updatedBy: string | null;
};

export async function listWorkspaceProjects(): Promise<WorkspaceProject[]> {
  return apiGet<WorkspaceProject[]>("/projects");
}

export async function getWorkspaceProject(projectId: string): Promise<WorkspaceProject> {
  return apiGet<WorkspaceProject>(`/projects/${projectId}`);
}

export async function listProjectFlows(projectId: string): Promise<WorkspaceFlow[]> {
  return apiGet<WorkspaceFlow[]>(`/projects/${projectId}/flows`);
}

export async function createProject(input: {
  description?: string | null;
  name: string;
}): Promise<WorkspaceProject> {
  return apiPost<WorkspaceProject>("/projects", input);
}

export async function createProjectFlow(
  projectId: string,
  input: {
    description?: string | null;
    title: string;
  },
): Promise<WorkspaceFlow> {
  return apiPost<WorkspaceFlow>(`/projects/${projectId}/flows`, input);
}

export async function updateWorkspaceProject(
  projectId: string,
  input: {
    coverAssetId?: string | null;
    description?: string | null;
    name?: string;
  },
): Promise<WorkspaceProject> {
  return apiPatch<WorkspaceProject>(`/projects/${projectId}`, input);
}

export async function createWorkspaceProject(input: {
  description?: string | null;
  name: string;
}): Promise<{
  flow: WorkspaceFlow;
  project: WorkspaceProject;
}> {
  const project = await createProject(input);
  let flow: WorkspaceFlow;

  try {
    flow = await createProjectFlow(project.id, {
      description: "项目默认画布",
      title: `${project.name} 画布`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "未知错误";
    throw new Error(`项目已创建，但默认画布创建失败。项目 ID：${project.id}。${message}`);
  }

  return { flow, project };
}
