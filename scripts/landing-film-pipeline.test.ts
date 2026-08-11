import { describe, expect, test } from "vitest";

import { LANDING_FILM_BRIEFS, LANDING_FILM_ROUTE_KEY, makeLandingFilmJobs } from "./landing-film-prompts.js";
import { buildLandingFilmObjectKeys, parseLandingFilmCommand, selectApprovedFilms } from "./landing-film-pipeline.js";

describe("landing film generation contracts", () => {
  test("defines twelve literal Gemini briefs and produces desktop plus mobile jobs", () => {
    expect(LANDING_FILM_ROUTE_KEY).toBe("video.pixelhub.gemini-omni-flash");
    expect(LANDING_FILM_BRIEFS).toHaveLength(12);
    expect(makeLandingFilmJobs()).toHaveLength(24);
    expect(makeLandingFilmJobs()).toEqual(expect.arrayContaining([
      expect.objectContaining({ aspectRatio: "16:9", durationSeconds: 8, resolution: "1080P" }),
      expect.objectContaining({ aspectRatio: "9:16", durationSeconds: 8, resolution: "1080P" }),
    ]));
    for (const brief of LANDING_FILM_BRIEFS) {
      expect(brief.desktopPrompt).toMatch(/no text, no logo, no watermark/i);
      expect(brief.mobilePrompt).toMatch(/no text, no logo, no watermark/i);
    }
  });

  test("uses immutable v1 object keys", () => {
    expect(buildLandingFilmObjectKeys("imagination", "variant-a", "desktop")).toEqual({
      master: "brand-media/tapflow/landing-film-v1/imagination/variant-a/desktop/master.mp4",
      poster: "brand-media/tapflow/landing-film-v1/imagination/variant-a/desktop/poster.webp",
      video: "brand-media/tapflow/landing-film-v1/imagination/variant-a/desktop/loop.mp4",
    });
  });

  test("defaults to dry run and requires explicit cost confirmation for generation", () => {
    expect(parseLandingFilmCommand([])).toMatchObject({ dryRun: true, generationConfirmed: false, publish: false });
    expect(() => parseLandingFilmCommand(["--generate"])).toThrow(/confirm-generation-cost/);
    expect(parseLandingFilmCommand(["--generate", "--confirm-generation-cost"])).toMatchObject({ dryRun: false, generationConfirmed: true });
  });

  test("publishes only explicit approved manifest selections", () => {
    const jobs = makeLandingFilmJobs();
    expect(selectApprovedFilms(jobs, { approved: [{ chapter: "imagination", variant: "variant-a", viewport: "desktop", startSeconds: 0, durationSeconds: 8 }] })).toHaveLength(1);
    expect(() => selectApprovedFilms(jobs, { approved: [] })).toThrow(/at least one/i);
    expect(() => selectApprovedFilms(jobs, { approved: [{ chapter: "imagination", variant: "variant-a", viewport: "desktop", startSeconds: 0, durationSeconds: 7 }] })).toThrow(/8 and 12/i);
  });
});
