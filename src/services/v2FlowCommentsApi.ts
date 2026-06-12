import { apiGet, apiPatch, apiPost } from './v2HttpClient';

export type FlowComment = {
  id: string;
  projectId: string;
  flowId: string | null;
  nodeId: string | null;
  authorUserId: string;
  body: string;
  status: 'open' | 'resolved';
  anchor: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
};

export function listFlowComments(projectId: string) {
  return apiGet<{ items: FlowComment[] }>(`/projects/${projectId}/comments`);
}

export function createFlowComment(
  projectId: string,
  input: { anchor?: Record<string, unknown>; body: string; flowId?: string; nodeId?: string },
) {
  return apiPost<FlowComment>(`/projects/${projectId}/comments`, input);
}

export function updateFlowComment(
  projectId: string,
  commentId: string,
  input: { body?: string; status?: 'open' | 'resolved' },
) {
  return apiPatch<FlowComment>(`/projects/${projectId}/comments/${commentId}`, input);
}
