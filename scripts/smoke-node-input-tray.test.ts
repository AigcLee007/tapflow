import { describe, expect, test } from "vitest";

import {
  NODE_INPUT_TRAY_SMOKE_OUTPUT_DIR,
  buildNodeInputTraySmokeHtml,
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
    expect(code).toContain("upstream:upstream-image");
    expect(code).toContain("DataTransfer");
    expect(code).toContain("Reference image");
    expect(code).toContain("edges.some");
  });

  test("mounts real XYFlow, Store, and composer input sources", () => {
    const html = buildNodeInputTraySmokeHtml();
    for (const value of [
      "ReactFlowProvider",
      "useFlowCanvasStore",
      "VideoNodeComposer",
      "upstream-text",
      "upstream-image",
      "onEdgesChange([])",
      "mode:'text_to_video'",
      "onRemoveInput:key=>remove(id,key)",
      "onReorderInputs:keys=>reorder(id,keys)",
    ]) {
      expect(html).toContain(value);
    }
  });
});
