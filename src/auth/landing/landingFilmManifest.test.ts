import { describe, expect, test } from "vitest";

import { LANDING_FILM_MANIFEST, getLandingFilmUrl } from "./landingFilmManifest";

describe("landing film manifest", () => {
  test("defines every chapter with three Gemini variants", () => {
    expect(LANDING_FILM_MANIFEST.map((chapter) => chapter.id)).toEqual([
      "imagination",
      "rewrite",
      "form",
      "resolution",
    ]);
    expect(LANDING_FILM_MANIFEST.every((chapter) => chapter.variants.length === 3)).toBe(true);
    expect(LANDING_FILM_MANIFEST[0].variants.map((variant) => variant.id)).toEqual(["a", "b", "c"]);
  });

  test("constructs stable public media URLs from the configured base path", () => {
    expect(getLandingFilmUrl("imagination", "b", "poster", "/media/films/")).toBe(
      "/media/films/gemini-omni-flash/imagination/variant-b/desktop/poster.webp",
    );
    expect(getLandingFilmUrl("resolution", "c", "video", "/media/films")).toBe(
      "/media/films/gemini-omni-flash/resolution/variant-c/desktop/video.mp4",
    );
  });

  test("provides orientation-specific video and poster paths", () => {
    expect(getLandingFilmUrl("form", "a", "video", "/media", "desktop")).toContain("/desktop/video.mp4");
    expect(getLandingFilmUrl("form", "a", "poster", "/media", "mobile")).toContain("/mobile/poster.webp");
  });
});
