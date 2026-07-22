import type { PromptEntry } from "../services/v2PromptsApi";

export function createPromptInsertRequestId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `prompt-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export type PromptLanguage = "en" | "zh";
export type PromptCopyMode = PromptLanguage | "both";

export function preferredPromptLanguage(prompt: PromptEntry, locale = typeof navigator === "undefined" ? "en" : navigator.language): PromptLanguage {
  if (locale.toLowerCase().startsWith("zh") && prompt.promptTextZh) return "zh";
  if (prompt.promptTextEn) return "en";
  return "zh";
}

export function getPromptText(prompt: PromptEntry, language: PromptLanguage): string {
  return (language === "zh" ? prompt.promptTextZh : prompt.promptTextEn) || prompt.promptTextEn || prompt.promptTextZh || prompt.promptText;
}

export async function copyPromptText(prompt: PromptEntry, mode?: PromptCopyMode): Promise<void> {
  if (!navigator.clipboard?.writeText) {
    throw new Error("当前浏览器不支持自动复制");
  }
  const resolved = mode ?? preferredPromptLanguage(prompt);
  const text = resolved === "both"
    ? [prompt.promptTextZh ? `中文：\n${prompt.promptTextZh}` : "", prompt.promptTextEn ? `English:\n${prompt.promptTextEn}` : ""].filter(Boolean).join("\n\n")
    : getPromptText(prompt, resolved);
  await navigator.clipboard.writeText(text);
}

export function navigate(path: string): void {
  window.history.pushState(null, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

export function openPromptDetail(path: string): void {
  window.history.pushState(
    { ...(window.history.state ?? {}), promptModalFromPlaza: true },
    "",
    path,
  );
  window.dispatchEvent(new PopStateEvent("popstate"));
}

export function closePromptDetail(returnUrl: string): void {
  if (window.history.state?.promptModalFromPlaza === true) {
    window.history.back();
    return;
  }
  window.history.replaceState(null, "", returnUrl);
  window.dispatchEvent(new PopStateEvent("popstate"));
}
