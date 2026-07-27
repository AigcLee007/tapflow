import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { ZodError } from "zod";

import { requireAuth } from "../../http/auth-middleware.js";
import { parseCnyToCents, verifyXunhuSignature } from "./xunhu.client.js";
import { PaymentsApiError } from "./payments.service.js";
import { createPaymentCheckoutSchema, paymentParamsSchema } from "./payments.schemas.js";

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
