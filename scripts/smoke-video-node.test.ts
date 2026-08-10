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
    expect(html).toContain("creatorLabel: 'Gemini Omni Flash'");
    expect(html.match(/uiSchema:/g)).toHaveLength(2);
    expect(html).toContain("modelKey: 'limited-smoke'");
  });

  test("checks the LibTV composer and the blocked-run boundary at all target viewports", () => {
    const html = buildVideoNodeSmokeHtml();
    const code = buildVideoNodeCheckCode({
      desktopScreenshotPath: "output/playwright/video-node/desktop.png",
      mobileScreenshotPath: "output/playwright/video-node/mobile.png",
      narrowScreenshotPath: "output/playwright/video-node/narrow.png",
      tabletScreenshotPath: "output/playwright/video-node/tablet.png",
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
      "portraitEmptyNodeIsSized",
      "emptyUploadInputPresent",
      "emptyPreviewDoesNotOpenUpload",
      "topUploadButtonOpensUpload",
      "placeholderDropDoesNotUpload",
      "videoNodeHasNoResizeControls",
      "editorGeometryByZoom",
      "editorSizeStableAcrossZoom",
      "editorRemainsNodeAnchored",
      "capsuleWidthMatchesContent",
      "noParameterFlexExpansion",
      "readyControls",
      "readyPreviewUsesContain",
      "defaultGeminiSelected",
      "desktopActionsSingleRow",
      "tabletActionsSingleRow",
      "mobileActionsTwoGroups",
      "generationFeedbackVisibleUnselected",
      "generationControlsLocked",
      "reducedMotionFeedbackSafe",
      "modeAvailabilityNoMedia",
      "modeAvailabilityOneImage",
      "modeAvailabilityTwoImages",
      "modeAvailabilityThreeImages",
      "modeAvailabilityVideoOrAudio",
      "disabledModeTooltipVisible",
      "twoImagesDefaultToImageReference",
      "singleFrameRoleVisible",
      "orderedFrameRolesVisible",
      "modelUnsupportedAllReference",
    ]) {
      expect(code).toContain(field);
    }
    expect(code).toContain("1440");
    expect(code).toContain("1024");
    expect(code).toContain("390");
    expect(code).toContain("768");
    expect(code).toContain("1080P");
    expect(code).toContain('button[aria-label="视频参数摘要"]');
    expect(code).toContain("countDisabledStates");
    expect(code).toContain("await modelOption.click()");
    expect(code).toContain("prefers-reduced-motion");
    expect(code).toContain("runBackendWorkflow");
    expect(code).toContain("setVideoSmokeNodeData");
    expect(code).toContain('input[accept="video/*"]');
    expect(code).toContain("video-empty-placeholder");
    expect(code).toContain("setVideoSmokeZoom");
    expect(code).toContain('data-testid="video-composer-tools"');
    expect(code).toContain('data-testid="video-composer-actions"');
    expect(code).toContain('data-testid="video-composer-settings-group"');
    expect(code).toContain('data-testid="video-composer-submit-group"');
    expect(code).toContain("video-capsule-model");
    expect(code).toContain("video-capsule-parameters");
    expect(code).toContain("scrollWidth");
    expect(code).toContain("noParameterFlexExpansion");
    expect(code).toContain("expectedEditorGap");
    expect(code).toContain(".react-flow__resize-control");
    expect(code).toContain('[data-node-editor-variant="video"]');
    expect(code).toContain("objectFit === 'contain'");
    expect(code).toContain("下载视频");
    expect(code).toContain("全屏预览");
    expect(code).toContain("运镜库");
    expect(code).toContain("reducedMotionVideoIsPaused");
    expect(code).toContain("throw new Error");
    expect(code).toContain("browser.newContext");
    expect(code).toContain("newPage");
    expect(code).not.toContain("page.reload()");
    expect(html).toContain("modelKey: 'gemini-omni-flash'");
  });

  test("parses Playwright CLI JSON and keeps its markdown failures visible", () => {
    expect(parsePlaywrightCliJson(JSON.stringify(JSON.stringify({ status: "ok" })))).toEqual({ status: "ok" });
    expect(() => parsePlaywrightCliJson("### Error\nfailed")).toThrow("### Error");
  });
});
