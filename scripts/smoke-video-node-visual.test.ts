import { describe, expect, test } from "vitest";

import {
  VIDEO_NODE_VISUAL_OUTPUT_DIR,
  VIDEO_NODE_VISUAL_SHOTS,
  buildVideoNodeVisualCheckCode,
} from "./smoke-video-node-visual";

describe("video node visual acceptance contract", () => {
  test("defines the six screenshot states and stable output directory", () => {
    expect(VIDEO_NODE_VISUAL_SHOTS).toEqual([
      "composer-default",
      "parameters-open",
      "camera-library-open",
      "palette-open",
      "narrow",
      "mobile",
    ]);
    expect(VIDEO_NODE_VISUAL_OUTPUT_DIR).toBe("output/playwright/video-node-visual");
  });

  test("checks Chinese copy, independent viewport contexts, and the required visual surfaces", () => {
    const code = buildVideoNodeVisualCheckCode({
      outputDirectory: VIDEO_NODE_VISUAL_OUTPUT_DIR,
    });

    expect(code).toContain("browser.newContext");
    expect(code).toContain("视频创作面板");
    expect(code).toContain("视频参数");
    expect(code).toContain("运镜库");
    expect(code).toContain("调色盘");
    expect(code).toContain("23");
    expect(code).toContain("4K");
    expect(code).toContain("English video UI remains");
    expect(code).toContain("Video UI contains mojibake");
  });
});
