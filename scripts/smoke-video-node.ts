import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import { pathToFileURL } from "node:url";

type Viewport = { height: number; width: number };

export type VideoNodeSmokeResult = {
  blockedGenerationDidNotCreateRun: boolean;
  cameraGridColumns: number;
  cameraPresetCount: number;
  composerVisible: boolean;
  durationRangeIsDefault: boolean;
  modelMenuNoSearch: boolean;
  parameterDialogIsTopLayer: boolean;
  resolutionOptions: string[];
};

export type VideoNodeSmokeCheckOptions = {
  desktopScreenshotPath: string;
  mobileScreenshotPath: string;
  narrowScreenshotPath: string;
};

export const VIDEO_NODE_SMOKE_DEFAULT_URL = "http://localhost:5188";
export const VIDEO_NODE_SMOKE_OUTPUT_DIR = path.join("output", "playwright", "video-node");
const SMOKE_HTML_PATH = path.join(VIDEO_NODE_SMOKE_OUTPUT_DIR, "video-node-smoke.html");
const CHECK_CODE_PATH = path.join(VIDEO_NODE_SMOKE_OUTPUT_DIR, "video-node-check.js");

export function buildVideoNodeSmokeHtml(): string {
  return `<!doctype html>
  <html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Video Node Smoke</title>
    <style>
      html, body, #root { width: 100%; height: 100%; margin: 0; background: #090a0d; }
      .react-flow__node { overflow: visible; }
    </style>
  </head>
  <body>
    <div id="root" data-testid="video-node-smoke-root"></div>
    <script type="module">
      import React, { useEffect } from 'react';
      import { createRoot } from 'react-dom/client';
      import { ReactFlow, ReactFlowProvider, useReactFlow } from '@xyflow/react';
      import '@xyflow/react/dist/style.css';
      import '/src/index.css';
      import { AuthContext } from '/src/auth/useAuth.ts';
      import { VideoNodeComponent } from '/src/flowCanvas/nodes/FlowNodes.tsx';
      import { useFlowCanvasStore } from '/src/flowCanvas/store/flowCanvasStore.ts';
      import { createDefaultVideoGenerationParams } from '/src/flowCanvas/video/videoGenerationParams.ts';

      const nativeFetch = window.fetch.bind(window);
      window.videoNodeSmokeState = { workflowRequestCount: 0 };
      window.fetch = async (input, init) => {
        const requestUrl = typeof input === 'string' ? input : input.url;
        if (requestUrl.includes('/api/v2/ai/model-catalog?modality=video')) {
          return new Response(JSON.stringify([{
            capabilities: {}, defaultRouteKey: 'video.smoke', displayName: 'CineMotion Pro', id: 'video-smoke-model',
            modality: 'video', modelFamily: 'smoke', modelId: 'cine-motion-pro', modelKey: 'video-smoke', sortOrder: 1,
            status: 'active', uiSchema: { description: '电影感运动与光线模型' },
          }]), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
        if (requestUrl.includes('/api/v2/ai/model-catalog/video-smoke/routes')) {
          return new Response(JSON.stringify([{
            capabilities: { aspectRatios: ['auto', '16:9', '4:3', '1:1', '3:4', '9:16', '21:9'], durationStepSeconds: 1,
              maxCount: 4, maxDurationSeconds: 12, minDurationSeconds: 2, resolutions: ['480P', '720P', '1080P', '4K'],
              supportedModes: ['text_to_video', 'all_reference', 'image_to_video', 'first_last_frame', 'image_reference'],
              supportedVideoWorkflows: ['video_generation'], supportsAudio: true, supportsHumanReview: false },
            estimatedCredits: 12, minChargeCredits: 12, modality: 'video', modelFamily: 'smoke', modelKey: 'video-smoke',
            pricingUnit: 'generation', providerKey: 'smoke', providerName: 'Smoke provider', routeId: 'route-smoke',
            routeKey: 'video.smoke', routeLabel: 'Line one',
          }]), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
        if (requestUrl.includes('/workflow-runs')) window.videoNodeSmokeState.workflowRequestCount += 1;
        return nativeFetch(input, init);
      };

      const auth = { authenticated: true, error: null, loading: false, permissions: [], refreshMe: async () => {},
        register: async () => {}, login: async () => {}, logout: async () => {}, roles: [], sessionId: 'smoke-session',
        tenant: { id: 'smoke-tenant' }, user: { id: 'smoke-user' } };
      const initialNode = {
        id: 'video-smoke-node', type: 'video', position: { x: Math.max(5, (window.innerWidth - 380) / 2), y: 40 }, selected: true,
        data: { kind: 'video', title: '视频', width: 380, height: 220, status: 'idle', generationStatus: 'idle',
          modelId: 'unconfigured-video', routeKey: 'video.unconfigured', generationPrompt: '在阳光充足的摄影棚中缓慢推进镜头。',
          params: { videoGeneration: { ...createDefaultVideoGenerationParams(), mode: 'all_reference', referenceRolesByKey: {
            subject: { role: 'subject', source: { kind: 'asset', id: 'asset-subject-smoke' } },
            scene: { role: 'scene', source: { kind: 'asset', id: 'asset-scene-smoke' } },
            prop: null, style: null, first_frame: null, last_frame: null, reference: null,
          } } }, createdAt: 1, updatedAt: 1 },
      };
      useFlowCanvasStore.setState({ edges: [], nodes: [initialNode], selectedNodeCount: 1, nodeOutputByNodeId: {}, nodeRunStatusByNodeId: {} });
      window.getVideoSmokeNode = () => useFlowCanvasStore.getState().nodes.find((node) => node.id === 'video-smoke-node');
      window.resetVideoSmokeBlockedNode = () => {
        window.videoNodeSmokeState.workflowRequestCount = 0;
        useFlowCanvasStore.setState((state) => ({ nodes: state.nodes.map((node) => node.id === 'video-smoke-node' ? {
          ...node, data: { ...node.data, modelId: 'unconfigured-video', status: 'idle', generationStatus: 'idle', errorCode: undefined, errorMessage: undefined }, selected: true,
        } : node), selectedNodeCount: 1 }));
      };
      window.positionVideoSmokeNode = (x) => useFlowCanvasStore.setState((state) => ({ nodes: state.nodes.map((node) => node.id === 'video-smoke-node' ? {
        ...node, position: { ...node.position, x },
      } : node) }));
      function SmokeViewportCoordinator() {
        const reactFlow = useReactFlow();
        useEffect(() => {
          let firstFrame = 0;
          let secondFrame = 0;
          const synchronize = () => {
            const nodeX = Math.max(5, (window.innerWidth - 380) / 2);
            useFlowCanvasStore.setState((state) => ({ nodes: state.nodes.map((node) => node.id === 'video-smoke-node' ? {
              ...node, position: { ...node.position, x: nodeX },
            } : node) }));
            // The smoke page changes viewport sizes in one browser session. Explicitly reset
            // XYFlow after layout so a prior desktop transform cannot hide the real composer.
            void reactFlow.setViewport({ x: 0, y: 0, zoom: 1 }, { duration: 0 });
          };
          const afterLayout = () => {
            cancelAnimationFrame(firstFrame);
            cancelAnimationFrame(secondFrame);
            firstFrame = requestAnimationFrame(() => {
              synchronize();
              secondFrame = requestAnimationFrame(synchronize);
            });
          };
          afterLayout();
          window.addEventListener('resize', afterLayout);
          return () => {
            cancelAnimationFrame(firstFrame);
            cancelAnimationFrame(secondFrame);
            window.removeEventListener('resize', afterLayout);
          };
        }, [reactFlow]);
        return null;
      }
      function Harness() {
        const nodes = useFlowCanvasStore((state) => state.nodes);
        const onNodesChange = useFlowCanvasStore((state) => state.onNodesChange);
        useEffect(() => () => useFlowCanvasStore.getState().newProject(), []);
        return React.createElement('div', { style: { width: '100%', height: '100%' } },
          React.createElement(ReactFlow, { defaultViewport: { x: 0, y: 0, zoom: 1 }, minZoom: 0.2, nodes, nodeTypes: { video: VideoNodeComponent }, onNodesChange, viewport: { x: 0, y: 0, zoom: 1 } }, React.createElement(SmokeViewportCoordinator)));
      }
      createRoot(document.getElementById('root')).render(
        React.createElement(AuthContext.Provider, { value: auth }, React.createElement(ReactFlowProvider, null, React.createElement(Harness))),
      );
    </script>
  </body>
</html>`;
}

export function buildVideoNodeCheckCode(options: VideoNodeSmokeCheckOptions): string {
  return `(async (page) => {
const desktop = { width: 1440, height: 900 };
const narrow = { width: 1024, height: 768 };
const mobile = { width: 390, height: 844 };
const browser = page.context().browser();
if (!browser) throw new Error('Smoke browser is unavailable');
const smokeUrl = page.url();
async function openViewport(viewport, reducedMotion) {
  const context = await browser.newContext({ viewport, reducedMotion: reducedMotion ? 'reduce' : 'no-preference' });
  const viewportPage = await context.newPage();
  await viewportPage.goto(smokeUrl, { waitUntil: 'networkidle' });
  await viewportPage.waitForSelector('[aria-label="视频创作面板"]', { timeout: 15000 });
  return { context, page: viewportPage };
}
async function assertComposerVisible(viewportPage, viewportName) {
  const rect = await viewportPage.locator('[aria-label="视频创作面板"]').evaluate((composer) => composer.getBoundingClientRect().toJSON());
  const viewport = await viewportPage.evaluate(() => ({ height: window.innerHeight, width: window.innerWidth }));
  const meaningfulWidth = Math.min(320, viewport.width - 32);
  if (rect.width < meaningfulWidth || rect.left < -1 || rect.right > viewport.width + 1 || rect.top < -1 || rect.top >= viewport.height) {
    const canvas = await viewportPage.evaluate(() => ({
      node: document.querySelector('.react-flow__node')?.getAttribute('style'),
      stateNode: window.getVideoSmokeNode?.()?.position,
      transform: document.querySelector('.react-flow__viewport')?.getAttribute('style'),
    }));
    throw new Error('视频创作面板在 ' + viewportName + ' 未正确显示: ' + JSON.stringify({ canvas, rect, viewport }));
  }
}
async function assertNoVisualOverflow(viewportPage) {
  const violations = await viewportPage.locator('button, textarea, input').evaluateAll((elements) => elements.filter((element) => {
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 && (rect.right > window.innerWidth + 1 || rect.bottom > window.innerHeight + 1);
  }).map((element) => {
    const rect = element.getBoundingClientRect();
    return { label: element.getAttribute('aria-label') || element.textContent?.trim() || 'unnamed', bottom: Math.round(rect.bottom), right: Math.round(rect.right) };
  }));
  if (violations.length) {
    const geometry = await viewportPage.locator('[aria-label="视频创作面板"]').evaluate((composer) => ({
      composer: getComputedStyle(composer).width,
      rect: composer.getBoundingClientRect().toJSON(),
      node: composer.closest('.react-flow__node')?.getAttribute('style'),
      stateNode: window.getVideoSmokeNode?.()?.position,
      viewport: [window.innerWidth, window.innerHeight],
    }));
    throw new Error('Interactive controls overflow viewport: ' + JSON.stringify({ ...geometry, violations }));
  }
}

const desktopHarness = await openViewport(desktop, false);
const desktopPage = desktopHarness.page;
let narrowHarness;
let mobileHarness;
try {
await assertComposerVisible(desktopPage, 'desktop');
const composerVisible = await desktopPage.locator('[aria-label="视频创作面板"]').isVisible();
await desktopPage.locator('button[aria-label="选择视频模型"]').click();
await desktopPage.waitForSelector('[aria-label="视频模型"]', { timeout: 15000 });
const modelMenuNoSearch = await desktopPage.locator('[aria-label="视频模型"] input[type="search"], [aria-label="视频模型"] input').count() === 0;
const modelOption = desktopPage.getByRole('option', { name: /视频模型 1/ });
await modelOption.hover();
const hoverDescriptionVisible = await desktopPage.getByText('电影感运动与光线模型').isVisible();
await desktopPage.locator('button[aria-label="选择视频模型"]').click();

await desktopPage.evaluate(() => document.querySelector('button[aria-label="运镜库"]')?.click());
await desktopPage.waitForSelector('section[role="dialog"][aria-label="运镜库"]', { timeout: 15000 });
const cameraPresetCount = await desktopPage.locator('[data-camera-motion-id]').count();
const cameraGridColumns = await desktopPage.locator('[data-camera-motion-id]').first().evaluate((first) => {
  const grid = first.parentElement?.parentElement;
  return grid ? getComputedStyle(grid).gridTemplateColumns.split(' ').filter(Boolean).length : 0;
});
await desktopPage.screenshot({ path: ${JSON.stringify(options.desktopScreenshotPath.replaceAll("\\", "/"))}, fullPage: true });
await desktopPage.locator('button[aria-label="关闭运镜库"]').click();

await desktopPage.locator('button[aria-label="视频参数"]').click();
await desktopPage.waitForSelector('[role="dialog"][aria-label="视频参数"]', { timeout: 15000 });
const parameterDialog = desktopPage.locator('[role="dialog"][aria-label="视频参数"]');
const parameterDialogIsTopLayer = await parameterDialog.evaluate((dialog) => dialog.parentElement === document.body
  && getComputedStyle(dialog).position === 'fixed'
  && Number(getComputedStyle(dialog).zIndex) >= 10020);
const resolutionOptions = await desktopPage.locator('[role="dialog"][aria-label="视频参数"] [role="radio"]').allTextContents();
const countOptions = await desktopPage.locator('[role="radiogroup"][aria-label="生成数量"] [role="radio"]').allTextContents();
const durationRange = await desktopPage.locator('input[aria-label="视频时长滑杆"]').evaluate((slider) => ({
  max: slider.getAttribute('max'), min: slider.getAttribute('min'), step: slider.getAttribute('step'),
}));
const durationRangeIsDefault = durationRange.min === '4' && durationRange.max === '15' && durationRange.step === '1';
const durationControlCount = await desktopPage.locator('input[aria-label="视频时长滑杆"], input[aria-label="视频时长输入"]').count();
const audioGroupCount = await desktopPage.getByRole('radiogroup', { name: '生成音频' }).count();
const hasDurationAudioAndCounts = durationControlCount === 2
  && audioGroupCount === 1
  && ['1 个', '2 个', '4 个'].every((count) => countOptions.includes(count));
await desktopPage.keyboard.press('Escape');
await desktopPage.waitForSelector('[role="dialog"][aria-label="视频参数"]', { state: 'hidden', timeout: 15000 });

narrowHarness = await openViewport(narrow, false);
await assertComposerVisible(narrowHarness.page, 'narrow');
await assertNoVisualOverflow(narrowHarness.page);
await narrowHarness.page.screenshot({ path: ${JSON.stringify(options.narrowScreenshotPath.replaceAll("\\", "/"))}, fullPage: true });

// The mobile page is a separate prefers-reduced-motion context, not a reload of the desktop canvas.
mobileHarness = await openViewport(mobile, true);
const mobilePage = mobileHarness.page;
await assertComposerVisible(mobilePage, 'mobile');
await mobilePage.evaluate(() => document.querySelector('button[aria-label="运镜库"]')?.click());
await mobilePage.waitForSelector('section[role="dialog"][aria-label="运镜库"] video', { timeout: 15000 });
const reducedMotionVideoIsPaused = await mobilePage.locator('section[role="dialog"][aria-label="运镜库"] video').evaluateAll((videos) => videos.length === 23 && videos.every((video) => video.paused));
await mobilePage.locator('button[aria-label="关闭运镜库"]').click();
await assertNoVisualOverflow(mobilePage);
await mobilePage.screenshot({ path: ${JSON.stringify(options.mobileScreenshotPath.replaceAll("\\", "/"))}, fullPage: true });

// VideoNodeComponent owns the runBackendWorkflow call. A blocked node must never reach it,
// so the harness verifies that no workflow request is emitted after its Generate action.
await mobilePage.evaluate(() => window.resetVideoSmokeBlockedNode());
await mobilePage.locator('button[aria-label="生成视频"]').click();
await mobilePage.waitForFunction(() => window.videoNodeSmokeState.workflowRequestCount === 0 && Boolean(document.querySelector('[aria-label="视频创作面板"]')));
const blockedGenerationDidNotCreateRun = await mobilePage.evaluate(() => window.videoNodeSmokeState.workflowRequestCount === 0);

const result = { blockedGenerationDidNotCreateRun, cameraGridColumns, cameraPresetCount, composerVisible, durationRangeIsDefault, modelMenuNoSearch, parameterDialogIsTopLayer, resolutionOptions };
if (!composerVisible || !modelMenuNoSearch || !hoverDescriptionVisible || !hasDurationAudioAndCounts || !durationRangeIsDefault || !parameterDialogIsTopLayer || !resolutionOptions.includes('4K') || cameraGridColumns !== 4 || cameraPresetCount !== 23 || !reducedMotionVideoIsPaused || !blockedGenerationDidNotCreateRun) {
  throw new Error(JSON.stringify({ ...result, hasDurationAudioAndCounts, durationControlCount, durationRange, audioGroupCount, countOptions, hoverDescriptionVisible, reducedMotionVideoIsPaused }));
}
return JSON.stringify({ ...result, status: 'ok' });
} finally {
  await mobileHarness?.context.close();
  await narrowHarness?.context.close();
  await desktopHarness.context.close();
}
})`;
}

export function parsePlaywrightCliJson(value: string): unknown {
  const trimmed = value.trim();
  if (trimmed.startsWith("### Error")) throw new Error(trimmed);
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

function commandInvocation(command: string, args: string[]) {
  if (process.platform !== "win32") return { command, args };
  const quote = (value: string) => /[ \t"&()<>^|]/.test(value) ? `"${value.replace(/(["^&|<>])/g, "^$1")}"` : value;
  return { command: "cmd.exe", args: ["/d", "/s", "/c", [command, ...args].map(quote).join(" ")] };
}

function runCommand(command: string, args: string[], timeoutMs = 60_000): Promise<string> {
  return new Promise((resolve, reject) => {
    const invocation = commandInvocation(command, args);
    const child = spawn(invocation.command, invocation.args, { cwd: process.cwd(), stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
    let stdout = "";
    let stderr = "";
    const timeout = setTimeout(() => { child.kill(); reject(new Error(`${command} timed out after ${timeoutMs}ms`)); }, timeoutMs);
    child.stdout.on("data", (chunk) => { stdout += String(chunk); });
    child.stderr.on("data", (chunk) => { stderr += String(chunk); });
    child.on("error", (error) => { clearTimeout(timeout); reject(error); });
    child.on("close", (code) => { clearTimeout(timeout); code === 0 ? resolve(stdout.trim()) : reject(new Error(`${command} ${args.join(" ")} failed with ${code}\n${stdout}\n${stderr}`)); });
  });
}

function spawnVite(port: number): ChildProcessWithoutNullStreams {
  const invocation = commandInvocation(process.platform === "win32" ? "npm.cmd" : "npm", ["run", "dev", "--", "--host", "127.0.0.1", "--port", String(port)]);
  return spawn(invocation.command, invocation.args, { cwd: process.cwd(), stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
}

async function waitForServer(url: string): Promise<void> {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try { if ((await fetch(url)).ok) return; } catch { /* keep polling */ }
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function stopProcessTree(child: ChildProcessWithoutNullStreams): Promise<void> {
  if (!child.pid) return;
  if (process.platform === "win32") { await runCommand("taskkill", ["/PID", String(child.pid), "/T", "/F"], 30_000).catch(() => ""); return; }
  child.kill("SIGTERM");
}

async function runSmoke(): Promise<void> {
  const port = await findFreePort();
  const session = `tapflow-video-node-${Date.now()}`;
  const pageUrl = `http://127.0.0.1:${port}/${SMOKE_HTML_PATH.replaceAll("\\", "/")}`;
  const screenshots = { desktopScreenshotPath: path.join(VIDEO_NODE_SMOKE_OUTPUT_DIR, "desktop.png"), narrowScreenshotPath: path.join(VIDEO_NODE_SMOKE_OUTPUT_DIR, "narrow.png"), mobileScreenshotPath: path.join(VIDEO_NODE_SMOKE_OUTPUT_DIR, "mobile.png") };
  const vite = spawnVite(port);
  const npx = process.platform === "win32" ? "npx.cmd" : "npx";
  try {
    await mkdir(VIDEO_NODE_SMOKE_OUTPUT_DIR, { recursive: true });
    await writeFile(SMOKE_HTML_PATH, buildVideoNodeSmokeHtml(), "utf8");
    await writeFile(CHECK_CODE_PATH, buildVideoNodeCheckCode(screenshots), "utf8");
    await waitForServer(`http://127.0.0.1:${port}/`);
    await runCommand(npx, ["--yes", "--package", "@playwright/cli", "playwright-cli", `-s=${session}`, "open", pageUrl]);
    const raw = await runCommand(npx, ["--yes", "--package", "@playwright/cli", "playwright-cli", `-s=${session}`, "--raw", "run-code", "--filename", CHECK_CODE_PATH]);
    console.log(JSON.stringify({ defaultUrl: VIDEO_NODE_SMOKE_DEFAULT_URL, result: parsePlaywrightCliJson(raw), screenshots, smokePage: SMOKE_HTML_PATH, status: "ok" }, null, 2));
  } finally {
    await runCommand(npx, ["--yes", "--package", "@playwright/cli", "playwright-cli", `-s=${session}`, "close"], 30_000).catch(() => "");
    await stopProcessTree(vite);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runSmoke().catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
}
