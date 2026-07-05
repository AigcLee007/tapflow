import type { FlowNodeKind } from '../types';

export const OPEN_PRODUCTION_STUDIO_EVENT = 'tapflow:open-production-studio';

export type ProductionStudioKind = Extract<FlowNodeKind, 'storyboard' | 'director3d' | 'video_editor'>;

export interface OpenProductionStudioDetail {
  nodeId: string;
  studio: ProductionStudioKind;
}

export function openProductionStudio(detail: OpenProductionStudioDetail) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<OpenProductionStudioDetail>(OPEN_PRODUCTION_STUDIO_EVENT, { detail }));
}
