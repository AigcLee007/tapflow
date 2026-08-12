import { describe, expect, it } from "vitest";
import {
  NODE_WAITING_ROUTE_KEY,
  NODE_WAITING_JOBS,
  buildNodeWaitingCommand,
  redactNodeWaitingError,
  buildNodeWaitingGenerationRequest,
  buildNodeWaitingFfmpegArgs,
  assertNodeWaitingVideoProbe,
  generateNodeWaitingVideos,
  getNodeWaitingOutputPaths,
} from "./generate-node-waiting-videos";

describe("node waiting video generation", () => {
  it("defines the three stable jobs and Gemini request parameters", () => {
    expect(NODE_WAITING_ROUTE_KEY).toBe("video.pixelhub.gemini-omni-flash");
    expect(NODE_WAITING_JOBS.map((job) => job.kind)).toEqual(["text", "image", "video"]);
    expect(NODE_WAITING_JOBS.map((job) => job.prompt)).toEqual([
      expect.stringContaining("dark writing surface"),
      expect.stringContaining("Cyan and teal mist"),
      expect.stringContaining("Cinematic frame bands"),
    ]);
    for (const job of NODE_WAITING_JOBS) {
      const request = buildNodeWaitingGenerationRequest(job);
      expect(request.params).toMatchObject({
        aspectRatio: "16:9",
        count: 1,
        durationSeconds: 4,
        generateAudio: false,
        mode: "text_to_video",
        resolution: "720P",
      });
      expect(request.prompt).toContain(job.prompt);
    }
  });

  it("requires both generation and explicit cost confirmation", () => {
    expect(buildNodeWaitingCommand([])).toEqual({ dryRun: true });
    expect(buildNodeWaitingCommand(["--generate"])).toEqual({ dryRun: true });
    expect(buildNodeWaitingCommand(["--confirm-generation-cost"])).toEqual({ dryRun: true });
    expect(buildNodeWaitingCommand(["--generate", "--confirm-generation-cost"])).toEqual({ dryRun: false });
  });

  it("maps temporary downloads to public repository assets", () => {
    expect(Object.fromEntries(NODE_WAITING_JOBS.map((job) => [job.kind, getNodeWaitingOutputPaths(job.kind)]))).toEqual({
      text: { temporary: ".codex-tmp/node-waiting-videos/text-waiting.mp4", public: "public/node-waiting/text-waiting.mp4" },
      image: { temporary: ".codex-tmp/node-waiting-videos/image-waiting.mp4", public: "public/node-waiting/image-waiting.mp4" },
      video: { temporary: ".codex-tmp/node-waiting-videos/video-waiting.mp4", public: "public/node-waiting/video-waiting.mp4" },
    });
  });

  it("redacts bearer tokens and sensitive credential fields", () => {
    const result = redactNodeWaitingError({ message: "Bearer abc.secret DATABASE_URL=postgres://u:p@host/db", code: "E_FAIL" });
    expect(result.message).toContain("Bearer [redacted]");
    expect(result.message).not.toContain("abc.secret");
    expect(result.message).not.toContain("postgres://");
    expect(result.code).toBe("E_FAIL");
  });

  it("fails live generation without exposing environment values", async () => {
    await expect(generateNodeWaitingVideos(["--generate", "--confirm-generation-cost"], {})).rejects.toThrow(
      "DATABASE_URL and CREDENTIAL_MASTER_KEY are required for live generation",
    );
  });

  it("constructs a silent H.264 faststart transcode capped at 720 pixels", () => {
    expect(buildNodeWaitingFfmpegArgs("source.mp4", "final.mp4")).toEqual([
      "-y", "-i", "source.mp4", "-map", "0:v:0", "-an", "-vf", "scale=720:720:force_original_aspect_ratio=decrease",
      "-c:v", "libx264", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "final.mp4",
    ]);
  });

  it("accepts only silent H.264 videos within waiting-asset limits", () => {
    expect(() => assertNodeWaitingVideoProbe({ format: { duration: "4.0", size: "1200000" }, streams: [{ codec_type: "video", codec_name: "h264", width: 720, height: 405 }] })).not.toThrow();
    expect(() => assertNodeWaitingVideoProbe({ format: { duration: "4.0", size: "1200000" }, streams: [{ codec_type: "video", codec_name: "hevc", width: 720, height: 405 }] })).toThrow("H.264");
    expect(() => assertNodeWaitingVideoProbe({ format: { duration: "4.0", size: "1200000" }, streams: [{ codec_type: "video", codec_name: "h264", width: 720, height: 405 }, { codec_type: "audio" }] })).toThrow("audio");
    expect(() => assertNodeWaitingVideoProbe({ format: { duration: "4.0", size: "1700000" }, streams: [{ codec_type: "video", codec_name: "h264", width: 720, height: 405 }] })).toThrow("size");
  });
});
