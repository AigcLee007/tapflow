import { expect, test, vi } from "vitest";
import { PaymentReconciler } from "../src/modules/payments/payment-reconciler.js";

test("clears its running guard when a database connection cannot be acquired", async () => {
  const connect = vi.fn(async () => { throw new Error("database unavailable"); });
  const reconciler = new PaymentReconciler({
    intervalMs: 60_000,
    logger: { error: vi.fn(), info: vi.fn() },
    payments: {} as never,
    pool: { connect } as never,
  });

  await expect(reconciler.runOnce()).rejects.toThrow("database unavailable");
  await expect(reconciler.runOnce()).rejects.toThrow("database unavailable");
  expect(connect).toHaveBeenCalledTimes(2);
});
