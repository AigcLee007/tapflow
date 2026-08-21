import { AiGatewayError } from "./errors.js";
import type { AiGatewayUsage, ResolvedRoute } from "./types.js";

export type TextStreamFinishReason = "length" | "stop" | "tool_calls" | "cancelled" | string;

export type TextStreamEvent =
  | { type: "text_delta"; text: string }
  | { type: "tool_call_delta"; callId: string; name?: string; argumentsDelta: string }
  | { type: "tool_call"; callId: string; name: string; arguments: string }
  | { type: "usage"; usage: AiGatewayUsage }
  | { type: "done"; finishReason?: TextStreamFinishReason }
  | { type: "error"; error: { code: string; message: string } }
  | { type: "cancelled" };

/** Provider adapters must emit only this allowlisted event surface. */
export type ProviderTextStreamEvent = TextStreamEvent;

/** Read an SSE response without exposing raw provider frames to callers. */
export async function* readTextServerSentEvents(response: Response): AsyncGenerator<unknown> {
  if (!response.body) return;
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.startsWith("data:")) continue;
        const data = line.slice(5).trim();
        if (!data || data === "[DONE]") {
          if (data === "[DONE]") return;
          continue;
        }
        try {
          yield JSON.parse(data) as unknown;
        } catch {
          // Ignore keepalive/non-JSON frames. Provider errors are represented by
          // the HTTP status or a normalized error event, never by raw frames.
        }
      }
      if (done) break;
    }
  } finally {
    reader.releaseLock();
  }
}

export type TextStreamingCapabilities = {
  supportsTextStreaming: boolean;
  supportsToolCalling: boolean;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readCapability(route: ResolvedRoute, name: keyof TextStreamingCapabilities): boolean {
  const routeCapabilities = isRecord(route.requestConfig.capabilities)
    ? route.requestConfig.capabilities
    : {};
  const providerCapabilities = isRecord(route.provider.capabilities)
    ? route.provider.capabilities
    : {};

  // An explicit false on either layer always wins. Otherwise a capability must
  // be explicitly advertised by the route or its provider; absence is unsafe.
  if (routeCapabilities[name] === false || providerCapabilities[name] === false) return false;
  return routeCapabilities[name] === true || providerCapabilities[name] === true;
}

export function resolveTextStreamingCapabilities(route: ResolvedRoute): TextStreamingCapabilities {
  return {
    supportsTextStreaming: readCapability(route, "supportsTextStreaming"),
    supportsToolCalling: readCapability(route, "supportsToolCalling"),
  };
}

export function assertTextStreamingCapabilities(
  route: ResolvedRoute,
  required: { toolCalling: boolean },
): TextStreamingCapabilities {
  const capabilities = resolveTextStreamingCapabilities(route);
  if (!capabilities.supportsTextStreaming || (required.toolCalling && !capabilities.supportsToolCalling)) {
    throw new AiGatewayError({
      code: "AGENT_ROUTE_CAPABILITY_REQUIRED",
      details: {
        required: {
          supportsTextStreaming: true,
          supportsToolCalling: required.toolCalling,
        },
        routeKey: route.routeKey,
      },
      message: "The selected AI route does not support the required Agent streaming capability",
      statusCode: 400,
    });
  }
  return capabilities;
}
