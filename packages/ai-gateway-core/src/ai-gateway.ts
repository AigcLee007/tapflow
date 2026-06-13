import { AiGatewayError } from "./errors.js";
import type { ProviderAdapter } from "./provider-adapter.js";
import type {
  AiGatewayUsage,
  AiGatewayMediaResult,
  AiGatewayTextResult,
  ImageGenerationRequest,
  MediaOutput,
  PollTaskRequest,
  ProviderCallContext,
  ProviderMediaGenerationResult,
  ProviderTaskResult,
  ResolvedRoute,
  TextGenerationRequest,
  VideoGenerationRequest,
} from "./types.js";

function readRequestedImageCount(request: ImageGenerationRequest, route: ResolvedRoute): number {
  const metadata = isRecord(request.metadata) ? request.metadata : {};
  const params = isRecord(metadata.params) ? metadata.params : {};
  const candidates = [
    params.n,
    metadata.n,
    route.requestConfig.n,
    isRecord(route.requestConfig.params) ? route.requestConfig.params.n : undefined,
  ];

  for (const candidate of candidates) {
    const parsed = readPositiveInteger(candidate);
    if (parsed !== null) {
      return Math.min(Math.max(parsed, 1), 4);
    }
  }

  return 1;
}

function withRequestedImageCount(request: ImageGenerationRequest, count: number): ImageGenerationRequest {
  const metadata = isRecord(request.metadata) ? request.metadata : {};
  const params = isRecord(metadata.params) ? metadata.params : {};
  return {
    ...request,
    metadata: {
      ...metadata,
      n: count,
      params: {
        ...params,
        n: count,
      },
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readPositiveInteger(value: unknown): number | null {
  const parsed = typeof value === "number"
    ? value
    : typeof value === "string"
      ? Number(value)
      : Number.NaN;
  if (!Number.isFinite(parsed) || parsed < 1) {
    return null;
  }
  return Math.floor(parsed);
}

function sumUsage(results: ProviderMediaGenerationResult[]): AiGatewayUsage | null {
  const usages = results.map((result) => result.usage).filter((usage): usage is AiGatewayUsage => Boolean(usage));
  if (usages.length === 0) {
    return null;
  }

  return {
    inputTokens: sumNullableNumbers(usages.map((usage) => usage.inputTokens)),
    outputTokens: sumNullableNumbers(usages.map((usage) => usage.outputTokens)),
    rawCost: sumRawCosts(usages.map((usage) => usage.rawCost)),
    totalTokens: sumNullableNumbers(usages.map((usage) => usage.totalTokens)),
  };
}

function sumNullableNumbers(values: Array<number | null>): number | null {
  if (values.some((value) => value === null)) {
    return null;
  }
  return values.reduce<number>((total, value) => total + (value ?? 0), 0);
}

function sumRawCosts(values: Array<string | number | null | undefined>): string | number | null {
  const present = values.filter((value): value is string | number => value !== null && value !== undefined);
  if (present.length === 0) {
    return null;
  }
  const parsed = present.map((value) => Number(value));
  if (parsed.some((value) => !Number.isFinite(value))) {
    return null;
  }
  return parsed.reduce((total, value) => total + value, 0);
}

export class AiGateway {
  private readonly adapters: Map<string, ProviderAdapter>;

  constructor(adapters: Record<string, ProviderAdapter>) {
    this.adapters = new Map(Object.entries(adapters));
  }

  async generateText(options: {
    apiKey: string;
    request: TextGenerationRequest;
    route: ResolvedRoute;
  }): Promise<AiGatewayTextResult> {
    const { adapter, context } = this.createProviderContext(
      options.apiKey,
      options.route,
      options.request.model ?? null,
      "text generation",
    );
    if (!adapter.generateText) {
      throw this.unsupportedOperationError(context.adapterKind, "text generation");
    }

    const result = await adapter.generateText(context, options.request);

    return {
      modelId: options.route.model.id,
      modelKey: result.modelKey,
      outputText: result.outputText,
      providerId: options.route.provider.id,
      providerKey: options.route.provider.key,
      providerRequest: result.providerRequest,
      providerResponse: result.providerResponse,
      routeId: options.route.routeId,
      status: "succeeded",
      usage: result.usage,
    };
  }

  async generateImage(options: {
    apiKey: string;
    request: ImageGenerationRequest;
    route: ResolvedRoute;
  }): Promise<AiGatewayMediaResult> {
    const { adapter, context } = this.createProviderContext(
      options.apiKey,
      options.route,
      options.request.model ?? null,
      "image generation",
    );
    if (!adapter.generateImage) {
      throw this.unsupportedOperationError(context.adapterKind, "image generation");
    }

    const requestedCount = readRequestedImageCount(options.request, options.route);
    const results: ProviderMediaGenerationResult[] = [];
    let outputs: MediaOutput[] = [];
    let request = withRequestedImageCount(options.request, requestedCount);

    while (outputs.length < requestedCount) {
      const result = await adapter.generateImage(context, request);
      results.push(result);
      outputs = outputs.concat(result.outputs ?? []);

      if (
        result.status !== "succeeded" ||
        result.providerTaskId ||
        outputs.length >= requestedCount ||
        requestedCount === 1
      ) {
        break;
      }

      request = withRequestedImageCount(options.request, requestedCount - outputs.length);
    }

    const result = results[0];
    if (!result) {
      throw new AiGatewayError({
        code: "PROVIDER_INVALID_RESPONSE",
        message: "Image provider returned no result",
        statusCode: 502,
      });
    }

    return {
      modelId: options.route.model.id,
      modelKey: result.modelKey,
      outputs: outputs.slice(0, requestedCount),
      providerId: options.route.provider.id,
      providerKey: options.route.provider.key,
      providerRequest: results.length === 1
        ? result.providerRequest
        : results.map((entry) => entry.providerRequest),
      providerResponse: results.length === 1
        ? result.providerResponse
        : results.map((entry) => entry.providerResponse),
      providerTaskId: result.providerTaskId ?? null,
      routeId: options.route.routeId,
      status: result.status,
      usage: results.length === 1 ? result.usage : sumUsage(results),
    };
  }

  async generateVideo(options: {
    apiKey: string;
    request: VideoGenerationRequest;
    route: ResolvedRoute;
  }): Promise<AiGatewayMediaResult> {
    const { adapter, context } = this.createProviderContext(
      options.apiKey,
      options.route,
      options.request.model ?? null,
      "video generation",
    );
    if (!adapter.generateVideo) {
      throw this.unsupportedOperationError(context.adapterKind, "video generation");
    }

    const result = await adapter.generateVideo(context, options.request);
    return {
      modelId: options.route.model.id,
      modelKey: result.modelKey,
      outputs: result.outputs ?? [],
      providerId: options.route.provider.id,
      providerKey: options.route.provider.key,
      providerRequest: result.providerRequest,
      providerResponse: result.providerResponse,
      providerTaskId: result.providerTaskId ?? null,
      routeId: options.route.routeId,
      status: result.status,
      usage: result.usage,
    };
  }

  async pollTask(options: {
    apiKey: string;
    request: PollTaskRequest;
    route: ResolvedRoute;
  }): Promise<ProviderTaskResult> {
    const { adapter, context } = this.createProviderContext(
      options.apiKey,
      options.route,
      options.request.model ?? null,
      "task polling",
    );
    if (!adapter.pollTask) {
      throw this.unsupportedOperationError(context.adapterKind, "task polling");
    }

    const result = await adapter.pollTask(context, options.request);
    return {
      ...result,
      modelId: options.route.model.id,
      providerId: options.route.provider.id,
      routeId: options.route.routeId,
    };
  }

  private createProviderContext(
    apiKey: string,
    route: ResolvedRoute,
    requestModel: string | null,
    operationLabel: string,
  ): {
    adapter: ProviderAdapter;
      context: ProviderCallContext & { adapterKind: string };
  } {
    const adapterKind = route.connection?.adapterKind?.trim() || route.provider.kind;
    const adapter = this.adapters.get(adapterKind);
    if (!adapter) {
      throw new AiGatewayError({
        code: "ADAPTER_NOT_FOUND",
        message: `No provider adapter is registered for ${adapterKind}`,
        statusCode: 500,
      });
    }

    const modelKey = requestModel?.trim() || route.model.modelKey;
    if (!modelKey) {
      throw new AiGatewayError({
        code: "MODEL_REQUIRED",
        message: `A model is required for ${operationLabel} on the selected route`,
        statusCode: 400,
      });
    }

    return {
      adapter,
      context: {
        apiKey,
        adapterKind,
        baseUrl: route.baseUrl,
        modelKey,
        providerKey: route.provider.key,
        requestConfig: route.requestConfig,
        routeId: route.routeId,
        routeKey: route.routeKey,
        timeoutMs: this.resolveTimeout(route, operationLabel),
      },
    };
  }

  private resolveTimeout(route: ResolvedRoute, operationLabel: string): number {
    const routeTimeout = this.parseTimeout(route.requestConfig.timeoutMs);
    if (routeTimeout !== null) {
      return routeTimeout;
    }

    const providerTimeout = this.parseTimeout(route.provider.capabilities?.timeoutMs);
    if (providerTimeout !== null) {
      return providerTimeout;
    }

    if (operationLabel === "image generation") {
      const envTimeout = this.parseTimeout(
        process.env.OPENAI_COMPAT_IMAGE_TIMEOUT_MS ?? process.env.OPENAI_IMAGE_TIMEOUT_MS,
      );
      if (envTimeout !== null) {
        return envTimeout;
      }
      return 300_000;
    }

    return 10_000;
  }

  private parseTimeout(value: unknown): number | null {
    if (typeof value === "number" && Number.isFinite(value) && value > 0) {
      return Math.floor(value);
    }
    if (typeof value === "string") {
      const parsed = Number(value);
      if (Number.isFinite(parsed) && parsed > 0) {
        return Math.floor(parsed);
      }
    }
    return null;
  }

  private unsupportedOperationError(providerKind: string, operationLabel: string): AiGatewayError {
    return new AiGatewayError({
      code: "ADAPTER_OPERATION_NOT_SUPPORTED",
      message: `Provider adapter ${providerKind} does not support ${operationLabel}`,
      statusCode: 400,
    });
  }
}
