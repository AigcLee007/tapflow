export type ApiEnv = {
  accessTokenTtlSeconds: number;
  adminEmails: string[];
  agentDirectorEnabled?: boolean;
  agentExecutorAllowBatchImage?: boolean;
  agentExecutorAllowImageEdit?: boolean;
  agentExecutorAllowVideo?: boolean;
  agentExecutorEnabled?: boolean;
  agentExecutorMaxEstimatedCredits?: number;
  agentExecutorMaxGeneratedItems?: number;
  agentExecutorMaxToolRounds?: number;
  agentExecutorRequireApproval?: boolean;
  agentExecutorToolTimeoutMs?: number;
  agentExecutorTurnTimeoutMs?: number;
  agentPlannerFallbackEnabled: boolean;
  agentPlannerEnabled: boolean;
  agentPlannerRepairAttempts: number;
  agentPlannerTimeoutMs: number;
  agentV2Enabled: boolean;
  agentV2RuntimeEnabled: boolean;
  agentV3Enabled?: boolean;
  agentV3RuntimeEnabled?: boolean;
  agentV3MaxToolRounds?: number;
  agentV3MaxContextNodes?: number;
  agentV3MaxVisualCaptures?: number;
  agentV3RepairAttempts?: number;
  agentV4Enabled: boolean;
  agentV4RuntimeEnabled: boolean;
  agentV4MaxRounds: number;
  agentV4MaxItems: number;
  agentV4MaxReferences: number;
  agentV4RepairAttempts: number;
  agentSkillsEnabled: boolean;
  agentSkillAuthoringEnabled: boolean;
  agentSkillRuntimeEnabled: boolean;
  agentSkillMaxSourceChars: number;
  agentSkillMaxSteps: number;
  agentSkillRepairAttempts: number;
  agentTextRouteKey: string;
  apiRateLimitMax?: number;
  apiRateLimitWindowMs?: number;
  authRateLimitMax?: number;
  authRateLimitWindowMs?: number;
  resendApiKey?: string;
  resendFromEmail?: string;
  resendFromName?: string;
  corsAllowedOrigins?: string[];
  credentialKeyVersion: string;
  credentialMasterKey: string;
  jwtAccessSecret: string;
  jwtRefreshSecret: string;
  legalContactUrl: string;
  nodeEnv: string;
  promptCatalogMediaDir: string;
  queuePrefix: string;
  redisUrl: string;
  refreshTokenTtlSeconds: number;
  s3AccessKeyId: string;
  s3Bucket: string;
  s3Endpoint: string;
  s3ForcePathStyle: boolean;
  s3Region: string;
  s3SecretAccessKey: string;
  securityHeadersEnabled?: boolean;
  trustProxy?: boolean;
  paymentsEnabled: boolean;
  paymentReconcileIntervalMs: number;
  xunhuAppId: string;
  xunhuAppSecret: string;
  xunhuBaseUrl: string;
  xunhuNotifyUrl: string;
  xunhuReturnUrl: string;
  xunhuTimeoutMs: number;
};

const DEV_ACCESS_SECRET = "dev_access_secret_change_me";
const DEV_ADMIN_EMAILS = "";
const DEV_API_RATE_LIMIT_MAX = 1000;
const DEV_API_RATE_LIMIT_WINDOW_MS = 60_000;
const DEV_AUTH_RATE_LIMIT_MAX = 20;
const DEV_AUTH_RATE_LIMIT_WINDOW_MS = 60_000;
const DEV_CORS_ALLOWED_ORIGINS = "http://localhost:5173,http://localhost:5188,http://127.0.0.1:5173,http://127.0.0.1:5188";
const DEV_CREDENTIAL_KEY_VERSION = "v1";
const DEV_CREDENTIAL_MASTER_KEY = "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=";
const DEV_QUEUE_PREFIX = "aigc-flow:v2";
const DEV_REDIS_URL = "redis://localhost:6379";
const DEV_REFRESH_SECRET = "dev_refresh_secret_change_me";
const DEV_S3_ACCESS_KEY_ID = "minio";
const DEV_S3_BUCKET = "aigc-flow-dev";
const DEV_S3_ENDPOINT = "http://localhost:9000";
const DEV_S3_FORCE_PATH_STYLE = true;
const DEV_S3_REGION = "us-east-1";
const DEV_S3_SECRET_ACCESS_KEY = "minio123456";

function parseBooleanEnv(name: string, value: string | undefined, fallback: boolean): boolean {
  const raw = value?.trim().toLowerCase();
  if (!raw) {
    return fallback;
  }
  if (["1", "true", "yes", "on"].includes(raw)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(raw)) {
    return false;
  }
  throw new Error(`${name} must be a boolean when provided`);
}

function parseCsvEnv(value: string | undefined, fallback: string): string[] {
  return (value?.trim() || fallback)
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function parsePositiveIntegerEnv(name: string, value: string | undefined, fallback: number): number {
  const raw = value?.trim() ?? "";
  const parsed = raw ? Number(raw) : fallback;
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer when provided`);
  }
  return parsed;
}

function parsePositiveNumberEnv(name: string, value: string | undefined, fallback: number): number {
  const raw = value?.trim() ?? "";
  const parsed = raw ? Number(raw) : fallback;
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive number when provided`);
  }
  return parsed;
}

function parseClampedIntegerEnv(name: string, value: string | undefined, fallback: number, min: number, max: number): number {
  const raw = value?.trim() ?? "";
  const parsed = raw ? Number(raw) : fallback;
  if (!Number.isInteger(parsed)) {
    throw new Error(`${name} must be an integer when provided`);
  }
  return Math.min(max, Math.max(min, parsed));
}

export function getApiEnv(): ApiEnv {
  const nodeEnv = process.env.NODE_ENV?.trim() || "development";
  const isProduction = nodeEnv === "production";
  const adminEmails = parseCsvEnv(process.env.ADMIN_EMAILS, DEV_ADMIN_EMAILS)
    .map((value) => value.toLowerCase());
  const jwtAccessSecret =
    process.env.JWT_ACCESS_SECRET?.trim() ||
    (isProduction ? "" : DEV_ACCESS_SECRET);
  const credentialMasterKey =
    process.env.CREDENTIAL_MASTER_KEY?.trim() ||
    (isProduction ? "" : DEV_CREDENTIAL_MASTER_KEY);
  const credentialKeyVersion =
    process.env.CREDENTIAL_KEY_VERSION?.trim() ||
    DEV_CREDENTIAL_KEY_VERSION;
  const redisUrl =
    process.env.REDIS_URL?.trim() ||
    (isProduction ? "" : DEV_REDIS_URL);
  const queuePrefix =
    process.env.QUEUE_PREFIX?.trim() ||
    DEV_QUEUE_PREFIX;
  const jwtRefreshSecret =
    process.env.JWT_REFRESH_SECRET?.trim() ||
    (isProduction ? "" : DEV_REFRESH_SECRET);
  const legalContactUrl = process.env.LEGAL_CONTACT_URL?.trim() || "";
  const corsAllowedOrigins = parseCsvEnv(
    process.env.CORS_ALLOWED_ORIGINS,
    isProduction ? "" : DEV_CORS_ALLOWED_ORIGINS,
  );
  const apiRateLimitMax = parsePositiveIntegerEnv(
    "API_RATE_LIMIT_MAX",
    process.env.API_RATE_LIMIT_MAX,
    DEV_API_RATE_LIMIT_MAX,
  );
  const apiRateLimitWindowMs = parsePositiveIntegerEnv(
    "API_RATE_LIMIT_WINDOW_MS",
    process.env.API_RATE_LIMIT_WINDOW_MS,
    DEV_API_RATE_LIMIT_WINDOW_MS,
  );
  const agentPlannerEnabled = parseBooleanEnv(
    "AGENT_PLANNER_ENABLED",
    process.env.AGENT_PLANNER_ENABLED,
    false,
  );
  const agentDirectorEnabled = parseBooleanEnv(
    "AGENT_DIRECTOR_ENABLED",
    process.env.AGENT_DIRECTOR_ENABLED,
    false,
  );
  const agentPlannerFallbackEnabled = parseBooleanEnv(
    "AGENT_PLANNER_FALLBACK_ENABLED",
    process.env.AGENT_PLANNER_FALLBACK_ENABLED,
    false,
  );
  const agentPlannerRepairAttempts = parsePositiveIntegerEnv(
    "AGENT_PLANNER_REPAIR_ATTEMPTS",
    process.env.AGENT_PLANNER_REPAIR_ATTEMPTS,
    1,
  );
  const agentPlannerTimeoutMs = parsePositiveIntegerEnv(
    "AGENT_PLANNER_TIMEOUT_MS",
    process.env.AGENT_PLANNER_TIMEOUT_MS,
    45_000,
  );
  const agentV2Enabled = parseBooleanEnv("AGENT_V2_ENABLED", process.env.AGENT_V2_ENABLED, false);
  const agentV2RuntimeEnabled = parseBooleanEnv("AGENT_V2_RUNTIME_ENABLED", process.env.AGENT_V2_RUNTIME_ENABLED, false);
  const agentV3Enabled = parseBooleanEnv("AGENT_V3_ENABLED", process.env.AGENT_V3_ENABLED, false);
  const agentV3RuntimeEnabled = parseBooleanEnv("AGENT_V3_RUNTIME_ENABLED", process.env.AGENT_V3_RUNTIME_ENABLED, false);
  const agentV3MaxToolRounds = parseClampedIntegerEnv("AGENT_V3_MAX_TOOL_ROUNDS", process.env.AGENT_V3_MAX_TOOL_ROUNDS, 8, 1, 8);
  const agentV3MaxContextNodes = parsePositiveIntegerEnv("AGENT_V3_MAX_CONTEXT_NODES", process.env.AGENT_V3_MAX_CONTEXT_NODES, 60);
  const agentV3MaxVisualCaptures = parsePositiveIntegerEnv("AGENT_V3_MAX_VISUAL_CAPTURES", process.env.AGENT_V3_MAX_VISUAL_CAPTURES, 4);
  const agentV3RepairAttempts = parsePositiveIntegerEnv("AGENT_V3_REPAIR_ATTEMPTS", process.env.AGENT_V3_REPAIR_ATTEMPTS, 1);
  const agentV4Enabled = parseBooleanEnv("AGENT_V4_ENABLED", process.env.AGENT_V4_ENABLED, false);
  const agentV4RuntimeEnabled = parseBooleanEnv("AGENT_V4_RUNTIME_ENABLED", process.env.AGENT_V4_RUNTIME_ENABLED, false);
  const agentV4MaxRounds = parseClampedIntegerEnv("AGENT_V4_MAX_ROUNDS", process.env.AGENT_V4_MAX_ROUNDS, 12, 1, 20);
  const agentV4MaxItems = parseClampedIntegerEnv("AGENT_V4_MAX_ITEMS", process.env.AGENT_V4_MAX_ITEMS, 12, 1, 24);
  const agentV4MaxReferences = parseClampedIntegerEnv("AGENT_V4_MAX_REFERENCES", process.env.AGENT_V4_MAX_REFERENCES, 16, 1, 16);
  const agentV4RepairAttempts = parseClampedIntegerEnv("AGENT_V4_REPAIR_ATTEMPTS", process.env.AGENT_V4_REPAIR_ATTEMPTS, 1, 0, 3);
  const agentSkillsEnabled = parseBooleanEnv("AGENT_SKILLS_ENABLED", process.env.AGENT_SKILLS_ENABLED, false);
  const agentSkillAuthoringEnabled = parseBooleanEnv("AGENT_SKILL_AUTHORING_ENABLED", process.env.AGENT_SKILL_AUTHORING_ENABLED, false);
  const agentSkillRuntimeEnabled = parseBooleanEnv("AGENT_SKILL_RUNTIME_ENABLED", process.env.AGENT_SKILL_RUNTIME_ENABLED, false);
  const agentSkillMaxSourceChars = parsePositiveIntegerEnv("AGENT_SKILL_MAX_SOURCE_CHARS", process.env.AGENT_SKILL_MAX_SOURCE_CHARS, 24_000);
  const agentSkillMaxSteps = parsePositiveIntegerEnv("AGENT_SKILL_MAX_STEPS", process.env.AGENT_SKILL_MAX_STEPS, 12);
  const agentSkillRepairAttempts = parsePositiveIntegerEnv("AGENT_SKILL_REPAIR_ATTEMPTS", process.env.AGENT_SKILL_REPAIR_ATTEMPTS, 1);
  const agentTextRouteKey = process.env.AGENT_TEXT_ROUTE_KEY?.trim() || "text.default";
  const agentExecutorEnabled = parseBooleanEnv(
    "AGENT_EXECUTOR_ENABLED",
    process.env.AGENT_EXECUTOR_ENABLED,
    false,
  );
  const agentExecutorRequireApproval = parseBooleanEnv(
    "AGENT_EXECUTOR_REQUIRE_APPROVAL",
    process.env.AGENT_EXECUTOR_REQUIRE_APPROVAL,
    true,
  );
  const agentExecutorMaxToolRounds = parsePositiveIntegerEnv(
    "AGENT_EXECUTOR_MAX_TOOL_ROUNDS",
    process.env.AGENT_EXECUTOR_MAX_TOOL_ROUNDS,
    8,
  );
  const agentExecutorMaxGeneratedItems = parsePositiveIntegerEnv(
    "AGENT_EXECUTOR_MAX_GENERATED_ITEMS",
    process.env.AGENT_EXECUTOR_MAX_GENERATED_ITEMS,
    8,
  );
  const agentExecutorMaxEstimatedCredits = parsePositiveNumberEnv(
    "AGENT_EXECUTOR_MAX_ESTIMATED_CREDITS",
    process.env.AGENT_EXECUTOR_MAX_ESTIMATED_CREDITS,
    50,
  );
  const agentExecutorTurnTimeoutMs = parsePositiveIntegerEnv(
    "AGENT_EXECUTOR_TURN_TIMEOUT_MS",
    process.env.AGENT_EXECUTOR_TURN_TIMEOUT_MS,
    300_000,
  );
  const agentExecutorToolTimeoutMs = parsePositiveIntegerEnv(
    "AGENT_EXECUTOR_TOOL_TIMEOUT_MS",
    process.env.AGENT_EXECUTOR_TOOL_TIMEOUT_MS,
    180_000,
  );
  const agentExecutorAllowBatchImage = parseBooleanEnv(
    "AGENT_EXECUTOR_ALLOW_BATCH_IMAGE",
    process.env.AGENT_EXECUTOR_ALLOW_BATCH_IMAGE,
    true,
  );
  const agentExecutorAllowImageEdit = parseBooleanEnv(
    "AGENT_EXECUTOR_ALLOW_IMAGE_EDIT",
    process.env.AGENT_EXECUTOR_ALLOW_IMAGE_EDIT,
    false,
  );
  const agentExecutorAllowVideo = parseBooleanEnv(
    "AGENT_EXECUTOR_ALLOW_VIDEO",
    process.env.AGENT_EXECUTOR_ALLOW_VIDEO,
    false,
  );
  const authRateLimitMax = parsePositiveIntegerEnv(
    "AUTH_RATE_LIMIT_MAX",
    process.env.AUTH_RATE_LIMIT_MAX,
    DEV_AUTH_RATE_LIMIT_MAX,
  );
  const authRateLimitWindowMs = parsePositiveIntegerEnv(
    "AUTH_RATE_LIMIT_WINDOW_MS",
    process.env.AUTH_RATE_LIMIT_WINDOW_MS,
    DEV_AUTH_RATE_LIMIT_WINDOW_MS,
  );
  const resendApiKey = process.env.RESEND_API_KEY?.trim() || "";
  const resendFromEmail = process.env.RESEND_FROM_EMAIL?.trim() || "";
  const resendFromName = process.env.RESEND_FROM_NAME?.trim() || "";
  const accessTokenTtlSeconds = parsePositiveIntegerEnv(
    "ACCESS_TOKEN_TTL_SECONDS",
    process.env.ACCESS_TOKEN_TTL_SECONDS,
    60 * 15,
  );
  const refreshTokenTtlSeconds = parsePositiveIntegerEnv(
    "REFRESH_TOKEN_TTL_SECONDS",
    process.env.REFRESH_TOKEN_TTL_SECONDS,
    60 * 60 * 24 * 7,
  );
  const securityHeadersEnabled = parseBooleanEnv(
    "SECURITY_HEADERS_ENABLED",
    process.env.SECURITY_HEADERS_ENABLED,
    true,
  );
  const trustProxy = parseBooleanEnv(
    "TRUST_PROXY",
    process.env.TRUST_PROXY,
    isProduction,
  );
  const promptCatalogMediaDir = process.env.PROMPT_CATALOG_MEDIA_DIR?.trim() || "./data/prompt-catalog";
  const paymentsEnabled = parseBooleanEnv("PAYMENTS_ENABLED", process.env.PAYMENTS_ENABLED, false);
  const paymentReconcileIntervalMs = parsePositiveIntegerEnv("PAYMENT_RECONCILE_INTERVAL_MS", process.env.PAYMENT_RECONCILE_INTERVAL_MS, 60_000);
  const xunhuAppId = process.env.XUNHU_APP_ID?.trim() || "";
  const xunhuAppSecret = process.env.XUNHU_APP_SECRET?.trim() || "";
  const xunhuBaseUrl = process.env.XUNHU_BASE_URL?.trim() || "https://api.xunhupay.com";
  const xunhuNotifyUrl = process.env.XUNHU_NOTIFY_URL?.trim() || "";
  const xunhuReturnUrl = process.env.XUNHU_RETURN_URL?.trim() || "";
  const xunhuTimeoutMs = parsePositiveIntegerEnv("XUNHU_TIMEOUT_MS", process.env.XUNHU_TIMEOUT_MS, 10_000);
  if (paymentsEnabled && (!xunhuAppId || !xunhuAppSecret || !xunhuNotifyUrl || !xunhuReturnUrl)) {
    throw new Error("XUNHU_APP_ID, XUNHU_APP_SECRET, XUNHU_NOTIFY_URL, and XUNHU_RETURN_URL are required when PAYMENTS_ENABLED=true");
  }

  if (isProduction && corsAllowedOrigins.length === 0) {
    throw new Error("CORS_ALLOWED_ORIGINS is required to start the v2 API in production");
  }

  if (isProduction && !resendApiKey) {
    throw new Error("RESEND_API_KEY is required to start the v2 API in production");
  }

  if (isProduction && !legalContactUrl) {
    throw new Error("LEGAL_CONTACT_URL is required to start the v2 API in production");
  }

  if (isProduction && !resendFromEmail) {
    throw new Error("RESEND_FROM_EMAIL is required to start the v2 API in production");
  }

  if (isProduction && !resendFromName) {
    throw new Error("RESEND_FROM_NAME is required to start the v2 API in production");
  }

  if (!jwtAccessSecret) {
    throw new Error("JWT_ACCESS_SECRET is required to start the v2 API");
  }

  if (isProduction && !jwtRefreshSecret) {
    throw new Error("JWT_REFRESH_SECRET is required to start the v2 API");
  }

  if (!credentialMasterKey) {
    throw new Error("CREDENTIAL_MASTER_KEY is required to start the v2 API");
  }

  if (!redisUrl) {
    throw new Error("REDIS_URL is required to start the v2 API");
  }

  const s3Endpoint =
    process.env.S3_ENDPOINT?.trim() ||
    (isProduction ? "" : DEV_S3_ENDPOINT);
  const s3Region =
    process.env.S3_REGION?.trim() ||
    (isProduction ? "" : DEV_S3_REGION);
  const s3Bucket =
    process.env.S3_BUCKET?.trim() ||
    (isProduction ? "" : DEV_S3_BUCKET);
  const s3AccessKeyId =
    process.env.S3_ACCESS_KEY_ID?.trim() ||
    (isProduction ? "" : DEV_S3_ACCESS_KEY_ID);
  const s3SecretAccessKey =
    process.env.S3_SECRET_ACCESS_KEY?.trim() ||
    (isProduction ? "" : DEV_S3_SECRET_ACCESS_KEY);
  const s3ForcePathStyleRaw =
    process.env.S3_FORCE_PATH_STYLE?.trim() ||
    String(DEV_S3_FORCE_PATH_STYLE);

  if (!s3Endpoint) {
    throw new Error("S3_ENDPOINT is required to start the v2 API");
  }

  if (!s3Region) {
    throw new Error("S3_REGION is required to start the v2 API");
  }

  if (!s3Bucket) {
    throw new Error("S3_BUCKET is required to start the v2 API");
  }

  if (!s3AccessKeyId) {
    throw new Error("S3_ACCESS_KEY_ID is required to start the v2 API");
  }

  if (!s3SecretAccessKey) {
    throw new Error("S3_SECRET_ACCESS_KEY is required to start the v2 API");
  }

  return {
    accessTokenTtlSeconds,
    adminEmails,
    agentDirectorEnabled,
    agentExecutorAllowBatchImage,
    agentExecutorAllowImageEdit,
    agentExecutorAllowVideo,
    agentExecutorEnabled,
    agentExecutorMaxEstimatedCredits,
    agentExecutorMaxGeneratedItems,
    agentExecutorMaxToolRounds,
    agentExecutorRequireApproval,
    agentExecutorToolTimeoutMs,
    agentExecutorTurnTimeoutMs,
    agentPlannerFallbackEnabled,
    agentPlannerEnabled,
    agentPlannerRepairAttempts,
    agentPlannerTimeoutMs,
    agentV2Enabled,
    agentV2RuntimeEnabled,
    agentV3Enabled,
    agentV3RuntimeEnabled,
    agentV3MaxToolRounds,
    agentV3MaxContextNodes,
    agentV3MaxVisualCaptures,
    agentV3RepairAttempts,
    agentV4Enabled,
    agentV4RuntimeEnabled,
    agentV4MaxRounds,
    agentV4MaxItems,
    agentV4MaxReferences,
    agentV4RepairAttempts,
    agentSkillsEnabled,
    agentSkillAuthoringEnabled,
    agentSkillRuntimeEnabled,
    agentSkillMaxSourceChars,
    agentSkillMaxSteps,
    agentSkillRepairAttempts,
    agentTextRouteKey,
    apiRateLimitMax,
    apiRateLimitWindowMs,
    authRateLimitMax,
    authRateLimitWindowMs,
    resendApiKey,
    resendFromEmail,
    resendFromName,
    corsAllowedOrigins,
    credentialKeyVersion,
    credentialMasterKey,
    jwtAccessSecret,
    jwtRefreshSecret,
    legalContactUrl,
    nodeEnv,
    promptCatalogMediaDir,
    queuePrefix,
    redisUrl,
    refreshTokenTtlSeconds,
    s3AccessKeyId,
    s3Bucket,
    s3Endpoint,
    s3ForcePathStyle: s3ForcePathStyleRaw.toLowerCase() === "true",
    s3Region,
    s3SecretAccessKey,
    securityHeadersEnabled,
    trustProxy,
    paymentsEnabled,
    paymentReconcileIntervalMs,
    xunhuAppId,
    xunhuAppSecret,
    xunhuBaseUrl,
    xunhuNotifyUrl,
    xunhuReturnUrl,
    xunhuTimeoutMs,
  };
}
