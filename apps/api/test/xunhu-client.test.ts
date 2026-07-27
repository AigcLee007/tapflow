import { describe, expect, test } from "vitest";
import { formatCnyFromCents, parseCnyToCents, signXunhuFields, verifyXunhuSignature } from "../src/modules/payments/xunhu.client.js";

describe("XunhuPay signing", () => {
  test("sorts nonempty fields and appends the secret", () => {
    expect(signXunhuFields({ b: "2", a: "1", hash: "ignored", empty: "" }, "secret")).toBe("8d9f51949e440aa629fd1a035708473a");
  });
  test("parses exact CNY cents and verifies callbacks", () => {
    expect(formatCnyFromCents(990)).toBe("9.90"); expect(parseCnyToCents("9.9")).toBe(990);
    const fields = { appid: "app", trade_order_id: "order", total_fee: "9.90" }; const hash = signXunhuFields(fields, "secret");
    expect(verifyXunhuSignature({ ...fields, hash }, "secret")).toBe(true);
  });
});
