import { AiGatewayError } from "./errors.js";
import { normalizeOpenAiCompatibleImageSize } from "./image-size.js";
import type { ProviderAdapter } from "./provider-adapter.js";
import type {
  AssetReferenceInput,
  ImageGenerationRequest,
  MediaOutput,
  ProviderCallContext,
  ProviderMediaGenerationResult,
  ProviderTaskResult,
  ProviderTextGenerationResult,
  PollTaskRequest,
  TextGenerationRequest,
} from "./types.js";

type FetchLike = typeof fetch;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function getNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function getString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function getNestedRecord(...records: Array<Record<string, unknown>>): Record<string, unknown> {
  for (const record of records) {
    const params = asRecord(record.params);
    if (Object.keys(params).length > 0) {
      return params;
    }
  }
  return {};
}

function getFirstString(records: Array<Record<string, unknown>>, keys: string[]): string | null {
  for (const record of records) {
    for (const key of keys) {
      const value = getString(record[key]);
      if (value) return value;
    }
  }
  return null;
}

function getFirstNumber(records: Array<Record<string, unknown>>, keys: string[]): number | null {
  for (const record of records) {
    for (const key of keys) {
      const value = getNumber(record[key]);
      if (value !== null) return value;
    }
  }
  return null;
}

function getBoolean(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    return normalized === "true" || normalized === "1" || normalized === "yes";
  }
  return false;
}

function normalizePath(value: unknown, fallback: string): string {
  const path = getString(value) || fallback;
  return path.startsWith("/") ? path : `/${path}`;
}

function buildUrl(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/$/, "")}${path}`;
}

function appendQueryParam(url: string, key: string, value: string): string {
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}${encodeURIComponent(key)}=${encodeURIComponent(value)}`;
}

function normalizeN(value: unknown): number {
  const parsed = typeof value === "number" && Number.isFinite(value)
    ? value
    : typeof value === "string" && value.trim()
      ? Number(value)
      : 1;
  return Math.max(1, Math.min(10, Math.floor(Number.isFinite(parsed) ? parsed : 1)));
}

function normalizeOutputFormat(value: string | null): "jpeg" | "png" | "webp" {
  const normalized = (value || "png").toLowerCase();
  if (normalized === "jpg") return "jpeg";
  return normalized === "jpeg" || normalized === "webp" || normalized === "png" ? normalized : "png";
}

function normalizeOutputCompression(value: number | null, outputFormat: string): number | null {
  if (outputFormat === "png" || value === null) return null;
  return Math.max(0, Math.min(100, Math.floor(value)));
}

function mimeTypeForOutputFormat(outputFormat: string): string {
  if (outputFormat === "jpeg") return "image/jpeg";
  if (outputFormat === "webp") return "image/webp";
  return "image/png";
}

function extensionForOutputFormat(outputFormat: string): string {
  return outputFormat === "jpeg" ? "jpg" : outputFormat;
}

function isGptImage2Model(model: string): boolean {
  return model.trim().toLowerCase() === "gpt-image-2";
}

function isOpenAiImageSizeTierModel(model: string): boolean {
  const normalized = model.trim().toLowerCase();
  return normalized === "gpt-image-2" || normalized === "gpt-5.5";
}

function normalizeProviderImageSize(model: string, size: string | null, aspectRatio: string | null): string | null {
  if (!size) return null;
  if (isOpenAiImageSizeTierModel(model)) {
    return normalizeOpenAiCompatibleImageSize(size, aspectRatio || "1:1");
  }
  return size.trim() || null;
}

function normalizeSizeTierKey(size: string | null): string | null {
  if (!size) return null;
  const normalized = size.trim().toUpperCase();
  return normalized === "1K" || normalized === "2K" || normalized === "4K" ? normalized : null;
}

function resolveModelBySize(
  fallbackModel: string,
  requestConfig: Record<string, unknown>,
  size: string | null,
): string {
  const modelBySize = asRecord(requestConfig.modelBySize);
  const tier = normalizeSizeTierKey(size);
  if (!tier) return fallbackModel;
  return getString(modelBySize[tier])
    ?? getString(modelBySize[tier.toLowerCase()])
    ?? fallbackModel;
}

function isResponsesImageMode(requestConfig: Record<string, unknown>): boolean {
  const apiMode = getString(requestConfig.apiMode);
  const endpoint = getString(requestConfig.endpoint);
  return apiMode?.toLowerCase() === "responses" || endpoint?.toLowerCase() === "responses";
}

function buildPromptInput(prompt: string): string {
  return `Use the following text as the complete prompt. Do not rewrite it:\n${prompt}`;
}

function collectStringInputs(...values: unknown[]): string[] {
  const inputs: string[] = [];
  for (const value of values) {
    if (Array.isArray(value)) {
      for (const item of value) {
        const text = getString(item);
        if (text) inputs.push(text);
      }
      continue;
    }
    const text = getString(value);
    if (text) inputs.push(text);
  }
  return Array.from(new Set(inputs));
}

function collectAssetImageInputs(inputAssets: AssetReferenceInput[] | null | undefined): string[] {
  if (!Array.isArray(inputAssets)) return [];

  return collectStringInputs(
    ...inputAssets.flatMap((asset) => {
      const metadata = asRecord(asset.metadata);
      return [
        metadata.url,
        metadata.uri,
        metadata.fileUri,
        metadata.file_url,
        metadata.signedUrl,
        metadata.signed_url,
        metadata.publicUrl,
        metadata.public_url,
      ];
    }),
  );
}

function collectImageInputs(
  request: ImageGenerationRequest,
  metadata: Record<string, unknown>,
  params: Record<string, unknown>,
): string[] {
  return collectStringInputs(
    metadata.images,
    metadata.referenceImages,
    metadata.reference_images,
    metadata.image,
    metadata.imageUrl,
    metadata.image_url,
    metadata.referenceImage,
    metadata.referenceImageUrl,
    params.images,
    params.referenceImages,
    params.reference_images,
    params.image,
    params.imageUrl,
    params.image_url,
    params.referenceImage,
    params.referenceImageUrl,
    collectAssetImageInputs(request.inputAssets),
  );
}

function collectMaskInput(metadata: Record<string, unknown>, params: Record<string, unknown>): string | null {
  return collectStringInputs(
    metadata.mask,
    metadata.maskImage,
    metadata.mask_image,
    metadata.maskUrl,
    metadata.mask_url,
    params.mask,
    params.maskImage,
    params.mask_image,
    params.maskUrl,
    params.mask_url,
  )[0] ?? null;
}

function collectResponseImageOutputs(value: unknown): unknown[] {
  const outputs: unknown[] = [];
  if (Array.isArray(value)) {
    for (const item of value) {
      outputs.push(...collectResponseImageOutputs(item));
    }
    return outputs;
  }

  const record = asRecord(value);
  if (Object.keys(record).length === 0) return outputs;
  const type = getString(record.type);
  if (type === "image_generation_call") {
    outputs.push(record.result ?? record.b64_json ?? record.base64 ?? record.image ?? record.data);
    return outputs;
  }
  for (const key of ["result", "b64_json", "base64", "image", "data", "output", "content"]) {
    if (record[key] !== undefined) {
      outputs.push(...collectResponseImageOutputs(record[key]));
    }
  }
  return outputs;
}

function responseImageValueToOutput(value: unknown, index: number, outputFormat: string): MediaOutput | null {
  const outputMimeType = mimeTypeForOutputFormat(outputFormat);
  const outputExtension = extensionForOutputFormat(outputFormat);
  const direct = getString(value);
  const record = asRecord(value);
  const candidate =
    direct ??
    getString(record.b64_json) ??
    getString(record.base64) ??
    getString(record.image) ??
    getString(record.data) ??
    getString(record.url);
  if (!candidate) return null;

  const isUrl = /^https?:\/\//i.test(candidate);
  return {
    ...(isUrl ? { url: candidate } : { base64: candidate }),
    filename: `openai-response-image-${index + 1}.${outputExtension}`,
    mimeType: getString(record.mime_type ?? record.mimeType) || outputMimeType,
  };
}

function openAiImageDataItemToOutput(item: unknown, index: number, outputFormat: string): MediaOutput | null {
  const row = asRecord(item);
  const b64Json = getString(row.b64_json);
  const url = getString(row.url);
  if (!b64Json && !url) return null;

  const outputMimeType = mimeTypeForOutputFormat(outputFormat);
  const outputExtension = extensionForOutputFormat(outputFormat);
  return {
    ...(b64Json ? { base64: b64Json } : {}),
    filename: `openai-image-${index + 1}.${outputExtension}`,
    mimeType: getString(row.mime_type ?? row.mimeType) || (url ? guessMimeType(url) : outputMimeType),
    ...(url ? { url } : {}),
  };
}

function collectOpenAiImageData(value: unknown): unknown[] {
  const record = asRecord(value);
  if (Array.isArray(record.data)) return record.data;

  const nestedData = asRecord(record.data).data;
  if (Array.isArray(nestedData)) return nestedData;

  const doubleNestedData = asRecord(asRecord(record.data).data).data;
  return Array.isArray(doubleNestedData) ? doubleNestedData : [];
}

function guessMimeType(value: string): string {
  const normalized = value.split("?")[0]?.toLowerCase() || "";
  if (normalized.startsWith("data:")) {
    const match = /^data:([^;,]+)/i.exec(value);
    if (match?.[1]) return match[1];
  }
  if (normalized.endsWith(".jpg") || normalized.endsWith(".jpeg")) return "image/jpeg";
  if (normalized.endsWith(".webp")) return "image/webp";
  if (normalized.endsWith(".gif")) return "image/gif";
  return "image/png";
}

async function imageInputToBlob(
  input: string,
  fetchImplementation: FetchLike,
  timeoutMs: number,
): Promise<{ blob: Blob; mimeType: string }> {
  if (/^https?:\/\//i.test(input)) {
    const response = await fetchImplementation(input, {
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) {
      throw new AiGatewayError({
        code: "PROVIDER_BAD_REQUEST",
        message: "The referenced image could not be fetched",
        providerRequest: { url: input },
        providerResponse: { status: response.status },
        statusCode: 400,
      });
    }
    const mimeType = response.headers.get("content-type")?.split(";")[0]?.trim() || guessMimeType(input);
    return {
      blob: new Blob([await response.arrayBuffer()], { type: mimeType }),
      mimeType,
    };
  }

  const dataUriMatch = /^data:([^;,]+)?(;base64)?,(.*)$/i.exec(input);
  if (dataUriMatch) {
    const mimeType = dataUriMatch[1] || "image/png";
    const payload = dataUriMatch[3] || "";
    const bytes = dataUriMatch[2]
      ? Buffer.from(payload, "base64")
      : Buffer.from(decodeURIComponent(payload), "utf8");
    return {
      blob: new Blob([bytes], { type: mimeType }),
      mimeType,
    };
  }

  return {
    blob: new Blob([Buffer.from(input, "base64")], { type: "image/png" }),
    mimeType: "image/png",
  };
}

async function readResponseBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function extractProviderTaskId(responseBody: unknown): string | null {
  const body = asRecord(responseBody);
  const data = asRecord(body.data);
  return getString(body.task_id)
    ?? getString(body.taskId)
    ?? getString(body.id)
    ?? getString(body.data)
    ?? getString(data.task_id)
    ?? getString(data.taskId)
    ?? getString(data.id);
}

function extractUsage(value: unknown) {
  const usage = asRecord(value);
  return {
    inputTokens: getNumber(usage.prompt_tokens),
    outputTokens: getNumber(usage.completion_tokens),
    totalTokens: getNumber(usage.total_tokens),
  };
}

function normalizeProviderTaskStatus(value: string): "pending" | "running" | "succeeded" | "failed" | null {
  const normalized = value.trim().toUpperCase().replace(/[\s-]+/g, "_");
  if (!normalized) return null;

  if (
    normalized === "SUBMITTED" ||
    normalized === "CREATED" ||
    normalized === "QUEUED" ||
    normalized === "PENDING" ||
    normalized === "WAITING" ||
    normalized === "NOT_STARTED"
  ) {
    return "pending";
  }

  if (
    normalized === "IN_PROGRESS" ||
    normalized === "PROCESSING" ||
    normalized === "RUNNING" ||
    normalized === "GENERATING" ||
    normalized === "EXECUTING"
  ) {
    return "running";
  }

  if (
    normalized === "SUCCESS" ||
    normalized === "SUCCEEDED" ||
    normalized === "COMPLETED" ||
    normalized === "COMPLETE" ||
    normalized === "DONE" ||
    normalized === "FINISHED"
  ) {
    return "succeeded";
  }

  if (
    normalized === "FAILURE" ||
    normalized === "FAILED" ||
    normalized === "ERROR" ||
    normalized === "CANCELED" ||
    normalized === "CANCELLED" ||
    normalized === "TIMEOUT" ||
    normalized === "TIMED_OUT"
  ) {
    return "failed";
  }

  return null;
}

function getTaskStatus(records: Array<Record<string, unknown>>): { normalized: ReturnType<typeof normalizeProviderTaskStatus>; raw: string } {
  const raw = getFirstString(records, [
    "status",
    "task_status",
    "taskStatus",
    "state",
    "task_state",
    "taskState",
  ]) ?? "";
  return {
    normalized: normalizeProviderTaskStatus(raw),
    raw: raw.toUpperCase(),
  };
}

function collectFirstOpenAiImageOutputs(
  candidates: Array<Record<string, unknown>>,
  outputFormat: string,
): MediaOutput[] {
  for (const candidate of candidates) {
    const outputs = collectOpenAiImageData(candidate)
      .map((item, index) => openAiImageDataItemToOutput(item, index, outputFormat))
      .filter((value): value is MediaOutput => value !== null);
    if (outputs.length > 0) {
      return outputs;
    }
  }
  return [];
}

function replaceTaskId(path: string, providerTaskId: string): string {
  const encoded = encodeURIComponent(providerTaskId);
  return path
    .replace("{task_id}", encoded)
    .replace("{taskId}", encoded)
    .replace(":task_id", encoded)
    .replace(":taskId", encoded);
}

export class OpenAiCompatibleTextAdapter implements ProviderAdapter {
  private readonly fetchImplementation: FetchLike;

  constructor(options?: { fetchImplementation?: FetchLike }) {
    this.fetchImplementation = options?.fetchImplementation ?? fetch;
  }

  async generateText(
    context: ProviderCallContext,
    request: TextGenerationRequest,
  ): Promise<ProviderTextGenerationResult> {
    const requestConfig = asRecord(context.requestConfig);
    const payload = {
      max_tokens:
        request.maxTokens ??
        getNumber(requestConfig.maxTokens) ??
        getNumber(requestConfig.max_tokens),
      messages: request.messages,
      model: request.model?.trim() || context.modelKey,
      temperature:
        request.temperature ??
        getNumber(requestConfig.temperature),
    };
    const providerRequest = {
      body: payload,
      headers: {
        Authorization: `Bearer ${context.apiKey}`,
        "Content-Type": "application/json",
      },
      method: "POST",
      url: `${context.baseUrl.replace(/\/$/, "")}/chat/completions`,
    };

    let response: Response;
    try {
      response = await this.fetchImplementation(providerRequest.url, {
        body: JSON.stringify(payload),
        headers: providerRequest.headers,
        method: "POST",
        signal: AbortSignal.timeout(context.timeoutMs),
      });
    } catch (error) {
      if (
        error instanceof Error &&
        (error.name === "AbortError" || error.name === "TimeoutError")
      ) {
        throw new AiGatewayError({
          code: "PROVIDER_TIMEOUT",
          message: "The provider request timed out",
          providerRequest,
          statusCode: 504,
        });
      }

      throw new AiGatewayError({
        code: "PROVIDER_INTERNAL_ERROR",
        details: error instanceof Error ? error.message : String(error),
        message: "The provider request failed before a response was received",
        providerRequest,
        statusCode: 502,
      });
    }

    const providerResponse = {
      body: await readResponseBody(response),
      status: response.status,
    };

    if (!response.ok) {
      throw this.mapError(response.status, providerRequest, providerResponse);
    }

    const responseBody = asRecord(providerResponse.body);
    const choices = Array.isArray(responseBody.choices) ? responseBody.choices : [];
    const firstChoice = asRecord(choices[0]);
    const message = asRecord(firstChoice.message);
    const content = message.content;

    if (typeof content !== "string" || !content.length) {
      throw new AiGatewayError({
        code: "PROVIDER_INVALID_RESPONSE",
        message: "The provider response did not contain text output",
        providerRequest,
        providerResponse,
        statusCode: 502,
      });
    }

    const usage = asRecord(responseBody.usage);

    return {
      modelKey: payload.model,
      outputText: content,
      providerRequest,
      providerResponse,
      usage: {
        inputTokens: getNumber(usage.prompt_tokens),
        outputTokens: getNumber(usage.completion_tokens),
        totalTokens: getNumber(usage.total_tokens),
      },
    };
  }

  async generateImage(
    context: ProviderCallContext,
    request: ImageGenerationRequest,
  ): Promise<ProviderMediaGenerationResult> {
    const requestConfig = asRecord(context.requestConfig);
    if (isResponsesImageMode(requestConfig)) {
      return this.generateImageWithResponsesApi(context, request, requestConfig);
    }

    return this.generateImageWithImagesApi(context, request, requestConfig);
  }

  private async generateImageWithImagesApi(
    context: ProviderCallContext,
    request: ImageGenerationRequest,
    requestConfig: Record<string, unknown>,
  ): Promise<ProviderMediaGenerationResult> {
    const metadata = asRecord(request.metadata);
    const params = getNestedRecord(metadata, requestConfig);
    const lookupRecords = [params, metadata, requestConfig];
    const images = collectImageInputs(request, metadata, params);
    const mask = collectMaskInput(metadata, params);
    const hasEditInput = images.length > 0;
    const requestedSize = getFirstString(lookupRecords, ["size", "imageSize", "image_size"]);
    const baseModel = getString(requestConfig.model) || request.model?.trim() || context.modelKey;
    const model = resolveModelBySize(baseModel, requestConfig, requestedSize);
    const n = hasEditInput && isGptImage2Model(model) ? 1 : normalizeN(params.n ?? requestConfig.n);
    const outputFormat = normalizeOutputFormat(
      getFirstString(lookupRecords, ["outputFormat", "output_format"]),
    );
    const outputCompression = normalizeOutputCompression(
      getFirstNumber(lookupRecords, ["outputCompression", "output_compression"]),
      outputFormat,
    );
    const payload: Record<string, unknown> = {
      model,
      n,
      prompt: request.prompt,
    };
    if (!isGptImage2Model(model) && requestConfig.responseFormat !== null) {
      payload.response_format = getString(requestConfig.responseFormat ?? requestConfig.response_format) || "b64_json";
    }
    const background = getFirstString(lookupRecords, ["background"]);
    const quality = getFirstString(lookupRecords, ["quality"]);
    const aspectRatio = getFirstString(lookupRecords, ["aspectRatio", "aspect_ratio"]);
    const size = normalizeProviderImageSize(
      model,
      requestedSize,
      aspectRatio,
    );
    const moderation = getFirstString(lookupRecords, ["moderation"]);
    if (background) payload.background = background;
    if (outputCompression !== null) payload.output_compression = outputCompression;
    if (outputFormat) payload.output_format = outputFormat;
    if (quality) payload.quality = quality;
    if (moderation) payload.moderation = moderation;
    if (size) payload.size = size;

    let url = hasEditInput
      ? buildUrl(context.baseUrl, normalizePath(requestConfig.editPath ?? requestConfig.editsPath, "/images/edits"))
      : buildUrl(context.baseUrl, normalizePath(requestConfig.path ?? requestConfig.generatePath, "/images/generations"));
    const isAsync = getBoolean(requestConfig.async ?? requestConfig.asyncMode);
    if (isAsync) {
      url = appendQueryParam(url, "async", "true");
    }

    let requestBody: BodyInit;
    let requestHeaders: Record<string, string>;
    let providerRequestBody: Record<string, unknown>;

    if (hasEditInput) {
      const formData = new FormData();
      for (const [key, value] of Object.entries(payload)) {
        if (value !== undefined && value !== null) {
          formData.append(key, String(value));
        }
      }
      let imageIndex = 0;
      for (const image of images.slice(0, 10)) {
        const file = await imageInputToBlob(image, this.fetchImplementation, context.timeoutMs);
        imageIndex += 1;
        formData.append("image[]", file.blob, `input-${imageIndex}.${file.mimeType.split("/")[1] || "png"}`);
      }
      if (mask) {
        const maskFile = await imageInputToBlob(mask, this.fetchImplementation, context.timeoutMs);
        formData.append("mask", maskFile.blob, `mask.${maskFile.mimeType.split("/")[1] || "png"}`);
      }
      requestBody = formData;
      requestHeaders = {
        Authorization: `Bearer ${context.apiKey}`,
      };
      providerRequestBody = {
        ...payload,
        hasMask: Boolean(mask),
        imageCount: Math.min(images.length, 10),
      };
    } else {
      requestBody = JSON.stringify(payload);
      requestHeaders = {
        Authorization: `Bearer ${context.apiKey}`,
        "Content-Type": "application/json",
      };
      providerRequestBody = payload;
    }

    const providerRequest = {
      body: providerRequestBody,
      headers: requestHeaders,
      method: "POST",
      url,
    };

    let response: Response;
    try {
      response = await this.fetchImplementation(providerRequest.url, {
        body: requestBody,
        headers: requestHeaders,
        method: "POST",
        signal: AbortSignal.timeout(context.timeoutMs),
      });
    } catch (error) {
      if (
        error instanceof Error &&
        (error.name === "AbortError" || error.name === "TimeoutError")
      ) {
        throw new AiGatewayError({
          code: "PROVIDER_TIMEOUT",
          message: "The provider request timed out",
          providerRequest,
          statusCode: 504,
        });
      }

      throw new AiGatewayError({
        code: "PROVIDER_INTERNAL_ERROR",
        details: error instanceof Error ? error.message : String(error),
        message: "The provider request failed before a response was received",
        providerRequest,
        statusCode: 502,
      });
    }

    const providerResponse = {
      body: await readResponseBody(response),
      status: response.status,
    };

    if (!response.ok) {
      throw this.mapError(response.status, providerRequest, providerResponse);
    }

    if (isAsync) {
      const providerTaskId = extractProviderTaskId(providerResponse.body);
      if (!providerTaskId) {
        throw new AiGatewayError({
          code: "PROVIDER_INVALID_RESPONSE",
          message: "The provider async response did not include a task id",
          providerRequest,
          providerResponse,
          statusCode: 502,
        });
      }

      return {
        modelKey: model,
        outputs: [],
        providerRequest,
        providerResponse,
        providerTaskId,
        status: "waiting_provider",
        usage: {
          inputTokens: null,
          outputTokens: null,
          totalTokens: null,
        },
      };
    }

    const outputs: MediaOutput[] = collectOpenAiImageData(providerResponse.body)
      .map((item, index) => openAiImageDataItemToOutput(item, index, outputFormat))
      .filter((value): value is MediaOutput => value !== null);

    if (!outputs.length) {
      throw new AiGatewayError({
        code: "PROVIDER_INVALID_RESPONSE",
        message: "The provider response did not include image output",
        providerRequest,
        providerResponse,
        statusCode: 502,
      });
    }

    return {
      modelKey: model,
      outputs,
      providerRequest,
      providerResponse,
      status: "succeeded",
      usage: {
        inputTokens: null,
        outputTokens: null,
        totalTokens: null,
      },
    };
  }

  async pollTask(
    context: ProviderCallContext,
    request: PollTaskRequest,
  ): Promise<ProviderTaskResult> {
    const requestConfig = asRecord(context.requestConfig);
    const path = normalizePath(requestConfig.pollPath ?? requestConfig.taskPath, "/v1/images/tasks/{task_id}");
    const url = buildUrl(context.baseUrl, replaceTaskId(path, request.providerTaskId));
    const requestHeaders = {
      Authorization: `Bearer ${context.apiKey}`,
      "Content-Type": "application/json",
    };
    const providerRequest = {
      headers: requestHeaders,
      method: "GET",
      url,
    };

    let response: Response;
    try {
      response = await this.fetchImplementation(providerRequest.url, {
        headers: requestHeaders,
        method: "GET",
        signal: AbortSignal.timeout(context.timeoutMs),
      });
    } catch (error) {
      if (
        error instanceof Error &&
        (error.name === "AbortError" || error.name === "TimeoutError")
      ) {
        throw new AiGatewayError({
          code: "PROVIDER_TIMEOUT",
          message: "The provider poll request timed out",
          providerRequest,
          statusCode: 504,
        });
      }

      throw new AiGatewayError({
        code: "PROVIDER_INTERNAL_ERROR",
        details: error instanceof Error ? error.message : String(error),
        message: "The provider poll request failed before a response was received",
        providerRequest,
        statusCode: 502,
      });
    }

    const providerResponse = {
      body: await readResponseBody(response),
      status: response.status,
    };

    if (!response.ok) {
      throw this.mapError(response.status, providerRequest, providerResponse);
    }

    const body = asRecord(providerResponse.body);
    const data = asRecord(body.data);
    const nestedData = asRecord(data.data);
    const taskStatus = getTaskStatus([nestedData, data, body]);
    const providerTaskId =
      getString(nestedData.task_id) ??
      getString(nestedData.taskId) ??
      getString(data.task_id) ??
      getString(data.taskId) ??
      getString(body.task_id) ??
      getString(body.taskId) ??
      request.providerTaskId;

    if (taskStatus.normalized === "pending" || taskStatus.normalized === "running") {
      return {
        providerRequest,
        providerResponse,
        providerTaskId,
        status: taskStatus.normalized,
        usage: null,
      };
    }

    if (taskStatus.normalized === "failed") {
      return {
        error: {
          message:
            getString(nestedData.fail_reason) ??
            getString(nestedData.failReason) ??
            getString(data.fail_reason) ??
            getString(data.failReason) ??
            getString(body.fail_reason) ??
            getString(body.failReason) ??
            getString(body.message) ??
            "Provider task failed",
          status: taskStatus.raw,
        },
        providerRequest,
        providerResponse,
        providerTaskId,
        status: "failed",
        usage: null,
      };
    }

    if (taskStatus.normalized !== "succeeded") {
      throw new AiGatewayError({
        code: "PROVIDER_INVALID_RESPONSE",
        message: "The provider poll response did not include a recognized task status",
        providerRequest,
        providerResponse,
        statusCode: 502,
      });
    }

    const outputFormat = normalizeOutputFormat(getString(requestConfig.outputFormat ?? requestConfig.output_format));
    const resultCandidates = [
      nestedData,
      data,
      body,
    ].filter((candidate) => Object.keys(candidate).length > 0);
    const outputs = collectFirstOpenAiImageOutputs(resultCandidates, outputFormat);

    if (!outputs.length) {
      throw new AiGatewayError({
        code: "PROVIDER_INVALID_RESPONSE",
        message: "The provider poll response did not include image output",
        providerRequest,
        providerResponse,
        statusCode: 502,
      });
    }
    const usageRecord = resultCandidates
      .map((candidate) => asRecord(candidate.usage))
      .find((usage) => Object.keys(usage).length > 0) ?? {};

    return {
      outputs,
      providerRequest,
      providerResponse,
      providerTaskId,
      status: "succeeded",
      usage: extractUsage(usageRecord),
    };
  }

  private async generateImageWithResponsesApi(
    context: ProviderCallContext,
    request: ImageGenerationRequest,
    requestConfig: Record<string, unknown>,
  ): Promise<ProviderMediaGenerationResult> {
    const metadata = asRecord(request.metadata);
    const params = getNestedRecord(metadata, requestConfig);
    const lookupRecords = [params, metadata, requestConfig];
    const model = getString(requestConfig.model) || request.model?.trim() || context.modelKey;
    const outputFormat = normalizeOutputFormat(
      getFirstString(lookupRecords, ["outputFormat", "output_format"]),
    );
    const outputCompression = normalizeOutputCompression(
      getFirstNumber(lookupRecords, ["outputCompression", "output_compression"]),
      outputFormat,
    );
    const aspectRatio = getFirstString(lookupRecords, ["aspectRatio", "aspect_ratio"]);
    const size = normalizeProviderImageSize(
      model,
      getFirstString(lookupRecords, ["size", "imageSize", "image_size"]),
      aspectRatio,
    ) || "auto";
    const quality = getFirstString(lookupRecords, ["quality"]) || "auto";
    const moderation = getFirstString(lookupRecords, ["moderation"]) || "auto";
    const images = collectImageInputs(request, metadata, params);
    const mask = collectMaskInput(metadata, params);
    const action = images.length > 0 ? "edit" : "generate";
    const tool: Record<string, unknown> = {
      action,
      moderation,
      output_format: outputFormat,
      quality,
      size,
      type: "image_generation",
    };
    if (outputCompression !== null) tool.output_compression = outputCompression;
    if (mask) tool.input_image_mask = { image_url: mask };

    const promptInput = buildPromptInput(request.prompt);
    const payload: Record<string, unknown> = {
      input: images.length > 0
        ? [
            {
              content: [
                { text: promptInput, type: "input_text" },
                ...images.slice(0, 10).map((image) => ({
                  image_url: image,
                  type: "input_image",
                })),
              ],
              role: "user",
            },
          ]
        : promptInput,
      model,
      tool_choice: "required",
      tools: [tool],
    };

    const url = buildUrl(context.baseUrl, normalizePath(requestConfig.path ?? requestConfig.generatePath, "/responses"));
    const requestHeaders = {
      Authorization: `Bearer ${context.apiKey}`,
      "Content-Type": "application/json",
    };
    const providerRequest = {
      body: payload,
      headers: requestHeaders,
      method: "POST",
      url,
    };

    let response: Response;
    try {
      response = await this.fetchImplementation(providerRequest.url, {
        body: JSON.stringify(payload),
        headers: requestHeaders,
        method: "POST",
        signal: AbortSignal.timeout(context.timeoutMs),
      });
    } catch (error) {
      if (
        error instanceof Error &&
        (error.name === "AbortError" || error.name === "TimeoutError")
      ) {
        throw new AiGatewayError({
          code: "PROVIDER_TIMEOUT",
          message: "The provider request timed out",
          providerRequest,
          statusCode: 504,
        });
      }

      throw new AiGatewayError({
        code: "PROVIDER_INTERNAL_ERROR",
        details: error instanceof Error ? error.message : String(error),
        message: "The provider request failed before a response was received",
        providerRequest,
        statusCode: 502,
      });
    }

    const providerResponse = {
      body: await readResponseBody(response),
      status: response.status,
    };

    if (!response.ok) {
      throw this.mapError(response.status, providerRequest, providerResponse);
    }

    const responseBody = asRecord(providerResponse.body);
    const imageValues = collectResponseImageOutputs(responseBody.output);
    const outputs = imageValues
      .map((value, index) => responseImageValueToOutput(value, index, outputFormat))
      .filter((value): value is MediaOutput => value !== null);

    if (!outputs.length) {
      throw new AiGatewayError({
        code: "PROVIDER_INVALID_RESPONSE",
        message: "The provider response did not include image output",
        providerRequest,
        providerResponse,
        statusCode: 502,
      });
    }

    return {
      modelKey: model,
      outputs,
      providerRequest,
      providerResponse,
      status: "succeeded",
      usage: {
        inputTokens: null,
        outputTokens: null,
        totalTokens: null,
      },
    };
  }

  private mapError(
    status: number,
    providerRequest: unknown,
    providerResponse: unknown,
  ): AiGatewayError {
    if (status === 401 || status === 403) {
      return new AiGatewayError({
        code: "PROVIDER_AUTH_FAILED",
        message: "The provider rejected the credential",
        providerRequest,
        providerResponse,
        statusCode: 502,
      });
    }

    if (status === 429) {
      return new AiGatewayError({
        code: "PROVIDER_RATE_LIMIT",
        message: "The provider rate limit was exceeded",
        providerRequest,
        providerResponse,
        statusCode: 429,
      });
    }

    if (status === 400) {
      return new AiGatewayError({
        code: "PROVIDER_BAD_REQUEST",
        message: "The provider rejected the request payload",
        providerRequest,
        providerResponse,
        statusCode: 400,
      });
    }

    if (status >= 500) {
      return new AiGatewayError({
        code: "PROVIDER_INTERNAL_ERROR",
        message: "The provider returned an internal error",
        providerRequest,
        providerResponse,
        statusCode: 502,
      });
    }

    return new AiGatewayError({
      code: "PROVIDER_INTERNAL_ERROR",
      message: "The provider request failed",
      providerRequest,
      providerResponse,
      statusCode: 502,
    });
  }
}
