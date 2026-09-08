import { AGENT_V6_ID_MAX_LENGTH } from "./conversationTypes";

const STABLE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;

export function normalizeStableId(value: unknown): string | undefined {
  if (typeof value !== "string" || value.length === 0 || value.length > AGENT_V6_ID_MAX_LENGTH) return undefined;
  return STABLE_ID_PATTERN.test(value) ? value : undefined;
}
