import { AiGatewayError } from "./errors.js";
import type { ProviderAdapter } from "./provider-adapter.js";
import type {
  AiGatewayUsage,
  ImageGenerationRequest,
  PollTaskRequest,
  ProviderCallContext,
  ProviderMediaGenerationResult,
  ProviderTaskResult,
  ProviderTextGenerationResult,
  TextGenerationRequest,
  VideoGenerationRequest,
} from "./types.js";

const MOCK_PNG_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9MbugAAAAASUVORK5CYII=";

function normalizeMockMode(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function resolveMockMode(context: ProviderCallContext, metadata: Record<string, unknown> | null | undefined): string {
  const fromMetadata = normalizeMockMode(metadata?.mockMode);
  if (fromMetadata) {
    return fromMetadata;
  }

  const fromConfig = normalizeMockMode(context.requestConfig.mockMode);
  if (fromConfig) {
    return fromConfig;
  }

  if (context.routeKey.toLowerCase().includes("fail")) {
    return "fail";
  }

  return "success";
}

function failWithMockError(message: string): never {
  throw new AiGatewayError({
    code: "PROVIDER_BAD_REQUEST",
    message,
    statusCode: 502,
  });
}

function buildUsage(overrides?: Partial<AiGatewayUsage>): AiGatewayUsage {
  return {
    inputTokens: overrides?.inputTokens ?? 8,
    outputTokens: overrides?.outputTokens ?? 1,
    rawCost: overrides?.rawCost ?? "0.00000000",
    totalTokens: overrides?.totalTokens ?? 9,
  };
}

export class MockProviderAdapter implements ProviderAdapter {
  async generateText(
    context: ProviderCallContext,
    request: TextGenerationRequest,
  ): Promise<ProviderTextGenerationResult> {
    const mode = resolveMockMode(context, null);
    if (mode === "fail") {
      failWithMockError("Mock provider text generation failed intentionally");
    }

    return {
      modelKey: context.modelKey,
      outputText: "mock text output",
      providerRequest: {
        messages: request.messages.length,
        routeKey: context.routeKey,
      },
      providerResponse: {
        mode,
        ok: true,
      },
      usage: buildUsage({
        outputTokens: 4,
        totalTokens: 12,
      }),
    };
  }

  async generateImage(
    context: ProviderCallContext,
    request: ImageGenerationRequest,
  ): Promise<ProviderMediaGenerationResult> {
    const mode = resolveMockMode(context, request.metadata ?? null);
    if (mode === "fail") {
      failWithMockError("Mock provider image generation failed intentionally");
    }

    return {
      modelKey: context.modelKey,
      outputs: [
        {
          base64: MOCK_PNG_DATA_URL,
          filename: "mock-generated-image.png",
          height: 1,
          mimeType: "image/png",
          width: 1,
        },
      ],
      providerRequest: {
        prompt: request.prompt,
        routeKey: context.routeKey,
      },
      providerResponse: {
        mode,
        output: "inline_base64_png",
      },
      status: "succeeded",
      usage: buildUsage(),
    };
  }

  async generateVideo(
    context: ProviderCallContext,
    request: VideoGenerationRequest,
  ): Promise<ProviderMediaGenerationResult> {
    const mode = resolveMockMode(context, request.metadata ?? null);
    if (mode === "fail") {
      failWithMockError("Mock provider video generation failed intentionally");
    }

    return {
      modelKey: context.modelKey,
      outputs: [],
      providerRequest: {
        prompt: request.prompt,
        routeKey: context.routeKey,
      },
      providerResponse: {
        mode,
        task: "mock-video-task",
      },
      providerTaskId: `mock-video:${context.routeKey}:task`,
      status: "waiting_provider",
      usage: buildUsage({
        outputTokens: null,
        totalTokens: 8,
      }),
    };
  }

  async pollTask(
    context: ProviderCallContext,
    request: PollTaskRequest,
  ): Promise<ProviderTaskResult> {
    const mode = resolveMockMode(context, null);
    if (mode === "fail") {
      return {
        error: {
          code: "MOCK_PROVIDER_FAILED",
          message: "Mock provider poll failed intentionally",
        },
        providerRequest: {
          providerTaskId: request.providerTaskId,
        },
        providerResponse: {
          mode,
        },
        status: "failed",
        usage: buildUsage({
          outputTokens: 0,
          totalTokens: 8,
        }),
      };
    }

    return {
      mimeType: "video/mp4",
      outputs: [
        {
          base64: "AAAA",
          filename: "mock-video.mp4",
          mimeType: "video/mp4",
        },
      ],
      providerRequest: {
        providerTaskId: request.providerTaskId,
      },
      providerResponse: {
        mode,
      },
      status: "succeeded",
      usage: buildUsage({
        outputTokens: 1,
      }),
    };
  }
}

