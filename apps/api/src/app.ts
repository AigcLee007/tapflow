import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import Fastify, {
  type FastifyInstance,
  type FastifyReply,
  type FastifyRequest,
} from "fastify";

import { builtinAiPluginRegistry, CredentialVault, DatabaseTextGenerationRuntime } from "@aigc-flow/ai-gateway-core";
import { createPgPool } from "@aigc-flow/db";
import {
  QUEUE_NAMES,
  closeRedisConnection,
  createQueueFactory,
  createRedisConnection,
} from "@aigc-flow/redis";
import { S3StorageProvider, type StorageProvider } from "@aigc-flow/storage";

import { getApiEnv, type ApiEnv } from "./config/env.js";
import { registerRequestContext } from "./http/request-context.js";
import { registerAuditRoutes } from "./modules/audit/audit.routes.js";
import { AuditApiService } from "./modules/audit/audit.service.js";
import { registerAdminRoutes } from "./modules/admin/admin.routes.js";
import { AdminApiService } from "./modules/admin/admin.service.js";
import { registerAgentRoutes } from "./modules/agent/agent.routes.js";
import { registerSkillRoutes } from "./modules/agent/skill.routes.js";
import { SkillAuthoringService } from "./modules/agent/skill-authoring.service.js";
import { SkillRunService } from "./modules/agent/agent-skill-run.service.js";
import { registerSkillRunRoutes } from "./modules/agent/skill-run.routes.js";
import { SkillService } from "./modules/agent/skill.service.js";
import { AgentRunSettingsService } from "./modules/agent/agent-run-settings.service.js";
import { AgentService } from "./modules/agent/agent.service.js";
import { AgentV3RuntimeService, createAgentV3PlanningAdapter } from "./modules/agent/v3/agent-v3-runtime.js";
import { DatabaseAgentV3TaskRepository } from "./modules/agent/v3/agent-v3-task-store.js";
import { CanvasOperationService } from "./modules/agent/v3/canvas-operation-service.js";
import { AgentCostEstimator, DatabaseAgentCostEstimatorRepository } from "./modules/agent/agent-cost-estimator.js";
import { AgentExecutorService, DatabaseAgentExecutorRepository } from "./modules/agent/agent-executor.service.js";
import { AgentReferenceAssetRepository } from "./modules/agent/agent-reference-context.js";
import { AgentCanvasService } from "./modules/agent/agent-canvas.service.js";
import { AgentSessionRepository } from "./modules/agent/agent-session.repository.js";
import { AgentToolRunner, DatabaseAgentToolRunnerRepository } from "./modules/agent/agent-tool-runner.js";
import { AgentWorkflowLauncher } from "./modules/agent/agent-workflow-launcher.js";
import { registerAiGatewayAdminRoutes } from "./modules/ai-gateway/ai-gateway.routes.js";
import { AiGatewayAdminService } from "./modules/ai-gateway/ai-gateway.service.js";
import { registerAiModelCatalogRoutes } from "./modules/ai-model-catalog/ai-model-catalog.routes.js";
import { RedisAiModelCatalogCache, type AiModelCatalogCache } from "./modules/ai-model-catalog/ai-model-catalog.cache.js";
import { AiModelCatalogService } from "./modules/ai-model-catalog/ai-model-catalog.service.js";
import { registerAiModelConfigurationRoutes } from "./modules/ai-model-configurations/ai-model-configurations.routes.js";
import { AiModelConfigurationsService } from "./modules/ai-model-configurations/ai-model-configurations.service.js";
import { registerAiPluginAdminRoutes } from "./modules/ai-plugins/ai-plugins.routes.js";
import { AiPluginService } from "./modules/ai-plugins/ai-plugins.service.js";
import { registerAiRouteTestRoutes } from "./modules/ai-route-tests/ai-route-tests.routes.js";
import { AiRouteTestService } from "./modules/ai-route-tests/ai-route-tests.service.js";
import { registerAuthRoutes } from "./modules/auth/auth.routes.js";
import {
  type AuthEmailSender,
  ResendAuthEmailSender,
} from "./modules/auth/auth-email-sender.js";
import { AuthService } from "./modules/auth/auth.service.js";
import { registerAssetRoutes } from "./modules/assets/assets.routes.js";
import { AssetsService, type AssetVideoReferenceVariantQueue } from "./modules/assets/assets.service.js";
import { registerBillingRoutes } from "./modules/billing/billing.routes.js";
import { BillingApiService } from "./modules/billing/billing.service.js";
import { registerPaymentRoutes } from "./modules/payments/payments.routes.js";
import { PaymentReconciler } from "./modules/payments/payment-reconciler.js";
import { PaymentsService } from "./modules/payments/payments.service.js";
import { registerFlowRoutes } from "./modules/flows/flows.routes.js";
import { FlowsService } from "./modules/flows/flows.service.js";
import { registerFlowCommentRoutes } from "./modules/flow-comments/flow-comments.routes.js";
import { FlowCommentsService } from "./modules/flow-comments/flow-comments.service.js";
import { registerFlowHistoryRoutes } from "./modules/flow-history/flow-history.routes.js";
import { FlowHistoryService } from "./modules/flow-history/flow-history.service.js";
import { registerFlowTemplateRoutes } from "./modules/flow-templates/flow-templates.routes.js";
import { FlowTemplatesService } from "./modules/flow-templates/flow-templates.service.js";
import { registerLegalRoutes } from "./modules/legal/legal.routes.js";
import { LegalService } from "./modules/legal/legal.service.js";
import { registerObservabilityRoutes } from "./modules/observability/observability.routes.js";
import { ObservabilityService } from "./modules/observability/observability.service.js";
import { createApiLoggerOptions, logApiRequestComplete } from "./observability/logger.js";
import { registerProjectRoutes } from "./modules/projects/projects.routes.js";
import { ProjectsService } from "./modules/projects/projects.service.js";
import { registerPromptRoutes } from "./modules/prompts/prompts.routes.js";
import { PROMPT_MEDIA_MAX_BYTES, PromptsService } from "./modules/prompts/prompts.service.js";
import { registerQueueRoutes } from "./modules/queues/queues.routes.js";
import { QueueHealthService } from "./modules/queues/queues.service.js";
import { registerWorkbenchRoutes } from "./modules/workbench/workbench.routes.js";
import { WorkbenchService } from "./modules/workbench/workbench.service.js";
import { registerWorkflowRunRoutes } from "./modules/workflow-runs/workflow-runs.routes.js";
import { WorkflowRunsService } from "./modules/workflow-runs/workflow-runs.service.js";

type PgPool = ReturnType<typeof createPgPool>;

function isAllowedOrigin(origin: string | undefined, allowedOrigins: string[]): boolean {
  if (!origin) {
    return true;
  }
  if (allowedOrigins.includes("*")) {
    return true;
  }
  return allowedOrigins.includes(origin);
}

function sendStandardError(
  request: FastifyRequest,
  reply: FastifyReply,
  statusCode: number,
  code: string,
  message: string,
  details?: unknown,
) {
  const ctx = request.ctx;
  return reply.code(statusCode).send({
    error: {
      code,
      details,
      message,
      requestId: ctx?.requestId ?? request.id,
    },
  });
}

function registerSecurityBaseline(app: FastifyInstance, env: ApiEnv): void {
  app.register(cors, {
    credentials: true,
    origin(origin, callback) {
      callback(null, isAllowedOrigin(origin, env.corsAllowedOrigins ?? []));
    },
  });

  if (env.securityHeadersEnabled ?? true) {
    app.register(helmet, {
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
    });
  }

  app.register(rateLimit, {
    global: true,
    keyGenerator(request) {
      return request.ctx?.userId ?? request.ip;
    },
    max: env.apiRateLimitMax ?? 1000,
    timeWindow: env.apiRateLimitWindowMs ?? 60_000,
  });
}

export function buildAgentExecutorService(options: {
  costEstimator: Pick<AgentCostEstimator, "estimateGenerateImage" | "estimateGenerateImageBatch">;
  env: ApiEnv;
  pool: PgPool;
  textRuntime: Pick<DatabaseTextGenerationRuntime, "generateText">;
  toolRunner: Pick<AgentToolRunner, "runToolCall">;
}): AgentExecutorService {
  return new AgentExecutorService({
    costEstimator: options.costEstimator,
    env: options.env,
    limits: {
      allowBatchImage: options.env.agentExecutorAllowBatchImage,
      allowImageEdit: options.env.agentExecutorAllowImageEdit,
      allowVideo: options.env.agentExecutorAllowVideo,
      maxEstimatedCredits: options.env.agentExecutorMaxEstimatedCredits,
      maxGeneratedItems: options.env.agentExecutorMaxGeneratedItems,
      maxToolRounds: options.env.agentExecutorMaxToolRounds,
      requireApproval: options.env.agentExecutorRequireApproval,
    },
    referenceAssetRepository: new AgentReferenceAssetRepository({ pool: options.pool }),
    repository: new DatabaseAgentExecutorRepository({ pool: options.pool }),
    textRuntime: options.textRuntime,
    toolRunner: options.toolRunner,
  });
}

export function buildApp(options?: {
  auditService?: AuditApiService;
  authEmailSender?: AuthEmailSender;
  env?: ApiEnv;
  logger?: boolean;
  observabilityService?: ObservabilityService;
  pool?: PgPool;
  queueHealthService?: QueueHealthService;
  storageProvider?: StorageProvider;
  assetVideoReferenceVariantQueue?: AssetVideoReferenceVariantQueue | null;
  workflowRunsService?: WorkflowRunsService;
  agentExecutorService?: AgentExecutorService;
  aiModelCatalogCache?: AiModelCatalogCache;
}) {
  const env = options?.env ?? getApiEnv();
  const ownedPool = !options?.pool;
  const ownedQueueHealthService = !options?.queueHealthService;
  const ownedWorkflowRunsService = !options?.workflowRunsService;
  const pool = options?.pool ?? createPgPool();
  const appRedisConnection = ownedQueueHealthService || ownedWorkflowRunsService
    ? createRedisConnection({
        redisUrl: env.redisUrl,
      })
    : null;
  const appQueueFactory = appRedisConnection
    ? createQueueFactory({
        connection: appRedisConnection,
        prefix: env.queuePrefix,
      })
    : null;
  const ownedAiModelCatalogCache = !options?.aiModelCatalogCache;
  const aiModelCatalogRedisConnection = ownedAiModelCatalogCache
    ? createRedisConnection({
        connectTimeout: 1_000,
        enableOfflineQueue: false,
        maxRetriesPerRequest: 1,
        redisUrl: env.redisUrl,
      })
    : null;
  const aiModelCatalogCache = options?.aiModelCatalogCache
    ?? new RedisAiModelCatalogCache(aiModelCatalogRedisConnection!);
  const storageProvider =
    options?.storageProvider ??
    new S3StorageProvider({
      accessKeyId: env.s3AccessKeyId,
      endpoint: env.s3Endpoint,
      forcePathStyle: env.s3ForcePathStyle,
      region: env.s3Region,
      secretAccessKey: env.s3SecretAccessKey,
    });
  const credentialVault = new CredentialVault({
    keyVersion: env.credentialKeyVersion,
    masterKey: env.credentialMasterKey,
  });
  const authEmailSender = options?.authEmailSender ?? new ResendAuthEmailSender({
    apiKey: env.resendApiKey ?? "",
    fromEmail: env.resendFromEmail ?? "",
    fromName: env.resendFromName ?? "",
  });
  const authService = new AuthService({
    authEmailSender,
    env,
    pool,
  });
  const assetVideoReferenceVariantQueue = options?.assetVideoReferenceVariantQueue
    ?? appQueueFactory?.createQueue(QUEUE_NAMES.assetVideoReferenceVariant)
    ?? null;
  const ownedAssetVideoReferenceVariantQueue = !options?.assetVideoReferenceVariantQueue
    && Boolean(appQueueFactory);
  const adminService = new AdminApiService({ pool });
  const aiGatewayService = new AiGatewayAdminService({
    credentialVault,
    pool,
  });
  const aiModelCatalogService = new AiModelCatalogService({
    cache: aiModelCatalogCache,
    pool,
  });
  const aiModelConfigurationsService = new AiModelConfigurationsService({
    credentialVault,
    pluginRegistry: builtinAiPluginRegistry,
    pool,
  });
  const aiPluginService = new AiPluginService({
    credentialVault,
    pool,
  });
  const aiRouteTestService = new AiRouteTestService({
    credentialVault,
    pool,
  });
  const assetsService = new AssetsService({
    assetVideoReferenceVariantQueue,
    bucket: env.s3Bucket,
    pool,
    storageProvider,
  });
  const billingService = new BillingApiService({ pool });
  const paymentsService = new PaymentsService(env, { pool });
  const auditService =
    options?.auditService ??
    new AuditApiService({
      pool,
    });
  const queueHealthService =
    options?.queueHealthService ??
    new QueueHealthService(
      appRedisConnection!,
      {
        queueFactory: appQueueFactory!,
      },
    );
  const nodeExecuteQueue = appQueueFactory?.createQueue(QUEUE_NAMES.nodeExecute);
  const nodeExecuteDefaultQueue = appQueueFactory?.createQueue(QUEUE_NAMES.nodeExecuteDefault);
  const nodeExecuteImageQueue = appQueueFactory?.createQueue(QUEUE_NAMES.nodeExecuteImage);
  const nodeExecuteVideoQueue = appQueueFactory?.createQueue(QUEUE_NAMES.nodeExecuteVideo);
  const workbenchGenerateQueue = appQueueFactory?.createQueue(QUEUE_NAMES.workbenchGenerate);
  const workflowRunsService =
    options?.workflowRunsService ??
    new WorkflowRunsService({
      nodeExecuteQueue: nodeExecuteQueue!,
      nodeExecuteQueues: {
        default: nodeExecuteDefaultQueue!,
        image: nodeExecuteImageQueue!,
        legacy: nodeExecuteQueue!,
        video: nodeExecuteVideoQueue!,
      },
      pool,
    });
  const flowsService = new FlowsService({ pool });
  const agentWorkflowLauncher = new AgentWorkflowLauncher({ workflowRunsService });
  const agentSessionRepository = new AgentSessionRepository({ pool });
  const agentCanvasService = new AgentCanvasService({
    eventRepository: agentSessionRepository,
    flowsService,
    sessionRepository: agentSessionRepository,
  });
  const agentToolRunner = new AgentToolRunner({
    canvasService: agentCanvasService,
    launcher: agentWorkflowLauncher,
    repository: new DatabaseAgentToolRunnerRepository({ pool }),
  });
  const agentCostEstimator = new AgentCostEstimator(
    new DatabaseAgentCostEstimatorRepository({ pool }),
  );
  const agentRunSettingsService = new AgentRunSettingsService({
    catalogService: aiModelCatalogService,
    costEstimator: agentCostEstimator,
  });
  const agentTextRuntime = new DatabaseTextGenerationRuntime({
    credentialVault,
    pool,
  });
  const agentExecutorService =
    options?.agentExecutorService ??
    buildAgentExecutorService({
      costEstimator: agentCostEstimator,
      env,
      pool,
      textRuntime: agentTextRuntime,
      toolRunner: agentToolRunner,
    });
  const workbenchService = new WorkbenchService({
    generationQueue: workbenchGenerateQueue ?? null,
    pool,
    storageProvider,
  });
  const observabilityService =
    options?.observabilityService ??
    new ObservabilityService({
      pool,
      queueHealthService,
    });
  const projectsService = new ProjectsService({
    pool,
    storageProvider,
  });
  const promptsService = new PromptsService({ pool, promptCatalogMediaDir: env.promptCatalogMediaDir });
  const skillService = new SkillService();
  const skillRunService = new SkillRunService();
  const agentService = new AgentService({
    aiModelCatalogService,
    env,
    executorService: agentExecutorService,
    canvasService: agentCanvasService,
    flowsService,
    pool,
    sessionRepository: agentSessionRepository,
    runSettingsService: agentRunSettingsService,
    textRuntime: agentTextRuntime,
    skillService,
    skillRunService,
    workflowRunsService,
  });
  const agentV3TaskRepository = new DatabaseAgentV3TaskRepository(pool);
  const agentV3OperationService = new CanvasOperationService(agentService.flowsService);
  const agentV3Runtime = new AgentV3RuntimeService({
    enabled: env.agentV3Enabled === true && env.agentV3RuntimeEnabled === true,
    adapter: createAgentV3PlanningAdapter(agentService, agentV3TaskRepository, agentV3OperationService),
    repository: agentV3TaskRepository,
  });
  const flowCommentsService = new FlowCommentsService({ pool });
  const flowHistoryService = new FlowHistoryService({ pool });
  const flowTemplatesService = new FlowTemplatesService({ pool });
  const legalService = new LegalService({ legalContactUrl: env.legalContactUrl });

  const app = Fastify({
    logger: options?.logger === false ? false : (createApiLoggerOptions() as never),
    trustProxy: env.trustProxy ?? false,
  });
  const paymentReconciler = env.paymentsEnabled
    ? new PaymentReconciler({ intervalMs: env.paymentReconcileIntervalMs, logger: app.log, payments: paymentsService, pool })
    : null;

  registerSecurityBaseline(app, env);

  app.decorate("adminService", adminService);
  app.decorate("agentService", agentService);
  app.decorate("agentV3Runtime", agentV3Runtime);
  app.decorate("skillService", skillService);
  app.decorate("skillRunService", skillRunService);
  app.decorate("aiGatewayService", aiGatewayService);
  app.decorate("aiModelCatalogCache", aiModelCatalogCache);
  app.decorate("aiModelCatalogService", aiModelCatalogService);
  app.decorate("aiModelConfigurationsService", aiModelConfigurationsService);
  app.decorate("aiPluginService", aiPluginService);
  app.decorate("aiRouteTestService", aiRouteTestService);
  app.decorate("auditService", auditService);
  app.decorate("authService", authService);
  app.decorate("assetsService", assetsService);
  app.decorate("billingService", billingService);
  app.decorate("paymentsService", paymentsService);
  app.decorate("credentialVault", credentialVault);
  app.decorate("projectsService", projectsService);
  app.decorate("promptsService", promptsService);
  app.decorate("observabilityService", observabilityService);
  app.decorate("flowsService", flowsService);
  app.decorate("flowCommentsService", flowCommentsService);
  app.decorate("flowHistoryService", flowHistoryService);
  app.decorate("flowTemplatesService", flowTemplatesService);
  app.decorate("legalService", legalService);
  app.decorate("queueHealthService", queueHealthService);
  app.decorate("storageProvider", storageProvider);
  app.decorate("workbenchService", workbenchService);
  app.decorate("workflowRunsService", workflowRunsService);
  registerRequestContext(app, authService);
  app.setErrorHandler((error, request, reply) => {
    const contentType = request.headers["content-type"]?.split(";", 1)[0]?.trim().toLowerCase();
    const errorCode = typeof error === "object" && error !== null && "code" in error
      ? error.code
      : undefined;
    if (errorCode === "FST_ERR_CTP_BODY_TOO_LARGE" && contentType === "application/x-prompt-media") {
      return sendStandardError(
        request,
        reply,
        413,
        "PROMPT_MEDIA_SIZE_INVALID",
        `效果图大小必须在 ${PROMPT_MEDIA_MAX_BYTES / 1024 / 1024} MB 以内`,
      );
    }
    request.log.error(
      {
        err: error,
        requestId: request.ctx?.requestId ?? request.id,
        tenantId: request.ctx?.tenantId,
        traceId: request.ctx?.traceId,
        userId: request.ctx?.userId,
      },
      "api request failed",
    );
    return sendStandardError(request, reply, 500, "INTERNAL_ERROR", "服务暂时不可用，请稍后重试。");
  });
  app.setNotFoundHandler((request, reply) => {
    return sendStandardError(request, reply, 404, "NOT_FOUND", "Route not found");
  });
  app.addHook("onResponse", async (request, reply) => {
    const responseTimeMs = typeof reply.elapsedTime === "number"
      ? Math.round(reply.elapsedTime)
      : 0;
    logApiRequestComplete(request.log, request, reply.statusCode, responseTimeMs);
  });

  app.addHook("onClose", async () => {
    await paymentReconciler?.stop();
    if (ownedPool) {
      await pool.end();
    }

    if (ownedWorkflowRunsService) {
      await Promise.all([
        nodeExecuteQueue?.close(),
        nodeExecuteDefaultQueue?.close(),
        nodeExecuteImageQueue?.close(),
        nodeExecuteVideoQueue?.close(),
        workbenchGenerateQueue?.close(),
      ]);
    }

    if (ownedAssetVideoReferenceVariantQueue) {
      await assetVideoReferenceVariantQueue?.close?.();
    }

    if (ownedQueueHealthService) {
      await queueHealthService.close();
    }

    if (!ownedQueueHealthService && appRedisConnection) {
      await closeRedisConnection(appRedisConnection);
    }

    if (ownedAiModelCatalogCache && aiModelCatalogRedisConnection) {
      await closeRedisConnection(aiModelCatalogRedisConnection);
    }
  });

  app.addHook("onReady", async () => {
    paymentReconciler?.start();
  });

  app.get("/health", async () => {
    return { status: "ok" };
  });

  app.get("/health/live", async () => {
    return {
      status: "ok",
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.round(process.uptime()),
    };
  });

  app.get("/health/ready", async (_request, reply) => {
    const health = await observabilityService.getAdminHealth();
    const statusCode = health.status === "ok" ? 200 : 503;
    return reply.code(statusCode).send({
      database: health.database,
      redis: health.redis,
      status: health.status,
      timestamp: health.timestamp,
      uptimeSeconds: health.uptimeSeconds,
      version: health.version,
    });
  });

  registerAdminRoutes(app);
  registerAgentRoutes(app);
  registerSkillRoutes(app, skillService, new SkillAuthoringService({
    repairAttempts: env.agentSkillRepairAttempts,
    generate: async (prompt, runtimeContext) => {
      if (!runtimeContext) throw new Error("AUTHORING_RUNTIME_CONTEXT_REQUIRED");
      const result = await agentTextRuntime.generateText(runtimeContext, {
        messages: [
          { role: "system", content: "你是 TapFlow 的 Skill 设计助手。严格按要求返回 JSON，不执行画布、工作流或计费操作。" },
          { role: "user", content: prompt.slice(0, 24000) },
        ],
        routeKey: env.agentTextRouteKey,
        maxTokens: 4000,
      });
      return result.outputText;
    },
  }), {
    skillsEnabled: env.agentSkillsEnabled,
    authoringEnabled: env.agentSkillAuthoringEnabled,
  });
  registerSkillRunRoutes(app, { canvas: app.agentService.canvasService, enabled: env.agentSkillsEnabled && env.agentSkillRuntimeEnabled, runs: skillRunService, skills: skillService });
  registerAuditRoutes(app);
  registerAiGatewayAdminRoutes(app);
  registerAiModelCatalogRoutes(app);
  registerAiModelConfigurationRoutes(app);
  registerAiPluginAdminRoutes(app);
  registerAiRouteTestRoutes(app);
  registerAuthRoutes(app);
  registerLegalRoutes(app);
  registerAssetRoutes(app);
  registerBillingRoutes(app);
  registerPaymentRoutes(app);
  registerProjectRoutes(app);
  registerPromptRoutes(app);
  registerFlowRoutes(app);
  registerFlowCommentRoutes(app);
  registerFlowHistoryRoutes(app);
  registerFlowTemplateRoutes(app);
  registerObservabilityRoutes(app);
  registerQueueRoutes(app);
  registerWorkbenchRoutes(app);
  registerWorkflowRunRoutes(app);

  return app;
}
