const MAX_DEPTH = 16;
const MAX_NODES = 512;
const STABLE_ID_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9_-]*[A-Za-z0-9])?$/;

const unsafeKeys = new Set([
  "apikey",
  "apisecret",
  "authorization",
  "authtag",
  "base64",
  "baseurl",
  "blob",
  "clientsecret",
  "credential",
  "credentialid",
  "data",
  "html",
  "nonce",
  "password",
  "privatekey",
  "provider",
  "refresh_token",
  "refreshtoken",
  "route",
  "secret",
  "signedurl",
  "token",
  "url",
]);

function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function isStableAssetId(value: unknown): value is string {
  return typeof value === "string"
    && value.length > 0
    && value.length <= 200
    && STABLE_ID_PATTERN.test(value);
}

function containsUnsafeDeliveryData(value: unknown, depth = 0, state = { nodes: 0, seen: new Set<object>() }): boolean {
  if (value === null || value === undefined || typeof value === "boolean" || typeof value === "number") return false;
  if (typeof value === "string") {
    return /^(?:data:|blob:)/i.test(value) || /\b(?:bearer|basic)\s+\S+/i.test(value);
  }
  if (typeof value !== "object" || depth > MAX_DEPTH || state.seen.has(value)) return true;
  state.nodes += 1;
  if (state.nodes > MAX_NODES) return true;
  state.seen.add(value);
  try {
    if (Array.isArray(value)) return value.some((item) => containsUnsafeDeliveryData(item, depth + 1, state));
    return Object.entries(value).some(([key, item]) => unsafeKeys.has(normalizeKey(key)) || containsUnsafeDeliveryData(item, depth + 1, state));
  } catch {
    return true;
  }
}

function readAssetIds(output: Record<string, unknown>): string[] {
  const candidates: unknown[] = [];
  if (output.assetId !== undefined) candidates.push(output.assetId);
  if (Array.isArray(output.assets)) {
    candidates.push(...output.assets.map((asset) => (
      asset !== null && typeof asset === "object" && !Array.isArray(asset)
        ? (asset as Record<string, unknown>).assetId
        : undefined
    )));
  }
  return [...new Set(candidates.filter(isStableAssetId))];
}

export type AgentV6DeliveryVerification =
  | { status: "delivered"; kind: "text"; text: string; assetIds?: string[] }
  | { status: "delivered"; kind: "asset"; assetIds: string[] }
  | { status: "failed"; code: "DELIVERY_NOT_VERIFIED"; retryable: true }
  | { status: "canceled"; code: "DELIVERY_CANCELED"; retryable: false };

export function verifyAgentV6Delivery(
  output: unknown,
  options: { canceled?: boolean } = {},
): AgentV6DeliveryVerification {
  if (options.canceled) return { code: "DELIVERY_CANCELED", retryable: false, status: "canceled" };
  if (output === null || typeof output !== "object" || Array.isArray(output)) {
    return { code: "DELIVERY_NOT_VERIFIED", retryable: true, status: "failed" };
  }

  const record = output as Record<string, unknown>;
  if (containsUnsafeDeliveryData(record)) {
    return { code: "DELIVERY_NOT_VERIFIED", retryable: true, status: "failed" };
  }

  const text = typeof record.text === "string" ? record.text.trim() : "";
  const assetIds = readAssetIds(record);
  if (text) return { assetIds: assetIds.length ? assetIds : undefined, kind: "text", status: "delivered", text };
  if (assetIds.length) return { assetIds, kind: "asset", status: "delivered" };
  return { code: "DELIVERY_NOT_VERIFIED", retryable: true, status: "failed" };
}
