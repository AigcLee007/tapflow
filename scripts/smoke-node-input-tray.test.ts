import { describe, expect, test } from "vitest";

import {
  NODE_INPUT_TRAY_SMOKE_CONTRACT,
  NODE_INPUT_TRAY_SMOKE_OUTPUT_DIR,
  buildNodeInputTraySmokeCheckCode,
  buildNodeInputTraySmokeHtml,
} from "./smoke-node-input-tray";

describe("node input tray browser smoke contract", () => {
  test("checks unified upstream inputs at desktop, tablet, and mobile sizes", () => {
    expect(NODE_INPUT_TRAY_SMOKE_OUTPUT_DIR.replaceAll("\\", "/")).toBe("output/playwright/node-input-tray");
    const code = buildNodeInputTraySmokeCheckCode({
      desktopScreenshotPath: "output/playwright/node-input-tray/desktop.png",
      mobileScreenshotPath: "output/playwright/node-input-tray/mobile.png",
      tabletScreenshotPath: "output/playwright/node-input-tray/tablet.png",
    });
    const html = buildNodeInputTraySmokeHtml();
    const source = `${NODE_INPUT_TRAY_SMOKE_CONTRACT}\n${html}\n${code}`;
    for (const value of [
      "1440", "1024", "390", "NodeInputTray", "text_to_video", "removeNodeInput", "reorderNodeInputs", "overflow",
      "文本输入，共 2 个节点", "MediaMentionPromptEditor", "@图片1", "@视频1", "video.play", "hoverPreviewUrl", "removeTextNodeInputs",
      "document.documentElement.scrollWidth", "upstream:upstream-image", "DataTransfer", "Reference image", "Unconnected video",
      "Library image", "asset:asset-library", "connected:upstream:upstream-image", "canvas:upstream-video", "option", "edges.some",
    ]) {
      expect(source).toContain(value);
    }
  });

  test("mounts real XYFlow, Store, and composer input sources", () => {
    const html = buildNodeInputTraySmokeHtml();
    for (const value of [
      "ReactFlowProvider", "useFlowCanvasStore", "VideoNodeComposer", "MediaMentionPromptEditor", "upstream-text", "upstream-text-2",
      "upstream-image", "upstream-video", "asset-library", "/logo.png", "/video-camera-library/v2/fixed.mp4", "onEdgesChange([])",
      "mode:'text_to_video'", "onRemoveInput:key=>remove(id,key)", "onRemoveAllText:()=>removeText(id)", "onReorderInputs:keys=>reorder(id,keys)",
    ]) {
      expect(html).toContain(value);
    }
  });
});
