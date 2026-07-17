import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path, { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { tmpdir } from "node:os";

import { buildVideoNodeSmokeHtml } from "./smoke-video-node";

export const VIDEO_NODE_VISUAL_SHOTS = [
  "composer-default",
  "parameters-open",
  "camera-library-open",
  "palette-open",
  "narrow",
  "mobile",
] as const;

export const VIDEO_NODE_VISUAL_OUTPUT_DIR = "output/playwright/video-node-visual";
const VISUAL_HTML_PATH = path.join(VIDEO_NODE_VISUAL_OUTPUT_DIR, "video-node-visual.html");
const VISUAL_CHECK_PATH = path.join(VIDEO_NODE_VISUAL_OUTPUT_DIR, "video-node-visual-check.js");

export type VideoNodeVisualCheckOptions = { outputDirectory: string };

export function buildVideoNodeVisualCheckCode(options: VideoNodeVisualCheckOptions): string {
  const output = options.outputDirectory.replaceAll("\\", "/");
  return `(async (page) => {
const browser = page.context().browser();
if (!browser) throw new Error('Smoke browser is unavailable');
const smokeUrl = page.url();
const forbidden = ['Subject', 'Scene', 'Prop', 'Style', 'Camera motion library', 'Favorites', 'Use', 'Clear', 'Video composer', 'Video parameters', 'Choose video model', 'Generate video'];
const mojibake = /\\uFFFD|锛|鏂|妯|棰|杩|缁|閫|绉|浣|鍙/;
const shots = ${JSON.stringify(VIDEO_NODE_VISUAL_SHOTS)};
const contexts = [];
function shotPath(name) { return '${output}/' + name + '.png'; }
async function openViewport(viewport, reducedMotion = false) {
  const context = await browser.newContext({ viewport, reducedMotion: reducedMotion ? 'reduce' : 'no-preference' });
  const viewportPage = await context.newPage();
  await viewportPage.goto(smokeUrl, { waitUntil: 'networkidle' });
  await viewportPage.waitForSelector('[aria-label="视频创作面板"]', { timeout: 15000 });
  contexts.push(context);
  return viewportPage;
}
async function assertChineseAndBounds(viewportPage, name) {
  const bodyText = await viewportPage.locator('body').innerText();
  if (forbidden.some((text) => bodyText.includes(text))) throw new Error('English video UI remains at ' + name);
  if (mojibake.test(bodyText)) throw new Error('Video UI contains mojibake at ' + name);
  const rect = await viewportPage.locator('[aria-label="视频创作面板"]').boundingBox();
  const viewport = await viewportPage.evaluate(() => ({ width: window.innerWidth, height: window.innerHeight }));
  if (!rect || rect.x < -1 || rect.x + rect.width > viewport.width + 1 || rect.y < -1 || rect.y >= viewport.height) {
    throw new Error('Composer overflow at ' + name + ': ' + JSON.stringify({ rect, viewport }));
  }
}
async function assertNoControlOverflow(viewportPage, name) {
  const violations = await viewportPage.locator('button, textarea, input').evaluateAll((elements) => elements.filter((element) => {
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 && (rect.right > window.innerWidth + 1 || rect.bottom > window.innerHeight + 1);
  }).map((element) => element.getAttribute('aria-label') || element.textContent?.trim() || 'unnamed'));
  if (violations.length) throw new Error('Control overflow at ' + name + ': ' + JSON.stringify(violations));
}
const desktop = { width: 1440, height: 900 };
const narrow = { width: 1024, height: 768 };
const mobile = { width: 390, height: 844 };
try {
  const defaultPage = await openViewport(desktop);
  await assertChineseAndBounds(defaultPage, 'composer-default');
  await defaultPage.screenshot({ path: shotPath('composer-default'), fullPage: true });

  const parameterPage = await openViewport(desktop);
  await parameterPage.locator('button[aria-label="视频参数"]').click();
  const parameterDialog = parameterPage.getByRole('dialog', { name: '视频参数' });
  await parameterDialog.waitFor({ state: 'visible', timeout: 15000 });
  const ratioCount = await parameterDialog.locator('[role="radiogroup"][aria-label="画面比例"] [role="radio"]').count();
  const resolutionCount = await parameterDialog.locator('[role="radiogroup"][aria-label="清晰度"] [role="radio"]').count();
  const countCount = await parameterDialog.locator('[role="radiogroup"][aria-label="生成数量"] [role="radio"]').count();
  const hasDuration = await parameterDialog.locator('input[aria-label="视频时长滑杆"], input[aria-label="视频时长输入"]').count() === 2;
  const hasAudio = await parameterDialog.getByRole('radiogroup', { name: '生成音频' }).count() === 1;
  if (ratioCount !== 7 || resolutionCount !== 4 || countCount !== 3 || !hasDuration || !hasAudio || !(await parameterDialog.getByText('4K').isVisible())) {
    throw new Error('Parameter surface is incomplete: ' + JSON.stringify({ ratioCount, resolutionCount, countCount, hasDuration, hasAudio }));
  }
  await assertChineseAndBounds(parameterPage, 'parameters-open');
  await parameterPage.screenshot({ path: shotPath('parameters-open'), fullPage: true });

  const cameraPage = await openViewport(desktop);
  await cameraPage.locator('button[aria-label="运镜库"]').click();
  const cameraDialog = cameraPage.getByRole('dialog', { name: '运镜库' });
  await cameraDialog.waitFor({ state: 'visible', timeout: 15000 });
  await cameraDialog.locator('[data-camera-motion-id]').first().waitFor({ state: 'visible', timeout: 15000 });
  const cameraCount = await cameraDialog.locator('[data-camera-motion-id]').count();
  const cameraGridColumns = await cameraDialog.locator('[data-camera-motion-id]').first().evaluate((first) => {
    const grid = first.parentElement?.parentElement;
    return grid ? getComputedStyle(grid).gridTemplateColumns.split(' ').filter(Boolean).length : 0;
  });
  const cameraVideoCount = await cameraDialog.locator('video').count();
  if (cameraCount !== 23 || cameraGridColumns !== 4 || cameraVideoCount !== 23) throw new Error('Camera library is incomplete: ' + JSON.stringify({ cameraCount, cameraGridColumns, cameraVideoCount }));
  await assertChineseAndBounds(cameraPage, 'camera-library-open');
  await cameraPage.screenshot({ path: shotPath('camera-library-open'), fullPage: true });

  const palettePage = await openViewport(desktop);
  await palettePage.locator('button[aria-label="调色盘"]').click();
  const paletteDialog = palettePage.getByRole('dialog', { name: '调色盘' });
  await paletteDialog.waitFor({ state: 'visible', timeout: 15000 });
  const paletteGroups = await paletteDialog.locator('[role="group"]').count();
  const toneCount = await paletteDialog.locator('[role="radiogroup"][aria-label="画面色调"] [role="radio"]').count();
  if (paletteGroups < 2 || toneCount !== 5) throw new Error('Palette surface is incomplete: ' + JSON.stringify({ paletteGroups, toneCount }));
  await assertChineseAndBounds(palettePage, 'palette-open');
  await palettePage.screenshot({ path: shotPath('palette-open'), fullPage: true });

  const narrowPage = await openViewport(narrow);
  await assertChineseAndBounds(narrowPage, 'narrow');
  await assertNoControlOverflow(narrowPage, 'narrow');
  await narrowPage.screenshot({ path: shotPath('narrow'), fullPage: true });

  const mobilePage = await openViewport(mobile, true);
  await assertChineseAndBounds(mobilePage, 'mobile');
  await assertNoControlOverflow(mobilePage, 'mobile');
  await mobilePage.screenshot({ path: shotPath('mobile'), fullPage: true });
  return JSON.stringify({ shots, status: 'ok' });
} finally {
  await Promise.all(contexts.map((context) => context.close()));
}
})`;
}

function commandInvocation(command: string, args: string[]) {
  if (process.platform !== "win32") return { command, args };
  const quote = (value: string) => /[ 	"&()<>^|]/.test(value) ? `"${value.replace(/(["^&|<>])/g, "^$1")}"` : value;
  return { command: "cmd.exe", args: ["/d", "/s", "/c", [command, ...args].map(quote).join(" ")] };
}

function runCommand(command: string, args: string[], timeoutMs = 120_000): Promise<string> {
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
  const invocation = commandInvocation("npm.cmd", ["run", "dev", "--", "--host", "127.0.0.1", "--port", String(port)]);
  return spawn(invocation.command, invocation.args, { cwd: process.cwd(), stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
}

async function findFreePort(): Promise<number> {
  const net = await import("node:net");
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

async function waitForServer(url: string) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try { if ((await fetch(url)).ok) return; } catch { /* keep polling */ }
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function stopProcessTree(child: ChildProcessWithoutNullStreams) {
  if (!child.pid) return;
  if (process.platform === "win32") {
    child.stdout.destroy();
    child.stderr.destroy();
    child.kill();
    child.unref();
  } else child.kill("SIGTERM");
}

function findChrome() {
  return [
    process.env.CHROME_PATH,
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  ].filter(Boolean).find((candidate) => existsSync(candidate!)) ?? null;
}

async function waitForDevToolsPort(profileDirectory: string) {
  const portPath = resolve(profileDirectory, "DevToolsActivePort");
  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (existsSync(portPath)) return Number(readFileSync(portPath, "utf8").split(/\r?\n/)[0]);
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 50));
  }
  throw new Error("Chrome did not expose a DevTools port.");
}

type CdpSession = {
  browser: ChildProcessWithoutNullStreams;
  profileDirectory: string;
  socket: WebSocket;
  state: { nextId: number; pending: Map<number, { resolve: (value: any) => void; reject: (reason: unknown) => void }> };
};

async function cdpRequest(session: CdpSession, method: string, params: Record<string, unknown> = {}) {
  const id = session.state.nextId++;
  const response = new Promise((resolvePromise, reject) => session.state.pending.set(id, { resolve: resolvePromise, reject }));
  session.socket.send(JSON.stringify({ id, method, params }));
  return response;
}

async function startChrome(url: string, viewport: { width: number; height: number }, reducedMotion = false): Promise<CdpSession> {
  const browserPath = findChrome();
  if (!browserPath) throw new Error("Chrome or Edge is required for the visual smoke fallback.");
  const profileDirectory = resolve(tmpdir(), `tapflow-video-visual-${process.pid}-${Date.now()}`);
  mkdirSync(profileDirectory, { recursive: true });
  const browser = spawn(browserPath, [
    "--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check", "--remote-debugging-port=0",
    `--user-data-dir=${profileDirectory}`, `--window-size=${viewport.width},${viewport.height}`, "about:blank",
  ], { stdio: "ignore", windowsHide: true });
  console.log(`visual: chrome ${viewport.width}x${viewport.height}`);
  let port: number;
  try {
    port = await waitForDevToolsPort(profileDirectory);
  } catch (error) {
    browser.kill();
    browser.unref();
    try { rmSync(profileDirectory, { recursive: true, force: true }); } catch { /* Windows may retain the profile briefly after Chrome exits. */ }
    throw error;
  }
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json() as Array<{ type: string; webSocketDebuggerUrl?: string }>;
  const target = targets.find((item) => item.type === "page");
  if (!target?.webSocketDebuggerUrl) throw new Error("Chrome did not expose a page target.");
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise<void>((resolvePromise, reject) => { socket.addEventListener("open", () => resolvePromise(), { once: true }); socket.addEventListener("error", reject, { once: true }); });
  const session: CdpSession = { browser, profileDirectory, socket, state: { nextId: 1, pending: new Map() } };
  socket.addEventListener("message", ({ data }) => {
    const message = JSON.parse(String(data));
    if (message.id && session.state.pending.has(message.id)) {
      const pending = session.state.pending.get(message.id)!;
      session.state.pending.delete(message.id);
      if (message.error) pending.reject(new Error(message.error.message)); else pending.resolve(message.result);
    }
  });
  await cdpRequest(session, "Page.enable");
  await cdpRequest(session, "Runtime.enable");
  await cdpRequest(session, "Emulation.setDeviceMetricsOverride", { width: viewport.width, height: viewport.height, deviceScaleFactor: 1, mobile: false });
  await cdpRequest(session, "Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: reducedMotion ? "reduce" : "no-preference" }] });
  await cdpRequest(session, "Page.navigate", { url });
  console.log(`visual: navigated ${viewport.width}x${viewport.height}`);
  return session;
}

async function startChromeWithTimeout(url: string, viewport: { width: number; height: number }, reducedMotion = false) {
  return await Promise.race([
    startChrome(url, viewport, reducedMotion),
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error("Browser did not expose DevTools within 10 seconds.")), 10_000)),
  ]);
}

async function evaluate(session: CdpSession, expression: string, awaitPromise = false): Promise<any> {
  const response = await cdpRequest(session, "Runtime.evaluate", { expression, awaitPromise, returnByValue: true }) as any;
  if (response.exceptionDetails) throw new Error(response.exceptionDetails.text ?? "Chrome evaluation failed.");
  return response.result?.value;
}

async function waitForExpression(session: CdpSession, expression: string, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await evaluate(session, expression, true)) return;
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 250));
  }
  throw new Error(`Timed out waiting for expression: ${expression}`);
}

async function clickSelector(session: CdpSession, selector: string) {
  const result = await evaluate(session, `(() => { const element = document.querySelector(${JSON.stringify(selector)}); if (!element) return false; element.click(); return true; })()`);
  if (!result) throw new Error(`Could not click selector: ${selector}`);
}

async function capture(session: CdpSession, filePath: string) {
  const response = await cdpRequest(session, "Page.captureScreenshot", { format: "png", fromSurface: true }) as any;
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, Buffer.from(response.data, "base64"));
}

async function assertVisualState(session: CdpSession, name: string) {
  const result = await evaluate(session, `(() => {
    const bodyText = document.body.innerText;
    const forbidden = ['Subject', 'Scene', 'Prop', 'Style', 'Camera motion library', 'Favorites', 'Use', 'Clear', 'Video composer', 'Video parameters', 'Choose video model', 'Generate video'];
    if (forbidden.some((text) => bodyText.includes(text))) return { error: 'English video UI remains' };
    if (/\\uFFFD|锛|鏂|妯|棰|杩|缁|閫|绉|浣|鍙/.test(bodyText)) return { error: 'Video UI contains mojibake' };
    const composer = document.querySelector('[aria-label="视频创作面板"]');
    const rect = composer?.getBoundingClientRect();
    if (!rect || rect.left < -1 || rect.right > innerWidth + 1 || rect.top < -1 || rect.top >= innerHeight) return { error: 'Composer overflow', rect: rect?.toJSON(), viewport: [innerWidth, innerHeight] };
    return { ok: true };
  })()`);
  if (!result?.ok) throw new Error(`${name}: ${JSON.stringify(result)}`);
}

async function closeChrome(session: CdpSession) {
  session.socket.close();
  await stopProcessTree(session.browser);
  try { rmSync(session.profileDirectory, { recursive: true, force: true }); } catch { /* Windows may retain the profile briefly after Chrome exits. */ }
}

async function runChromeSmoke(pageUrl: string) {
  const output = VIDEO_NODE_VISUAL_OUTPUT_DIR;
  const desktop = { width: 1440, height: 900 };
  const narrow = { width: 1024, height: 768 };
  const mobile = { width: 390, height: 844 };
  const sessions: CdpSession[] = [];
  try {
    const defaultSession = await startChromeWithTimeout(pageUrl, desktop); sessions.push(defaultSession);
    await waitForExpression(defaultSession, `document.querySelector('[aria-label="视频创作面板"]') !== null`); await assertVisualState(defaultSession, "composer-default"); await capture(defaultSession, path.join(output, "composer-default.png"));
    const parameterSession = await startChromeWithTimeout(pageUrl, desktop); sessions.push(parameterSession); await waitForExpression(parameterSession, `document.querySelector('[aria-label="视频创作面板"]') !== null`); await clickSelector(parameterSession, 'button[aria-label="视频参数"]'); await waitForExpression(parameterSession, `document.querySelector('[role="dialog"][aria-label="视频参数"]') !== null`); await assertVisualState(parameterSession, "parameters-open"); await capture(parameterSession, path.join(output, "parameters-open.png"));
    const cameraSession = await startChromeWithTimeout(pageUrl, desktop); sessions.push(cameraSession); await waitForExpression(cameraSession, `document.querySelector('[aria-label="视频创作面板"]') !== null`); await clickSelector(cameraSession, 'button[aria-label="运镜库"]'); await waitForExpression(cameraSession, `document.querySelectorAll('[data-camera-motion-id]').length === 23`); const cameraMetrics = await evaluate(cameraSession, `(() => { const first = document.querySelector('[data-camera-motion-id]'); const grid = first?.parentElement?.parentElement; return { count: document.querySelectorAll('[data-camera-motion-id]').length, videos: document.querySelectorAll('section[role="dialog"][aria-label="运镜库"] video').length, columns: grid ? getComputedStyle(grid).gridTemplateColumns.split(' ').filter(Boolean).length : 0 }; })()`); if (cameraMetrics.count !== 23 || cameraMetrics.videos !== 23 || cameraMetrics.columns !== 4) throw new Error(`camera-library-open: ${JSON.stringify(cameraMetrics)}`); await assertVisualState(cameraSession, "camera-library-open"); await capture(cameraSession, path.join(output, "camera-library-open.png"));
    const paletteSession = await startChromeWithTimeout(pageUrl, desktop); sessions.push(paletteSession); await waitForExpression(paletteSession, `document.querySelector('[aria-label="视频创作面板"]') !== null`); await clickSelector(paletteSession, 'button[aria-label="调色盘"]'); await waitForExpression(paletteSession, `document.querySelector('[role="dialog"][aria-label="调色盘"]') !== null`); const paletteMetrics = await evaluate(paletteSession, `({ groups: document.querySelectorAll('[role="dialog"][aria-label="调色盘"] [role="group"]').length, tones: document.querySelectorAll('[role="dialog"][aria-label="调色盘"] [role="radiogroup"] [role="radio"]').length })`); if (paletteMetrics.groups < 2 || paletteMetrics.tones !== 5) throw new Error(`palette-open: ${JSON.stringify(paletteMetrics)}`); await assertVisualState(paletteSession, "palette-open"); await capture(paletteSession, path.join(output, "palette-open.png"));
    const narrowSession = await startChromeWithTimeout(pageUrl, narrow); sessions.push(narrowSession); await waitForExpression(narrowSession, `document.querySelector('[aria-label="视频创作面板"]') !== null`); await assertVisualState(narrowSession, "narrow"); await capture(narrowSession, path.join(output, "narrow.png"));
    const mobileSession = await startChromeWithTimeout(pageUrl, mobile, true); sessions.push(mobileSession); await waitForExpression(mobileSession, `document.querySelector('[aria-label="视频创作面板"]') !== null`); await assertVisualState(mobileSession, "mobile"); await capture(mobileSession, path.join(output, "mobile.png"));
    return { shots: VIDEO_NODE_VISUAL_SHOTS, status: "ok" };
  } finally { await Promise.all(sessions.map(closeChrome)); }
}

async function runSmoke() {
  const port = await findFreePort();
  const session = `tapflow-video-node-visual-${Date.now()}`;
  const pageUrl = `http://127.0.0.1:${port}/${VISUAL_HTML_PATH.replaceAll("\\", "/")}`;
  const vite = spawnVite(port);
  try {
    await mkdir(VIDEO_NODE_VISUAL_OUTPUT_DIR, { recursive: true });
    await writeFile(VISUAL_HTML_PATH, buildVideoNodeSmokeHtml(), "utf8");
    await writeFile(VISUAL_CHECK_PATH, buildVideoNodeVisualCheckCode({ outputDirectory: VIDEO_NODE_VISUAL_OUTPUT_DIR }), "utf8");
    await waitForServer(`http://127.0.0.1:${port}/`);
    console.log(`visual: vite ready ${port}`);
    const result = await runChromeSmoke(pageUrl);
    console.log(JSON.stringify({ outputDirectory: VIDEO_NODE_VISUAL_OUTPUT_DIR, result, status: "ok" }, null, 2));
  } finally {
    await stopProcessTree(vite);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runSmoke().catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
}
