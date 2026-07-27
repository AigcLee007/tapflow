import { describe, expect, test } from "vitest";

import { WalletPaymentService } from "../src/wallet-payments.js";

describe("WalletPaymentService", () => {
  test("exposes server-owned fixed recharge plan and user payment operations", () => {
    const service = new WalletPaymentService({
      pool: {} as never,
    });

    expect(service.listActivePlans).toBeTypeOf("function");
    expect(service.createPendingPayment).toBeTypeOf("function");
    expect(service.getUserPayment).toBeTypeOf("function");
    expect(service.applyVerifiedNotification).toBeTypeOf("function");
  });
});
