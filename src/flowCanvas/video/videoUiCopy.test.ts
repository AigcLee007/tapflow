import { describe, expect, test } from "vitest";

import {
  formatVideoModelEstimatedDuration,
  getVideoModelDescription,
  VIDEO_UI_BLOCKER_COPY,
  VIDEO_UI_COPY,
  VIDEO_UI_MODE_COPY,
  VIDEO_UI_REFERENCE_ROLE_COPY,
  getVideoModeUnavailableReason,
  getVideoModeSwitchMessage,
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
    expect(VIDEO_UI_MODE_COPY.all_reference.label).toBe("全能参考视频");
    expect(getVideoModeUnavailableReason("INPUT_REQUIRES_MEDIA", counts)).toBe("全能参考视频需要至少 1 个媒体素材");
    expect(getVideoModeUnavailableReason("INPUT_REQUIRES_ONE_OR_TWO_IMAGES", counts)).toBe("首尾帧生视频需要 1-2 张图片（当前 2 张）");
    expect(getVideoModeUnavailableReason("INPUT_VIDEO_OR_AUDIO_REQUIRES_ALL_REFERENCE", counts)).toBe("视频或音频素材仅支持全能参考视频");
    expect(getVideoModeUnavailableReason("MODEL_UNSUPPORTED", counts)).toBe("当前模型不支持该生成模式");
    expect(getVideoModeUnavailableReason("MODEL_CONSTRAINT_UNMET", counts)).toBe("当前模型的输入限制不满足");
  });

  test.each([
    [{ audio: 0, image: 0, text: 1, total: 0, video: 0 }, "text_to_video", false, "\u5f53\u524d\u6ca1\u6709\u5a92\u4f53\u8f93\u5165\uff0c\u5df2\u5207\u6362\u4e3a\u6587\u751f\u89c6\u9891"],
    [{ audio: 0, image: 1, text: 0, total: 1, video: 0 }, "image_to_video", false, "\u6839\u636e 1 \u5f20\u56fe\u7247\u5df2\u5207\u6362\u4e3a\u56fe\u751f\u89c6\u9891"],
    [{ audio: 0, image: 2, text: 0, total: 2, video: 0 }, "first_last_frame", false, "\u6839\u636e 2 \u5f20\u56fe\u7247\u5df2\u5207\u6362\u4e3a\u9996\u5c3e\u5e27\u751f\u89c6\u9891"],
    [{ audio: 0, image: 3, text: 0, total: 3, video: 0 }, "image_reference", false, "\u6839\u636e 3 \u5f20\u56fe\u7247\u5df2\u5207\u6362\u4e3a\u56fe\u50cf\u53c2\u8003\u751f\u89c6\u9891"],
    [{ audio: 0, image: 0, text: 0, total: 1, video: 1 }, "all_reference", true, "\u89c6\u9891\u6216\u97f3\u9891\u8f93\u5165\u9700\u8981\u4f7f\u7528\u5168\u80fd\u53c2\u8003\u89c6\u9891\uff0c\u5f53\u524d\u6a21\u578b\u4e0d\u652f\u6301\u8be5\u6a21\u5f0f"],
  ])("describes automatic switches for the complete input topology", (counts, targetMode, incompatible, expected) => {
    expect(getVideoModeSwitchMessage(counts, targetMode, incompatible)).toBe(expected);
  });
});
