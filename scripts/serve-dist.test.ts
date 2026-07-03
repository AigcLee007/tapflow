import path from "node:path";
import http, { type Server } from "node:http";
import { describe, expect, test } from "vitest";

import { createApp, resolveStaticCacheControl } from "./serve-dist.cjs";

function listen(server: Server): Promise<string> {
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        throw new Error("Expected a TCP test server address.");
      }
      resolve(`http://127.0.0.1:${address.port}`);
    });
  });
}

function close(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

describe("serve-dist cache headers", () => {
  const distDir = path.resolve("dist");
  const indexFile = path.join(distDir, "index.html");

  test("serves version manifest without browser caching", () => {
    expect(resolveStaticCacheControl(path.join(distDir, "version.json"), { distDir, indexFile })).toBe(
      "no-store, no-cache, must-revalidate",
    );
  });

  test("keeps hashed assets immutable", () => {
    expect(resolveStaticCacheControl(path.join(distDir, "assets", "app.js"), { distDir, indexFile })).toBe(
      "public, max-age=31536000, immutable",
    );
  });

  test("proxies api requests before the SPA fallback", async () => {
    const apiServer = http.createServer((req, res) => {
      res.setHeader("content-type", "application/json");
      res.setHeader("x-test-proxied", "yes");
      res.end(JSON.stringify({ method: req.method, url: req.url }));
    });
    const originalProxyTarget = process.env.API_PROXY_TARGET;
    let frontendServer: Server | null = null;

    try {
      process.env.API_PROXY_TARGET = await listen(apiServer);
      frontendServer = createApp().listen(0, "127.0.0.1") as Server;
      const frontendUrl = await new Promise<string>((resolve) => {
        frontendServer!.once("listening", () => {
          const address = frontendServer!.address();
          if (!address || typeof address === "string") {
            throw new Error("Expected a TCP frontend address.");
          }
          resolve(`http://127.0.0.1:${address.port}`);
        });
      });

      const response = await fetch(`${frontendUrl}/api/v2/agent/sessions?limit=1`);

      expect(response.headers.get("x-test-proxied")).toBe("yes");
      await expect(response.json()).resolves.toEqual({
        method: "GET",
        url: "/api/v2/agent/sessions?limit=1",
      });
    } finally {
      if (originalProxyTarget === undefined) {
        delete process.env.API_PROXY_TARGET;
      } else {
        process.env.API_PROXY_TARGET = originalProxyTarget;
      }
      if (frontendServer) await close(frontendServer);
      await close(apiServer);
    }
  });
});
