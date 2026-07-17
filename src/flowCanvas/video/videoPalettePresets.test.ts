import { describe, expect, test } from "vitest";

import {
  VIDEO_CONTEXT_COLOR_PRESETS,
  VIDEO_CONTEXT_PALETTE_GROUPS,
  VIDEO_VISUAL_TONE_PRESETS,
} from "./videoPalettePresets";

describe("videoPalettePresets", () => {
  test("provides twelve context colors", () => {
    expect(VIDEO_CONTEXT_COLOR_PRESETS).toHaveLength(12);
    expect(VIDEO_CONTEXT_COLOR_PRESETS.map((color) => color.token)).toEqual([
      "洋红", "湖蓝", "柠檬黄", "橙红", "紫罗兰", "翠绿",
      "天蓝", "金黄", "葡萄紫", "青绿", "草绿", "靛蓝",
    ]);
    expect(VIDEO_CONTEXT_COLOR_PRESETS.every((color) => /^#[0-9A-F]{6}$/i.test(color.hex))).toBe(true);
  });

  test("maps reference roles to Chinese semantic groups", () => {
    expect(VIDEO_CONTEXT_PALETTE_GROUPS).toEqual([
      { roles: ["subject"], title: "人物颜色" },
      { roles: ["scene"], title: "场景颜色" },
      { roles: ["prop"], title: "道具颜色" },
      { roles: ["style"], title: "风格颜色" },
    ]);
  });

  test("provides five Chinese visual tones with three actual color strips", () => {
    expect(VIDEO_VISUAL_TONE_PRESETS.map((tone) => tone.label)).toEqual([
      "自然", "青橙电影", "暖色夕阳", "冷调月光", "黑白",
    ]);
    expect(VIDEO_VISUAL_TONE_PRESETS.every((tone) => tone.strips.length === 3)).toBe(true);
    expect(VIDEO_VISUAL_TONE_PRESETS.flatMap((tone) => tone.strips).every((hex) => /^#[0-9A-F]{6}$/i.test(hex))).toBe(true);
  });
});
