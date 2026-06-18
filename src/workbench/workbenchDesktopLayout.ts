import type { WorkbenchGeneration } from "./workbenchTypes";

const ACTIVE_STATUSES = new Set(["pending", "queued", "running", "waiting_provider"]);

function byCreatedDesc(left: WorkbenchGeneration, right: WorkbenchGeneration) {
  return right.createdAt.localeCompare(left.createdAt);
}

export function isWorkbenchGenerationAwaitingResult(generation: WorkbenchGeneration) {
  return generation.status === "succeeded" && generation.results.length === 0;
}

export function isWorkbenchGenerationActive(generation: WorkbenchGeneration) {
  return ACTIVE_STATUSES.has(generation.status) || isWorkbenchGenerationAwaitingResult(generation);
}

export function isWorkbenchGenerationCompleted(generation: WorkbenchGeneration) {
  return generation.status === "succeeded" && generation.results.length > 0;
}

export function getWorkbenchActiveGenerations(generations: WorkbenchGeneration[]) {
  return [...generations].filter(isWorkbenchGenerationActive).sort(byCreatedDesc);
}

export function getWorkbenchCompletedGenerations(generations: WorkbenchGeneration[]) {
  return [...generations].filter(isWorkbenchGenerationCompleted).sort(byCreatedDesc);
}

export const getWorkbenchCompletedHistory = getWorkbenchCompletedGenerations;
