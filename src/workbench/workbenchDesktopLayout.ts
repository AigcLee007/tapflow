import type { WorkbenchGeneration } from "./workbenchTypes";

const ACTIVE_STATUSES = new Set(["pending", "queued", "running", "waiting_provider"]);

function byCreatedDesc(left: WorkbenchGeneration, right: WorkbenchGeneration) {
  return right.createdAt.localeCompare(left.createdAt);
}

export function isWorkbenchGenerationAwaitingResult(generation: WorkbenchGeneration) {
  return generation.status === "succeeded" && getWorkbenchGenerationResultCount(generation) === 0;
}

export function getWorkbenchGenerationResultCount(generation: WorkbenchGeneration) {
  if (generation.batch) {
    return generation.batch.children.reduce((count, child) => count + child.results.length, 0);
  }
  return generation.results.length;
}

export function isWorkbenchBatchComplete(generation: WorkbenchGeneration) {
  if (!generation.batch) return false;
  return generation.batch.runningCount === 0 && generation.batch.pendingCount === 0;
}

export function isWorkbenchGenerationActive(generation: WorkbenchGeneration) {
  if (generation.batch) {
    return !isWorkbenchBatchComplete(generation);
  }
  return ACTIVE_STATUSES.has(generation.status) || isWorkbenchGenerationAwaitingResult(generation);
}

export function isWorkbenchGenerationCompleted(generation: WorkbenchGeneration) {
  if (generation.batch) {
    return isWorkbenchBatchComplete(generation) && getWorkbenchGenerationResultCount(generation) > 0;
  }
  return generation.status === "succeeded" && generation.results.length > 0;
}

export function getWorkbenchActiveGenerations(generations: WorkbenchGeneration[]) {
  return [...generations].filter(isWorkbenchGenerationActive).sort(byCreatedDesc);
}

export function getWorkbenchCompletedGenerations(generations: WorkbenchGeneration[]) {
  return [...generations].filter(isWorkbenchGenerationCompleted).sort(byCreatedDesc);
}

export const getWorkbenchCompletedHistory = getWorkbenchCompletedGenerations;
