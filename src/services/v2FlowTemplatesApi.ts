import { apiGet, apiPost } from './v2HttpClient';

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
};

export type FlowTemplateGraph = FlowTemplateItem & {
  graph: { nodes: unknown[]; edges: unknown[] };
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
