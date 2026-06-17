import "fastify";

import type { CredentialVault } from "@aigc-flow/ai-gateway-core";
import type { StorageProvider } from "@aigc-flow/storage";

import type { RequestContext } from "./http/request-context.js";
import type { AdminApiService } from "./modules/admin/admin.service.js";
import type { AgentService } from "./modules/agent/agent.service.js";
import type { AuditApiService } from "./modules/audit/audit.service.js";
import type { AuthService } from "./modules/auth/auth.service.js";
import type { AiGatewayAdminService } from "./modules/ai-gateway/ai-gateway.service.js";
import type { AiModelCatalogService } from "./modules/ai-model-catalog/ai-model-catalog.service.js";
import type { AiPluginService } from "./modules/ai-plugins/ai-plugins.service.js";
import type { AiRouteTestService } from "./modules/ai-route-tests/ai-route-tests.service.js";
import type { AssetsService } from "./modules/assets/assets.service.js";
import type { BillingApiService } from "./modules/billing/billing.service.js";
import type { FlowsService } from "./modules/flows/flows.service.js";
import type { FlowCommentsService } from "./modules/flow-comments/flow-comments.service.js";
import type { FlowHistoryService } from "./modules/flow-history/flow-history.service.js";
import type { FlowTemplatesService } from "./modules/flow-templates/flow-templates.service.js";
import type { ObservabilityService } from "./modules/observability/observability.service.js";
import type { ProjectsService } from "./modules/projects/projects.service.js";
import type { QueueHealthService } from "./modules/queues/queues.service.js";
import type { WorkbenchService } from "./modules/workbench/workbench.service.js";
import type { WorkflowRunsService } from "./modules/workflow-runs/workflow-runs.service.js";

declare module "fastify" {
  interface FastifyInstance {
    adminService: AdminApiService;
    agentService: AgentService;
    aiGatewayService: AiGatewayAdminService;
    aiModelCatalogService: AiModelCatalogService;
    aiPluginService: AiPluginService;
    aiRouteTestService: AiRouteTestService;
    auditService: AuditApiService;
    authService: AuthService;
    assetsService: AssetsService;
    billingService: BillingApiService;
    credentialVault: CredentialVault;
    flowsService: FlowsService;
    flowCommentsService: FlowCommentsService;
    flowHistoryService: FlowHistoryService;
    flowTemplatesService: FlowTemplatesService;
    observabilityService: ObservabilityService;
    projectsService: ProjectsService;
    queueHealthService: QueueHealthService;
    storageProvider: StorageProvider;
    workbenchService: WorkbenchService;
    workflowRunsService: WorkflowRunsService;
  }

  interface FastifyRequest {
    ctx: RequestContext;
  }
}
