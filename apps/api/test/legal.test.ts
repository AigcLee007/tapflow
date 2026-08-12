import Fastify from "fastify";
import { afterEach, describe, expect, test } from "vitest";

import { registerLegalRoutes } from "../src/modules/legal/legal.routes.js";
import { LegalService } from "../src/modules/legal/legal.service.js";

const apps: Array<ReturnType<typeof buildLegalApp>> = [];

function buildLegalApp() {
  const app = Fastify({ logger: false });
  app.decorate("legalService", new LegalService({ legalContactUrl: "https://example.test/contact" }));
  registerLegalRoutes(app);
  return app;
}

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

describe("public legal routes", () => {
  test("publishes the current anonymous legal manifest", async () => {
    const app = buildLegalApp();
    apps.push(app);

    const response = await app.inject({ method: "GET", url: "/api/v2/legal/manifest" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      privacy: { effectiveAt: "2026-08-12", requiresConsent: true, version: "2026-08-12" },
      terms: { effectiveAt: "2026-08-12", requiresConsent: true, version: "2026-08-12" },
    });
  });

  test("publishes Aittco terms and privacy documents without authorization", async () => {
    const app = buildLegalApp();
    apps.push(app);

    const [termsResponse, privacyResponse] = await Promise.all([
      app.inject({ method: "GET", url: "/api/v2/legal/documents/terms" }),
      app.inject({ method: "GET", url: "/api/v2/legal/documents/privacy" }),
    ]);

    expect(termsResponse.statusCode).toBe(200);
    expect(privacyResponse.statusCode).toBe(200);
    const terms = termsResponse.json();
    const privacy = privacyResponse.json();
    expect(terms.operatorName).toBe("Aittco");
    expect(terms.title).toBe("Aittco 用户协议");
    expect(privacy.title).toBe("Aittco 隐私政策");
    expect(terms.contactUrl).toBe("https://example.test/contact");
    expect(JSON.stringify([terms, privacy])).not.toContain("TapFlow 用户协议");
    expect(JSON.stringify([terms, privacy])).not.toContain("TapFlow 隐私政策");
  });

  test("returns a stable not-found error for an unsupported legal document", async () => {
    const app = buildLegalApp();
    apps.push(app);

    const response = await app.inject({ method: "GET", url: "/api/v2/legal/documents/cookies" });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({
      error: { code: "LEGAL_DOCUMENT_NOT_FOUND" },
    });
  });
});
