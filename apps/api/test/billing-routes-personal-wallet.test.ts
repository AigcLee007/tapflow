import { describe, expect, test } from "vitest";

import { requireAuth } from "../src/http/auth-middleware.js";
import { registerBillingRoutes } from "../src/modules/billing/billing.routes.js";

type CapturedRoute = { options: { preHandler?: unknown[] }; url: string };

function captureRoutes(): CapturedRoute[] {
  const routes: CapturedRoute[] = [];
  const app = {
    get(url: string, options: { preHandler?: unknown[] }) {
      routes.push({ options, url });
    },
    post(url: string, options: { preHandler?: unknown[] }) {
      routes.push({ options, url });
    },
  };
  registerBillingRoutes(app as never);
  return routes;
}

describe("personal wallet billing route authorization", () => {
  test("personal wallet reads require only authentication", () => {
    const routes = captureRoutes();
    for (const url of [
      "/api/v2/billing/summary",
      "/api/v2/billing/usage-events",
      "/api/v2/billing/ledger",
    ]) {
      expect(routes.find((route) => route.url === url)?.options.preHandler).toEqual([requireAuth]);
    }
  });

  test("workspace pricing and administrator adjustment retain tenant permissions", () => {
    const routes = captureRoutes();
    expect(routes.find((route) => route.url === "/api/v2/billing/pricing")?.options.preHandler).toHaveLength(3);
    expect(routes.find((route) => route.url === "/api/v2/billing/admin/adjust")?.options.preHandler).toHaveLength(3);
  });
});
