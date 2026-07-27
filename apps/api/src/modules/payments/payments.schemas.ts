import { z } from "zod";

export const createPaymentCheckoutSchema = z.object({
  planKey: z.string().trim().min(1).max(64),
  idempotencyKey: z.string().trim().min(1).max(255),
}).strict();

export const paymentParamsSchema = z.object({ paymentId: z.string().uuid() });

export type CreatePaymentCheckoutInput = z.infer<typeof createPaymentCheckoutSchema>;
