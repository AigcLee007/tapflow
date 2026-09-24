import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

const payloadSchema = z.object({ id: z.string().uuid(), createdAt: z.string().refine(value => Number.isFinite(Date.parse(value))), asOf: z.string().datetime(), binding: z.string() }).strict();
export type UserCursor = z.infer<typeof payloadSchema>;
const signature = (value: string, secret: string) => createHmac("sha256", secret).update(value).digest("base64url");
export function encodeUserCursor(value: UserCursor, secret: string): string {
  const body = Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${body}.${signature(body, secret)}`;
}
export function decodeUserCursor(value: string, binding: string, secret: string): UserCursor {
  const [body, supplied, extra] = value.split(".");
  if (!body || !supplied || extra) throw new Error("Invalid user cursor");
  const expected = Buffer.from(signature(body, secret));
  const actual = Buffer.from(supplied);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) throw new Error("Invalid user cursor");
  const parsed = payloadSchema.parse(JSON.parse(Buffer.from(body, "base64url").toString("utf8")));
  if (parsed.binding !== binding) throw new Error("User cursor filters changed");
  return parsed;
}
