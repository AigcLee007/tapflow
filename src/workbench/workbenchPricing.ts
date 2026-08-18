import type { WorkbenchDraft } from "./workbenchTypes";

export function getWorkbenchEstimatedCredits(draft: Pick<WorkbenchDraft, "quantity" | "size">): number {
  const size = String(draft.size || "").toLowerCase();
  const perImage = size === "2k" ? 2 : 4;
  return Math.max(1, draft.quantity || 1) * perImage;
}
