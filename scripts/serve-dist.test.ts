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

function requestStatus(url: string, options: http.RequestOptions & { body?: string }): Promise<number> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const request = http.request(
      {
        ...options,
        hostname: parsed.hostname,
        path: `${parsed.pathname}${parsed.search}`,
        port: parsed.port,
        protocol: parsed.protocol,
      },
      (response) => {
        response.resume();
        response.on("end", () => resolve(response.statusCode ?? 0));
      },
    );
    request.on("error", reject);
    if (options.body) request.write(options.body);
    request.end();
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

  test("does not forward hop-by-hop headers to the api service", async () => {
    let receivedHeaders: http.IncomingHttpHeaders = {};
    const apiServer = http.createServer((req, res) => {
      receivedHeaders = req.headers;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ ok: true }));
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

      const status = await requestStatus(`${frontendUrl}/api/v2/agent/sessions/session-1/tool-calls/approve/stream`, {
        body: JSON.stringify({ toolCallKey: "tool-1", turnId: "turn-1" }),
        headers: {
          "connection": "keep-alive",
          "content-type": "application/json",
          "keep-alive": "timeout=5",
          "te": "trailers",
        },
        method: "POST",
      });

      expect(status).toBe(200);
      expect(receivedHeaders.connection).not.toBe("upgrade");
      expect(receivedHeaders["keep-alive"]).toBeUndefined();
      expect(receivedHeaders.te).toBeUndefined();
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

  test("proxies agent approval post bodies and SSE chunks", async () => {
    let receivedBody = "";
    const apiServer = http.createServer((req, res) => {
      req.setEncoding("utf8");
      req.on("data", (chunk) => {
        receivedBody += chunk;
      });
      req.on("end", () => {
        res.writeHead(200, {
          "cache-control": "no-cache",
          "content-type": "text/event-stream; charset=utf-8",
        });
        res.write("event: tool_started\n");
        res.write('data: {"toolCallKey":"tool-1","toolName":"generate_image"}\n\n');
        res.end("event: turn_completed\ndata: {\"turnId\":\"turn-1\",\"finalText\":\"Queued\"}\n\n");
      });
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

      const response = await fetch(`${frontendUrl}/api/v2/agent/sessions/session-1/tool-calls/approve/stream`, {
        body: JSON.stringify({ toolCallKey: "tool-1", turnId: "turn-1" }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });

      expect(response.headers.get("content-type")).toContain("text/event-stream");
      await expect(response.text()).resolves.toContain("event: tool_started");
      expect(JSON.parse(receivedBody)).toEqual({ toolCallKey: "tool-1", turnId: "turn-1" });
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
