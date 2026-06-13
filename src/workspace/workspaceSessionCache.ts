import type { WorkspaceProject } from "./workspaceApi";

export type WorkspaceProjectsSnapshot = {
  projects: WorkspaceProject[];
  staleAt: number;
};

const snapshots = new Map<string, WorkspaceProjectsSnapshot>();

export function getWorkspaceProjectsSnapshot(identityKey: string): WorkspaceProjectsSnapshot | null {
  return snapshots.get(identityKey) ?? null;
}

export function setWorkspaceProjectsSnapshot(identityKey: string, snapshot: WorkspaceProjectsSnapshot): void {
  snapshots.set(identityKey, snapshot);
}

export function clearWorkspaceProjectsCache(): void {
  snapshots.clear();
}
