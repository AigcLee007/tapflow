import { describe, expect, test } from "vitest";

import { buildProductionImagePrompt } from "../src/production-image-prompt.js";

describe("buildProductionImagePrompt", () => {
  test("keeps standard and unknown modes unchanged", () => {
    expect(buildProductionImagePrompt("quiet studio", { params: { generationMode: "standard" } })).toBe("quiet studio");
    expect(buildProductionImagePrompt("quiet studio", { params: { generationMode: "unsupported" } })).toBe("quiet studio");
    expect(buildProductionImagePrompt("quiet studio", {})).toBe("quiet studio");
  });

  test("adds 360 panorama production instructions", () => {
    const prompt = buildProductionImagePrompt("future city courtyard", {
      params: {
        generationMode: "panorama_360",
        panorama: {
          continuity: "seamless",
          projectionHint: "equirectangular",
          subjectType: "scene",
        },
      },
    });

    expect(prompt).toContain("future city courtyard");
    expect(prompt).toContain("360-degree equirectangular panorama");
    expect(prompt).toContain("seamless left-right continuity");
    expect(prompt).toContain("2:1 equirectangular unwrap");
    expect(prompt).toContain("Do not create a flat wide-angle image");
    expect(prompt).toContain("left edge and right edge must connect");
  });

  test("adds continuous 270 wraparound environment instructions", () => {
    const prompt = buildProductionImagePrompt("ancient library hall", {
      params: {
        generationMode: "wraparound_270",
        wraparound: {
          coverageDegrees: 270,
          layout: "continuous",
          panels: 3,
          subjectType: "scene",
        },
      },
    });

    expect(prompt).toContain("ancient library hall");
    expect(prompt).toContain("270-degree wraparound environment");
    expect(prompt).toContain("three connected sides");
  });

  test("adds three-panel subject orbit sheet instructions", () => {
    const prompt = buildProductionImagePrompt("red travel backpack", {
      params: {
        generationMode: "subject_orbit_270",
        wraparound: {
          coverageDegrees: 270,
          layout: "three_panel_sheet",
          panels: 3,
          subjectType: "subject",
        },
      },
    });

    expect(prompt).toContain("red travel backpack");
    expect(prompt).toContain("270-degree three-panel subject orbit sheet");
    expect(prompt).toContain("front, three-quarter, and side/back views");
    expect(prompt).toContain("not a single 270-degree camera angle");
  });
});
