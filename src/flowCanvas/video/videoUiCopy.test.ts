import { describe, expect, test } from "vitest";

import {
  formatVideoModelEstimatedDuration,
  getVideoModelDescription,
  VIDEO_UI_BLOCKER_COPY,
  VIDEO_UI_COPY,
  VIDEO_UI_MODE_COPY,
  VIDEO_UI_REFERENCE_ROLE_COPY,
  getVideoModeUnavailableReason,
} from "./videoUiCopy";

const MOJIBAKE_TOKENS = ["\uFFFD", "\u00E9\u00A2\u0091", "\u00E7\u0094\u009F", "\u00E8\u00A7\u0086", "\u00A6\u0086"];

function collectCopyValues(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (!value || typeof value !== "object") return [];
  return Object.values(value).flatMap(collectCopyValues);
}

describe("VIDEO_UI_COPY", () => {
  test("keeps ratio-control Chinese copy centralized", () => {
    expect(VIDEO_UI_COPY.auto).toBe("自动");
    expect(VIDEO_UI_COPY.unsupportedByCurrentModel).toBe("当前模型不支持");
  });

  test("labels canonical reference roles and model capability blockers", () => {
    expect(VIDEO_UI_REFERENCE_ROLE_COPY.main_image).toBe("\u4e3b\u53c2\u8003\u56fe");
    expect(VIDEO_UI_REFERENCE_ROLE_COPY.source_video).toBe("\u6e90\u89c6\u9891");
    expect(VIDEO_UI_BLOCKER_COPY.VIDEO_MODE_INPUT_REQUIRED).toBe("\u5f53\u524d\u751f\u6210\u6a21\u5f0f\u9700\u8981\u8865\u5145\u53c2\u8003\u7d20\u6750");
    expect(VIDEO_UI_BLOCKER_COPY.UNSUPPORTED_DURATION).toBe("\u5f53\u524d\u6a21\u578b\u4e0d\u652f\u6301\u8be5\u89c6\u9891\u65f6\u957f");
  });

  test("provides non-empty Chinese creator copy without replacement characters or mojibake", () => {
    const values = collectCopyValues({
      VIDEO_UI_COPY,
      VIDEO_UI_MODE_COPY,
      VIDEO_UI_REFERENCE_ROLE_COPY,
    });

    expect(values.length).toBeGreaterThan(20);
    for (const value of values) {
      expect(value.trim()).not.toBe("");
      expect(value).toMatch(/[\u3400-\u9FFF]/u);
      for (const token of MOJIBAKE_TOKENS) expect(value).not.toContain(token);
    }
  });
});

describe("video model presentation copy", () => {
  test("converts recognized external duration strings into Chinese presentation copy", () => {
    expect(formatVideoModelEstimatedDuration("Up to 8 seconds")).toBe("预计 8 秒");
    expect(formatVideoModelEstimatedDuration("About 1 minute")).toBe("预计 1 分钟");
  });

  test("does not expose unrecognized external duration or non-Chinese descriptions", () => {
    expect(formatVideoModelEstimatedDuration("fast response")).toBeNull();
    expect(getVideoModelDescription("Fast motion and cinematic composition.")).toBe("暂无中文模型说明");
    expect(getVideoModelDescription("适合电影感动态镜头")).toBe("适合电影感动态镜头");
  });

  test("only exposes descriptions made of Chinese text, numbers, whitespace, and approved punctuation", () => {
    expect(getVideoModelDescription("适合 fast motion")).toBe("暂无中文模型说明");
    expect(getVideoModelDescription("支持 4K and audio")).toBe("暂无中文模型说明");
    expect(getVideoModelDescription("适合电影感动态镜头，画面稳定。 ")).toBe("适合电影感动态镜头，画面稳定。 ");
    expect(getVideoModelDescription("支持 4K / 16:9，时长 8 秒")).toBe("支持 4K / 16:9，时长 8 秒");
    expect(getVideoModelDescription("适合动态镜头\nhttps://example.com")).toBe("暂无中文模型说明");
  });
});

describe("video mode availability copy", () => {
  test("explains input and model availability reasons in Chinese", () => {
    const counts = { audio: 0, image: 2, text: 1, total: 2, video: 0 };
    expect(getVideoModeUnavailableReason("INPUT_MEDIA_NOT_ALLOWED", counts)).toBe("已添加媒体素材，无法使用文生视频");
    expect(getVideoModeUnavailableReason("INPUT_REQUIRES_EXACTLY_ONE_IMAGE", counts)).toBe("图生视频需要恰好 1 张图片（当前 2 张）");
    expect(getVideoModeUnavailableReason("INPUT_REQUIRES_IMAGE", counts)).toBe("图像参考生视频需要至少 1 张图片");
    expect(getVideoModeUnavailableReason("INPUT_REQUIRES_MEDIA", counts)).toBe("全参考生视频需要至少 1 个媒体素材");
    expect(getVideoModeUnavailableReason("INPUT_REQUIRES_ONE_OR_TWO_IMAGES", counts)).toBe("首尾帧生视频需要 1-2 张图片（当前 2 张）");
    expect(getVideoModeUnavailableReason("INPUT_VIDEO_OR_AUDIO_REQUIRES_ALL_REFERENCE", counts)).toBe("视频或音频素材仅支持全参考生视频");
    expect(getVideoModeUnavailableReason("MODEL_UNSUPPORTED", counts)).toBe("当前模型不支持该生成模式");
    expect(getVideoModeUnavailableReason("MODEL_CONSTRAINT_UNMET", counts)).toBe("当前模型的输入限制不满足");
  });
});
