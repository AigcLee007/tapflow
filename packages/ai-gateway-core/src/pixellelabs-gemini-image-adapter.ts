import { AiGatewayError } from "./errors.js";
import type { ProviderAdapter } from "./provider-adapter.js";
import type {
  AssetReferenceInput,
  ImageGenerationRequest,
  MediaOutput,
  ProviderCallContext,
  ProviderMediaGenerationResult,
} from "./types.js";

type FetchLike = typeof fetch;

const DEFAULT_PATH_TEMPLATE = "/v1beta/models/{model}:generateContent";
const DEFAULT_ASPECT_RATIO = "1:1";
const DEFAULT_IMAGE_SIZE = "2K";
const VALID_ASPECT_RATIOS = new Set(["1:1", "16:9", "9:16", "21:9", "4:3", "3:4", "3:2", "2:3"]);
const VALID_IMAGE_SIZES = new Set(["1K", "2K", "4K"]);

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
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

function normalizeAspectRatio(value: string | null): string {
  const normalized = value?.trim() || DEFAULT_ASPECT_RATIO;
  return VALID_ASPECT_RATIOS.has(normalized) ? normalized : DEFAULT_ASPECT_RATIO;
}

function normalizeImageSize(value: string | null): string {
  const normalized = (value?.trim() || DEFAULT_IMAGE_SIZE).toUpperCase();
  return VALID_IMAGE_SIZES.has(normalized) ? normalized : DEFAULT_IMAGE_SIZE;
}

function normalizePath(value: unknown, model: string): string {
  const path = getString(value) || DEFAULT_PATH_TEMPLATE;
  const withModel = path.replace("{model}", encodeURIComponent(model));
  return withModel.startsWith("/") ? withModel : `/${withModel}`;
}

function buildUrl(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/$/, "")}${path}`;
}

function normalizeImageInputs(value: unknown): string[] {
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

function guessMimeType(uri: string): string {
  const normalized = uri.split("?")[0]?.toLowerCase() || "";
  if (normalized.endsWith(".png")) return "image/png";
  if (normalized.endsWith(".webp")) return "image/webp";
  if (normalized.endsWith(".gif")) return "image/gif";
  return "image/jpeg";
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

function collectOutputs(value: unknown, outputs: MediaOutput[] = []): MediaOutput[] {
  if (!value || typeof value !== "object") return outputs;
  if (Array.isArray(value)) {
    value.forEach((item) => collectOutputs(item, outputs));
    return outputs;
  }

  const record = value as Record<string, unknown>;
  const inlineData = asRecord(record.inlineData ?? record.inline_data);
  const inlineMimeType = getString(inlineData.mimeType ?? inlineData.mime_type);
  const inlineBytes = getString(inlineData.data);
  if (inlineBytes) {
    outputs.push({
      base64: inlineBytes,
      filename: `pixellelabs-image-${outputs.length + 1}.png`,
      mimeType: inlineMimeType || "image/png",
    });
  }

  const fileData = asRecord(record.fileData ?? record.file_data);
  const fileUri = getString(fileData.fileUri ?? fileData.file_uri ?? fileData.uri ?? fileData.url);
  if (fileUri) {
    outputs.push({
      filename: `pixellelabs-image-${outputs.length + 1}.png`,
      mimeType: getString(fileData.mimeType ?? fileData.mime_type) || guessMimeType(fileUri),
      url: fileUri,
    });
  }

  for (const child of Object.values(record)) {
    collectOutputs(child, outputs);
  }

  return outputs;
}

export class PixelleLabsGeminiImageAdapter implements ProviderAdapter {
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
    const lookupRecords = [metadata, params, requestConfig];
    const aspectRatio = normalizeAspectRatio(getFirstString(lookupRecords, ["aspectRatio", "aspect_ratio"]));
    const imageSize = normalizeImageSize(getFirstString(lookupRecords, ["imageSize", "image_size", "size"]));
    const images = normalizeImageInputs([
      ...normalizeImageInputs(metadata.images ?? metadata.referenceImages ?? params.images ?? params.reference_images),
      ...collectAssetImageInputs(request.inputAssets),
    ]);

    const parts: Array<Record<string, unknown>> = [{ text: request.prompt }];
    for (const image of images) {
      parts.push({
        fileData: {
          fileUri: image,
          mimeType: guessMimeType(image),
        },
      });
    }

    const payload = {
      contents: [
        {
          parts,
          role: "user",
        },
      ],
      generationConfig: {
        imageConfig: {
          aspectRatio,
          imageSize,
        },
        responseModalities: ["IMAGE"],
      },
    };

    const providerRequest = {
      body: payload,
      headers: {
        Authorization: `Bearer ${context.apiKey}`,
        "Content-Type": "application/json",
      },
      method: "POST",
      url: buildUrl(context.baseUrl, normalizePath(requestConfig.path ?? requestConfig.generatePath, model)),
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

    const outputs = collectOutputs(providerResponse.body)
      .filter((output, index, items) => {
        const key = output.url || output.base64 || "";
        return key && items.findIndex((item) => (item.url || item.base64 || "") === key) === index;
      });

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

  private mapError(status: number, providerRequest: unknown, providerResponse: unknown): AiGatewayError {
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

    return new AiGatewayError({
      code: "PROVIDER_INTERNAL_ERROR",
      message: status >= 500 ? "The provider returned an internal error" : "The provider request failed",
      providerRequest,
      providerResponse,
      statusCode: 502,
    });
  }
}
