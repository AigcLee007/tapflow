import { describe, expect, test } from "vitest";

import {
  buildDirectorViewportSmokeHtml,
  buildDirectorViewportPixelCheckCode,
  parsePlaywrightCliJson,
} from "./smoke-director-three-viewport";

describe("director three viewport smoke script helpers", () => {
  test("builds an HTTP-served smoke page for the director viewport", () => {
    const html = buildDirectorViewportSmokeHtml();

    expect(html).toContain("DirectorDeskThreeViewport");
    expect(html).toContain("/src/flowCanvas/studios/DirectorDeskThreeViewport.tsx");
    expect(html).toContain("data-testid");
    expect(html).not.toContain("data:text/html");
  });

  test("builds a pixel check that verifies a real WebGL canvas", () => {
    const code = buildDirectorViewportPixelCheckCode({
      screenshotPath: "output/playwright/director-viewport-desktop.png",
      viewport: { height: 720, width: 1280 },
    });

    expect(code).toContain("getContext(\"webgl2\")");
    expect(code).toContain("readPixels");
    expect(code).toContain("director-viewport-desktop.png");
    expect(code).toContain("throw new Error");
  });

  test("parses nested JSON returned by playwright-cli raw run-code", () => {
    const cliOutput = JSON.stringify(JSON.stringify({ ok: true, renderer: "three" }));

    expect(parsePlaywrightCliJson(cliOutput)).toEqual({
      ok: true,
      renderer: "three",
    });
  });
});
