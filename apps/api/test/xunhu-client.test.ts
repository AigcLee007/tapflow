import { describe, expect, test } from "vitest";
import { XunhuClient, formatCnyFromCents, parseCnyToCents, signXunhuFields, verifyXunhuSignature } from "../src/modules/payments/xunhu.client.js";

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

describe("XunhuPay operations", () => {
  test("queries an order with the documented out_trade_order field", async () => {
    let request: Request | null = null;
    const client = new XunhuClient({
      appId: "app",
      appSecret: "secret",
      baseUrl: "https://api.example.test",
      notifyUrl: "https://app.example.test/notify",
      returnUrl: "https://app.example.test/billing",
      timeoutMs: 1_000,
    }, async (input, init) => {
      request = new Request(input, init);
      return new Response(JSON.stringify({
        errcode: 0,
        data: { open_order_id: "open-1", status: "OD", total_fee: "9.90" },
        errmsg: "success",
      }), { headers: { "content-type": "application/json" } });
    });

    await expect(client.queryPayment({ merchantOrderId: "TF0001", nonce: "nonce", timestamp: 1 })).resolves.toMatchObject({
      openOrderId: "open-1",
      providerState: "OD",
    });
    expect(request?.url).toBe("https://api.example.test/payment/query.html");
    expect(JSON.parse(request?.body ? await request.text() : "{}")).toMatchObject({ out_trade_order: "TF0001" });
  });

  test("requests a refund with the merchant order and maps its provider state", async () => {
    const client = new XunhuClient({
      appId: "app",
      appSecret: "secret",
      baseUrl: "https://api.example.test",
      notifyUrl: "https://app.example.test/notify",
      returnUrl: "https://app.example.test/billing",
      timeoutMs: 1_000,
    }, async () => new Response(JSON.stringify({
      errcode: 0,
      refund_status: "RD",
      trade_order_id: "TF0001",
    }), { headers: { "content-type": "application/json" } }));

    await expect(client.refundPayment({ merchantOrderId: "TF0001", nonce: "nonce", reason: "duplicate payment", timestamp: 1 })).resolves.toMatchObject({
      merchantOrderId: "TF0001",
      providerState: "RD",
    });
  });
});
