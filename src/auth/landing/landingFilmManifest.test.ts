import { describe, expect, test } from "vitest";

import { LANDING_FILM_MANIFEST, getLandingFilmUrl } from "./landingFilmManifest";
import { buildLandingFilmObjectKeys } from "../../../scripts/landing-film-pipeline";

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

  test("constructs URLs matching the immutable published object contract", () => {
    expect(getLandingFilmUrl("imagination", "b", "poster", "/media/films/")).toBe(
      "/media/films/imagination/variant-b/desktop/poster.webp",
    );
    expect(getLandingFilmUrl("resolution", "c", "video", "/media/films")).toBe(
      "/media/films/resolution/variant-c/desktop/loop.mp4",
    );
  });

  test("provides orientation-specific video and poster paths", () => {
    expect(getLandingFilmUrl("form", "a", "video", "/media", "desktop")).toContain("/desktop/loop.mp4");
    expect(getLandingFilmUrl("form", "a", "poster", "/media", "mobile")).toContain("/mobile/poster.webp");
  });

  test("maps every runtime film URL to its pipeline object path", () => {
    for (const chapter of LANDING_FILM_MANIFEST) for (const variant of chapter.variants) for (const orientation of ["desktop", "mobile"] as const) {
      const keys = buildLandingFilmObjectKeys(chapter.id, `variant-${variant.id}`, orientation);
      expect(getLandingFilmUrl(chapter.id, variant.id, "video", "/public-root", orientation)).toBe(`/public-root/${keys.video.replace("brand-media/tapflow/landing-film-v1/", "")}`);
      expect(getLandingFilmUrl(chapter.id, variant.id, "poster", "/public-root", orientation)).toBe(`/public-root/${keys.poster.replace("brand-media/tapflow/landing-film-v1/", "")}`);
    }
  });
});
