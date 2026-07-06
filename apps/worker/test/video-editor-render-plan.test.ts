import { describe, expect, test } from "vitest";

import {
  VideoEditorRenderPlanError,
  buildVideoEditorRenderPlan,
} from "../src/workflow-runtime/video-editor-render-plan.js";

describe("buildVideoEditorRenderPlan", () => {
  test("normalizes asset-backed clips, audio, and subtitles into an ffmpeg render plan", () => {
    const plan = buildVideoEditorRenderPlan({
      aspect: "16:9",
      resolution: "1920x1080",
      timeline: {
        audio: [
          { id: "audio-1", assetId: "asset-audio-1", track: 2, startMs: 500, inMs: 100, outMs: 5100, volume: 0.8 },
        ],
        clips: [
          { id: "clip-1", assetId: "asset-image-1", kind: "image", track: 1, startMs: 0, inMs: 0, outMs: 3000, speed: 1, transitionOut: { type: "fade", durationMs: 750 } },
          { id: "clip-2", assetId: "asset-video-2", kind: "video", track: 1, startMs: 3000, inMs: 200, outMs: 4200, speed: 2, muted: true, volume: 0.25 },
        ],
        durationMs: 7000,
        subtitles: [
          { id: "sub-1", text: "Opening", startMs: 0, endMs: 1200 },
        ],
      },
    });

    expect(plan).toMatchObject({
      assetIds: ["asset-image-1", "asset-video-2", "asset-audio-1"],
      output: {
        durationMs: 7000,
        height: 1080,
        mimeType: "video/mp4",
        width: 1920,
      },
      renderer: "ffmpeg",
      version: 1,
    });
    expect(plan.clips[1]).toMatchObject({
      assetId: "asset-video-2",
      durationMs: 4000,
      effectiveDurationMs: 2000,
      muted: true,
      volume: 0.25,
    });
    expect(plan.clips[0].transitionOut).toEqual({ durationMs: 750, type: "fade" });
    expect(plan.audio[0]).toMatchObject({
      assetId: "asset-audio-1",
      durationMs: 5000,
      startMs: 500,
      volume: 0.8,
    });
    expect(plan.subtitles).toEqual([
      { id: "sub-1", text: "Opening", startMs: 0, endMs: 1200 },
    ]);
    expect(JSON.stringify(plan)).not.toMatch(/blob:|data:|https?:\/\//);
  });

  test("rejects empty editor timelines before provider or renderer execution", () => {
    expect(() => buildVideoEditorRenderPlan({
      resolution: "1920x1080",
      timeline: { audio: [], clips: [], durationMs: 0, subtitles: [] },
    })).toThrow(VideoEditorRenderPlanError);
  });

  test("rejects transient media references instead of treating them as asset ids", () => {
    expect(() => buildVideoEditorRenderPlan({
      resolution: "1920x1080",
      timeline: {
        audio: [],
        clips: [
          { id: "clip-1", assetId: "blob:http://local/asset", kind: "image", track: 1, startMs: 0, inMs: 0, outMs: 3000, speed: 1 },
        ],
        durationMs: 3000,
        subtitles: [],
      },
    })).toThrow(VideoEditorRenderPlanError);
  });

  test("rejects unbound placeholder asset ids before renderer execution", () => {
    expect(() => buildVideoEditorRenderPlan({
      resolution: "1920x1080",
      timeline: {
        audio: [],
        clips: [
          { id: "clip-1", assetId: "placeholder-video-1", kind: "video", track: 1, startMs: 0, inMs: 0, outMs: 3000, speed: 1 },
        ],
        durationMs: 3000,
        subtitles: [],
      },
    })).toThrow(VideoEditorRenderPlanError);
  });

  test("uses 16:9 1080p defaults when editor output settings are missing", () => {
    const plan = buildVideoEditorRenderPlan({
      timeline: {
        audio: [],
        clips: [
          { id: "clip-1", assetId: "asset-image-1", kind: "image", track: 0, startMs: 0, inMs: 0, outMs: 4500, speed: 1 },
        ],
        durationMs: 0,
        subtitles: [],
      },
    });

    expect(plan.output).toMatchObject({
      durationMs: 4500,
      height: 1080,
      mimeType: "video/mp4",
      width: 1920,
    });
  });

  test("uses square 1080p output dimensions for 1:1 editor exports", () => {
    const plan = buildVideoEditorRenderPlan({
      aspect: "1:1",
      resolution: "1080x1080",
      timeline: {
        audio: [],
        clips: [
          { id: "clip-1", assetId: "asset-image-1", kind: "image", track: 0, startMs: 0, inMs: 0, outMs: 3000, speed: 1 },
        ],
        durationMs: 3000,
        subtitles: [],
      },
    });

    expect(plan.output).toMatchObject({
      durationMs: 3000,
      height: 1080,
      mimeType: "video/mp4",
      width: 1080,
    });
  });
});
