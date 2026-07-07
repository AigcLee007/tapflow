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
    <title>StoryAI Director Desk Smoke</title>
    <style>
      html,
      body,
      #root {
        width: 100%;
        height: 100%;
        margin: 0;
        background: #050814;
      }
    </style>
  </head>
  <body>
    <div id="root"></div>
    <script type="module">
      import React from 'react';
      import { createRoot } from 'react-dom/client';
      import { StoryAiDirectorDesk } from '/src/flowCanvas/studios/StoryAiDirectorDesk.tsx';
      import { useDirectorStore } from '/src/flowCanvas/studios/storyai/editor/store/directorStore.ts';

      const initialDirectorData = {
        version: 1,
        scene: { gridVisible: true, units: 'meters' },
        actors: [
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
        ],
        cameras: [{ id: 'camera-1', name: 'Main camera', position: [0, 2.2, 9], target: [0, 1.2, 0] }],
        shots: [{ id: 'shot-1', cameraId: 'camera-1', startMs: 0, durationMs: 3000, motion: 'static' }],
      };

      window.directorDeskSmokeState = {
        closes: 0,
        patches: [],
      };
      window.directorDeskSmokeStore = useDirectorStore;

      function SmokeHarness() {
        const [data, setData] = React.useState(initialDirectorData);

        return React.createElement(StoryAiDirectorDesk, {
            data,
            nodeId: 'director-node',
            onClose: () => {
              window.directorDeskSmokeState.closes += 1;
            },
            onUpdateNodeData: (nodeId, patch) => {
              window.directorDeskSmokeState.patches.push({ nodeId, patch });
              if (patch.director3d) {
                setData(patch.director3d);
              }
            },
          });
      }

      createRoot(document.getElementById('root')).render(React.createElement(SmokeHarness));
    </script>
  </body>
</html>
`;
}

export function buildDirectorViewportPixelCheckCode(options: PixelCheckOptions): string {
  const screenshotPath = options.screenshotPath.replaceAll("\\", "/");
  const sidebarWaitState = options.viewport.width < 700 ? "attached" : "visible";
  return `(async (page) => {
await page.setViewportSize(${JSON.stringify(options.viewport)});
await page.waitForSelector('[data-testid="storyai-director-desk"]', { timeout: 15000 });
await page.waitForSelector('[data-testid="storyai-director-left-sidebar"]', { state: ${JSON.stringify(sidebarWaitState)}, timeout: 15000 });
await page.waitForSelector('[data-testid="storyai-director-right-sidebar"]', { state: ${JSON.stringify(sidebarWaitState)}, timeout: 15000 });
await page.waitForSelector('[data-testid="storyai-director-toolbar"]', { timeout: 15000 });
await page.waitForSelector('[data-testid="storyai-director-canvas"] canvas', { timeout: 15000 });
await page.waitForTimeout(1600);

await page.locator('[data-testid="storyai-add-character"]').click();
await page.locator('[data-testid="storyai-add-character-mannequin"]').click();
await page.waitForFunction(() => window.directorDeskSmokeState?.patches?.length > 0, null, { timeout: 15000 });

await page.locator('button[aria-label="当前视角截图"]').first().click();
await page.waitForFunction(() => {
  const project = window.directorDeskSmokeStore?.getState?.().project;
  return Boolean(project?.cameras?.some((camera) => (camera.captures ?? []).length > 0));
}, null, { timeout: 15000 });
const capturePanelDebug = await page.evaluate(() => {
  const project = window.directorDeskSmokeStore?.getState?.().project;
  return {
    activeCameraId: project?.activeCameraId ?? null,
    cameraCaptureCardCount: document.querySelectorAll('.camera-capture-card').length,
    cameras: project?.cameras?.map((camera) => ({
      captureCount: (camera.captures ?? []).length,
      id: camera.id,
      name: camera.name,
    })) ?? [],
    rightPanelText: document.querySelector('[data-testid="storyai-director-right-sidebar"]')?.textContent ?? '',
  };
});
if (capturePanelDebug.cameraCaptureCardCount < 1) {
  throw new Error(JSON.stringify({ reason: 'camera capture card missing', capturePanelDebug }));
}

const patchCountAfterCapture = await page.evaluate(() => window.directorDeskSmokeState?.patches?.length ?? 0);
await page.evaluate(async () => {
  const input = document.querySelector('input[accept=".jpg,.jpeg,.png,.webp"]');
  if (!(input instanceof HTMLInputElement)) {
    throw new Error('missing panorama import input');
  }

  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 32;
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('missing 2d context for panorama smoke asset');
  }

  const gradient = context.createLinearGradient(0, 0, canvas.width, 0);
  gradient.addColorStop(0, '#1d4ed8');
  gradient.addColorStop(0.5, '#22c55e');
  gradient.addColorStop(1, '#f97316');
  context.fillStyle = gradient;
  context.fillRect(0, 0, canvas.width, canvas.height);

  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob((value) => {
      if (value) {
        resolve(value);
      } else {
        reject(new Error('failed to create panorama smoke blob'));
      }
    }, 'image/png');
  });
  const file = new File([blob], 'smoke-panorama.png', { type: 'image/png' });
  const dataTransfer = new DataTransfer();
  dataTransfer.items.add(file);
  input.files = dataTransfer.files;
  input.dispatchEvent(new Event('change', { bubbles: true }));
});
await page.waitForFunction((previousPatchCount) => {
  return (window.directorDeskSmokeState?.patches?.length ?? 0) > previousPatchCount;
}, patchCountAfterCapture, { timeout: 15000 });
await page.waitForFunction(() => {
  const project = window.directorDeskSmokeStore?.getState?.().project;
  const panoramaAsset = project?.assets?.find((item) => item.id === project.panoramaAssetId);
  return typeof panoramaAsset?.url === 'string' && /^(?:blob:|data:image)/i.test(panoramaAsset.url);
}, null, { timeout: 15000 });

const result = await page.evaluate(() => {
  const desk = document.querySelector('[data-testid="storyai-director-desk"]');
  const leftSidebar = document.querySelector('[data-testid="storyai-director-left-sidebar"]');
  const rightSidebar = document.querySelector('[data-testid="storyai-director-right-sidebar"]');
  const toolbar = document.querySelector('[data-testid="storyai-director-toolbar"]');
  const canvas = document.querySelector('[data-testid="storyai-director-canvas"] canvas');
  const liveProject = window.directorDeskSmokeStore?.getState?.().project;
  const latestPatch = window.directorDeskSmokeState?.patches?.at?.(-1);
  const cameraCaptureCount =
    liveProject?.cameras?.reduce((count, camera) => count + (camera.captures ?? []).length, 0) ?? 0;
  const cameraCaptureCardCount = document.querySelectorAll('.camera-capture-card').length;
  const cameraCaptureUrl = liveProject?.cameras?.flatMap((camera) => camera.captures ?? [])?.[0]?.dataUrl ?? null;
  const panoramaAsset = liveProject?.assets?.find((item) => item.id === liveProject.panoramaAssetId);
  const panoramaAssetUrl = panoramaAsset?.url ?? null;
  if (!desk || !leftSidebar || !rightSidebar || !toolbar || !canvas) {
    return {
      ok: false,
      reason: 'missing storyai director landmarks',
      hasCanvas: Boolean(canvas),
      hasDesk: Boolean(desk),
      hasLeftSidebar: Boolean(leftSidebar),
      hasRightSidebar: Boolean(rightSidebar),
      hasToolbar: Boolean(toolbar),
    };
  }

  const gl = canvas.getContext("webgl2") || canvas.getContext("webgl");
  if (!gl) {
    return {
      ok: false,
      reason: 'missing webgl',
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
  const patchJson = JSON.stringify(latestPatch ?? null);
  const safePatchHasUnsafeMedia = /(?:blob:|data:|https?:\\/\\/)/i.test(patchJson);
  return {
    actorCount: latestPatch?.patch?.director3d?.actors?.length ?? 0,
    cameraCaptureCardCount,
    cameraCaptureCount,
    hasLiveCameraCapture: typeof cameraCaptureUrl === 'string' && /^data:image/i.test(cameraCaptureUrl),
    hasLivePanoramaPreview: typeof panoramaAssetUrl === 'string' && /^(?:blob:|data:image)/i.test(panoramaAssetUrl),
    hasSafePatch: Boolean(latestPatch) && !safePatchHasUnsafeMedia,
    ok:
      nonblank &&
      Boolean(latestPatch) &&
      !safePatchHasUnsafeMedia &&
      cameraCaptureCardCount > 0 &&
      cameraCaptureCount > 0 &&
      typeof cameraCaptureUrl === 'string' &&
      /^data:image/i.test(cameraCaptureUrl) &&
      typeof panoramaAssetUrl === 'string' &&
      /^(?:blob:|data:image)/i.test(panoramaAssetUrl),
    patchNodeId: latestPatch?.nodeId ?? null,
    panoramaAssetUrl,
    pixels,
    storyAi: {
      leftSidebar: Boolean(leftSidebar),
      rightSidebar: Boolean(rightSidebar),
      toolbar: Boolean(toolbar),
    },
    width: canvas.width,
    height: canvas.height,
  };
});

await page.screenshot({ path: ${JSON.stringify(screenshotPath)}, fullPage: true });

if (
  !result.ok ||
  result.patchNodeId !== 'director-node' ||
  result.actorCount < 2 ||
  result.cameraCaptureCardCount < 1 ||
  result.cameraCaptureCount < 1 ||
  !result.hasLivePanoramaPreview
) {
  throw new Error(JSON.stringify(result));
}

return JSON.stringify(result);
})`;
}

export function parsePlaywrightCliJson(value: string): unknown {
  const trimmed = value.trim();
  if (trimmed.startsWith("### Error")) {
    throw new Error(trimmed);
  }
  const parsed = JSON.parse(trimmed);
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
