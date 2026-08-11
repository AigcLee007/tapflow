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
      "/media/films/gemini-omni-flash/imagination/variant-b/poster.webp",
    );
    expect(getLandingFilmUrl("resolution", "c", "video", "/media/films")).toBe(
      "/media/films/gemini-omni-flash/resolution/variant-c/video.mp4",
    );
  });
});
