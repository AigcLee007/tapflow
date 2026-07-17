const CHINESE_CHARACTER_PATTERN = /[\u3400-\u9FFF]/u;
const SAFE_CREATOR_TEXT_PATTERN = /^[\u3400-\u9FFF0-9\s，。；：、】【、】【（）()、·+\-\/:%,.]*$/u;
const DISPLAY_RESOLUTION_TOKEN_PATTERN = /\b4K\b/g;
const ENGLISH_DURATION_PATTERN = /(?:about|up\s+to|around|approximately)?\s*(\d+(?:\.\d+)?)\s*(seconds?|secs?|s|minutes?|mins?|m)\b/i;

export function isSafeChineseCreatorText(value: unknown): value is string {
  return typeof value === "string"
    && CHINESE_CHARACTER_PATTERN.test(value)
    && SAFE_CREATOR_TEXT_PATTERN.test(value.replace(DISPLAY_RESOLUTION_TOKEN_PATTERN, ""));
}

export function sanitizeVideoModelDescription(value: unknown): string {
  return isSafeChineseCreatorText(value) ? value.trim() : "暂无中文模型说明";
}

export function sanitizeVideoModelEstimatedDuration(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  if (!normalized || /https?:\/\//i.test(normalized)) return undefined;
  if (isSafeChineseCreatorText(normalized)) return normalized;

  const match = normalized.match(ENGLISH_DURATION_PATTERN);
  if (!match || match[0].trim() !== normalized) return undefined;
  const amount = match[1];
  const unit = match[2].toLowerCase();
  return /^(minutes?|mins?|m)$/.test(unit) ? `预计 ${amount} 分钟` : `预计 ${amount} 秒`;
}
