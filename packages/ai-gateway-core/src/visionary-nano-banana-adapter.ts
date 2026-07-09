import { AiGatewayError } from "./errors.js";
import type { ProviderAdapter } from "./provider-adapter.js";
import { buildProductionImagePrompt } from "./production-image-prompt.js";
import type {
  AssetReferenceInput,
  ImageGenerationRequest,
  ProviderCallContext,
  ProviderMediaGenerationResult,
} from "./types.js";

type FetchLike = typeof fetch;

const SUPPORTED_MODELS = new Set(["nano-banana-pro", "nano-banana-pro-fast"]);
const DEFAULT_PATH = "/v1/api/nano-banana";
const DEFAULT_ASPECT_RATIO = "1:1";
const DEFAULT_IMAGE_SIZE = "2K";
const VALID_ASPECT_RATIOS = new Set(["1:1", "16:9", "9:16", "21:9", "2:1", "4:3", "3:4", "3:2", "2:3"]);
const VALID_IMAGE_SIZES = new Set(["2K", "4K"]);

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function getString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function getBoolean(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "1", "yes", "on"].includes(normalized)) return true;
    if (["false", "0", "no", "off"].includes(normalized)) return false;
  }
  return null;
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

function getFirstString(
  records: Array<Record<string, unknown>>,
  keys: string[],
): string | null {
  for (const record of records) {
    for (const key of keys) {
      const value = getString(record[key]);
      if (value) return value;
    }
  }
  return null;
}

function getFirstBoolean(
  records: Array<Record<string, unknown>>,
  keys: string[],
): boolean | null {
  for (const record of records) {
    for (const key of keys) {
      const value = getBoolean(record[key]);
      if (value !== null) return value;
    }
  }
  return null;
}

function normalizeAspectRatio(value: string | null): string {
  const normalized = value?.trim() || DEFAULT_ASPECT_RATIO;
  return VALID_ASPECT_RATIOS.has(normalized) ? normalized : DEFAULT_ASPECT_RATIO;
}

function normalizeImageSize(value: string | null): string {
  const normalized = (value?.trim() || DEFAULT_IMAGE_SIZE).toUpperCase();
  return VALID_IMAGE_SIZES.has(normalized) ? normalized : DEFAULT_IMAGE_SIZE;
}

function normalizePath(value: unknown): string {
  const path = getString(value) || DEFAULT_PATH;
  return path.startsWith("/") ? path : `/${path}`;
}

function buildUrl(baseUrl: string, path: string): string {
  const trimmedBaseUrl = baseUrl.replace(/\/$/, "");
  return `${trimmedBaseUrl}${path}`;
}

function normalizeImages(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value
        .map((item) => String(item || "").trim())
        .filter(Boolean),
    ),
  ).slice(0, 9);
}

function collectAssetImageInputs(inputAssets: AssetReferenceInput[] | null | undefined): string[] {
  if (!Array.isArray(inputAssets)) return [];
  return inputAssets
    .flatMap((asset) => {
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
    })
    .map((item) => String(item || "").trim())
    .filter(Boolean);
}

async function readResponseBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

export class VisionaryNanoBananaAdapter implements ProviderAdapter {
  private readonly fetchImplementation: FetchLike;

  constructor(options?: { fetchImplementation?: FetchLike }) {
    this.fetchImplementation = options?.fetchImplementation ?? fetch;
  }

  async generateImage(
    context: ProviderCallContext,
    request: ImageGenerationRequest,
  ): Promise<ProviderMediaGenerationResult> {
    const requestConfig = asRecord(context.requestConfig);
    const metadata = asRecord(request.metadata);
    const params = getNestedRecord(metadata, requestConfig);
    const model = request.model?.trim() || context.modelKey;

    if (!SUPPORTED_MODELS.has(model)) {
      throw new AiGatewayError({
        code: "PROVIDER_BAD_REQUEST",
        message: "The nano-banana endpoint only supports nano-banana-pro or nano-banana-pro-fast.",
        statusCode: 400,
      });
    }

    const lookupRecords = [metadata, params, requestConfig];
    const aspectRatio = normalizeAspectRatio(
      getFirstString(lookupRecords, ["aspectRatio", "aspect_ratio"]),
    );
    const imageSize = normalizeImageSize(
      getFirstString(lookupRecords, ["imageSize", "image_size", "size"]),
    );
    const optimizeChineseText = model === "nano-banana-pro"
      ? getFirstBoolean(lookupRecords, ["optimizeChineseText", "optimize_chinese_text"]) ?? false
      : false;
    const images = normalizeImages([
      ...normalizeImages(metadata.images ?? metadata.referenceImages ?? params.images ?? params.reference_images),
      ...collectAssetImageInputs(request.inputAssets),
    ]);

    const payload: Record<string, unknown> = {
      aspectRatio,
      imageSize,
      model,
      optimizeChineseText,
      prompt: buildProductionImagePrompt(request.prompt, metadata),
      replyType: "json",
    };
    if (images.length > 0) {
      payload.images = images;
    }

    const providerRequest = {
      body: payload,
      headers: {
        Authorization: `Bearer ${context.apiKey}`,
        "Content-Type": "application/json",
      },
      method: "POST",
      url: buildUrl(context.baseUrl, normalizePath(requestConfig.path ?? requestConfig.generatePath)),
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
    const results = Array.isArray(responseBody.results) ? responseBody.results : [];
    const outputs = results
      .map((item, index) => {
        const row = asRecord(item);
        const url = getString(row.url);
        if (!url) return null;
        return {
          filename: `nano-banana-${index + 1}.png`,
          mimeType: "image/png",
          url,
        };
      })
      .filter((value): value is NonNullable<typeof value> => value !== null);

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
