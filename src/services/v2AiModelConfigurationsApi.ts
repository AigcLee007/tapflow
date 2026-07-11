import { apiPost } from "./v2HttpClient";

export type AiModelConfigurationModality = "text" | "image" | "video";
export type AiModelConfigurationPricingUnit =
  | "text_generation"
  | "image_generation"
  | "video_generation";

export type ModelConfigurationCredentialChoice =
  | { mode: "create"; name: string; secret: string }
  | { credentialId: string; mode: "existing" };

export type ModelConfigurationConnectionChoice =
  | { baseUrl: string; environment: string; mode: "create"; name: string }
  | { connectionId: string; mode: "existing" };

export type ModelConfigurationRouteInput = {
  apiMode?: string;
  fallbackGroup?: string;
  priority?: number;
  requestConfig?: Record<string, unknown>;
  requestPath?: string;
  routeKey?: string;
  routeLabel: string;
  timeoutMs?: number;
  upstreamModel: string;
  weight?: number;
};

export type ModelConfigurationCustomDefinition = {
  model: {
    displayName: string;
    modality: AiModelConfigurationModality;
    modelFamily: string;
    modelKey: string;
  };
  provider: {
    defaultBaseUrl?: string;
    key: string;
    kind: "openai-compatible";
    name: string;
  };
  routeDefaults: {
    apiMode?: string;
    mode?: "async" | "stream" | "sync";
    requestConfig?: Record<string, unknown>;
    requestPath?: string;
    timeoutMs?: number;
  };
};

type ModelConfigurationDraftCommon = {
  connection: ModelConfigurationConnectionChoice;
  credential: ModelConfigurationCredentialChoice;
  expectedRevision?: number;
  pricing: {
    minChargeCredits: number;
    unit: AiModelConfigurationPricingUnit;
    unitCredits: number;
  };
  route: ModelConfigurationRouteInput;
  routeId?: string;
};

export type SaveModelConfigurationDraftInput = ModelConfigurationDraftCommon &
  ({ packageKey: string } | { custom: ModelConfigurationCustomDefinition });

export type PublishModelConfigurationInput = {
  expectedRevision: number;
  routeId: string;
};

export type ModelConfigurationDraftResult = {
  catalog: { id: string; status: string };
  connection: {
    baseUrl: string | null;
    environment: string;
    id: string;
    name: string;
    status: string;
  };
  credential: {
    id: string;
    maskedSecret?: string;
    name: string;
    secretFingerprint: string;
    status: string;
  };
  model: {
    displayName: string;
    id: string;
    modality: string;
    modelFamily: string;
    modelKey: string;
  };
  pricing: {
    active: boolean;
    minChargeCredits: number;
    unit: AiModelConfigurationPricingUnit;
    unitCredits: number;
  };
  route: {
    configurationRevision: number;
    id: string;
    key: string;
    status: string;
    testedRevision: number | null;
  };
};

export function saveModelConfigurationDraft(
  input: SaveModelConfigurationDraftInput,
): Promise<ModelConfigurationDraftResult> {
  return apiPost<ModelConfigurationDraftResult>("/admin/ai/model-configurations/draft", input)
    .then(sanitizeDraftResult);
}

export function publishModelConfiguration(
  input: PublishModelConfigurationInput,
): Promise<ModelConfigurationDraftResult> {
  return apiPost<ModelConfigurationDraftResult>("/admin/ai/model-configurations/publish", input)
    .then(sanitizeDraftResult);
}

function sanitizeDraftResult(result: ModelConfigurationDraftResult): ModelConfigurationDraftResult {
  return {
    ...result,
    credential: {
      id: result.credential.id,
      ...(result.credential.maskedSecret === undefined ? {} : { maskedSecret: result.credential.maskedSecret }),
      name: result.credential.name,
      secretFingerprint: result.credential.secretFingerprint,
      status: result.credential.status,
    },
  };
}
