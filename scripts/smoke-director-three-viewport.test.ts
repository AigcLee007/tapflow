import { describe, expect, test } from "vitest";

import {
  buildDirectorViewportSmokeHtml,
  buildDirectorViewportPixelCheckCode,
  parsePlaywrightCliJson,
} from "./smoke-director-three-viewport";

describe("StoryAI director desk smoke script helpers", () => {
  test("builds an HTTP-served smoke page for the director viewport", () => {
    const html = buildDirectorViewportSmokeHtml();

    expect(html).toContain("StoryAiDirectorDesk");
    expect(html).toContain("/src/flowCanvas/studios/StoryAiDirectorDesk.tsx");
    expect(html).toContain("directorDeskSmokeState");
    expect(html).toContain("setData(patch.director3d)");
    expect(html).toContain("sentCaptures");
    expect(html).toContain("onSendCapturesToCanvas");
    expect(html).not.toContain("data:text/html");
  });

  test("builds a pixel check that verifies a real WebGL canvas", () => {
    const code = buildDirectorViewportPixelCheckCode({
      screenshotPath: "output/playwright/director-viewport-desktop.png",
      viewport: { height: 720, width: 1280 },
    });

    expect(code).toContain("getContext(\"webgl2\")");
    expect(code).toContain("readPixels");
    expect(code).toContain("storyai-director-desk");
    expect(code).toContain("storyai-add-character-mannequin");
    expect(code).toContain("camera-capture-card");
    expect(code).toContain("camera-capture-send-one");
    expect(code).toContain("camera-capture-send-all");
    expect(code).toContain("sentCaptureCount");
    expect(code).toContain("hasSentCaptures");
    expect(code).toContain("DataTransfer");
    expect(code).toContain("panoramaAssetUrl");
    expect(code).toContain("hasSafePatch");
    expect(code).toContain("director-viewport-desktop.png");
    expect(code).toContain("throw new Error");
  });

  test("parses nested JSON returned by playwright-cli raw run-code", () => {
    const cliOutput = JSON.stringify(JSON.stringify({ ok: true, patchNodeId: "director-node" }));

    expect(parsePlaywrightCliJson(cliOutput)).toEqual({
      ok: true,
      patchNodeId: "director-node",
    });
  });

  test("preserves playwright-cli markdown errors instead of hiding them behind a JSON parse error", () => {
    expect(() => parsePlaywrightCliJson("### Error\n{\"ok\":false}")).toThrow("### Error");
  });
});
