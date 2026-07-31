import { createHash, timingSafeEqual } from "node:crypto";

export type XunhuConfig = { appId: string; appSecret: string; baseUrl: string; notifyUrl: string; returnUrl: string; timeoutMs: number };
export type XunhuFields = Record<string, string | number | null | undefined>;

export function formatCnyFromCents(cents: number): string {
  if (!Number.isSafeInteger(cents) || cents <= 0) throw new Error("CNY cents must be a positive safe integer");
  return (cents / 100).toFixed(2);
}

export function parseCnyToCents(value: string): number {
  if (!/^\d+(?:\.\d{1,2})?$/.test(value.trim())) throw new Error("Invalid CNY amount");
  const [whole, fraction = ""] = value.trim().split(".");
  const cents = Number(whole) * 100 + Number((fraction + "00").slice(0, 2));
  if (!Number.isSafeInteger(cents) || cents <= 0) throw new Error("Invalid CNY amount");
  return cents;
}

export function signXunhuFields(fields: XunhuFields, secret: string): string {
  const stringA = Object.entries(fields)
    .filter(([key, value]) => key !== "hash" && value !== null && value !== undefined && value !== "")
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${String(value)}`)
    .join("&");
  return createHash("md5").update(`${stringA}${secret}`, "utf8").digest("hex");
}

export function verifyXunhuSignature(fields: XunhuFields, secret: string): boolean {
  const actual = typeof fields.hash === "string" ? fields.hash.toLowerCase() : "";
  const expected = signXunhuFields(fields, secret);
  if (!/^[a-f0-9]{32}$/.test(actual)) return false;
  return timingSafeEqual(Buffer.from(actual), Buffer.from(expected));
}

export class XunhuClient {
  constructor(private readonly config: XunhuConfig, private readonly fetchFn: typeof fetch = fetch) {}
  async createCheckout(input: { merchantOrderId: string; amountCents: number; title: string; attach: string; nonce: string; returnUrl?: string; timestamp?: number }) {
    const fields: Record<string, string | number> = { version: "1.1", appid: this.config.appId, trade_order_id: input.merchantOrderId, total_fee: formatCnyFromCents(input.amountCents), title: input.title, time: input.timestamp ?? Math.floor(Date.now() / 1000), notify_url: this.config.notifyUrl, return_url: input.returnUrl ?? this.config.returnUrl, attach: input.attach, nonce_str: input.nonce, plugins: "tapflow" };
    const payload = { ...fields, hash: signXunhuFields(fields, this.config.appSecret) };
    const response = await this.fetchFn(`${this.config.baseUrl.replace(/\/$/, "")}/payment/do.html`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload), signal: AbortSignal.timeout(this.config.timeoutMs) });
    if (!response.ok) throw new Error(`Xunhu checkout request failed with ${response.status}`);
    const body = await response.json() as { errcode?: number; errmsg?: string; url?: string; url_qrcode?: string; openid?: string };
    if (body.errcode !== 0 || !body.url) throw new Error(body.errmsg || "Xunhu checkout rejected");
    return { checkoutUrl: body.url, qrCodeUrl: body.url_qrcode ?? null, providerOpenOrderId: body.openid ?? null };
  }

  async queryPayment(input: { merchantOrderId: string; nonce: string; timestamp?: number }) {
    const body = await this.postSigned("/payment/query.html", {
      appid: this.config.appId,
      nonce_str: input.nonce,
      out_trade_order: input.merchantOrderId,
      time: input.timestamp ?? Math.floor(Date.now() / 1000),
    });
    const data = asRecord(body.data);
    const providerState = asPaymentState(data.status ?? body.status);
    return {
      amountCents: typeof (data.total_fee ?? body.total_fee) === "string" ? parseCnyToCents(String(data.total_fee ?? body.total_fee)) : null,
      merchantOrderId: stringOrNull(data.out_trade_order ?? data.trade_order_id ?? body.out_trade_order ?? body.trade_order_id) ?? input.merchantOrderId,
      openOrderId: stringOrNull(data.open_order_id ?? body.open_order_id),
      providerState,
      transactionId: stringOrNull(data.transaction_id ?? body.transaction_id),
    };
  }

  async refundPayment(input: { merchantOrderId: string; nonce: string; reason: string; timestamp?: number }) {
    const body = await this.postSigned("/payment/refund.html", {
      appid: this.config.appId,
      nonce_str: input.nonce,
      reason: input.reason,
      time: input.timestamp ?? Math.floor(Date.now() / 1000),
      trade_order_id: input.merchantOrderId,
    });
    return {
      merchantOrderId: stringOrNull(body.trade_order_id) ?? input.merchantOrderId,
      openOrderId: stringOrNull(body.open_order_id),
      providerState: asPaymentState(body.refund_status),
      transactionId: stringOrNull(body.transaction_id),
    };
  }

  private async postSigned(path: string, fields: Record<string, string | number>): Promise<Record<string, unknown>> {
    const payload = { ...fields, hash: signXunhuFields(fields, this.config.appSecret) };
    const response = await this.fetchFn(`${this.config.baseUrl.replace(/\/$/, "")}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(this.config.timeoutMs),
    });
    if (!response.ok) throw new Error(`Xunhu request failed with ${response.status}`);
    const body = asRecord(await response.json());
    if (body.errcode !== 0) throw new Error(typeof body.errmsg === "string" ? body.errmsg : "Xunhu request rejected");
    return body;
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid Xunhu response");
  return value as Record<string, unknown>;
}

function asPaymentState(value: unknown): "OD" | "CD" | "RD" | "UD" | "WP" {
  if (value === "OD" || value === "CD" || value === "RD" || value === "UD" || value === "WP") return value;
  throw new Error("Invalid Xunhu payment state");
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}
