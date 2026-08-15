import { describe, expect, test, vi } from "vitest";

import {
  buildReferenceVideoFfmpegArgs,
  isReferenceVideoSizeCompliant,
  probeReferenceVideo,
  resolveReferenceVideoTargetSize,
  transcodeReferenceVideo,
} from "../src/workflow-runtime/video-reference-variant.js";

describe("reference video sizing", () => {
  test("accepts landscape and portrait 720p constraint boxes", () => {
    expect(isReferenceVideoSizeCompliant(1280, 720)).toBe(true);
    expect(isReferenceVideoSizeCompliant(720, 1280)).toBe(true);
    expect(isReferenceVideoSizeCompliant(1920, 1080)).toBe(false);
  });

  test("fits landscape, portrait, and 4:3 sources inside the 720p boxes", () => {
    expect(resolveReferenceVideoTargetSize(1920, 1080)).toEqual({ height: 720, width: 1280 });
    expect(resolveReferenceVideoTargetSize(1080, 1920)).toEqual({ height: 1280, width: 720 });
    expect(resolveReferenceVideoTargetSize(1920, 1440)).toEqual({ height: 720, width: 960 });
  });

  test("rounds target dimensions down to even values", () => {
    expect(resolveReferenceVideoTargetSize(2001, 1001)).toEqual({ height: 640, width: 1280 });
  });
});

describe("reference video ffmpeg", () => {
  test("builds an H.264 faststart MP4 command", () => {
    const args = buildReferenceVideoFfmpegArgs("input.mp4", "output.mp4", { height: 720, width: 960 });
    expect(args).toEqual(expect.arrayContaining([
      "-c:v", "libx264", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "output.mp4",
    ]));
    expect(args.join(" ")).toContain("scale=960:720");
  });

  test("runs ffmpeg through injected executable", async () => {
    const execFile = vi.fn().mockResolvedValue({ stderr: "", stdout: "" });
    await transcodeReferenceVideo("input.mp4", "output.mp4", { execFile });
    expect(execFile).toHaveBeenCalledWith("ffmpeg", expect.any(Array), expect.objectContaining({ timeout: expect.any(Number) }));
  });

  test("parses dimensions from ffprobe JSON", async () => {
    const execFile = vi.fn().mockResolvedValue({ stdout: JSON.stringify({ streams: [{ codec_type: "video", width: 1920, height: 1080 }] }), stderr: "" });
    await expect(probeReferenceVideo("input.mp4", { execFile })).resolves.toEqual({ height: 1080, width: 1920 });
  });
});
