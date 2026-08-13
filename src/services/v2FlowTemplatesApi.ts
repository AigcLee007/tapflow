import { apiGet, apiPost, apiPut } from './v2HttpClient';

export type FlowTemplateStatus = 'archived' | 'draft' | 'published' | 'testing';

export type FlowTemplateInputDefinition = {
  id: string;
  label: string;
  description?: string;
  required: boolean;
  target: { nodeId: string; fieldPath: string };
} & (
  | { type: 'text'; defaultValue?: string }
  | { type: 'asset'; assetKinds?: Array<'image' | 'video' | 'audio'>; defaultValue?: string }
  | { type: 'enum'; options: string[]; defaultValue?: string }
  | { type: 'number'; minimum?: number; maximum?: number; step?: number; defaultValue?: number }
);

export type SaveFlowTemplateDraftInput = {
  title: string;
  description: string;
  category: string;
  coverAssetId?: string | null;
  graph: { nodes: unknown[]; edges: unknown[] };
  inputSchema: FlowTemplateInputDefinition[];
  estimatedCredits?: number | null;
};

export type FlowTemplateItem = {
  id: string;
  title: string;
  description: string;
  category: string;
  visibility: 'official' | 'tenant' | 'private';
  nodeCount: number;
  estimatedCredits: number | null;
  coverAssetId?: string | null;
  tenantId?: string | null;
  updatedAt?: string;
  status?: FlowTemplateStatus;
  version?: number;
  publishedAt?: string | null;
};

export type FlowTemplateGraph = FlowTemplateItem & {
  graph: { nodes: unknown[]; edges: unknown[] };
  inputSchema?: FlowTemplateInputDefinition[];
};

export async function listFlowTemplates(params: { category?: string; query?: string } = {}) {
  const search = new URLSearchParams();
  if (params.category) search.set('category', params.category);
  if (params.query) search.set('query', params.query);
  const suffix = search.toString() ? `?${search.toString()}` : '';
  const items = await apiGet<Array<FlowTemplateGraph | FlowTemplateItem>>(`/flow-templates${suffix}`);
  return {
    items: items.map((item) => ({
      id: item.id,
      title: item.title,
      description: item.description,
      category: item.category,
      visibility: item.visibility,
      nodeCount: item.nodeCount,
      estimatedCredits: item.estimatedCredits,
      coverAssetId: item.coverAssetId ?? null,
      tenantId: item.tenantId ?? null,
      updatedAt: item.updatedAt,
    })),
  };
}

export function getFlowTemplate(templateId: string) {
  return apiGet<FlowTemplateGraph>(`/flow-templates/${templateId}`);
}

export function recordFlowTemplateUsage(templateId: string, projectId?: string) {
  return apiPost<{ ok: true }>(`/flow-templates/${templateId}/usage`, projectId ? { projectId } : {});
}

export function instantiateFlowTemplate(templateId: string, input: { projectId?: string; inputValues: Record<string, string | number | undefined>; idempotencyKey: string }) {
  return apiPost<{ graph: { nodes: unknown[]; edges: unknown[] }; version: number }>(`/flow-templates/${encodeURIComponent(templateId)}/instantiate`, input);
}

export function listAdminFlowTemplates(params: { category?: string; query?: string; status?: FlowTemplateStatus } = {}) {
  const search = new URLSearchParams();
  if (params.category) search.set('category', params.category);
  if (params.query) search.set('query', params.query);
  if (params.status) search.set('status', params.status);
  const suffix = search.toString() ? `?${search.toString()}` : '';
  return apiGet<FlowTemplateGraph[]>(`/admin/flow-templates${suffix}`);
}

export function getAdminFlowTemplate(templateId: string) {
  return apiGet<FlowTemplateGraph>(`/admin/flow-templates/${encodeURIComponent(templateId)}`);
}

export function createAdminFlowTemplateDraft(input: SaveFlowTemplateDraftInput) {
  return apiPost<FlowTemplateGraph>('/admin/flow-templates', input);
}

export function saveAdminFlowTemplateDraft(templateId: string, input: SaveFlowTemplateDraftInput) {
  return apiPut<FlowTemplateGraph>(`/admin/flow-templates/${encodeURIComponent(templateId)}`, input);
}

export function validateAdminFlowTemplate(templateId: string) {
  return apiPost<FlowTemplateGraph>(`/admin/flow-templates/${encodeURIComponent(templateId)}/testing`);
}

export function publishAdminFlowTemplate(templateId: string) {
  return apiPost<FlowTemplateGraph>(`/admin/flow-templates/${encodeURIComponent(templateId)}/publish`);
}

export function archiveAdminFlowTemplate(templateId: string) {
  return apiPost<FlowTemplateGraph>(`/admin/flow-templates/${encodeURIComponent(templateId)}/archive`);
}
