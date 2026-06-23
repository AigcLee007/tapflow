const IMAGE_CONTEXT_PATTERN = /生图|出图|画图|图片|图像|套图|张|nano banana|gpt-image|image|picture|generate|compare|batch/i;
const PRODUCTION_ACTION_PATTERN = /生成|生图|出图|画图|对比|批量|generate|compare|batch/i;

export function isProductionImageAgentPrompt(prompt: string): boolean {
  const normalized = prompt.trim().toLowerCase();
  if (!normalized) return false;
  return PRODUCTION_ACTION_PATTERN.test(normalized) && IMAGE_CONTEXT_PATTERN.test(normalized);
}
