export type AiGatewayErrorCode =
  | "AGENT_ROUTE_CAPABILITY_REQUIRED"
  | "TEXT_IMAGE_ASSET_NOT_FOUND"
  | "TEXT_IMAGE_INPUT_LIMIT_EXCEEDED"
  | "TEXT_IMAGE_SIZE_LIMIT_EXCEEDED"
  | "TEXT_IMAGE_TYPE_UNSUPPORTED"
  | "TEXT_IMAGE_URL_HYDRATION_FAILED"
  | "TEXT_MODEL_IMAGE_INPUT_UNSUPPORTED"
  | "ADAPTER_NOT_FOUND"
  | "ADAPTER_OPERATION_NOT_SUPPORTED"
  | "CREDENTIAL_REQUIRED"
  | "MODEL_REQUIRED"
  | "PROVIDER_AUTH_FAILED"
  | "PROVIDER_BAD_REQUEST"
  | "PROVIDER_INTERNAL_ERROR"
  | "PROVIDER_INVALID_RESPONSE"
  | "PROVIDER_RATE_LIMIT"
  | "PROVIDER_RATE_LIMITED"
  | "PROVIDER_TIMEOUT"
  | "PROVIDER_UNAVAILABLE"
  | "PIXELHUB_REQUEST_REJECTED"
  | "PIXELHUB_RESPONSE_INVALID"
  | "PIXELHUB_TASK_FAILED"
  | "PIXELHUB_TASK_TIMEOUT"
  | "REFERENCE_ASSET_KIND_MISMATCH"
  | "REFERENCE_ASSET_NOT_FOUND"
  | "REFERENCE_VIDEO_VARIANT_FAILED"
  | "REFERENCE_VIDEO_VARIANT_PROCESSING"
  | "REFERENCE_LIMIT_EXCEEDED"
  | "REFERENCE_MEDIA_TOTAL_EXCEEDED"
  | "ROUTE_NOT_FOUND"
  | "UNSUPPORTED_ASPECT_RATIO"
  | "UNSUPPORTED_REFERENCE_KIND"
  | "UNSUPPORTED_RESOLUTION"
  | "UNSUPPORTED_DURATION"
  | "UNSUPPORTED_VIDEO_MODE"
  | "AUDIO_REFERENCE_REQUIRES_VISUAL"
  | "AUDIO_SETTING_FIXED"
  | "VIDEO_COUNT_UNSUPPORTED"
  | "VIDEO_MODE_INPUT_REQUIRED"
  | "VIDEO_PROMPT_REQUIRED"
  | "VIDEO_PROMPT_TOO_LONG"
  | "UNSUPPORTED_VIDEO_EDITOR_EXPORT";

export class AiGatewayError extends Error {
  readonly code: AiGatewayErrorCode;
  readonly details: unknown;
  readonly providerRequest: unknown;
  readonly providerResponse: unknown;
  readonly statusCode: number;

  constructor(options: {
    code: AiGatewayErrorCode;
    details?: unknown;
    message: string;
    providerRequest?: unknown;
    providerResponse?: unknown;
    statusCode?: number;
  }) {
    super(options.message);
    this.code = options.code;
    this.details = options.details;
    this.name = "AiGatewayError";
    this.providerRequest = options.providerRequest ?? null;
    this.providerResponse = options.providerResponse ?? null;
    this.statusCode = options.statusCode ?? 500;
  }
}
