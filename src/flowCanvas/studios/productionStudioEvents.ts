import type { FlowNodeKind } from '../types';

export const OPEN_PRODUCTION_STUDIO_EVENT = 'tapflow:open-production-studio';

export type ProductionStudioKind = Extract<FlowNodeKind, 'storyboard' | 'director3d' | 'video_editor'>;

export type ProductionStudioScope = 'node' | 'project';

export interface OpenProductionStudioDetail {
  nodeId: string;
  studio: ProductionStudioKind;
  scope?: 'node';
}

export interface OpenProjectProductionStudioDetail {
  nodeId?: never;
  studio: Extract<ProductionStudioKind, 'director3d'>;
  scope: 'project';
}

export type ProductionStudioOpenDetail = OpenProductionStudioDetail | OpenProjectProductionStudioDetail;

export function openProductionStudio(detail: ProductionStudioOpenDetail) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<ProductionStudioOpenDetail>(OPEN_PRODUCTION_STUDIO_EVENT, { detail }));
}

export function openProjectDirectorDesk() {
  openProductionStudio({ scope: 'project', studio: 'director3d' });
}
