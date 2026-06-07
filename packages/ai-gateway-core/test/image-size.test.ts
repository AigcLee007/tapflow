import { describe, expect, test } from "vitest";

import {
  normalizeOpenAiCompatibleImageSize,
  normalizeOpenAiImagePixelSize,
} from "../src/image-size.js";

function expectValidPixelSize(value: string | null): { height: number; width: number } {
  expect(value).toMatch(/^\d+x\d+$/);
  const [width, height] = String(value).split("x").map(Number);
  expect(width % 16).toBe(0);
  expect(height % 16).toBe(0);
  expect(Math.max(width, height)).toBeLessThanOrEqual(3840);
  expect(Math.max(width / height, height / width)).toBeLessThanOrEqual(3);
  expect(width * height).toBeGreaterThanOrEqual(655_360);
  expect(width * height).toBeLessThanOrEqual(8_294_400);
  return { height, width };
}

describe("OpenAI image size normalization", () => {
  test("keeps auto as provider payload size", () => {
    expect(normalizeOpenAiCompatibleImageSize("auto")).toBe("auto");
    expect(normalizeOpenAiCompatibleImageSize("AUTO")).toBe("auto");
  });

  test("keeps explicit 1024x1024 pixel size", () => {
    expect(normalizeOpenAiCompatibleImageSize("1024x1024")).toBe("1024x1024");
  });

  test("normalizes arbitrary pixel size to valid 16-aligned constraints", () => {
    const normalized = normalizeOpenAiImagePixelSize("1033x1522");
    const dimensions = expectValidPixelSize(normalized);
    expect(`${dimensions.width}x${dimensions.height}`).toBe("1040x1520");
  });

  test("converts 1k tier with 1:1 aspect ratio to concrete pixel size", () => {
    const normalized = normalizeOpenAiCompatibleImageSize("1k", "1:1");
    expect(normalized).not.toBe("1k");
    expect(normalized).not.toBe("1K");
    expect(normalized).toBe("1248x1248");
    expectValidPixelSize(normalized);
  });

  test("converts 2k tier with 16:9 aspect ratio to concrete pixel size", () => {
    const normalized = normalizeOpenAiCompatibleImageSize("2k", "16:9");
    expect(normalized).not.toBe("2k");
    expect(normalized).not.toBe("2K");
    expect(normalized).toBe("2720x1536");
    expectValidPixelSize(normalized);
  });

  test("converts 4k tier with 3:4 aspect ratio to concrete pixel size", () => {
    const normalized = normalizeOpenAiCompatibleImageSize("4k", "3:4");
    expect(normalized).not.toBe("4k");
    expect(normalized).not.toBe("4K");
    expect(normalized).toBe("2480x3312");
    expectValidPixelSize(normalized);
  });
});
