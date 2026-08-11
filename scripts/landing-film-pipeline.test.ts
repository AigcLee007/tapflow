import { describe, expect, test } from "vitest";

import { LANDING_FILM_BRIEFS, LANDING_FILM_ROUTE_KEY, makeLandingFilmJobs } from "./landing-film-prompts.js";
import { assertLandingFilmProbeResults, buildImmutableLandingFilmPutInput, buildLandingFilmFfmpegArgs, buildLandingFilmObjectKeys, parseLandingFilmCommand, selectApprovedFilms } from "./landing-film-pipeline.js";

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

  test("uses an atomic no-overwrite condition for every published object", () => {
    expect(buildImmutableLandingFilmPutInput("bucket", "brand-media/tapflow/landing-film-v1/loop.mp4", Buffer.from("video"), "video/mp4")).toMatchObject({
      Bucket: "bucket", ContentType: "video/mp4", IfNoneMatch: "*", Key: "brand-media/tapflow/landing-film-v1/loop.mp4",
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

  test("accepts an H.264 silent faststart MP4 and readable WebP poster", () => {
    expect(() => assertLandingFilmProbeResults(
      { format: { format_name: "mov,mp4,m4a,3gp,3g2,mj2" }, streams: [{ codec_name: "h264", codec_type: "video" }] },
      { format: { format_name: "webp" }, streams: [{ codec_name: "webp", codec_type: "video" }] },
      true,
    )).not.toThrow();
  });

  test("uses silent H.264 faststart and WebP ffmpeg arguments", () => {
    const args = buildLandingFilmFfmpegArgs("master.mp4", "loop.mp4", "poster.webp", { chapter: "imagination", variant: "variant-a", viewport: "desktop", startSeconds: 0, durationSeconds: 8 });
    expect(args.video).toEqual(expect.arrayContaining(["-an", "-c:v", "libx264", "-movflags", "+faststart", "loop.mp4"]));
    expect(args.poster).toEqual(expect.arrayContaining(["-frames:v", "1", "-c:v", "libwebp", "poster.webp"]));
  });

  test("rejects non-H.264, audio-bearing, non-faststart, or unreadable output", () => {
    expect(() => assertLandingFilmProbeResults(
      { format: { format_name: "matroska" }, streams: [{ codec_name: "vp9", codec_type: "video" }, { codec_type: "audio" }] },
      { format: { format_name: "png" }, streams: [{ codec_name: "png", codec_type: "video" }] },
      false,
    )).toThrow(/H\.264|audio|faststart|WebP/i);
  });
});
