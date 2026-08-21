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
    messages: messages.filter((message) => message.role !== "system" && message.content.trim()),
    system,
  };
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
      response = await this.fetchImplementation(providerRequest.url, {
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
        if (eventType === "content_block_delta" && typeof delta.partial_json === "string") {
          yield { type: "tool_call_delta", callId: typeof event.index === "number" ? `tool-call-${event.index}` : "tool-call-0", argumentsDelta: delta.partial_json };
        }
        const block = readRelayStreamRecord(event.content_block);
        if (eventType === "content_block_start" && block.type === "tool_use" && typeof block.name === "string") {
          yield { type: "tool_call_delta", callId: typeof block.id === "string" ? block.id : "tool-call-0", name: block.name, argumentsDelta: "" };
        }
        if (eventType === "message_delta") {
          finishReason = typeof delta.stop_reason === "string" ? delta.stop_reason : finishReason;
          const usage = readRelayStreamRecord(delta.usage);
          if (Object.keys(usage).length > 0) {
            yield { type: "usage", usage: { inputTokens: asNumber(usage.input_tokens), outputTokens: asNumber(usage.output_tokens), totalTokens: asNumber(usage.input_tokens) !== null && asNumber(usage.output_tokens) !== null ? asNumber(usage.input_tokens)! + asNumber(usage.output_tokens)! : null } };
          }
        }
        continue;
      }
      if (protocol === "responses") {
        if (eventType === "response.output_text.delta" && typeof event.delta === "string") yield { type: "text_delta", text: event.delta };
        if (eventType === "response.function_call_arguments.delta" && typeof event.delta === "string") yield { type: "tool_call_delta", callId: typeof event.item_id === "string" ? event.item_id : "tool-call-0", argumentsDelta: event.delta };
        if (eventType === "response.output_item.added") {
          const item = readRelayStreamRecord(event.item);
          if (item.type === "function_call" && typeof item.name === "string") yield { type: "tool_call_delta", callId: typeof item.call_id === "string" ? item.call_id : "tool-call-0", name: item.name, argumentsDelta: "" };
        }
        if (eventType === "response.completed") {
          finishReason = "stop";
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
      response = await this.fetchImplementation(url, {
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
    if (protocol === "responses") {
      return compactObject({
        input: system ? [{ content: system, role: "system" }, ...messages.map((message, index) => ({ ...message, content: index === finalUserMessageIndex && images.length ? [{ type: "input_text", text: message.content }, ...images.map((image) => ({ type: "input_image", image_url: `data:${image.mimeType};base64,${image.base64}` }))] : message.content }))] : messages.map((message, index) => ({ ...message, content: index === finalUserMessageIndex && images.length ? [{ type: "input_text", text: message.content }, ...images.map((image) => ({ type: "input_image", image_url: `data:${image.mimeType};base64,${image.base64}` }))] : message.content })),
        max_output_tokens: maxTokens,
        model,
        temperature,
      });
    }
    if (protocol === "chat-completions") {
      return compactObject({
        max_tokens: maxTokens,
        messages: (system ? [{ content: system, role: "system" as const }, ...messages] : messages).map((message, index) => ({ ...message, content: images.length && index === (system ? finalUserMessageIndex + 1 : finalUserMessageIndex) ? [{ type: "text", text: message.content }, ...images.map((image) => ({ type: "image_url", image_url: { url: `data:${image.mimeType};base64,${image.base64}` } }))] : message.content })),
        model,
        temperature,
      });
    }
    return compactObject({
      max_tokens: maxTokens ?? 2048,
      messages: messages.map((message, index) => ({
        content: images.length && index === finalUserMessageIndex ? [{ type: "text", text: message.content }, ...images.map((image) => ({ type: "image", source: { type: "base64", media_type: image.mimeType, data: image.base64 } }))] : message.content,
        role: message.role === "assistant" ? "assistant" : "user",
      })),
      model,
      system: system ?? undefined,
      temperature,
    });
  }
}
