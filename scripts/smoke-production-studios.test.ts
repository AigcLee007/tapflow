import { describe, expect, test } from "vitest";

import {
  buildProductionStudiosCheckCode,
  buildProductionStudiosSmokeHtml,
  parsePlaywrightCliJson,
} from "./smoke-production-studios";

describe("production studios smoke script helpers", () => {
  test("builds an HTTP-served smoke page for all production studios", () => {
    const html = buildProductionStudiosSmokeHtml();

    expect(html).toContain("ProductionStudioShell");
    expect(html).toContain("ImagePromptActionRow");
    expect(html).toContain("buildImageGenerationModeParamPatch");
    expect(html).toContain("/src/flowCanvas/studios/ProductionStudioShell.tsx");
    expect(html).toContain("data-testid=\"production-studios-smoke-root\"");
    expect(html).toContain("image-production-mode-smoke");
    expect(html).toContain("video_editor");
    expect(html).not.toContain("data:text/html");
  });

  test("builds a browser check for studio UI controls and export guards", () => {
    const code = buildProductionStudiosCheckCode({
      screenshotPath: "output/playwright/production-studios-smoke.png",
      viewport: { height: 720, width: 1280 },
    });

    expect(code).toContain("选择输出规格 1:1 1080p");
    expect(code).toContain("请先绑定素材库资产");
    expect(code).toContain("图片生成模式 标准");
    expect(code).toContain("subject_orbit_270");
    expect(code).toContain("合成故事板图");
    expect(code).toContain("dispatchAssetDrop");
    expect(code).toContain("application/x-tapflow-asset-id");
    expect(code).toContain("directorActorDropPatch");
    expect(code).toContain("directorSceneDropPatch");
    expect(code).toContain("storyboardDropPatch");
    expect(code).toContain("videoClipDropPatch");
    expect(code).toContain("videoAudioDropPatch");
    expect(code).toContain("request.data?.params?.storyboardSheet?.sourceStoryboardNodeId");
    expect(code).toContain("production-studios-smoke.png");
    expect(code).toContain("throw new Error");
  });

  test("parses nested JSON returned by playwright-cli raw run-code", () => {
    const cliOutput = JSON.stringify(JSON.stringify({ status: "ok" }));

    expect(parsePlaywrightCliJson(cliOutput)).toEqual({ status: "ok" });
  });
});
