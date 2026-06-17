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

export function getWorkbenchCompletedHistory(generations: WorkbenchGeneration[]) {
  return [...generations].filter(isWorkbenchGenerationCompleted).sort(byCreatedDesc);
}

export function getWorkbenchDesktopStage(generations: WorkbenchGeneration[]) {
  const sorted = [...generations].sort(byCreatedDesc);
  const primary =
    sorted.find(isWorkbenchGenerationActive) ??
    sorted.find(isWorkbenchGenerationCompleted) ??
    sorted[0] ??
    null;

  const recent = sorted
    .filter((generation) => generation.id !== primary?.id)
    .filter(
      (generation) =>
        isWorkbenchGenerationActive(generation) ||
        isWorkbenchGenerationCompleted(generation) ||
        generation.status === "failed",
    )
    .slice(0, primary ? 7 : 8);

  return { primary, recent };
}
