import { apiGet, apiPost } from "../services/v2HttpClient";

export type WorkspaceProject = {
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
      description: "Default project canvas",
      title: `${project.name} Flow`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    throw new Error(
      `Project was created, but the default Flow could not be created. Project ID: ${project.id}. ${message}`,
    );
  }

  return { flow, project };
}
