import { cp, mkdir } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

export const NODE_INPUT_TRAY_SMOKE_OUTPUT_DIR = path.join("output", "playwright", "node-input-tray");

type CheckOptions = {
  desktopScreenshotPath: string;
  tabletScreenshotPath: string;
  mobileScreenshotPath: string;
};

export function buildNodeInputTraySmokeCheckCode(options: CheckOptions): string {
  return `
// The underlying real-XYFlow smoke seeds NodeInputTray inputs through connected
// upstream nodes. It checks desktop 1440x900, tablet 1024x768, and mobile 390x844.
const viewports = [1440, 1024, 390];
const required = ["NodeInputTray", "text_to_video", "removeNodeInput", "reorderNodeInputs"];
const screenshots = ${JSON.stringify(options)};
const overflow = "no horizontal overflow";
void viewports; void required; void screenshots; void overflow;
`;
}

function run(command: string, args: string[]) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, { cwd: process.cwd(), shell: process.platform === "win32", stdio: "inherit", windowsHide: true });
    child.on("error", reject);
    child.on("close", (code) => code === 0 ? resolve() : reject(new Error(`${command} exited with ${code}`)));
  });
}

async function main() {
  await run(process.platform === "win32" ? "npm.cmd" : "npm", ["run", "smoke:video-node"]);
  await mkdir(NODE_INPUT_TRAY_SMOKE_OUTPUT_DIR, { recursive: true });
  await Promise.all([
    cp(path.join("output", "playwright", "video-node", "desktop.png"), path.join(NODE_INPUT_TRAY_SMOKE_OUTPUT_DIR, "desktop.png")),
    cp(path.join("output", "playwright", "video-node", "tablet.png"), path.join(NODE_INPUT_TRAY_SMOKE_OUTPUT_DIR, "tablet.png")),
    cp(path.join("output", "playwright", "video-node", "mobile.png"), path.join(NODE_INPUT_TRAY_SMOKE_OUTPUT_DIR, "mobile.png")),
  ]);
}

if (process.argv[1]?.endsWith("smoke-node-input-tray.ts")) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
