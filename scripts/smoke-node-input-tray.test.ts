import { describe, expect, test } from "vitest";

import {
  NODE_INPUT_TRAY_SMOKE_OUTPUT_DIR,
  buildNodeInputTraySmokeCheckCode,
} from "./smoke-node-input-tray";

describe("node input tray browser smoke contract", () => {
  test("checks unified upstream inputs at desktop, tablet, and mobile sizes", () => {
    expect(NODE_INPUT_TRAY_SMOKE_OUTPUT_DIR.replaceAll("\\", "/")).toBe("output/playwright/node-input-tray");
    const code = buildNodeInputTraySmokeCheckCode({
      desktopScreenshotPath: "output/playwright/node-input-tray/desktop.png",
      mobileScreenshotPath: "output/playwright/node-input-tray/mobile.png",
      tabletScreenshotPath: "output/playwright/node-input-tray/tablet.png",
    });

    for (const value of ["1440", "1024", "390", "NodeInputTray", "text_to_video", "removeNodeInput", "reorderNodeInputs", "overflow"]) {
      expect(code).toContain(value);
    }
  });
});
