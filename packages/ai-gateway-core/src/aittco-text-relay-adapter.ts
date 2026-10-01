import { observeProviderFetch } from "./provider-request-telemetry.js";
import { AiGatewayError } from "./errors.js";
import type { ProviderAdapter } from "./provider-adapter.js";
import { readTextServerSentEvents, type ProviderTextStreamEvent } from "./text-streaming-contract.js";
import type {
  AssetReferenceInput,
  AiGatewayUsage,
  ProviderCallContext,
  ProviderTextGenerationResult,
  TextGenerationRequest,
  TextMessage,
} from "./types.js";

type FetchLike = typeof fetch;
type AittcoTextProtocol = "chat-completions" | "claude" | "gemini" | "responses";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function compactObject<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as T;
}

type RelayImageInput = { base64: string; mimeType: string };

function readImageInputs(inputAssets: AssetReferenceInput[] | null | undefined): RelayImageInput[] {
  if (!Array.isArray(inputAssets)) return [];
  return inputAssets.filter((asset) => asset.kind === "image").map((asset) => {
    const metadata = asRecord(asset.metadata);
    const mimeType = typeof asset.mimeType === "string" && asset.mimeType.trim() ? asset.mimeType.trim().toLowerCase() : "application/octet-stream";
    const raw = asString(metadata.base64);
    const base64 = raw?.match(/^data:[^;]+;base64,(.*)$/s)?.[1]?.trim() ?? raw;
    if (!base64) {
      throw new AiGatewayError({ code: "TEXT_IMAGE_URL_HYDRATION_FAILED", message: "The image input URL could not be hydrated", statusCode: 502 });
    }
    return { base64, mimeType };
  });
}

function normalizePath(value: unknown, fallback: string): string {
  const path = asString(value) || fallback;
  return path.startsWith("/") ? path : `/${path}`;
}

function buildUrl(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/$/, "")}${path}`;
}

function resolveProtocol(requestConfig: Record<string, unknown>): AittcoTextProtocol {
  const configured = asString(requestConfig.protocol) ?? asString(requestConfig.apiMode);
  if (configured === "gemini" || configured === "responses" || configured === "claude" || configured === "chat-completions") {
    return configured;
  }
  throw new AiGatewayError({
    code: "PROVIDER_BAD_REQUEST",
    message: "The selected text route uses an unsupported relay protocol",
    statusCode: 400,
  });
}

function resolveUpstreamModel(requestConfig: Record<string, unknown>, fallback: string): string {
  return asString(requestConfig.upstreamModel) ?? asString(requestConfig.model) ?? fallback;
}

function resolveMaxTokens(request: TextGenerationRequest, requestConfig: Record<string, unknown>): number | undefined {
  const value = request.maxTokens
    ?? asNumber(requestConfig.maxOutputTokens)
    ?? asNumber(requestConfig.maxTokens)
    ?? asNumber(requestConfig.max_tokens);
  return value && value > 0 ? Math.floor(value) : undefined;
}

function resolveTemperature(request: TextGenerationRequest, requestConfig: Record<string, unknown>): number | undefined {
  const value = request.temperature ?? asNumber(requestConfig.temperature);
  return value !== null && value !== undefined && Number.isFinite(value) ? value : undefined;
}

function splitSystemMessages(messages: TextMessage[]): { messages: TextMessage[]; system: string | null } {
  const system = messages
    .filter((message) => message.role === "system" && message.content.trim())
    .map((message) => message.content.trim())
    .join("\n\n") || null;
  return {
    // Keep assistant tool-call turns and tool results even when their text is
    // empty: dropping them breaks the call/result pairing providers require.
    messages: messages.filter((message) => message.role !== "system"
      && (message.content.trim() || message.role === "tool" || Boolean(message.toolCalls?.length))),
    system,
  };
}

function geminiToolCallingUnsupported(routeKey: string | null): AiGatewayError {
  return new AiGatewayError({
    code: "TEXT_TOOL_CALLING_UNSUPPORTED_PROTOCOL",
    details: { protocol: "gemini", ...(routeKey ? { routeKey } : {}) },
    message: "The relay Gemini protocol does not support tool calling; configure this route with protocol \"chat-completions\"",
    statusCode: 400,
  });
}

function hasToolMessages(messages: TextMessage[]): boolean {
  return messages.some((message) => message.role === "tool" || Boolean(message.toolCalls?.length));
}

type RelayMessage = Record<string, unknown>;

/** Chat Completions relay: same shape as OpenAI. */
function toRelayChatMessages(messages: TextMessage[]): RelayMessage[] {
  return messages.map((message) => {
    if (message.role === "tool") return { content: message.content, role: "tool", tool_call_id: message.toolCallId ?? "" };
    if (message.role === "assistant" && message.toolCalls?.length) {
      return {
        content: message.content || null,
        role: "assistant",
        tool_calls: message.toolCalls.map((call) => ({
          function: { arguments: call.arguments, name: call.name },
          id: call.callId,
          type: "function",
        })),
      };
    }
    return { content: message.content, role: message.role };
  });
}

/** Responses relay: tool calls/results are standalone input items. */
function toRelayResponsesInput(messages: TextMessage[]): RelayMessage[] {
  return messages.flatMap((message): RelayMessage[] => {
    if (message.role === "tool") return [{ call_id: message.toolCallId ?? "", output: message.content, type: "function_call_output" }];
    if (message.role === "assistant" && message.toolCalls?.length) {
      return [
        ...(message.content.trim() ? [{ content: message.content, role: "assistant" }] : []),
        ...message.toolCalls.map((call) => ({ arguments: call.arguments, call_id: call.callId, name: call.name, type: "function_call" })),
      ];
    }
    return [{ content: message.content, role: message.role }];
  });
}

function parseToolArguments(raw: string): unknown {
  try {
    const parsed = JSON.parse(raw || "{}") as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

/**
 * Claude Messages relay: assistant tool calls become `tool_use` blocks; tool
 * results become `tool_result` blocks inside a user turn. Consecutive tool
 * results are merged into one user turn because Claude requires roles to
 * alternate.
 */
function toRelayClaudeMessages(messages: TextMessage[]): Array<{ content: unknown; role: "assistant" | "user" }> {
  const result: Array<{ content: unknown; role: "assistant" | "user" }> = [];
  for (const message of messages) {
    if (message.role === "tool") {
      const block = { content: message.content, tool_use_id: message.toolCallId ?? "", type: "tool_result" };
      const previous = result[result.length - 1];
      if (previous?.role === "user" && Array.isArray(previous.content)
        && (previous.content as Array<Record<string, unknown>>).every((item) => item.type === "tool_result")) {
        (previous.content as unknown[]).push(block);
      } else {
        result.push({ content: [block], role: "user" });
      }
      continue;
    }
    if (message.role === "assistant" && message.toolCalls?.length) {
      result.push({
        content: [
          ...(message.content.trim() ? [{ text: message.content, type: "text" }] : []),
          ...message.toolCalls.map((call) => ({ id: call.callId, input: parseToolArguments(call.arguments), name: call.name, type: "tool_use" })),
        ],
        role: "assistant",
      });
      continue;
    }
    const role = message.role === "assistant" ? "assistant" : "user";
    const previous = result[result.length - 1];
    if (role === "user" && previous?.role === "user" && Array.isArray(previous.content)) {
      // A user message right after tool results: same turn, text after the results.
      (previous.content as unknown[]).push({ text: message.content, type: "text" });
      continue;
    }
    result.push({ content: message.content, role });
  }
  return result;
}

function parseGeminiText(body: unknown): string | null {
  const candidates = asRecord(body).candidates;
  if (!Array.isArray(candidates)) return null;
  const parts = candidates.flatMap((candidate) => {
    const content = asRecord(asRecord(candidate).content);
    return Array.isArray(content.parts) ? content.parts : [];
  });
  const text = parts
    .map((part) => asString(asRecord(part).text))
    .filter((part): part is string => part !== null)
    .join("");
  return text || null;
}

function parseResponsesText(body: unknown): string | null {
  const record = asRecord(body);
  const direct = asString(record.output_text) ?? asString(record.outputText);
  if (direct) return direct;
  const output = Array.isArray(record.output) ? record.output : [];
  const text = output.flatMap((item) => {
    const content = asRecord(item).content;
    return Array.isArray(content) ? content : [];
  })
    .map((item) => asString(asRecord(item).text))
    .filter((item): item is string => item !== null)
    .join("");
  return text || null;
}

function parseChatCompletionsText(body: unknown): string | null {
  const choices = asRecord(body).choices;
  if (!Array.isArray(choices)) return null;
  const text = choices
    .flatMap((choice) => {
      const content = asRecord(asRecord(choice).message).content;
      if (typeof content === "string") return [content];
      return Array.isArray(content)
        ? content.map((part) => asRecord(part).text).filter((part): part is string => typeof part === "string")
        : [];
    })
    .filter((part) => part.trim())
    .join("");
  return text || null;
}

function parseClaudeText(body: unknown): string | null {
  const content = asRecord(body).content;
  if (!Array.isArray(content)) return null;
  const text = content
    .map((item) => asString(asRecord(item).text))
    .filter((item): item is string => item !== null)
    .join("");
  return text || null;
}

function parseUsage(protocol: AittcoTextProtocol, body: unknown): AiGatewayUsage {
  const record = asRecord(body);
  const usage = asRecord(protocol === "gemini" ? record.usageMetadata : record.usage);
  const inputTokens = protocol === "gemini"
    ? asNumber(usage.promptTokenCount)
    : asNumber(usage.input_tokens) ?? asNumber(usage.prompt_tokens);
  const outputTokens = protocol === "gemini"
    ? asNumber(usage.candidatesTokenCount)
    : asNumber(usage.output_tokens) ?? asNumber(usage.completion_tokens);
  return {
    inputTokens,
    outputTokens,
    totalTokens: protocol === "gemini"
      ? asNumber(usage.totalTokenCount)
      : asNumber(usage.total_tokens) ?? (inputTokens !== null && outputTokens !== null ? inputTokens + outputTokens : null),
  };
}

function readRequestId(body: unknown): string | null {
  const record = asRecord(body);
  return asString(record.id) ?? asString(record.request_id) ?? asString(record.requestId);
}

function mapProviderStatus(status: number): AiGatewayError["code"] {
  if (status === 401 || status === 403) return "PROVIDER_AUTH_FAILED";
  if (status === 429) return "PROVIDER_RATE_LIMIT";
  if (status >= 400 && status < 500) return "PROVIDER_BAD_REQUEST";
  return "PROVIDER_INTERNAL_ERROR";
}

async function readJsonResponse(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return {};
  }
}

function streamToolDefinitions(request: TextGenerationRequest, protocol: AittcoTextProtocol): Array<Record<string, unknown>> | undefined {
  if (!request.tools?.length) return undefined;
  return request.tools.map((tool) => protocol === "claude"
    ? { name: tool.name, description: tool.description, input_schema: tool.inputSchema }
    : protocol === "responses"
      ? { name: tool.name, description: tool.description, parameters: tool.inputSchema, type: "function" }
      : { function: { name: tool.name, description: tool.description, parameters: tool.inputSchema }, type: "function" });
}

function streamToolChoice(choice: TextGenerationRequest["toolChoice"], protocol: AittcoTextProtocol): unknown {
  if (!choice) return undefined;
  if (typeof choice === "string") return protocol === "claude" ? { type: choice } : choice;
  return protocol === "responses"
    ? { name: choice.function.name, type: "function" }
    : protocol === "claude"
      ? { name: choice.function.name, type: "tool" }
      : choice;
}

function readRelayStreamRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function readRelayChatToolDeltas(event: Record<string, unknown>, knownCallIds: Map<number, string>): Array<{ argumentsDelta: string; callId: string; name?: string }> {
  const choices = Array.isArray(event.choices) ? event.choices : [];
  const choice = readRelayStreamRecord(choices[0]);
  const delta = readRelayStreamRecord(choice.delta);
  const calls = Array.isArray(delta.tool_calls) ? delta.tool_calls : [];
  return calls.flatMap((item, index) => {
    const call = readRelayStreamRecord(item);
    const fn = readRelayStreamRecord(call.function);
    const argumentsDelta = typeof fn.arguments === "string" ? fn.arguments : "";
    const callIndex = typeof call.index === "number" ? call.index : index;
    const explicitId = typeof call.id === "string" && call.id ? call.id : null;
    if (explicitId) knownCallIds.set(callIndex, explicitId);
    const callId = explicitId ?? knownCallIds.get(callIndex) ?? `tool-call-${callIndex}`;
    if (!argumentsDelta && typeof fn.name !== "string") return [];
    return [{ argumentsDelta, callId, ...(typeof fn.name === "string" && fn.name ? { name: fn.name } : {}) }];
  });
}

export class AittcoTextRelayAdapter implements ProviderAdapter {
  private readonly fetchImplementation: FetchLike;

  constructor(options?: { fetchImplementation?: FetchLike }) {
    this.fetchImplementation = options?.fetchImplementation ?? fetch;
  }

  async *streamText(
    context: ProviderCallContext,
    request: TextGenerationRequest,
  ): AsyncGenerator<ProviderTextStreamEvent> {
    const requestConfig = asRecord(context.requestConfig);
    const protocol = resolveProtocol(requestConfig);
    const model = resolveUpstreamModel(requestConfig, context.modelKey);
    if (protocol === "gemini" && request.tools?.length) {
      // The relay's Gemini protocol is not wired for function calling. Fail
      // loudly instead of silently dropping tools (the model would then answer
      // without ever calling them). Use the chat-completions protocol instead.
      throw geminiToolCallingUnsupported(context.routeKey);
    }
    const { messages, system } = splitSystemMessages(request.messages);
    const images = readImageInputs(request.inputAssets);
    const basePayload = this.buildPayload(
      protocol,
      model,
      messages,
      system,
      resolveMaxTokens(request, requestConfig),
      resolveTemperature(request, requestConfig),
      images,
    );
    const tools = streamToolDefinitions(request, protocol);
    const toolChoice = streamToolChoice(request.toolChoice, protocol);
    const payload: Record<string, unknown> = {
      ...basePayload,
      ...(protocol === "gemini" ? {} : { stream: true }),
      ...(tools && protocol !== "gemini" ? { tools } : {}),
      ...(toolChoice && protocol !== "gemini" ? { tool_choice: toolChoice } : {}),
    };
    const path = this.resolvePath(protocol, requestConfig, model);
    const providerRequest = {
      body: { messageCount: request.messages.length, model, protocol, routeKey: context.routeKey },
      headers: { Authorization: `Bearer ${context.apiKey}`, "Content-Type": "application/json" },
      method: "POST",
      url: buildUrl(context.baseUrl, path),
    };
    let response: Response;
    try {
      response = await observeProviderFetch(context, "stream", this.fetchImplementation, providerRequest.url, {
        body: JSON.stringify(payload),
        headers: providerRequest.headers,
        method: "POST",
        signal: request.signal ?? AbortSignal.timeout(context.timeoutMs),
      });
    } catch (error) {
      const timeout = error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError");
      throw new AiGatewayError({
        code: timeout ? "PROVIDER_TIMEOUT" : "PROVIDER_INTERNAL_ERROR",
        message: timeout ? "The text provider stream timed out" : "The text provider stream failed before a response was received",
        providerRequest,
        statusCode: timeout ? 504 : 502,
      });
    }
    if (!response.ok) {
      const body = await readJsonResponse(response);
      throw new AiGatewayError({
        code: mapProviderStatus(response.status),
        message: "The text provider rejected the streaming request",
        providerRequest,
        providerResponse: { requestId: readRequestId(body), status: response.status },
        statusCode: response.status,
      });
    }

    let finishReason: string | undefined;
    const knownCallIds = new Map<number, string>();
    // Claude: content_block_start carries the tool_use id; later
    // input_json_delta events only carry the block index.
    const claudeBlockCallIds = new Map<number, string>();
    // Responses: output_item.added carries item.id + call_id; argument deltas
    // only carry item_id.
    const responsesItemCallIds = new Map<string, string>();
    let sawResponsesToolCall = false;
    for await (const raw of readTextServerSentEvents(response)) {
      const event = readRelayStreamRecord(raw);
      if (protocol === "gemini") {
        const candidates = Array.isArray(event.candidates) ? event.candidates : [];
        const candidate = readRelayStreamRecord(candidates[0]);
        const content = readRelayStreamRecord(candidate.content);
        const parts = Array.isArray(content.parts) ? content.parts : [];
        for (const part of parts) {
          const text = readRelayStreamRecord(part).text;
          if (typeof text === "string" && text) yield { type: "text_delta", text };
        }
        const usage = readRelayStreamRecord(event.usageMetadata);
        if (Object.keys(usage).length > 0) {
          yield { type: "usage", usage: {
            inputTokens: asNumber(usage.promptTokenCount),
            outputTokens: asNumber(usage.candidatesTokenCount),
            totalTokens: asNumber(usage.totalTokenCount),
          } };
        }
        continue;
      }
      const eventType = typeof event.type === "string" ? event.type : "";
      if (protocol === "claude") {
        const delta = readRelayStreamRecord(event.delta);
        if (eventType === "content_block_delta" && typeof delta.text === "string" && delta.text) {
          yield { type: "text_delta", text: delta.text };
        }
        const blockIndex = typeof event.index === "number" ? event.index : 0;
        const block = readRelayStreamRecord(event.content_block);
        if (eventType === "content_block_start" && block.type === "tool_use" && typeof block.name === "string") {
          const callId = typeof block.id === "string" && block.id ? block.id : `tool-call-${blockIndex}`;
          claudeBlockCallIds.set(blockIndex, callId);
          yield { type: "tool_call_delta", callId, name: block.name, argumentsDelta: "" };
        }
        if (eventType === "content_block_delta" && typeof delta.partial_json === "string") {
          const callId = claudeBlockCallIds.get(blockIndex) ?? `tool-call-${blockIndex}`;
          yield { type: "tool_call_delta", callId, argumentsDelta: delta.partial_json };
        }
        if (eventType === "message_delta") {
          // Normalize Claude's "tool_use" to the shared "tool_calls" reason.
          const stopReason = typeof delta.stop_reason === "string" ? delta.stop_reason : null;
          finishReason = stopReason === "tool_use" ? "tool_calls" : stopReason ?? finishReason;
          const usage = readRelayStreamRecord(delta.usage);
          if (Object.keys(usage).length > 0) {
            yield { type: "usage", usage: { inputTokens: asNumber(usage.input_tokens), outputTokens: asNumber(usage.output_tokens), totalTokens: asNumber(usage.input_tokens) !== null && asNumber(usage.output_tokens) !== null ? asNumber(usage.input_tokens)! + asNumber(usage.output_tokens)! : null } };
          }
        }
        continue;
      }
      if (protocol === "responses") {
        if (eventType === "response.output_text.delta" && typeof event.delta === "string") yield { type: "text_delta", text: event.delta };
        if (eventType === "response.output_item.added") {
          const item = readRelayStreamRecord(event.item);
          if (item.type === "function_call" && typeof item.name === "string") {
            const itemId = typeof item.id === "string" && item.id ? item.id : "";
            const callId = typeof item.call_id === "string" && item.call_id ? item.call_id : itemId || "tool-call-0";
            if (itemId) responsesItemCallIds.set(itemId, callId);
            sawResponsesToolCall = true;
            yield { type: "tool_call_delta", callId, name: item.name, argumentsDelta: "" };
          }
        }
        if (eventType === "response.function_call_arguments.delta" && typeof event.delta === "string") {
          const itemId = typeof event.item_id === "string" && event.item_id ? event.item_id : "";
          const callId = (itemId && responsesItemCallIds.get(itemId)) || itemId || "tool-call-0";
          yield { type: "tool_call_delta", callId, argumentsDelta: event.delta };
        }
        if (eventType === "response.completed") {
          finishReason = sawResponsesToolCall ? "tool_calls" : "stop";
          const usage = readRelayStreamRecord(readRelayStreamRecord(event.response).usage);
          if (Object.keys(usage).length > 0) yield { type: "usage", usage: { inputTokens: asNumber(usage.input_tokens), outputTokens: asNumber(usage.output_tokens), totalTokens: asNumber(usage.total_tokens) } };
        }
        continue;
      }
      const text = readRelayStreamRecord(readRelayStreamRecord(Array.isArray(event.choices) ? event.choices[0] : null).delta).content;
      if (typeof text === "string" && text) yield { type: "text_delta", text };
      for (const tool of readRelayChatToolDeltas(event, knownCallIds)) yield { type: "tool_call_delta", ...tool };
      const choice = readRelayStreamRecord(Array.isArray(event.choices) ? event.choices[0] : null);
      if (typeof choice.finish_reason === "string") finishReason = choice.finish_reason;
      const usage = readRelayStreamRecord(event.usage);
      if (Object.keys(usage).length > 0) yield { type: "usage", usage: parseUsage(protocol, event) };
    }
    yield { type: "done", ...(finishReason ? { finishReason } : {}) };
  }

  async generateText(
    context: ProviderCallContext,
    request: TextGenerationRequest,
  ): Promise<ProviderTextGenerationResult> {
    const requestConfig = asRecord(context.requestConfig);
    const protocol = resolveProtocol(requestConfig);
    const model = resolveUpstreamModel(requestConfig, context.modelKey);
    const { messages, system } = splitSystemMessages(request.messages);
    const maxTokens = resolveMaxTokens(request, requestConfig);
    const temperature = resolveTemperature(request, requestConfig);
    const images = readImageInputs(request.inputAssets);
    const path = this.resolvePath(protocol, requestConfig, model);
    const url = buildUrl(context.baseUrl, path);
    const payload = this.buildPayload(protocol, model, messages, system, maxTokens, temperature, images);
    const providerRequest = {
      ...(images.length ? { body: { imageInputCount: images.length, imageMimeTypes: images.map((image) => image.mimeType) } } : {}),
      messageCount: request.messages.length,
      model,
      protocol,
      routeKey: context.routeKey,
      url,
    };

    let response: Response;
    try {
      response = await observeProviderFetch(context, "generate", this.fetchImplementation, url, {
        body: JSON.stringify(payload),
        headers: {
          Authorization: `Bearer ${context.apiKey}`,
          "Content-Type": "application/json",
        },
        method: "POST",
        signal: AbortSignal.timeout(context.timeoutMs),
      });
    } catch (error) {
      const isTimeout = error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError");
      throw new AiGatewayError({
        code: isTimeout ? "PROVIDER_TIMEOUT" : "PROVIDER_INTERNAL_ERROR",
        message: isTimeout ? "The text provider request timed out" : "The text provider request could not be completed",
        providerRequest,
        providerResponse: null,
        statusCode: isTimeout ? 504 : 502,
      });
    }

    const responseBody = await readJsonResponse(response);
    const providerResponse = {
      requestId: readRequestId(responseBody),
      status: response.status,
    };
    if (!response.ok) {
      throw new AiGatewayError({
        code: mapProviderStatus(response.status),
        message: "The text provider rejected the request",
        providerRequest,
        providerResponse,
        statusCode: response.status,
      });
    }

    const outputText = protocol === "gemini"
      ? parseGeminiText(responseBody)
      : protocol === "responses"
        ? parseResponsesText(responseBody)
        : protocol === "chat-completions"
          ? parseChatCompletionsText(responseBody)
        : parseClaudeText(responseBody);
    if (!outputText) {
      throw new AiGatewayError({
        code: "PROVIDER_INVALID_RESPONSE",
        message: "The text provider response did not contain generated text",
        providerRequest,
        providerResponse,
        statusCode: 502,
      });
    }

    return {
      modelKey: context.modelKey,
      outputText,
      providerRequest,
      providerResponse,
      usage: parseUsage(protocol, responseBody),
    };
  }

  private resolvePath(
    protocol: AittcoTextProtocol,
    requestConfig: Record<string, unknown>,
    model: string,
  ): string {
    const fallback = protocol === "gemini"
      ? "/v1beta/models/{model}:generateContent"
      : protocol === "responses"
        ? "/v1/responses"
        : protocol === "chat-completions"
          ? "/v1/chat/completions"
        : "/v1/messages";
    const path = normalizePath(requestConfig.path ?? requestConfig.generatePath, fallback);
    return protocol === "gemini"
      ? path.replace("{model}", encodeURIComponent(model))
      : path;
  }

  private buildPayload(
    protocol: AittcoTextProtocol,
    model: string,
    messages: TextMessage[],
    system: string | null,
    maxTokens: number | undefined,
    temperature: number | undefined,
    images: RelayImageInput[],
  ): Record<string, unknown> {
    const finalUserMessageIndex = messages.reduce<number>((lastIndex, message, index) => message.role === "user" ? index : lastIndex, -1);
    if (protocol === "gemini" && hasToolMessages(messages)) throw geminiToolCallingUnsupported(null);
    if (protocol === "gemini") {
      return compactObject({
        contents: messages.map((message, index) => ({
          parts: [
            { text: message.content },
            ...(index === finalUserMessageIndex ? images.map((image) => ({ inlineData: { data: image.base64, mimeType: image.mimeType } })) : []),
          ],
          role: message.role === "assistant" ? "model" : "user",
        })),
        generationConfig: compactObject({
          maxOutputTokens: maxTokens,
          temperature,
        }),
        systemInstruction: system ? { parts: [{ text: system }] } : undefined,
      });
    }
    // Images attach to the last user turn. A plain-text turn becomes [text, ...images];
    // a turn that is already a block list (Claude tool results + folded text) gets the
    // images appended, so they sit next to the request that refers to them.
    const attachImages = <T extends Record<string, unknown>>(items: T[], textPart: (text: string) => unknown, imageParts: unknown[]): T[] => {
      if (!images.length) return items;
      const index = items.map((item) => item.role === "user").lastIndexOf(true);
      if (index < 0) return items;
      return items.map((item, itemIndex) => {
        if (itemIndex !== index) return item;
        const content = Array.isArray(item.content) ? [...item.content, ...imageParts] : [textPart(String(item.content)), ...imageParts];
        return { ...item, content };
      });
    };
    if (protocol === "responses") {
      const input = attachImages(
        toRelayResponsesInput(messages),
        (text) => ({ type: "input_text", text }),
        images.map((image) => ({ type: "input_image", image_url: `data:${image.mimeType};base64,${image.base64}` })),
      );
      return compactObject({
        input: system ? [{ content: system, role: "system" }, ...input] : input,
        max_output_tokens: maxTokens,
        model,
        temperature,
      });
    }
    if (protocol === "chat-completions") {
      const chatMessages = attachImages(
        toRelayChatMessages(messages),
        (text) => ({ type: "text", text }),
        images.map((image) => ({ type: "image_url", image_url: { url: `data:${image.mimeType};base64,${image.base64}` } })),
      );
      return compactObject({
        max_tokens: maxTokens,
        messages: system ? [{ content: system, role: "system" }, ...chatMessages] : chatMessages,
        model,
        temperature,
      });
    }
    return compactObject({
      max_tokens: maxTokens ?? 2048,
      messages: attachImages(
        toRelayClaudeMessages(messages),
        (text) => ({ type: "text", text }),
        images.map((image) => ({ type: "image", source: { type: "base64", media_type: image.mimeType, data: image.base64 } })),
      ),
      model,
      system: system ?? undefined,
      temperature,
    });
  }
}
