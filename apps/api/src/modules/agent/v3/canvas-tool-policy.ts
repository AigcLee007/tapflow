import type { CanvasToolNamespace } from "./canvas-tool-registry.js";
export class CanvasToolPolicyError extends Error { constructor(message: string) { super(message); this.name = "CanvasToolPolicyError"; } }
export type CanvasToolPolicyContext = { tenantId: string; projectId: string; flowId: string; sessionId: string; graphRevision: number; modelVisible: boolean; pricingPresent: boolean; risk: "safe" | "destructive" | "paid" | "batch"; requiresApproval: boolean; approvalGranted?: boolean };
export function assertCanvasToolAllowed(request: { namespace: CanvasToolNamespace; toolName: string; tenantId?: string; projectId?: string; flowId?: string; sessionId?: string; expectedRevision?: number }, context: CanvasToolPolicyContext) {
  if (!["read", "proposal", "run", "control"].includes(request.namespace)) throw new CanvasToolPolicyError("namespace is not allowed");
  if (request.tenantId !== undefined && request.tenantId !== context.tenantId) throw new CanvasToolPolicyError("tenant scope mismatch");
  if (request.projectId !== undefined && request.projectId !== context.projectId) throw new CanvasToolPolicyError("project scope mismatch");
  if (request.flowId !== undefined && request.flowId !== context.flowId) throw new CanvasToolPolicyError("flow scope mismatch");
  if (request.sessionId !== undefined && request.sessionId !== context.sessionId) throw new CanvasToolPolicyError("session scope mismatch");
  if (request.expectedRevision !== undefined && request.expectedRevision !== context.graphRevision) throw new CanvasToolPolicyError("stale graph revision");
  if (["run", "proposal"].includes(request.namespace) && !context.modelVisible) throw new CanvasToolPolicyError("model is not visible");
  if (request.namespace === "run" && !context.pricingPresent) throw new CanvasToolPolicyError("pricing is required");
  if ((context.requiresApproval || context.risk === "paid" || context.risk === "destructive" || context.risk === "batch") && !context.approvalGranted) throw new CanvasToolPolicyError("approval is required");
  if (/^(http|filesystem|shell|mcp|browser|code|url|secret)[._:-]/i.test(request.toolName)) throw new CanvasToolPolicyError("external capability is forbidden");
  return { allowed: true as const };
}
