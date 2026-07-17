import { describe, expect, test } from "vitest";

import {
  VIDEO_NODE_SMOKE_DEFAULT_URL,
  VIDEO_NODE_SMOKE_OUTPUT_DIR,
  buildVideoNodeCheckCode,
  buildVideoNodeSmokeHtml,
  parsePlaywrightCliJson,
} from "./smoke-video-node";

describe("video node browser smoke contract", () => {
  test("publishes the stable default URL and artifact directory", () => {
    expect(VIDEO_NODE_SMOKE_DEFAULT_URL).toBe("http://localhost:5188");
    expect(VIDEO_NODE_SMOKE_OUTPUT_DIR.replaceAll("\\", "/")).toBe("output/playwright/video-node");
  });

  test("mounts the real video node in an XYFlow/store harness", () => {
    const html = buildVideoNodeSmokeHtml();

    expect(html).toContain("VideoNodeComponent");
    expect(html).toContain("ReactFlow");
    expect(html).toContain("useFlowCanvasStore");
    expect(html).toContain("video-smoke-node");
  });

  test("checks the LibTV composer and the blocked-run boundary at all target viewports", () => {
    const code = buildVideoNodeCheckCode({
      desktopScreenshotPath: "output/playwright/video-node/desktop.png",
      mobileScreenshotPath: "output/playwright/video-node/mobile.png",
      narrowScreenshotPath: "output/playwright/video-node/narrow.png",
    });

    for (const field of [
      "composerVisible",
      "modelMenuNoSearch",
      "cameraGridColumns",
      "resolutionOptions",
      "cameraPresetCount",
      "blockedGenerationDidNotCreateRun",
      "durationRangeIsDefault",
      "parameterDialogIsTopLayer",
    ]) {
      expect(code).toContain(field);
    }
    expect(code).toContain("1440");
    expect(code).toContain("1024");
    expect(code).toContain("390");
    expect(code).toContain("4K");
    expect(code).toContain("prefers-reduced-motion");
    expect(code).toContain("runBackendWorkflow");
    expect(code).toContain("运镜库");
    expect(code).toContain("reducedMotionVideoIsPaused");
    expect(code).toContain("throw new Error");
    expect(code).toContain("browser.newContext");
    expect(code).toContain("newPage");
    expect(code).not.toContain("page.reload()");
  });

  test("parses Playwright CLI JSON and keeps its markdown failures visible", () => {
    expect(parsePlaywrightCliJson(JSON.stringify(JSON.stringify({ status: "ok" })))).toEqual({ status: "ok" });
    expect(() => parsePlaywrightCliJson("### Error\nfailed")).toThrow("### Error");
  });
});
