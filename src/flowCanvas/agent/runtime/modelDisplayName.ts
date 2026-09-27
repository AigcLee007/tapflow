const MODEL_NAMES: Record<string, string> = {
  "text.gpt-5-5": "GPT-5.5",
  "gpt-5-5": "GPT-5.5",
  "gpt-image-2": "GPT Image 2",
};

export function modelDisplayName(modelKey: string | null | undefined): string | null {
  if (!modelKey) return null;
  return MODEL_NAMES[modelKey] ?? (modelKey.startsWith("text.") ? modelKey.slice(5).replace(/[-_]/g, " ") : "默认模型");
}
