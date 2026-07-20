import type { PromptEntry } from "../services/v2PromptsApi";

export function createPromptInsertRequestId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `prompt-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export async function copyPromptText(prompt: PromptEntry): Promise<void> {
  if (!navigator.clipboard?.writeText) {
    throw new Error("当前浏览器不支持自动复制");
  }
  await navigator.clipboard.writeText(prompt.promptText);
}

export function navigate(path: string): void {
  window.history.pushState(null, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}
