import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import { pathToFileURL } from "node:url";

type Viewport = {
  height: number;
  width: number;
};

type CheckOptions = {
  screenshotPath: string;
  viewport: Viewport;
};

const OUTPUT_DIR = path.join("output", "playwright");
const SMOKE_HTML_PATH = path.join(OUTPUT_DIR, "production-studios-smoke.html");
const CHECK_CODE_PATH = path.join(OUTPUT_DIR, "production-studios-check.js");
const SCREENSHOT_PATH = path.join(OUTPUT_DIR, "production-studios-smoke.png");

export function buildProductionStudiosSmokeHtml(): string {
  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Production Studios Smoke</title>
    <style>
      html,
      body,
      #root {
        width: 100%;
        height: 100%;
        margin: 0;
        background: #020617;
      }
    </style>
  </head>
  <body>
    <div id="root" data-testid="production-studios-smoke-root"></div>
    <script type="module">
      import React from 'react';
      import { createRoot } from 'react-dom/client';
      import { MenuSelect } from '/src/components/menu/MenuSelect.tsx';
      import { ImagePromptActionRow } from '/src/flowCanvas/nodes/ImagePromptActionRow.tsx';
      import { ProductionStudioShell } from '/src/flowCanvas/studios/ProductionStudioShell.tsx';
      import {
        IMAGE_GENERATION_MODE_OPTIONS,
        buildImageGenerationModeParamPatch,
        normalizeImageGenerationMode,
      } from '/src/flowCanvas/utils/imageGenerationModes.ts';

      const root = createRoot(document.getElementById('root'));
      function ImageModeSmoke() {
        const [mode, setMode] = React.useState('standard');
        const patch = buildImageGenerationModeParamPatch(mode);
        const setProductionMode = (value) => {
          const nextMode = normalizeImageGenerationMode(value);
          const nextPatch = buildImageGenerationModeParamPatch(nextMode);
          setMode(nextMode);
          window.productionStudiosSmokeState.imageModePatches.push({ mode: nextMode, patch: nextPatch });
        };

        return React.createElement(
          'div',
          {
            'data-testid': 'image-production-mode-smoke',
            style: {
              boxSizing: 'border-box',
              minHeight: '100%',
              padding: 28,
              color: '#e2e8f0',
              fontFamily: 'Inter, system-ui, sans-serif',
            },
          },
          React.createElement('h1', { style: { fontSize: 18, margin: '0 0 14px' } }, '图片生产模式'),
          React.createElement(ImagePromptActionRow, {
            batchCount: 1,
            creditsValue: '24',
            isGenerating: false,
            modelControl: React.createElement('button', { type: 'button' }, '模型'),
            settingsControl: React.createElement('button', { type: 'button' }, '设置'),
            quantityControl: React.createElement('button', { type: 'button' }, '1x'),
            generationModeControl: React.createElement(
              'div',
              { style: { minWidth: 168 } },
              React.createElement(MenuSelect, {
                label: '图片生成模式',
                onChange: setProductionMode,
                options: IMAGE_GENERATION_MODE_OPTIONS.map((option) => ({
                  label: option.label,
                  value: option.mode,
                })),
                size: 'compact',
                value: mode,
              }),
            ),
            onGenerate: () => {
              window.productionStudiosSmokeState.imageGenerateClicks.push({ mode, patch });
            },
          }),
          React.createElement(
            'pre',
            {
              'data-testid': 'image-production-mode-patch',
              style: {
                marginTop: 18,
                overflow: 'auto',
                borderRadius: 12,
                border: '1px solid rgba(148,163,184,0.2)',
                background: 'rgba(15,23,42,0.82)',
                padding: 14,
                fontSize: 12,
              },
            },
            JSON.stringify({ mode, patch }, null, 2),
          ),
        );
      }

      const nodes = {
        director3d: {
          id: 'director-node',
          type: 'director3d',
          position: { x: 0, y: 0 },
          data: {
            kind: 'director3d',
            title: '3D导演台',
            width: 340,
            height: 220,
            status: 'idle',
            director3d: {
              version: 1,
              scene: { gridVisible: true, units: 'meters' },
              actors: [
                {
                  id: 'actor-1',
                  name: '角色 A',
                  kind: 'placeholder_humanoid',
                  position: [0, 0, 0],
                  rotation: [0, 0, 0],
                  scale: [1, 1, 1],
                  visible: true,
                  locked: false,
                },
              ],
              cameras: [{ id: 'camera-1', name: '主镜头', position: [0, 2, 6], target: [0, 1, 0] }],
              shots: [{ id: 'shot-1', cameraId: 'camera-1', startMs: 0, durationMs: 3000, motion: 'static', generatedAssetId: 'asset-director-shot-smoke' }],
            },
          },
        },
        storyboard: {
          id: 'storyboard-node',
          type: 'storyboard',
          position: { x: 0, y: 0 },
          data: {
            kind: 'storyboard',
            title: '故事板',
            width: 360,
            height: 260,
            status: 'idle',
            storyboard: {
              aspect: '16:9',
              grid: '3x2',
              selectedIndex: 0,
              cells: [
                { id: 'cell-1', shotNo: 1, title: '开场', prompt: '城市远景', assetId: 'asset-story-1' },
                { id: 'cell-2', shotNo: 2, title: '近景', prompt: '角色回头', assetId: 'asset-story-2' },
              ],
            },
          },
        },
        video_editor: {
          id: 'video-node',
          type: 'video_editor',
          position: { x: 0, y: 0 },
          data: {
            kind: 'video_editor',
            title: '剪辑工程',
            width: 360,
            height: 220,
            status: 'idle',
            videoEditor: {
              version: 1,
              aspect: '16:9',
              resolution: '1920x1080',
              timeline: {
                audio: [
                  { id: 'audio-1', assetId: 'asset-audio-1', track: 1, startMs: 0, inMs: 0, outMs: 3000, volume: 1 },
                ],
                clips: [
                  { id: 'clip-1', assetId: 'asset-video-1', kind: 'video', track: 1, startMs: 0, inMs: 0, outMs: 3000, speed: 1 },
                ],
                durationMs: 3000,
                subtitles: [],
              },
            },
          },
        },
        video_editor_placeholder: {
          id: 'video-node-placeholder',
          type: 'video_editor',
          position: { x: 0, y: 0 },
          data: {
            kind: 'video_editor',
            title: '剪辑工程',
            width: 360,
            height: 220,
            status: 'idle',
            videoEditor: {
              version: 1,
              aspect: '16:9',
              resolution: '1920x1080',
              timeline: {
                audio: [],
                clips: [
                  { id: 'clip-1', assetId: 'placeholder-video-1', kind: 'video', track: 1, startMs: 0, inMs: 0, outMs: 3000, speed: 1 },
                ],
                durationMs: 3000,
                subtitles: [],
              },
            },
          },
        },
      };

      window.productionStudiosSmokeState = {
        current: 'director3d',
        patches: [],
        requests: [],
        imageGenerateClicks: [],
        imageModePatches: [],
        directorVideoSyncs: [],
        storyboardSyncs: [],
        storyboardVideoSyncs: [],
      };

      window.renderProductionStudioSmoke = (key) => {
        window.productionStudiosSmokeState.current = key;
        if (key === 'image_modes') {
          root.render(React.createElement(ImageModeSmoke, { key }));
          return;
        }
        const node = nodes[key];
        const studio = key === 'video_editor_placeholder' ? 'video_editor' : key;
        root.render(
          React.createElement(ProductionStudioShell, {
            key,
            studio,
            node,
            onClose: () => {},
            onCreateCanvasNodeFromStudio: (request) => window.productionStudiosSmokeState.requests.push(request),
            onSyncDirectorShotToStoryboard: (request) => window.productionStudiosSmokeState.storyboardSyncs.push(request),
            onSyncDirectorShotsToVideoEditor: (request) => window.productionStudiosSmokeState.directorVideoSyncs.push(request),
            onSyncStoryboardToVideoEditor: (request) => window.productionStudiosSmokeState.storyboardVideoSyncs.push(request),
            onUpdateNodeData: (nodeId, patch) => window.productionStudiosSmokeState.patches.push({ nodeId, patch }),
          }),
        );
      };

      window.renderProductionStudioSmoke('director3d');
    </script>
  </body>
</html>
`;
}

export function buildProductionStudiosCheckCode(options: CheckOptions): string {
  const screenshotPath = options.screenshotPath.replaceAll("\\", "/");
  return `(async (page) => {
await page.setViewportSize(${JSON.stringify(options.viewport)});
await page.waitForSelector('[data-testid="storyai-director-desk"]', { timeout: 15000 });
await page.waitForSelector('[data-testid="storyai-director-toolbar"]', { timeout: 15000 });
const directorReady = await page.locator('section[role="dialog"][aria-label="3D导演台"]').count();

async function dispatchAssetDrop(selector, assetId) {
  await page.locator(selector).evaluate((element, targetAssetId) => {
    const dataTransfer = new DataTransfer();
    dataTransfer.setData('application/x-tapflow-asset-id', targetAssetId);
    dataTransfer.setData('text/plain', 'https://signed.example.com/ignored-preview.png');
    element.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer }));
    element.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer }));
  }, assetId);
}

await page.locator('[data-testid="storyai-add-character"]').click();
await page.locator('[data-testid="storyai-add-character-mannequin"]').click();
await page.waitForFunction(() =>
  window.productionStudiosSmokeState.patches.some((entry) =>
    entry.nodeId === 'director-node' &&
    entry.patch?.director3d?.actors?.length > 1
  ),
  null,
  { timeout: 15000 },
);

await page.evaluate(() => window.renderProductionStudioSmoke('storyboard'));
await page.waitForSelector('section[role="dialog"][aria-label="故事板"]', { timeout: 15000 });
await dispatchAssetDrop('button[aria-label="选择镜头 1"]', 'asset-storyboard-smoke');
await page.locator('button[aria-label="合成故事板图"]').click();

await page.evaluate(() => window.renderProductionStudioSmoke('video_editor'));
await page.waitForSelector('section[role="dialog"][aria-label="剪辑工程"]', { timeout: 15000 });
await dispatchAssetDrop('button[aria-label="选择片段 clip-1"]', 'asset-video-clip-smoke');
await dispatchAssetDrop('button[aria-label="选择音频 audio-1"]', 'asset-audio-smoke');
await page.locator('button[aria-label="选择输出规格 1:1 1080p"]').click();
await page.locator('button[aria-label="导出到画布"]').click();

await page.evaluate(() => window.renderProductionStudioSmoke('video_editor_placeholder'));
await page.waitForSelector('section[role="dialog"][aria-label="剪辑工程"]', { timeout: 15000 });
await page.waitForSelector('text=请先绑定素材库资产', { timeout: 15000 });
const placeholderExportDisabled = await page.locator('button[aria-label="导出到画布"]').isDisabled();

await page.evaluate(() => window.renderProductionStudioSmoke('image_modes'));
await page.waitForSelector('[data-testid="image-production-mode-smoke"]', { timeout: 15000 });
await page.locator('button[aria-label="图片生成模式 标准"]').click();
await page.locator('button[role="menuitem"]').filter({ hasText: '360°全景' }).click();
await page.waitForSelector('text=panorama_360', { timeout: 15000 });
await page.locator('button[aria-label="图片生成模式 360°全景"]').click();
await page.locator('button[role="menuitem"]').filter({ hasText: '主体三面展开' }).click();
await page.waitForSelector('text=subject_orbit_270', { timeout: 15000 });
await page.locator('button[aria-label="开始生成"]').click();

const result = await page.evaluate(() => {
  const state = window.productionStudiosSmokeState;
  const videoPatch = state.patches.find((entry) =>
    entry.nodeId === 'video-node' &&
    entry.patch?.videoEditor?.aspect === '1:1' &&
    entry.patch?.videoEditor?.resolution === '1080x1080'
  );
  const directorStoryAiPatch = state.patches.find((entry) =>
    entry.nodeId === 'director-node' &&
    entry.patch?.director3d?.actors?.length > 1 &&
    entry.patch?.director3d?.storyAiProject?.objects?.some?.((object) =>
      object.kind === 'character' &&
      object.name === '角色02'
    )
  );
  const directorPatchJson = JSON.stringify(directorStoryAiPatch?.patch ?? null);
  const directorPatchSafe = Boolean(directorStoryAiPatch) && !/(?:blob:|data:|https?:\\/\\/)/i.test(directorPatchJson);
  const storyboardDropPatch = state.patches.find((entry) =>
    entry.nodeId === 'storyboard-node' &&
    entry.patch?.storyboard?.cells?.some?.((cell) =>
      cell.id === 'cell-1' &&
      cell.assetId === 'asset-storyboard-smoke'
    )
  );
  const videoClipDropPatch = state.patches.find((entry) =>
    entry.nodeId === 'video-node' &&
    entry.patch?.videoEditor?.timeline?.clips?.some?.((clip) =>
      clip.id === 'clip-1' &&
      clip.assetId === 'asset-video-clip-smoke'
    )
  );
  const videoAudioDropPatch = state.patches.find((entry) =>
    entry.nodeId === 'video-node' &&
    entry.patch?.videoEditor?.timeline?.audio?.some?.((audio) =>
      audio.id === 'audio-1' &&
      audio.assetId === 'asset-audio-smoke'
    )
  );
  const storyboardSheetRequest = state.requests.find((request) =>
    request.kind === 'image' &&
    request.data?.params?.storyboardSheet?.sourceStoryboardNodeId === 'storyboard-node'
  );
  const videoExportRequest = state.requests.find((request) =>
    request.kind === 'video' &&
    request.data?.routeKey === 'video.editor.ffmpeg' &&
    request.data?.params?.videoEditor?.sourceVideoEditorNodeId === 'video-node'
  );
  const imagePanoramaPatch = state.imageModePatches.find((entry) =>
    entry.mode === 'panorama_360' &&
    entry.patch?.generationMode === 'panorama_360' &&
    entry.patch?.panorama?.projectionHint === 'equirectangular' &&
    entry.patch?.panorama?.subjectType === 'scene' &&
    entry.patch?.wraparound === undefined
  );
  const imageSubject270Patch = state.imageModePatches.find((entry) =>
    entry.mode === 'subject_orbit_270' &&
    entry.patch?.generationMode === 'subject_orbit_270' &&
    entry.patch?.panorama === undefined &&
    entry.patch?.wraparound?.coverageDegrees === 270 &&
    entry.patch?.wraparound?.layout === 'three_panel_sheet' &&
    entry.patch?.wraparound?.panels === 3 &&
    entry.patch?.wraparound?.subjectType === 'subject'
  );
  const imageGenerateClick = state.imageGenerateClicks.find((entry) =>
    entry.mode === 'subject_orbit_270' &&
    entry.patch?.generationMode === 'subject_orbit_270'
  );
  return {
    directorPatchSafe,
    directorStoryAiPatch: Boolean(directorStoryAiPatch),
    imageGenerateClick: Boolean(imageGenerateClick),
    imagePanoramaPatch: Boolean(imagePanoramaPatch),
    imageSubject270Patch: Boolean(imageSubject270Patch),
    patchCount: state.patches.length,
    requestCount: state.requests.length,
    storyboardDropPatch: Boolean(storyboardDropPatch),
    storyboardSheetRequest: Boolean(storyboardSheetRequest),
    videoAudioDropPatch: Boolean(videoAudioDropPatch),
    videoClipDropPatch: Boolean(videoClipDropPatch),
    videoExportRequest: Boolean(videoExportRequest),
    videoSquarePatch: Boolean(videoPatch),
  };
});
result.directorReady = directorReady === 1;
result.placeholderExportDisabled = placeholderExportDisabled;

await page.screenshot({ path: ${JSON.stringify(screenshotPath)}, fullPage: true });

if (
  !result.directorReady ||
  !result.directorStoryAiPatch ||
  !result.directorPatchSafe ||
  !result.imageGenerateClick ||
  !result.imagePanoramaPatch ||
  !result.imageSubject270Patch ||
  !result.storyboardDropPatch ||
  !result.storyboardSheetRequest ||
  !result.videoAudioDropPatch ||
  !result.videoClipDropPatch ||
  !result.videoExportRequest ||
  !result.videoSquarePatch ||
  !result.placeholderExportDisabled
) {
  throw new Error(JSON.stringify(result));
}

return JSON.stringify({
  ...result,
  screenshot: ${JSON.stringify(screenshotPath)},
  status: 'ok',
});
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

async function runPlaywrightCode(session: string, codePath: string): Promise<string> {
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
  const session = `tapflow-production-studios-${Date.now()}`;
  const pageUrl = `http://127.0.0.1:${port}/${SMOKE_HTML_PATH.replaceAll("\\", "/")}`;
  const vite = spawnVite(port);

  try {
    await mkdir(OUTPUT_DIR, { recursive: true });
    await writeFile(SMOKE_HTML_PATH, buildProductionStudiosSmokeHtml(), "utf8");
    await writeFile(CHECK_CODE_PATH, buildProductionStudiosCheckCode({
      screenshotPath: SCREENSHOT_PATH,
      viewport: { height: 720, width: 1280 },
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

    const result = await runPlaywrightCode(session, CHECK_CODE_PATH);
    console.log(JSON.stringify({
      result: parsePlaywrightCliJson(result),
      screenshot: SCREENSHOT_PATH,
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
