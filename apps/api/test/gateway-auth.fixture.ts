import type { FastifyInstance } from "fastify";
import type { AuthEmailSender } from "../src/modules/auth/auth-email-sender.js";
import { expect } from "vitest";

const codes = new Map<string, string>();
export const gatewayTestEmailSender: AuthEmailSender = {
  async sendVerificationCode({ email, code }) { codes.set(email, code); },
  async sendPasswordResetCode({ email, code }) { codes.set(email, code); },
};

/** Exercise the current email verification contract without external delivery. */
export async function verifyGatewayRegistration(app: FastifyInstance, email: string, challengeToken: string) {
  const code = codes.get(email);
  expect(code).toMatch(/^\d{6}$/);
  const response = await app.inject({
    method: "POST", url: "/api/v2/auth/email/verify", payload: { challengeToken, code },
  });
  expect(response.statusCode, response.body).toBe(200);
  codes.delete(email);
  return response.json();
}
