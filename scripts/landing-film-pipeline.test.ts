import { describe, expect, test } from "vitest";

import { LANDING_FILM_BRIEFS, LANDING_FILM_ROUTE_KEY, makeLandingFilmJobs } from "./landing-film-prompts.js";
import { assertLandingFilmProbeResults, buildImmutableLandingFilmPutInput, buildLandingFilmFfmpegArgs, buildLandingFilmObjectKeys, classifyExistingImmutableObject, getLandingFilmPublicUrl, isImmutablePreconditionFailure, parseLandingFilmCommand, requireLandingMediaPublicBaseUrl, selectApprovedFilms } from "./landing-film-pipeline.js";
import { buildLandingFilmRouteQuery, buildVideoDownloadRequest, resolveLandingFilmRouteScope } from "./generate-landing-films.js";

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

  test("recovers a matching partial publication but rejects mismatched immutable content", () => {
    expect(classifyExistingImmutableObject("abc123", { sha256: "abc123" })).toBe("already-published");
    expect(classifyExistingImmutableObject("abc123", undefined)).toBe("missing");
    expect(() => classifyExistingImmutableObject("abc123", { sha256: "different" })).toThrow(/immutable/i);
    expect(isImmutablePreconditionFailure({ $metadata: { httpStatusCode: 412 } })).toBe(true);
  });

  test("downloads provider output without forwarding the provider credential", () => {
    expect(buildVideoDownloadRequest("https://provider.example/video.mp4", 0)).toEqual({ headers: {}, url: "https://provider.example/video.mp4" });
    expect(buildVideoDownloadRequest("https://provider.example/video.mp4", 123)).toEqual({ headers: { Range: "bytes=123-" }, url: "https://provider.example/video.mp4" });
  });

  test("requires exactly one explicit live-generation route selection mode", () => {
    expect(resolveLandingFilmRouteScope({ LANDING_FILM_TENANT_ID: " 00000000-0000-4000-8000-000000000001 " })).toEqual({ tenantId: "00000000-0000-4000-8000-000000000001", type: "tenant" });
    expect(resolveLandingFilmRouteScope({ LANDING_FILM_ROUTE_SCOPE: "system" })).toEqual({ type: "system" });
    expect(() => resolveLandingFilmRouteScope({})).toThrow(/LANDING_FILM_TENANT_ID.*LANDING_FILM_ROUTE_SCOPE/i);
    expect(() => resolveLandingFilmRouteScope({ LANDING_FILM_TENANT_ID: "00000000-0000-4000-8000-000000000001", LANDING_FILM_ROUTE_SCOPE: "system" })).toThrow(/either.*or/i);
    expect(() => resolveLandingFilmRouteScope({ LANDING_FILM_ROUTE_SCOPE: "tenant" })).toThrow(/system/i);
    expect(() => resolveLandingFilmRouteScope({ LANDING_FILM_TENANT_ID: "not-a-uuid" })).toThrow(/uuid/i);
  });

  test("queries only the explicitly selected tenant or system route", () => {
    const tenant = buildLandingFilmRouteQuery({ tenantId: "00000000-0000-4000-8000-000000000001", type: "tenant" });
    const system = buildLandingFilmRouteQuery({ type: "system" });
    expect(tenant).toMatchObject({ params: [LANDING_FILM_ROUTE_KEY, "00000000-0000-4000-8000-000000000001"] });
    expect(tenant.text).toContain("r.tenant_id = $2::uuid");
    expect(system).toMatchObject({ params: [LANDING_FILM_ROUTE_KEY] });
    expect(system.text).toContain("r.tenant_id IS NULL");
    expect(tenant.text).not.toMatch(/LIMIT 1/);
    expect(system.text).not.toMatch(/LIMIT 1/);
  });

  test("defaults to dry run and requires explicit cost confirmation for generation", () => {
    expect(parseLandingFilmCommand([])).toMatchObject({ dryRun: true, generationConfirmed: false, publish: false });
    expect(() => parseLandingFilmCommand(["--generate"])).toThrow(/confirm-generation-cost/);
    expect(parseLandingFilmCommand(["--generate", "--confirm-generation-cost"])).toMatchObject({ dryRun: false, generationConfirmed: true });
  });

  test("publishes only explicit approved manifest selections", () => {
    const jobs = makeLandingFilmJobs();
    const complete = jobs.map(({ chapter, variant, viewport }) => ({ chapter, variant, viewport, startSeconds: 0, durationSeconds: 8 }));
    expect(selectApprovedFilms(jobs, { approved: complete })).toHaveLength(24);
    expect(() => selectApprovedFilms(jobs, { approved: [] })).toThrow(/at least one/i);
    expect(() => selectApprovedFilms(jobs, { approved: complete.slice(1) })).toThrow(/complete coverage/i);
    expect(() => selectApprovedFilms(jobs, { approved: [...complete.slice(1), complete[1]] })).toThrow(/duplicate/i);
    expect(() => selectApprovedFilms(jobs, { approved: complete.map((item, index) => index === 0 ? { ...item, durationSeconds: 7 } : item) })).toThrow(/8 and 12/i);
  });

  test("requires a public root for the canonical prefix and builds public media URLs", () => {
    expect(() => requireLandingMediaPublicBaseUrl(undefined)).toThrow(/LANDING_MEDIA_PUBLIC_BASE_URL/);
    const base = requireLandingMediaPublicBaseUrl("https://cdn.example.com/brand-media/tapflow/landing-film-v1/");
    expect(getLandingFilmPublicUrl(base, "brand-media/tapflow/landing-film-v1/form/variant-a/mobile/loop.mp4")).toBe("https://cdn.example.com/brand-media/tapflow/landing-film-v1/form/variant-a/mobile/loop.mp4");
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
