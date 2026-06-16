const FORBIDDEN_PATTERN =
  /(baseUrl|Authorization|apiKey|provider_key|provider_name|adapter_kind|upstream_model|route_key_snapshot|raw route[_ ]?key)/i;

export function containsForbiddenAgentOutputText(value: string): boolean {
  return FORBIDDEN_PATTERN.test(value);
}

export function assertAgentOutputSafe(value: unknown): void {
  const serialized = JSON.stringify(value);
  if (containsForbiddenAgentOutputText(serialized)) {
    throw new Error("Agent planner produced unsafe internal data.");
  }
}
