import { stat } from "node:fs/promises";

import { describe, expect, test, vi } from "vitest";

import type { StorageProvider } from "@aigc-flow/storage";
import type { VideoEditorRenderPlan } from "../src/workflow-runtime/video-editor-render-plan.js";
import {
  VideoEditorLocalRenderService,
} from "../src/workflow-runtime/video-editor-local-render-service.js";

class MemoryStorageProvider implements StorageProvider {
  readonly objects = new Map<string, { body: Buffer; contentType: string | null }>();

  async putObject(): Promise<void> {
    throw new Error("not used");
  }

  async headObject() {
    throw new Error("not used");
  }

  async getObject(input: { bucket: string; key: string }) {
    const object = this.objects.get(`${input.bucket}/${input.key}`);
    if (!object) {
      throw new Error(`missing object ${input.bucket}/${input.key}`);
    }
    return {
      body: object.body,
      contentLength: object.body.byteLength,
      contentType: object.contentType,
      metadata: {},
    };
  }

  async deleteObject(): Promise<void> {
    throw new Error("not used");
  }

  async createPresignedPutUrl() {
    throw new Error("not used");
  }

  async createPresignedGetUrl() {
    throw new Error("not used");
  }
}

const plan: VideoEditorRenderPlan = {
  assetIds: ["asset-image-1", "asset-video-1", "asset-audio-1"],
  audio: [
    { assetId: "asset-audio-1", durationMs: 7000, id: "audio-1", inMs: 0, outMs: 7000, startMs: 0, track: 1, volume: 1 },
  ],
  clips: [
    { assetId: "asset-image-1", durationMs: 3000, effectiveDurationMs: 3000, id: "clip-1", inMs: 0, kind: "image", muted: false, outMs: 3000, speed: 1, startMs: 0, track: 0, volume: null },
    { assetId: "asset-video-1", durationMs: 4000, effectiveDurationMs: 4000, id: "clip-2", inMs: 0, kind: "video", muted: false, outMs: 4000, speed: 1, startMs: 3000, track: 0, volume: null },
  ],
  output: { durationMs: 7000, height: 1080, mimeType: "video/mp4", width: 1920 },
  renderer: "ffmpeg",
  subtitles: [],
  version: 1,
};

describe("VideoEditorLocalRenderService", () => {
  test("downloads render plan assets, runs ffmpeg, and returns a local video output", async () => {
    const storageProvider = new MemoryStorageProvider();
    storageProvider.objects.set("asset-bucket/images/source.png", { body: Buffer.from("image"), contentType: "image/png" });
    storageProvider.objects.set("asset-bucket/videos/source.mp4", { body: Buffer.from("video"), contentType: "video/mp4" });
    storageProvider.objects.set("asset-bucket/audio/source.m4a", { body: Buffer.from("audio"), contentType: "audio/mp4" });

    const runFfmpeg = vi.fn(async ({ outputPath }: { outputPath: string }) => {
      await import("node:fs/promises").then(({ writeFile }) => writeFile(outputPath, Buffer.from("rendered video")));
      return { exitCode: 0, stderr: "" };
    });
    const buildArgs = vi.fn((input: { assetFiles: Record<string, string>; outputPath: string }) => [
      "-i",
      input.assetFiles["asset-image-1"],
      input.outputPath,
    ]);
    const service = new VideoEditorLocalRenderService({
      buildArgs,
      runFfmpeg,
      storageProvider,
    });

    const result = await service.render({
      assetLookups: new Map([
        ["asset-image-1", { bucket: "asset-bucket", mimeType: "image/png", objectKey: "images/source.png" }],
        ["asset-video-1", { bucket: "asset-bucket", mimeType: "video/mp4", objectKey: "videos/source.mp4" }],
        ["asset-audio-1", { bucket: "asset-bucket", mimeType: "audio/mp4", objectKey: "audio/source.m4a" }],
      ]),
      plan,
      tenantId: "tenant-1",
      workflowRunId: "workflow-1",
    });

    expect(result.output).toEqual(expect.objectContaining({
      durationMs: 7000,
      height: 1080,
      localFilePath: expect.stringContaining("rendered-output.mp4"),
      mimeType: "video/mp4",
      width: 1920,
    }));
    expect(buildArgs).toHaveBeenCalledWith(expect.objectContaining({
      assetFiles: expect.objectContaining({
        "asset-audio-1": expect.stringContaining("asset-audio-1"),
        "asset-image-1": expect.stringContaining("asset-image-1"),
        "asset-video-1": expect.stringContaining("asset-video-1"),
      }),
      outputPath: result.output.localFilePath,
      plan,
    }));
    expect(runFfmpeg).toHaveBeenCalledWith(expect.objectContaining({
      outputPath: result.output.localFilePath,
    }));
    await expect(stat(result.output.localFilePath ?? "")).resolves.toEqual(expect.objectContaining({
      size: 14,
    }));
    await expect(stat(result.tempDir)).rejects.toThrow();
  });

  test("fails clearly when storage provider cannot read objects", async () => {
    const service = new VideoEditorLocalRenderService({
      storageProvider: {
        async putObject() {},
        async headObject() { throw new Error("not used"); },
        async deleteObject() {},
        async createPresignedPutUrl() { throw new Error("not used"); },
        async createPresignedGetUrl() { throw new Error("not used"); },
      },
    });

    await expect(service.render({
      assetLookups: new Map(),
      plan,
      tenantId: "tenant-1",
      workflowRunId: "workflow-1",
    })).rejects.toMatchObject({
      code: "VIDEO_EDITOR_RENDER_STORAGE_UNSUPPORTED",
    });
  });

  test("fails when a required asset lookup is missing", async () => {
    const storageProvider = new MemoryStorageProvider();
    const service = new VideoEditorLocalRenderService({ storageProvider });

    await expect(service.render({
      assetLookups: new Map(),
      plan,
      tenantId: "tenant-1",
      workflowRunId: "workflow-1",
    })).rejects.toMatchObject({
      code: "VIDEO_EDITOR_RENDER_ASSET_LOOKUP_MISSING",
    });
  });
});
