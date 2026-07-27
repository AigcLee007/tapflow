import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { ZodError } from "zod";
import { safeRecordAuditLog } from "@aigc-flow/db";

import { requireAuth, requirePermission, requireTenant } from "../../http/auth-middleware.js";
import { parseCnyToCents, verifyXunhuSignature } from "./xunhu.client.js";
import { PaymentsApiError } from "./payments.service.js";
import { adminCreateRechargePlanSchema, adminPaymentListSchema, adminPlanParamsSchema, adminRefundPaymentSchema, adminUpdateRechargePlanSchema, createPaymentCheckoutSchema, paymentParamsSchema } from "./payments.schemas.js";

type FormFields = Record<string, string>;

function sendError(request: FastifyRequest, reply: FastifyReply, statusCode: number, code: string, message: string) {
  return reply.code(statusCode).send({ error: { code, message, requestId: request.ctx.requestId } });
}
function routeError(error: unknown, request: FastifyRequest, reply: FastifyReply) {
  if (error instanceof ZodError) return sendError(request, reply, 400, "VALIDATION_ERROR", "Request validation failed");
  if (error instanceof PaymentsApiError) return sendError(request, reply, error.statusCode, error.code, error.message);
  request.log.error({ err: error }, "payment route failed");
  return sendError(request, reply, 500, "INTERNAL_ERROR", "Payment operation failed");
}
function parseNotification(form: FormFields): { amountCents: number; eventTime: string; merchantOrderId: string; openOrderId: string | null; providerState: "OD" | "CD" | "RD" | "UD"; transactionId: string | null } {
  const status = form.status;
  if (!form.appid || !form.trade_order_id || !form.total_fee || !form.time || !form.hash || !status) throw new PaymentsApiError(400, "PAYMENT_CALLBACK_INVALID", "Payment notification is incomplete");
  if (!["OD", "CD", "RD", "UD"].includes(status)) throw new PaymentsApiError(400, "PAYMENT_CALLBACK_STATE_INVALID", "Payment notification state is invalid");
  const seconds = Number(form.time);
  if (!Number.isSafeInteger(seconds) || seconds <= 0) throw new PaymentsApiError(400, "PAYMENT_CALLBACK_INVALID", "Payment notification time is invalid");
  return { amountCents: parseCnyToCents(form.total_fee), eventTime: new Date(seconds * 1000).toISOString(), merchantOrderId: form.trade_order_id, openOrderId: form.open_order_id || null, providerState: status as "OD" | "CD" | "RD" | "UD", transactionId: form.transaction_id || null };
}

async function requirePlatformBillingAdmin(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply | void> {
  if (!request.ctx.roles.includes("system_admin") && !request.ctx.roles.includes("admin_email")) {
    return sendError(request, reply, 403, "FORBIDDEN", "Platform billing administrator access is required");
  }
}

async function auditPaymentAdminAction(request: FastifyRequest, action: string, resourceId: string, metadata: Record<string, unknown>): Promise<void> {
  await safeRecordAuditLog({
    action,
    actorType: "user",
    actorUserId: request.ctx.userId,
    ipHash: request.ctx.ipHash,
    metadata,
    requestId: request.ctx.requestId,
    resourceId,
    resourceType: "billing_wallet_payment",
    tenantId: request.ctx.tenantId!,
    traceId: request.ctx.traceId,
    userAgent: request.ctx.userAgent,
  }, { pool: request.server.paymentsService.walletPayments.pool });
}

export function registerPaymentRoutes(app: FastifyInstance): void {
  app.addContentTypeParser("application/x-www-form-urlencoded", { bodyLimit: 16 * 1024, parseAs: "string" }, (_request, body, done) => {
    try {
      const fields: FormFields = {};
      const parameters = new URLSearchParams(String(body));
      if (Array.from(parameters).length > 64) throw new Error("too many form fields");
      for (const [key, value] of parameters) { if (!key || Object.hasOwn(fields, key)) throw new Error("duplicate form field"); fields[key] = value; }
      done(null, fields);
    } catch { done(new Error("invalid form body"), undefined); }
  });
  app.get("/api/v2/billing/recharge-plans", { preHandler: [requireAuth] }, async (request, reply) => {
    try { return reply.send(await app.paymentsService.listPlans(request.ctx.userId!)); } catch (error) { return routeError(error, request, reply); }
  });
  const platformPlanHandlers = [requireAuth, requireTenant, requirePermission("billing:plans:manage"), requirePlatformBillingAdmin];
  const platformPaymentHandlers = [requireAuth, requireTenant, requirePermission("billing:payments:manage"), requirePlatformBillingAdmin];
  const platformRefundHandlers = [requireAuth, requireTenant, requirePermission("billing:refund"), requirePlatformBillingAdmin];
  app.get("/api/v2/admin/billing/recharge-plans", { preHandler: platformPlanHandlers }, async (request, reply) => {
    try { return reply.send(await app.paymentsService.listAdminPlans()); } catch (error) { return routeError(error, request, reply); }
  });
  app.post("/api/v2/admin/billing/recharge-plans", { preHandler: platformPlanHandlers }, async (request, reply) => {
    try {
      const body = adminCreateRechargePlanSchema.parse(request.body);
      const plan = await app.paymentsService.createAdminPlan(body);
      await auditPaymentAdminAction(request, "billing.recharge_plan.create", plan.id, { after: { active: plan.active, amountCents: plan.amountCents, credits: plan.credits, key: plan.key, validityDays: plan.validityDays }, reason: body.reason });
      return reply.code(201).send(plan);
    } catch (error) { return routeError(error, request, reply); }
  });
  app.patch("/api/v2/admin/billing/recharge-plans/:planId", { preHandler: platformPlanHandlers }, async (request, reply) => {
    try {
      const params = adminPlanParamsSchema.parse(request.params);
      const body = adminUpdateRechargePlanSchema.parse(request.body);
      const plan = await app.paymentsService.updateAdminPlan(params.planId, body);
      await auditPaymentAdminAction(request, "billing.recharge_plan.update", plan.id, { after: { active: plan.active, amountCents: plan.amountCents, credits: plan.credits, key: plan.key, validityDays: plan.validityDays }, reason: body.reason });
      return reply.send(plan);
    } catch (error) { return routeError(error, request, reply); }
  });
  app.get("/api/v2/admin/billing/payments", { preHandler: platformPaymentHandlers }, async (request, reply) => {
    try { return reply.send(await app.paymentsService.listAdminPayments(adminPaymentListSchema.parse(request.query))); } catch (error) { return routeError(error, request, reply); }
  });
  app.post("/api/v2/admin/billing/payments/:paymentId/query", { preHandler: platformPaymentHandlers }, async (request, reply) => {
    try {
      const params = paymentParamsSchema.parse(request.params);
      const payment = await app.paymentsService.queryAdminPayment(params.paymentId);
      await auditPaymentAdminAction(request, "billing.payment.query", params.paymentId, { status: payment.status });
      return reply.send(payment);
    } catch (error) { return routeError(error, request, reply); }
  });
  app.post("/api/v2/admin/billing/payments/:paymentId/refund", { preHandler: platformRefundHandlers }, async (request, reply) => {
    try {
      const params = paymentParamsSchema.parse(request.params);
      const body = adminRefundPaymentSchema.parse(request.body);
      const payment = await app.paymentsService.refundAdminPayment(params.paymentId, body.reason);
      await auditPaymentAdminAction(request, "billing.payment.refund", params.paymentId, { reason: body.reason, status: payment.status });
      return reply.send(payment);
    } catch (error) { return routeError(error, request, reply); }
  });
  app.post("/api/v2/billing/payment/create-checkout", { preHandler: [requireAuth] }, async (request, reply) => {
    try { const body = createPaymentCheckoutSchema.parse(request.body); return reply.code(201).send(await app.paymentsService.createCheckout(request.ctx.userId!, body)); } catch (error) { return routeError(error, request, reply); }
  });
  app.get("/api/v2/billing/payments/:paymentId", { preHandler: [requireAuth] }, async (request, reply) => {
    try { const params = paymentParamsSchema.parse(request.params); return reply.send(await app.paymentsService.getUserPayment(request.ctx.userId!, params.paymentId)); } catch (error) { return routeError(error, request, reply); }
  });
  app.post("/api/v2/billing/payment/xunhu/notify", async (request, reply) => {
    try {
      const form = request.body as FormFields;
      if (form.appid !== app.paymentsService.appId || !verifyXunhuSignature(form, app.paymentsService.appSecret)) return sendError(request, reply, 400, "PAYMENT_CALLBACK_SIGNATURE_INVALID", "Payment notification signature is invalid");
      await app.paymentsService.applyNotification(parseNotification(form));
      return reply.type("text/plain").send("success");
    } catch (error) { return routeError(error, request, reply); }
  });
}
