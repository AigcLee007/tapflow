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
  async createCheckout(input: { merchantOrderId: string; amountCents: number; title: string; attach: string; nonce: string; timestamp?: number }) {
    const fields: Record<string, string | number> = { version: "1.1", appid: this.config.appId, trade_order_id: input.merchantOrderId, total_fee: formatCnyFromCents(input.amountCents), title: input.title, time: input.timestamp ?? Math.floor(Date.now() / 1000), notify_url: this.config.notifyUrl, return_url: this.config.returnUrl, attach: input.attach, nonce_str: input.nonce, plugins: "tapflow" };
    const payload = { ...fields, hash: signXunhuFields(fields, this.config.appSecret) };
    const response = await this.fetchFn(`${this.config.baseUrl.replace(/\/$/, "")}/payment/do.html`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload), signal: AbortSignal.timeout(this.config.timeoutMs) });
    if (!response.ok) throw new Error(`Xunhu checkout request failed with ${response.status}`);
    const body = await response.json() as { errcode?: number; errmsg?: string; url?: string; url_qrcode?: string; openid?: string };
    if (body.errcode !== 0 || !body.url) throw new Error(body.errmsg || "Xunhu checkout rejected");
    return { checkoutUrl: body.url, qrCodeUrl: body.url_qrcode ?? null, providerOpenOrderId: body.openid ?? null };
  }
}
