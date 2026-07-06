import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import { pathToFileURL } from "node:url";

type Viewport = {
  height: number;
  width: number;
};

type PixelCheckOptions = {
  screenshotPath: string;
  viewport: Viewport;
};

const OUTPUT_DIR = path.join("output", "playwright");
const SMOKE_HTML_PATH = path.join(OUTPUT_DIR, "director-viewport-smoke.html");
const DESKTOP_CHECK_CODE = path.join(OUTPUT_DIR, "director-viewport-desktop-check.js");
const MOBILE_CHECK_CODE = path.join(OUTPUT_DIR, "director-viewport-mobile-check.js");
const DESKTOP_SCREENSHOT = path.join(OUTPUT_DIR, "director-viewport-desktop.png");
const MOBILE_SCREENSHOT = path.join(OUTPUT_DIR, "director-viewport-mobile.png");

export function buildDirectorViewportSmokeHtml(): string {
  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Director Desk Three Viewport Smoke</title>
    <style>
      html,
      body,
      #root {
        width: 100%;
        height: 100%;
        margin: 0;
        background: #050814;
      }
      body {
        display: grid;
        place-items: center;
      }
      .stage {
        width: min(92vw, 980px);
        height: min(78vh, 620px);
        border: 1px solid rgba(255, 255, 255, 0.12);
      }
      @media (max-width: 640px) {
        .stage {
          width: 100vw;
          height: 100vh;
          border: 0;
        }
      }
    </style>
  </head>
  <body>
    <div id="root"></div>
    <script type="module">
      import React from 'react';
      import { createRoot } from 'react-dom/client';
      import { DirectorDeskThreeViewport } from '/src/flowCanvas/studios/DirectorDeskThreeViewport.tsx';

      const actors = [
        {
          id: 'actor-1',
          name: 'Actor A',
          kind: 'placeholder_humanoid',
          position: [0, 0, 0],
          rotation: [0, 0, 0],
          scale: [1, 1, 1],
          visible: true,
          locked: false,
        },
        {
          id: 'actor-2',
          name: 'Actor B',
          kind: 'image_plane',
          assetId: 'asset-actor-image-1',
          position: [0.95, 0, -0.35],
          rotation: [0, 0.2, 0],
          scale: [0.86, 0.86, 0.86],
          visible: true,
          locked: false,
        },
      ];
      const cameras = [
        {
          id: 'camera-1',
          name: 'Main camera',
          position: [0, 2, 4],
          target: [0, 0.8, 0],
        },
      ];
      const shots = [
        {
          id: 'shot-1',
          cameraId: 'camera-1',
          startMs: 0,
          durationMs: 3000,
          motion: 'orbit',
          cameraSnapshot: {
            name: 'Smoke orbit',
            position: [1.5, 2.25, 4.75],
            target: [0, 1.1, 0],
            focalMm: 55,
          },
        },
      ];

      createRoot(document.getElementById('root')).render(
        React.createElement(
          'div',
          { className: 'stage', 'data-testid': 'director-viewport-smoke-stage' },
          React.createElement(DirectorDeskThreeViewport, {
            actors,
            cameras,
            scene: { backgroundAssetId: 'asset-scene-bg-1', gridVisible: true, units: 'meters' },
            selectedId: 'shot-1',
            selectedType: 'shot',
            shots,
          }),
        ),
      );
    </script>
  </body>
</html>
`;
}

export function buildDirectorViewportPixelCheckCode(options: PixelCheckOptions): string {
  const screenshotPath = options.screenshotPath.replaceAll("\\", "/");
  return `(async (page) => {
await page.setViewportSize(${JSON.stringify(options.viewport)});
await page.waitForSelector('[data-testid="director-three-viewport"] canvas', { timeout: 15000 });
await page.waitForTimeout(900);

const result = await page.evaluate(() => {
  const host = document.querySelector('[data-testid="director-three-viewport"]');
  const canvas = host?.querySelector('canvas');
  if (!host || !canvas) {
    return { ok: false, reason: 'missing canvas', renderer: host?.getAttribute('data-renderer') };
  }

  const gl = canvas.getContext("webgl2") || canvas.getContext("webgl");
  if (!gl) {
    return {
      ok: false,
      reason: 'missing webgl',
      renderer: host.getAttribute('data-renderer'),
      width: canvas.width,
      height: canvas.height,
    };
  }

  const points = [
    [0.5, 0.5],
    [0.35, 0.45],
    [0.65, 0.55],
    [0.5, 0.7],
    [0.25, 0.75],
  ];
  const pixels = points.map(([px, py]) => {
    const x = Math.max(0, Math.min(canvas.width - 1, Math.floor(canvas.width * px)));
    const y = Math.max(0, Math.min(canvas.height - 1, Math.floor(canvas.height * py)));
    const data = new Uint8Array(4);
    gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, data);
    return Array.from(data);
  });
  const nonblank = pixels.some(([r, g, b, a]) => a > 0 && (r > 16 || g > 16 || b > 34));
  return {
    actorCount: host.getAttribute('data-actor-count'),
    cameraCount: host.getAttribute('data-camera-count'),
    ok: nonblank,
    pixels,
    renderer: host.getAttribute('data-renderer'),
    selectedShotId: host.getAttribute('data-selected-shot-id'),
    width: canvas.width,
    height: canvas.height,
  };
});

await page.screenshot({ path: ${JSON.stringify(screenshotPath)}, fullPage: true });

if (!result.ok || result.renderer !== 'three') {
  throw new Error(JSON.stringify(result));
}

return JSON.stringify(result);
})`;
}

export function parsePlaywrightCliJson(value: string): unknown {
  const parsed = JSON.parse(value);
  return typeof parsed === "string" ? JSON.parse(parsed) : parsed;
}

async function findFreePort(): Promise<number> {
  return await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close(() => resolve(port));
    });
  });
}

function quoteWindowsCommandArg(value: string): string {
  if (!value) return '""';
  if (!/[ \t"&()<>^|]/.test(value)) return value;
  return `"${value.replace(/(["^&|<>])/g, "^$1")}"`;
}

function buildCommandInvocation(command: string, args: string[]): {
  args: string[];
  command: string;
} {
  if (process.platform !== "win32") {
    return { args, command };
  }
  return {
    args: [
      "/d",
      "/s",
      "/c",
      [command, ...args].map(quoteWindowsCommandArg).join(" "),
    ],
    command: "cmd.exe",
  };
}

function runCommand(command: string, args: string[], options?: { timeoutMs?: number }): Promise<string> {
  return new Promise((resolve, reject) => {
    const invocation = buildCommandInvocation(command, args);
    const child = spawn(invocation.command, invocation.args, {
      cwd: process.cwd(),
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    const timeout = options?.timeoutMs
      ? setTimeout(() => {
          child.kill();
          reject(new Error(`${command} ${args.join(" ")} timed out after ${options.timeoutMs}ms`));
        }, options.timeoutMs)
      : null;

    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", (error) => {
      if (timeout) clearTimeout(timeout);
      reject(error);
    });
    child.on("close", (code) => {
      if (timeout) clearTimeout(timeout);
      if (code === 0) {
        resolve(stdout.trim());
        return;
      }
      reject(new Error(`${command} ${args.join(" ")} failed with ${code}\n${stdout}\n${stderr}`));
    });
  });
}

function spawnVite(port: number): ChildProcessWithoutNullStreams {
  const invocation = buildCommandInvocation(process.platform === "win32" ? "npm.cmd" : "npm", [
    "run",
    "dev",
    "--",
    "--host",
    "127.0.0.1",
    "--port",
    String(port),
  ]);
  return spawn(invocation.command, invocation.args, {
    cwd: process.cwd(),
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
}

async function waitForServer(url: string, timeoutMs = 30_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // Keep polling until the deadline.
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function stopProcessTree(child: ChildProcessWithoutNullStreams): Promise<void> {
  if (!child.pid) return;
  if (process.platform === "win32") {
    await runCommand("taskkill", ["/PID", String(child.pid), "/T", "/F"]).catch(() => "");
    return;
  }
  child.kill("SIGTERM");
}

async function runPixelCheck(session: string, codePath: string): Promise<string> {
  const command = process.platform === "win32" ? "npx.cmd" : "npx";
  return await runCommand(command, [
    "--yes",
    "--package",
    "@playwright/cli",
    "playwright-cli",
    `-s=${session}`,
    "--raw",
    "run-code",
    "--filename",
    codePath,
  ], { timeoutMs: 60_000 });
}

async function runSmoke(): Promise<void> {
  const port = await findFreePort();
  const session = `tapflow-director3d-${Date.now()}`;
  const pageUrl = `http://127.0.0.1:${port}/${SMOKE_HTML_PATH.replaceAll("\\", "/")}`;
  const vite = spawnVite(port);

  try {
    await mkdir(OUTPUT_DIR, { recursive: true });
    await writeFile(SMOKE_HTML_PATH, buildDirectorViewportSmokeHtml(), "utf8");
    await writeFile(DESKTOP_CHECK_CODE, buildDirectorViewportPixelCheckCode({
      screenshotPath: DESKTOP_SCREENSHOT,
      viewport: { height: 720, width: 1280 },
    }), "utf8");
    await writeFile(MOBILE_CHECK_CODE, buildDirectorViewportPixelCheckCode({
      screenshotPath: MOBILE_SCREENSHOT,
      viewport: { height: 844, width: 390 },
    }), "utf8");
    await waitForServer(`http://127.0.0.1:${port}/`);

    const command = process.platform === "win32" ? "npx.cmd" : "npx";
    await runCommand(command, [
      "--yes",
      "--package",
      "@playwright/cli",
      "playwright-cli",
      `-s=${session}`,
      "open",
      pageUrl,
    ], { timeoutMs: 60_000 });

    const desktop = await runPixelCheck(session, DESKTOP_CHECK_CODE);
    const mobile = await runPixelCheck(session, MOBILE_CHECK_CODE);

    console.log(JSON.stringify({
      desktop: parsePlaywrightCliJson(desktop),
      mobile: parsePlaywrightCliJson(mobile),
      screenshots: [DESKTOP_SCREENSHOT, MOBILE_SCREENSHOT],
      smokePage: SMOKE_HTML_PATH,
      status: "ok",
    }, null, 2));
  } finally {
    const command = process.platform === "win32" ? "npx.cmd" : "npx";
    await runCommand(command, [
      "--yes",
      "--package",
      "@playwright/cli",
      "playwright-cli",
      `-s=${session}`,
      "close",
    ], { timeoutMs: 30_000 }).catch(() => "");
    await stopProcessTree(vite);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runSmoke().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
