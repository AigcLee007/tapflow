import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createReadStream, existsSync, mkdirSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import http, { type Server } from "node:http";
import net from "node:net";
import path from "node:path";
import { pathToFileURL } from "node:url";
import sharp from "sharp";

export const CINEMATIC_AUTH_HOME_OUTPUT_DIR = path.join("output", "playwright", "cinematic-auth-home");
export const CINEMATIC_AUTH_HOME_VIEWPORTS = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "mobile", width: 390, height: 844 },
] as const;

type Viewport = (typeof CINEMATIC_AUTH_HOME_VIEWPORTS)[number];
type CheckOptions = { outputDirectory: string; reducedMotion: boolean; viewport: Viewport };

export function buildCinematicAuthHomeCheckCode({ outputDirectory, reducedMotion, viewport }: CheckOptions): string {
  const snapshotPrefix = path.join(outputDirectory, `${viewport.name}${reducedMotion ? "-reduced-motion" : ""}`).replaceAll("\\", "/");
  return `(async (page) => {
const browser = page.context().browser();
if (!browser) throw new Error('Smoke browser is unavailable');
const targetUrl = page.url();
const viewport = ${JSON.stringify({ width: viewport.width, height: viewport.height })};
const context = await browser.newContext({ viewport, reducedMotion: ${JSON.stringify(reducedMotion ? "reduce" : "no-preference")} });
const smokePage = await context.newPage();
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const assertLandmarkVisibility = async (requireCta) => {
  const issue = await smokePage.evaluate((requireCta) => {
    const active = document.querySelector('.cinematic-auth-home__chapter[data-active="true"]');
    if (!active) return 'Missing active chapter';
    const landmarks = [['nav', document.querySelector('.cinematic-auth-home__nav')], ['rail', document.querySelector('.cinematic-auth-home__rail')], ['heading', active.querySelector('.cinematic-auth-home__content h1')]];
    if (requireCta) landmarks.push(['CTA', active.querySelector('.cinematic-auth-home__workspace')]);
    for (const [name, element] of landmarks) {
      if (!(element instanceof Element)) return 'Missing landmark ' + name;
      const rect = element.getBoundingClientRect();
      if (rect.width < 2 || rect.height < 2 || rect.right < 0 || rect.left > innerWidth || rect.bottom < 0 || rect.top > innerHeight) return 'Invisible landmark ' + name;
      const points = [[rect.left + rect.width / 2, rect.top + rect.height / 2], [Math.max(rect.left + 2, 1), Math.max(rect.top + 2, 1)]];
      for (const [x, y] of points) {
        const top = document.elementsFromPoint(x, y)[0];
        if (!(top instanceof Element) || (!element.contains(top) && !top.contains(element))) return 'Landmark overlapped ' + name + ' by ' + top?.className;
      }
    }
    return null;
  }, requireCta);
  assert(!issue, String(issue));
};
try {
  await smokePage.goto(targetUrl, { waitUntil: 'networkidle' });
  await smokePage.locator('.cinematic-auth-home').waitFor({ state: 'visible', timeout: 20000 });
  const posters = smokePage.locator('[data-testid="landing-film-poster"]');
  assert(await posters.count() === 4, 'Expected four film posters');
  if (${JSON.stringify(reducedMotion)}) {
    assert(await smokePage.locator('[data-testid="landing-film-video"]').count() === 0, 'Reduced motion rendered videos');
    await assertLandmarkVisibility(false);
    const screenshot = ${JSON.stringify(`${snapshotPrefix}.png`)};
    await smokePage.screenshot({ path: screenshot });
    return JSON.stringify({ reducedMotion: true, screenshot, status: 'ok' });
  }
  const videos = smokePage.locator('[data-testid="landing-film-video"]');
  assert(await videos.count() === 4, 'Expected desktop/mobile video layers');
  const before = await videos.first().evaluate((video) => video.currentTime);
  await smokePage.waitForTimeout(1200);
  const state = await smokePage.evaluate(() => Array.from(document.querySelectorAll('[data-testid="landing-film-video"]')).map((video) => ({
    active: video.closest('[data-active]')?.getAttribute('data-active') === 'true', currentTime: video.currentTime, paused: video.paused, preload: video.preload,
  })));
  assert(state.filter((item) => !item.paused).length === 1, 'More than one video is playing: ' + JSON.stringify(state));
  const active = state.find((item) => item.active);
  assert(active && active.currentTime > before, 'Active video currentTime did not advance: ' + JSON.stringify(state));
  state.forEach((item, index) => {
    const distance = Math.abs(index - state.findIndex((candidate) => candidate.active));
    const expected = distance === 0 ? 'auto' : distance === 1 ? 'metadata' : 'none';
    assert(item.preload === expected, 'Unexpected preload policy: ' + JSON.stringify({ expected, index, item }));
  });
  const chapterStates = [];
  const chapters = smokePage.locator('.cinematic-auth-home__chapter');
  for (let index = 0; index < await chapters.count(); index += 1) {
    const chapter = chapters.nth(index);
    await chapter.scrollIntoViewIfNeeded();
    await smokePage.waitForTimeout(900);
    const activeLabel = await smokePage.locator('.cinematic-auth-home__chapter[data-active="true"]').evaluate((element) => element.getAttribute('aria-label'));
    const expectedLabel = await chapter.getAttribute('aria-label');
    assert(activeLabel === expectedLabel, 'Scroll did not activate chapter ' + index);
    await assertLandmarkVisibility(index === 3);
    const screenshot = ${JSON.stringify(`${snapshotPrefix}-chapter-`)} + (index + 1) + '.png';
    await smokePage.screenshot({ path: screenshot });
    chapterStates.push({ index, screenshot });
  }
  await smokePage.getByRole('button', { name: '登录' }).click();
  const dialog = smokePage.getByRole('dialog');
  await dialog.waitFor({ state: 'visible' });
  for (let index = 0; index < 18; index += 1) { await smokePage.keyboard.press('Tab'); assert(await dialog.evaluate((node) => node.contains(document.activeElement)), 'Dialog focus escaped during Tab trap'); }
  await smokePage.keyboard.press('Escape');
  await assert(await dialog.count() === 0, 'Escape did not close login dialog');
  await smokePage.goto(targetUrl.replace(/\\/login(?:\\?.*)?$/, '/register'), { waitUntil: 'networkidle' });
  await smokePage.getByRole('dialog', { name: 'Create account' }).waitFor({ state: 'visible' });
  assert(await smokePage.getByLabel('Display name').count() === 1, 'Register route did not show register panel');
  await smokePage.goto(targetUrl.replace(/\\/login(?:\\?.*)?$/, '/forgot-password'), { waitUntil: 'networkidle' });
  await smokePage.getByRole('dialog', { name: 'Reset password' }).waitFor({ state: 'visible' });
  assert(await smokePage.getByLabel('Email').count() === 1, 'Forgot route did not show reset panel');
  return JSON.stringify({ chapterStates, status: 'ok', viewport });
} finally { await context.close(); }
})`;
}

function invocation(command: string, args: string[]) {
  if (process.platform !== "win32") return { command, args };
  const quote = (value: string) => /[ \t"&()<>^|]/.test(value) ? `"${value.replace(/(["^&|<>])/g, "^$1")}"` : value;
  return { command: "cmd.exe", args: ["/d", "/s", "/c", [command, ...args].map(quote).join(" ")] };
}

function run(command: string, args: string[], timeoutMs = 180_000): Promise<string> {
  return new Promise((resolve, reject) => {
    const entry = invocation(command, args);
    const child = spawn(entry.command, entry.args, { cwd: process.cwd(), stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
    let stdout = ""; let stderr = "";
    const timer = setTimeout(() => { child.kill(); reject(new Error(`${command} timed out after ${timeoutMs}ms`)); }, timeoutMs);
    child.stdout.on("data", (chunk) => { stdout += String(chunk); }); child.stderr.on("data", (chunk) => { stderr += String(chunk); });
    child.on("error", (error) => { clearTimeout(timer); reject(error); });
    child.on("close", (code) => { clearTimeout(timer); code === 0 ? resolve(stdout.trim()) : reject(new Error(`${command} ${args.join(" ")} failed with ${code}\n${stdout}\n${stderr}`)); });
  });
}

async function freePort() { return await new Promise<number>((resolve, reject) => { const server = net.createServer(); server.on("error", reject); server.listen(0, "127.0.0.1", () => { const address = server.address() as net.AddressInfo; server.close(() => resolve(address.port)); }); }); }

function fixtureServer(): Server {
  const video = path.resolve(process.cwd(), "public", "video-camera-library", "v2", "fixed.mp4");
  const poster = path.resolve(process.cwd(), "public", "video-camera-library", "v1", "fixed.webp");
  if (!existsSync(video) || !existsSync(poster)) throw new Error("Committed fixture MP4 and WebP are required for cinematic smoke.");
  return http.createServer((request, response) => {
    const isPoster = request.url?.endsWith("poster.webp") ?? false;
    const source = isPoster ? poster : video;
    response.setHeader("Access-Control-Allow-Origin", "*"); response.setHeader("Cache-Control", "no-store"); response.setHeader("Content-Type", isPoster ? "image/webp" : "video/mp4");
    createReadStream(source).pipe(response);
  });
}

function startBuiltFrontend(port: number): ChildProcessWithoutNullStreams {
  const entry = invocation(process.platform === "win32" ? "node.exe" : "node", ["scripts/serve-dist.cjs", String(port)]);
  return spawn(entry.command, entry.args, { cwd: process.cwd(), stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
}

async function waitFor(url: string) { const deadline = Date.now() + 30_000; while (Date.now() < deadline) { try { if ((await fetch(url)).ok) return; } catch { /* poll */ } await new Promise((resolve) => setTimeout(resolve, 250)); } throw new Error(`Timed out waiting for ${url}`); }
async function closeServer(server: Server) { await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); }
async function stop(child: ChildProcessWithoutNullStreams) { if (!child.pid) return; if (process.platform === "win32") await run("taskkill", ["/PID", String(child.pid), "/T", "/F"], 30_000).catch(() => undefined); else child.kill("SIGTERM"); }

async function assertRenderedPrimaryMedia(screenshotPath: string) {
  const image = sharp(screenshotPath);
  const metadata = await image.metadata();
  if (!metadata.width || !metadata.height) throw new Error(`Rendered screenshot is unreadable: ${screenshotPath}`);
  const crop = {
    left: Math.floor(metadata.width * 0.2),
    top: Math.floor(metadata.height * 0.16),
    width: Math.max(1, Math.floor(metadata.width * 0.48)),
    height: Math.max(1, Math.floor(metadata.height * 0.42)),
  };
  const stats = await image.extract(crop).stats();
  const channels = stats.channels.slice(0, 3);
  const range = Math.max(...channels.map((channel) => channel.max)) - Math.min(...channels.map((channel) => channel.min));
  const deviation = channels.reduce((sum, channel) => sum + channel.stdev, 0) / channels.length;
  if (range <= 14 || deviation <= 5) throw new Error(`Rendered primary media is near-uniform or blank: ${JSON.stringify({ crop, deviation, range, screenshotPath })}`);
  return { crop, deviation, range, screenshotPath };
}

async function main() {
  const fixturePort = await freePort(); const frontendPort = await freePort(); const fixture = fixtureServer();
  const baseUrl = `http://127.0.0.1:${fixturePort}/landing-films/v1`;
  const session = `cinematic-auth-home-${Date.now()}`;
  const previousMediaBaseUrl = process.env.VITE_LANDING_MEDIA_BASE_URL;
  let frontend: ChildProcessWithoutNullStreams | null = null;
  try {
    await new Promise<void>((resolve) => fixture.listen(fixturePort, "127.0.0.1", resolve));
    await mkdir(CINEMATIC_AUTH_HOME_OUTPUT_DIR, { recursive: true });
    process.env.VITE_LANDING_MEDIA_BASE_URL = baseUrl;
    await run(process.platform === "win32" ? "npm.cmd" : "npm", ["run", "build"], 300_000);
    frontend = startBuiltFrontend(frontendPort); await waitFor(`http://127.0.0.1:${frontendPort}/login`);
    const pageUrl = `http://127.0.0.1:${frontendPort}/login`;
    const npx = process.platform === "win32" ? "npx.cmd" : "npx";
    await run(npx, ["--yes", "--package", "@playwright/cli", "playwright-cli", `-s=${session}`, "open", pageUrl], 90_000);
    const results: unknown[] = [];
    for (const viewport of CINEMATIC_AUTH_HOME_VIEWPORTS) for (const reducedMotion of [false, true]) {
      const checkPath = path.join(CINEMATIC_AUTH_HOME_OUTPUT_DIR, `${viewport.name}${reducedMotion ? "-reduced-motion" : ""}-check.js`);
      await writeFile(checkPath, buildCinematicAuthHomeCheckCode({ outputDirectory: CINEMATIC_AUTH_HOME_OUTPUT_DIR, reducedMotion, viewport }), "utf8");
      const raw = await run(npx, ["--yes", "--package", "@playwright/cli", "playwright-cli", `-s=${session}`, "--raw", "run-code", "--filename", checkPath], 90_000);
      const result = JSON.parse(JSON.parse(raw));
      if (!reducedMotion) {
        result.renderedPrimaryMedia = await assertRenderedPrimaryMedia(result.chapterStates[0].screenshot);
      }
      results.push(result);
    }
    console.log(JSON.stringify({ mediaBaseUrl: baseUrl, results, status: "ok" }, null, 2));
  } finally {
    const npx = process.platform === "win32" ? "npx.cmd" : "npx";
    await run(npx, ["--yes", "--package", "@playwright/cli", "playwright-cli", `-s=${session}`, "close"], 30_000).catch(() => undefined);
    if (frontend) await stop(frontend);
    await closeServer(fixture).catch(() => undefined);
    if (previousMediaBaseUrl === undefined) delete process.env.VITE_LANDING_MEDIA_BASE_URL;
    else process.env.VITE_LANDING_MEDIA_BASE_URL = previousMediaBaseUrl;
  }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) main().catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
