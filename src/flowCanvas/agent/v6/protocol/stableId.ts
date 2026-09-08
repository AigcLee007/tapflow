import { AGENT_V6_ID_MAX_LENGTH } from "./conversationTypes";

const STABLE_ID_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9_-]*[A-Za-z0-9])?$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TOKEN_PREFIX_PATTERN = /^(?:sk|rk|pk|gh[pousr]|xox[baprs]|bearer|basic)[-_]|^(?:AIza|ya29)/i;
const URL_PATTERN = /^(?:https?|wss?|ftp|data|blob):/i;
const JWT_PATTERN = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
function isTokenLike(value: string) {
  if (UUID_PATTERN.test(value)) return false;
  return URL_PATTERN.test(value)
    || JWT_PATTERN.test(value)
    || TOKEN_PREFIX_PATTERN.test(value)
    || /^eyJ[A-Za-z0-9_-]{10,}$/i.test(value)
    || /^c2V[A-Za-z0-9_-]{10,}$/i.test(value);
}

export function normalizeStableId(value: unknown): string | undefined {
  if (typeof value !== "string" || value.length === 0 || value.length > AGENT_V6_ID_MAX_LENGTH) return undefined;
  return STABLE_ID_PATTERN.test(value) && !isTokenLike(value) ? value : undefined;
}

function canonicalize(value: unknown, seen = new Set<object>()): unknown {
  if (value === undefined) return "undefined";
  if (typeof value === "number" && !Number.isFinite(value)) return String(value);
  if (value === null || typeof value !== "object") return value;
  if (seen.has(value)) return "[Circular]";
  seen.add(value);
  if (Array.isArray(value)) return value.map((item) => canonicalize(item, seen));
  return Object.fromEntries(Object.keys(value as Record<string, unknown>).sort().map((key) => [key, canonicalize((value as Record<string, unknown>)[key], seen)]));
}

export function stableHash(value: unknown): string {
  const input = JSON.stringify(canonicalize(value));
  let first = 0x811c9dc5;
  let second = 0x9e3779b9;
  for (let index = 0; index < input.length; index += 1) {
    const code = input.charCodeAt(index);
    first ^= code;
    first = Math.imul(first, 0x01000193);
    second ^= code + index;
    second = Math.imul(second, 0x85ebca6b);
  }
  return `h${(first >>> 0).toString(16).padStart(8, "0")}${(second >>> 0).toString(16).padStart(8, "0")}`;
}
