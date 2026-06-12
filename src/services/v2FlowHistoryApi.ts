import { apiGet, apiPost } from './v2HttpClient';

export type FlowHistoryItem = {
  actorUserId: string | null;
  createdAt: string;
  eventId: string;
  eventType: 'restore' | 'snapshot';
  flowId: string;
  label: string;
  payload: Record<string, unknown> | null;
  projectId: string;
  summary: string;
  tenantId: string;
  type: 'restore' | 'snapshot';
  version: number | null;
  versionId: string | null;
};

export type FlowHistorySnapshot = {
  createdAt: string;
  flowId: string;
  graph: {
    edges: Record<string, unknown>[];
    nodes: Record<string, unknown>[];
    viewport: {
      x: number;
      y: number;
      zoom: number;
    };
  };
  id: string;
  lastSavedBy: string | null;
  projectId: string;
  revision: number;
  tenantId: string;
  updatedAt: string;
};

export function listProjectHistory(projectId: string) {
  return apiGet<{ items: FlowHistoryItem[] }>(`/projects/${projectId}/history`);
}

export function createProjectHistorySnapshot(projectId: string, input: { label?: string } = {}) {
  return apiPost<{
    createdAt: string;
    flowId: string;
    label: string;
    projectId: string;
    version: number;
    versionId: string;
  }>(`/projects/${projectId}/history/snapshot`, input);
}

export function restoreProjectHistoryVersion(projectId: string, versionId: string) {
  return apiPost<FlowHistorySnapshot>(`/projects/${projectId}/history/${versionId}/restore`);
}
