import { describe, expect, test } from "vitest";

import { createPaymentCheckoutSchema } from "../src/modules/payments/payments.schemas.js";

describe("payment checkout request", () => {
  test("accepts only a server-selected plan and idempotency key", () => {
    expect(createPaymentCheckoutSchema.safeParse({
      planKey: "credits_100",
      idempotencyKey: "checkout:user:1",
    }).success).toBe(true);
    expect(createPaymentCheckoutSchema.safeParse({
      planKey: "credits_100",
      idempotencyKey: "checkout:user:1",
      amountCents: 1,
      credits: 999999,
    }).success).toBe(false);
  });
});
