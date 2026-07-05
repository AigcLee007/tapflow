import { EventEmitter } from "node:events";

import { describe, expect, test, vi } from "vitest";

import type { VideoEditorRenderPlan } from "../src/workflow-runtime/video-editor-render-plan.js";
import {
  VideoEditorFfmpegExecutorError,
  buildVideoEditorFfmpegArgs,
  runVideoEditorFfmpeg,
} from "../src/workflow-runtime/video-editor-ffmpeg-executor.js";

const plan: VideoEditorRenderPlan = {
  assetIds: ["asset-image-1", "asset-video-2", "asset-audio-1"],
  audio: [
    { assetId: "asset-audio-1", durationMs: 7000, id: "audio-1", inMs: 0, outMs: 7000, startMs: 0, track: 1, volume: 0.8 },
  ],
  clips: [
    { assetId: "asset-image-1", durationMs: 3000, effectiveDurationMs: 3000, id: "clip-1", inMs: 0, kind: "image", muted: false, outMs: 3000, speed: 1, startMs: 0, track: 0, volume: null },
    { assetId: "asset-video-2", durationMs: 4000, effectiveDurationMs: 4000, id: "clip-2", inMs: 200, kind: "video", muted: true, outMs: 4200, speed: 1, startMs: 3000, track: 0, volume: 0.5 },
  ],
  output: { durationMs: 7000, height: 1080, mimeType: "video/mp4", width: 1920 },
  renderer: "ffmpeg",
  subtitles: [
    { endMs: 1800, id: "sub-1", startMs: 500, text: "Bob's \"Opening\": 100%" },
  ],
  version: 1,
};

describe("buildVideoEditorFfmpegArgs", () => {
  test("builds deterministic ffmpeg args from a render plan and local asset files", () => {
    const args = buildVideoEditorFfmpegArgs({
      assetFiles: {
        "asset-audio-1": "C:/render/audio.m4a",
        "asset-image-1": "C:/render/image.png",
        "asset-video-2": "C:/render/video.mp4",
      },
      outputPath: "C:/render/output.mp4",
      plan,
    });

    expect(args.slice(0, 6)).toEqual(["-y", "-loop", "1", "-t", "3.000", "-i"]);
    expect(args).toContain("C:/render/image.png");
    expect(args).toContain("C:/render/video.mp4");
    expect(args).toContain("C:/render/audio.m4a");
    expect(args).toContain("-filter_complex");
    expect(args.join(" ")).toContain("scale=1920:1080");
    expect(args.join(" ")).toContain("drawtext=");
    expect(args.join(" ")).toContain("Bob\\'s \\\"Opening\\\"\\: 100%");
    expect(args.slice(-7)).toEqual(["-map", "[vout]", "-map", "[aout]", "-t", "7.000", "C:/render/output.mp4"]);
  });

  test("applies single-clip fade transition filters", () => {
    const args = buildVideoEditorFfmpegArgs({
      assetFiles: {
        "asset-image-1": "C:/render/image.png",
      },
      outputPath: "C:/render/output.mp4",
      plan: {
        ...plan,
        assetIds: ["asset-image-1"],
        audio: [],
        clips: [
          {
            ...plan.clips[0],
            transitionOut: { durationMs: 750, type: "fade" },
          },
        ],
        output: { durationMs: 3000, height: 1080, mimeType: "video/mp4", width: 1920 },
        subtitles: [],
      },
    });

    const filter = args[args.indexOf("-filter_complex") + 1];
    expect(filter).toContain("fade=t=out:st=2.250:d=0.750");
    expect(filter).toContain("[vbase]");
    expect(filter).not.toContain("concat=n=1");
  });

  test("applies crossfade filters between adjacent clips", () => {
    const args = buildVideoEditorFfmpegArgs({
      assetFiles: {
        "asset-image-1": "C:/render/image.png",
        "asset-video-2": "C:/render/video.mp4",
      },
      outputPath: "C:/render/output.mp4",
      plan: {
        ...plan,
        audio: [],
        clips: [
          {
            ...plan.clips[0],
            transitionOut: { durationMs: 750, type: "crossfade" },
          },
          {
            ...plan.clips[1],
            muted: false,
          },
        ],
        output: { durationMs: 6250, height: 1080, mimeType: "video/mp4", width: 1920 },
        subtitles: [],
      },
    });

    const filter = args[args.indexOf("-filter_complex") + 1];
    expect(filter).toContain("xfade=transition=fade:duration=0.750:offset=2.250");
    expect(filter).toContain("[vbase]");
    expect(filter).not.toContain("concat=n=2");
  });

  test("rejects render plans when a local file is missing for an asset id", () => {
    expect(() => buildVideoEditorFfmpegArgs({
      assetFiles: { "asset-image-1": "C:/render/image.png" },
      outputPath: "C:/render/output.mp4",
      plan,
    })).toThrow(VideoEditorFfmpegExecutorError);
  });
});

describe("runVideoEditorFfmpeg", () => {
  test("resolves when ffmpeg exits successfully", async () => {
    const spawned = new EventEmitter() as EventEmitter & {
      stderr: EventEmitter;
    };
    spawned.stderr = new EventEmitter();
    const spawn = vi.fn(() => spawned);
    const promise = runVideoEditorFfmpeg({
      args: ["-version"],
      ffmpegPath: "ffmpeg",
      spawn,
    });
    spawned.emit("close", 0);
    await expect(promise).resolves.toEqual({ exitCode: 0, stderr: "" });
    expect(spawn).toHaveBeenCalledWith("ffmpeg", ["-version"], { windowsHide: true });
  });

  test("rejects with stderr when ffmpeg exits non-zero", async () => {
    const spawned = new EventEmitter() as EventEmitter & {
      stderr: EventEmitter;
    };
    spawned.stderr = new EventEmitter();
    const spawn = vi.fn(() => spawned);
    const promise = runVideoEditorFfmpeg({
      args: ["-bad"],
      ffmpegPath: "ffmpeg",
      spawn,
    });
    spawned.stderr.emit("data", Buffer.from("bad filter"));
    spawned.emit("close", 1);
    await expect(promise).rejects.toMatchObject({
      code: "VIDEO_EDITOR_FFMPEG_FAILED",
      stderr: "bad filter",
    });
  });
});
