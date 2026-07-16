import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import process from "node:process";
import sharp from "sharp";

export const CAMERA_IDS = [
  "fixed", "follow", "spiral-up", "spiral-down", "tilt-up", "tilt-down",
  "pan-left", "pan-right", "crane-up", "crane-down", "truck-left", "truck-right",
  "dolly-in", "dolly-out", "zoom-in", "zoom-out", "dolly-zoom", "orbit", "roll",
  "fpv", "drone", "aerial", "handheld",
];

const CAMERA_LABELS = {
  fixed: "固定镜头", follow: "跟随镜头", "spiral-up": "螺旋上升", "spiral-down": "螺旋下降",
  "tilt-up": "上摇镜头", "tilt-down": "下摇镜头", "pan-left": "左摇镜头", "pan-right": "右摇镜头",
  "crane-up": "升降上升", "crane-down": "升降下降", "truck-left": "左移镜头", "truck-right": "右移镜头",
  "dolly-in": "推进镜头", "dolly-out": "拉远镜头", "zoom-in": "变焦放大", "zoom-out": "变焦缩小",
  "dolly-zoom": "滑轨变焦", orbit: "环绕镜头", roll: "翻滚镜头", fpv: "穿越视角",
  drone: "无人机跟拍", aerial: "航拍俯视", handheld: "手持镜头",
};

export const CAMERA_LIBRARY_DIR = resolve(process.cwd(), "public/video-camera-library");
export const MANIFEST_PATH = resolve(CAMERA_LIBRARY_DIR, "manifest.v1.json");
export const MEDIARECORDER_VP9_MIME_TYPE = "video/webm;codecs=vp9";
const WIDTH = 320;
const HEIGHT = 180;
const FPS = 24;
const FRAME_COUNT = 60;
const DURATION_MS = 2500;

export function loadManifest() {
  return JSON.parse(readFileSync(MANIFEST_PATH, "utf8"));
}

export function assertGeneratedAssets(manifest) {
  for (const item of manifest.items) {
    for (const relativePath of [item.poster, item.preview]) {
      const assetPath = resolve(CAMERA_LIBRARY_DIR, relativePath);
      if (!existsSync(assetPath) || statSync(assetPath).size === 0) {
        throw new Error(`Generated camera preview is missing or empty: ${relativePath}`);
      }
    }
  }
}

function motionProfile(id, frame) {
  const t = frame / (FRAME_COUNT - 1);
  const wobble = Math.sin(t * Math.PI * 8) * 1.8;
  const profile = { x: 0, y: 0, scale: 1, rotate: 0, lightX: 0, lightY: 0 };
  if (id === "follow") profile.x = -28 * t;
  if (id === "spiral-up" || id === "spiral-down") { profile.x = Math.cos(t * Math.PI * 4) * 12; profile.y = (id === "spiral-up" ? -1 : 1) * 30 * t + Math.sin(t * Math.PI * 4) * 7; profile.rotate = (id === "spiral-up" ? 1 : -1) * 5 * t; }
  if (id === "tilt-up" || id === "tilt-down") profile.rotate = (id === "tilt-up" ? -1 : 1) * 9 * t;
  if (id === "pan-left" || id === "pan-right") profile.x = (id === "pan-left" ? 1 : -1) * 42 * t;
  if (id === "crane-up" || id === "crane-down") profile.y = (id === "crane-up" ? 1 : -1) * 32 * t;
  if (id === "truck-left" || id === "truck-right") profile.x = (id === "truck-left" ? 1 : -1) * 30 * t;
  if (id === "dolly-in" || id === "dolly-out") profile.scale = id === "dolly-in" ? 1 + t * 0.28 : 1.28 - t * 0.28;
  if (id === "zoom-in" || id === "zoom-out") profile.scale = id === "zoom-in" ? 1 + t * 0.4 : 1.4 - t * 0.4;
  if (id === "dolly-zoom") { profile.scale = 1 + t * 0.32; profile.x = -24 * t; }
  if (id === "orbit") { profile.x = Math.cos(t * Math.PI * 2) * 20; profile.y = Math.sin(t * Math.PI * 2) * 12; profile.rotate = Math.sin(t * Math.PI * 2) * 3; }
  if (id === "roll") profile.rotate = t * 360;
  if (id === "fpv") { profile.x = -45 * t; profile.scale = 1 + t * 0.2; }
  if (id === "drone") { profile.y = -34 * t; profile.scale = 1 - t * 0.2; }
  if (id === "aerial") { profile.y = 25 * t; profile.scale = 1.25 - t * 0.22; }
  if (id === "handheld") { profile.x = wobble; profile.y = Math.cos(t * Math.PI * 5) * 1.5; profile.rotate = wobble * 0.5; }
  profile.lightX = Math.sin(t * Math.PI * 2) * 8;
  profile.lightY = Math.cos(t * Math.PI * 2) * 5;
  return profile;
}

function frameSvg(id, frame) {
  const p = motionProfile(id, frame);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
    <rect width="320" height="180" fill="#111722"/>
    <g opacity=".5" stroke="#344052" stroke-width=".5">${Array.from({ length: 17 }, (_, i) => `<path d="M${i * 20} 0V180 M0 ${i * 12}H320"/>`).join("")}</g>
    <g transform="translate(${p.x} ${p.y}) rotate(${p.rotate} 160 90) translate(${160 - 160 * p.scale} ${90 - 90 * p.scale}) scale(${p.scale})">
      <ellipse cx="160" cy="140" rx="105" ry="20" fill="#0b0f17"/>
      <rect x="110" y="84" width="98" height="55" rx="6" fill="#202c3c" stroke="#5b6a7f"/>
      <rect x="119" y="93" width="80" height="34" rx="3" fill="#182231"/>
      <circle cx="136" cy="110" r="13" fill="#ff6658"/><circle cx="162" cy="104" r="13" fill="#69d4e6"/><circle cx="184" cy="117" r="13" fill="#f3c760"/>
      <path d="M72 142L94 88 116 142ZM248 142L226 88 204 142Z" fill="#303f52"/><circle cx="94" cy="82" r="11" fill="#ffdc7a" opacity=".9"/><circle cx="226" cy="82" r="11" fill="#7ae7ff" opacity=".9"/>
      <rect x="154" y="54" width="12" height="30" rx="6" fill="#7b8798"/><circle cx="160" cy="45" r="15" fill="#d7e2ee"/><path d="M148 76Q160 66 172 76" stroke="#ff8a72" stroke-width="3" fill="none"/>
    </g>
    <circle cx="${44 + p.lightX}" cy="${38 + p.lightY}" r="20" fill="#ff775c" opacity=".16"/><circle cx="${276 - p.lightX}" cy="${42 - p.lightY}" r="24" fill="#58dff5" opacity=".14"/>
    <text x="14" y="165" fill="#d9e1eb" font-family="Arial, sans-serif" font-size="10">${CAMERA_LABELS[id]}</text>
  </svg>`;
}

function assertFfmpegAvailable() {
  try {
    execFileSync("ffmpeg", ["-version"], { stdio: "ignore" });
  } catch {
    throw new Error("ffmpeg is required to create silent VP9 WebM camera previews. Install it locally and ensure it is available on PATH.");
  }
}

function findLocalBrowser() {
  const candidates = [
    process.env.CHROME_PATH,
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
  ].filter(Boolean);
  return candidates.find((candidate) => existsSync(candidate)) ?? null;
}

function wait(ms) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}

function removeTemporaryDirectory(directory) {
  try {
    rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 250 });
  } catch {
    // Windows can retain Sharp's temporary frame handles briefly. PID-scoped paths prevent reuse.
  }
}

async function readDevToolsPort(profileDirectory) {
  const portPath = resolve(profileDirectory, "DevToolsActivePort");
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (existsSync(portPath)) return Number(readFileSync(portPath, "utf8").split(/\r?\n/)[0]);
    await wait(50);
  }
  throw new Error("Local browser did not expose its DevTools port.");
}

async function cdpRequest(socket, state, method, params = {}) {
  const id = state.nextId++;
  const response = new Promise((resolvePromise, reject) => state.pending.set(id, { resolve: resolvePromise, reject }));
  socket.send(JSON.stringify({ id, method, params }));
  return response;
}

async function startBrowserRecorder() {
  const browserPath = findLocalBrowser();
  if (!browserPath) throw new Error("ffmpeg is unavailable and no local Chrome or Edge executable was found for the MediaRecorder fallback.");
  const profileDirectory = resolve(tmpdir(), `tapflow-camera-recorder-${process.pid}`);
  rmSync(profileDirectory, { recursive: true, force: true });
  mkdirSync(profileDirectory, { recursive: true });
  const browser = spawn(browserPath, ["--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check", "--remote-debugging-port=0", `--user-data-dir=${profileDirectory}`, "about:blank"], { stdio: "ignore", windowsHide: true });
  const port = await readDevToolsPort(profileDirectory);
  const targetResponse = await fetch(`http://127.0.0.1:${port}/json/list`);
  const targets = await targetResponse.json();
  const target = targets.find((item) => item.type === "page");
  if (!target?.webSocketDebuggerUrl) throw new Error("Local browser did not expose a page CDP target.");
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolvePromise, reject) => { socket.addEventListener("open", resolvePromise, { once: true }); socket.addEventListener("error", reject, { once: true }); });
  const state = { nextId: 1, pending: new Map() };
  socket.addEventListener("message", ({ data }) => {
    const message = JSON.parse(String(data));
    if (message.id && state.pending.has(message.id)) {
      const pending = state.pending.get(message.id);
      state.pending.delete(message.id);
      if (message.error) pending.reject(new Error(message.error.message)); else pending.resolve(message.result);
    }
  });
  return { browser, profileDirectory, socket, state };
}

async function encodeWebmWithMediaRecorder(recorder, id, outputPath) {
  const expression = `(() => new Promise(async (resolve, reject) => {
    const canvas = document.createElement('canvas'); canvas.width = ${WIDTH}; canvas.height = ${HEIGHT};
    const context = canvas.getContext('2d');
    const mimeType = ${JSON.stringify(MEDIARECORDER_VP9_MIME_TYPE)};
    if (!MediaRecorder.isTypeSupported(mimeType)) { reject(new Error('This browser does not support silent VP9 MediaRecorder WebM encoding. Install ffmpeg with libvpx-vp9 or use a VP9-capable Chrome or Edge build.')); return; }
    const chunks = []; const stream = canvas.captureStream(${FPS}); const track = stream.getVideoTracks()[0];
    const mediaRecorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 500000 });
    mediaRecorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
    mediaRecorder.onerror = event => reject(event.error || new Error('MediaRecorder failed'));
    mediaRecorder.onstop = () => { const reader = new FileReader(); reader.onloadend = () => resolve({ codec: 'vp9', base64: String(reader.result).split(',')[1] }); reader.readAsDataURL(new Blob(chunks, { type: mimeType })); };
    function draw(frame) {
      const t = frame / ${FRAME_COUNT - 1}; const id = ${JSON.stringify(id)};
      let x=0,y=0,scale=1,rotation=0; const wave=Math.sin(t*Math.PI*8)*1.8;
      if(id==='follow')x=-28*t; if(id==='spiral-up'||id==='spiral-down'){x=Math.cos(t*Math.PI*4)*12;y=(id==='spiral-up'?-1:1)*30*t+Math.sin(t*Math.PI*4)*7;rotation=(id==='spiral-up'?1:-1)*5*t;}
      if(id==='tilt-up'||id==='tilt-down')rotation=(id==='tilt-up'?-1:1)*9*t; if(id==='pan-left'||id==='pan-right')x=(id==='pan-left'?1:-1)*42*t; if(id==='crane-up'||id==='crane-down')y=(id==='crane-up'?1:-1)*32*t; if(id==='truck-left'||id==='truck-right')x=(id==='truck-left'?1:-1)*30*t;
      if(id==='dolly-in'||id==='dolly-out')scale=id==='dolly-in'?1+t*.28:1.28-t*.28; if(id==='zoom-in'||id==='zoom-out')scale=id==='zoom-in'?1+t*.4:1.4-t*.4; if(id==='dolly-zoom'){scale=1+t*.32;x=-24*t;} if(id==='orbit'){x=Math.cos(t*Math.PI*2)*20;y=Math.sin(t*Math.PI*2)*12;rotation=Math.sin(t*Math.PI*2)*3;} if(id==='roll')rotation=t*360; if(id==='fpv'){x=-45*t;scale=1+t*.2;} if(id==='drone'){y=-34*t;scale=1-t*.2;} if(id==='aerial'){y=25*t;scale=1.25-t*.22;} if(id==='handheld'){x=wave;y=Math.cos(t*Math.PI*5)*1.5;rotation=wave*.5;}
      context.fillStyle='#111722'; context.fillRect(0,0,320,180); context.strokeStyle='#344052'; context.lineWidth=.5; context.globalAlpha=.5; for(let n=0;n<17;n++){context.beginPath();context.moveTo(n*20,0);context.lineTo(n*20,180);context.moveTo(0,n*12);context.lineTo(320,n*12);context.stroke();} context.globalAlpha=1;
      context.save();context.translate(160+x,90+y);context.rotate(rotation*Math.PI/180);context.scale(scale,scale);context.translate(-160,-90); context.fillStyle='#0b0f17';context.beginPath();context.ellipse(160,140,105,20,0,0,Math.PI*2);context.fill(); context.fillStyle='#202c3c';context.fillRect(110,84,98,55); context.fillStyle='#ff6658';context.beginPath();context.arc(136,110,13,0,Math.PI*2);context.fill();context.fillStyle='#69d4e6';context.beginPath();context.arc(162,104,13,0,Math.PI*2);context.fill();context.fillStyle='#f3c760';context.beginPath();context.arc(184,117,13,0,Math.PI*2);context.fill();context.fillStyle='#d7e2ee';context.beginPath();context.arc(160,45,15,0,Math.PI*2);context.fill(); context.restore();
    }
    mediaRecorder.start(); for(let frame=0;frame<${FRAME_COUNT};frame+=1){draw(frame); track.requestFrame(); await new Promise(done=>setTimeout(done, ${Math.round(1000 / FPS)}));} mediaRecorder.stop();
  }))()`;
  const result = await cdpRequest(recorder.socket, recorder.state, "Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text ?? "MediaRecorder evaluation failed.");
  const value = result.result?.value;
  if (!value?.base64 || value.codec !== "vp9") throw new Error("MediaRecorder did not return a VP9 WebM preview.");
  writeFileSync(outputPath, Buffer.from(value.base64, "base64"));
  return value.codec;
}

async function encodeWithLocalBrowser(cameraIds, outputDirectory) {
  const recorder = await startBrowserRecorder();
  try {
    const codecs = new Set();
    for (const id of cameraIds) codecs.add(await encodeWebmWithMediaRecorder(recorder, id, resolve(outputDirectory, `${id}.webm`)));
    if (codecs.size !== 1 || !codecs.has("vp9")) throw new Error("Local browser did not return VP9 camera preview codecs.");
    return "vp9";
  } finally {
    recorder.socket.close();
    recorder.browser.kill();
    removeTemporaryDirectory(recorder.profileDirectory);
  }
}

export async function generateCameraAssets() {
  let useFfmpeg = true;
  try { assertFfmpegAvailable(); } catch { useFfmpeg = false; }
  const outputDirectory = resolve(CAMERA_LIBRARY_DIR, "v1");
  mkdirSync(outputDirectory, { recursive: true });
  const frameDirectory = resolve(tmpdir(), `tapflow-video-camera-frames-v1-${process.pid}`);
  removeTemporaryDirectory(frameDirectory);
  mkdirSync(frameDirectory, { recursive: true });

  try {
    for (const id of CAMERA_IDS) {
      const cameraFrames = resolve(frameDirectory, id);
      mkdirSync(cameraFrames, { recursive: true });
      for (let frame = 0; frame < FRAME_COUNT; frame += 1) {
        const image = sharp(Buffer.from(frameSvg(id, frame))).webp({ quality: 82 });
        await image.toFile(resolve(cameraFrames, `${String(frame).padStart(3, "0")}.webp`));
      }
      const poster = resolve(outputDirectory, `${id}.webp`);
      await sharp(resolve(cameraFrames, "000.webp")).webp({ quality: 86 }).toFile(poster);
      if (useFfmpeg) execFileSync("ffmpeg", ["-y", "-framerate", String(FPS), "-i", resolve(cameraFrames, "%03d.webp"), "-an", "-c:v", "libvpx-vp9", "-b:v", "0", "-crf", "34", "-pix_fmt", "yuv420p", resolve(outputDirectory, `${id}.webm`)], { stdio: "inherit" });
    }
    const codec = useFfmpeg ? "vp9" : await encodeWithLocalBrowser(CAMERA_IDS, outputDirectory);
    const manifest = { version: 1, attribution: "TapFlow original", items: CAMERA_IDS.map((id) => ({ id, label: CAMERA_LABELS[id], poster: `v1/${id}.webp`, preview: `v1/${id}.webm`, durationMs: DURATION_MS, version: 1, attribution: "TapFlow original", codec })) };
    writeFileSync(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);
    assertGeneratedAssets(manifest);
    return manifest;
  } finally {
    removeTemporaryDirectory(frameDirectory);
  }
}

if (import.meta.url === `file:///${process.argv[1]?.replaceAll("\\", "/")}`) {
  generateCameraAssets().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
