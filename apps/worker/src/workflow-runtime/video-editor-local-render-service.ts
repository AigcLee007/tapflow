import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { MediaOutput } from "@aigc-flow/ai-gateway-core";
import type { StorageProvider } from "@aigc-flow/storage";

import {
  buildVideoEditorFfmpegArgs,
  runVideoEditorFfmpeg,
  type BuildVideoEditorFfmpegArgsInput,
  type RunVideoEditorFfmpegResult,
} from "./video-editor-ffmpeg-executor.js";
import type { VideoEditorRenderPlan } from "./video-editor-render-plan.js";

export type VideoEditorLocalRenderServiceErrorCode =
  | "VIDEO_EDITOR_RENDER_STORAGE_UNSUPPORTED"
  | "VIDEO_EDITOR_RENDER_ASSET_LOOKUP_MISSING"
  | "VIDEO_EDITOR_RENDER_ASSET_DOWNLOAD_FAILED";

export class VideoEditorLocalRenderServiceError extends Error {
  readonly code: VideoEditorLocalRenderServiceErrorCode;

  constructor(code: VideoEditorLocalRenderServiceErrorCode, message: string) {
    super(message);
    this.name = "VideoEditorLocalRenderServiceError";
    this.code = code;
  }
}

export type VideoEditorRenderAssetLookup = {
  bucket: string;
  mimeType: string | null;
  objectKey: string;
};

export type VideoEditorLocalRenderInput = {
  assetLookups: Map<string, VideoEditorRenderAssetLookup>;
  plan: VideoEditorRenderPlan;
  tenantId: string;
  workflowRunId: string;
};

export type VideoEditorLocalRenderResult = {
  output: MediaOutput;
  tempDir: string;
};

type BuildArgsLike = (input: BuildVideoEditorFfmpegArgsInput) => string[];
type RunFfmpegLike = (input: { args: string[]; outputPath: string }) => Promise<RunVideoEditorFfmpegResult>;

export type VideoEditorLocalRenderServiceOptions = {
  buildArgs?: BuildArgsLike;
  runFfmpeg?: RunFfmpegLike;
  storageProvider: StorageProvider;
  tmpRoot?: string;
};

function extensionForMimeType(mimeType: string | null | undefined, fallback = ".bin"): string {
  switch ((mimeType ?? "").toLowerCase()) {
    case "audio/aac":
      return ".aac";
    case "audio/m4a":
    case "audio/mp4":
      return ".m4a";
    case "audio/mpeg":
      return ".mp3";
    case "image/jpeg":
      return ".jpg";
    case "image/png":
      return ".png";
    case "image/webp":
      return ".webp";
    case "video/mp4":
      return ".mp4";
    case "video/quicktime":
      return ".mov";
    case "video/webm":
      return ".webm";
    default:
      return fallback;
  }
}

function sanitizeFilenameSegment(value: string): string {
  return value
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 96) || "asset";
}

export class VideoEditorLocalRenderService {
  readonly buildArgs: BuildArgsLike;
  readonly runFfmpeg: RunFfmpegLike;
  readonly storageProvider: StorageProvider;
  readonly tmpRoot: string;

  constructor(options: VideoEditorLocalRenderServiceOptions) {
    this.buildArgs = options.buildArgs ?? buildVideoEditorFfmpegArgs;
    this.runFfmpeg = options.runFfmpeg ?? (async ({ args }) => runVideoEditorFfmpeg({ args }));
    this.storageProvider = options.storageProvider;
    this.tmpRoot = options.tmpRoot ?? tmpdir();
  }

  async render(input: VideoEditorLocalRenderInput): Promise<VideoEditorLocalRenderResult> {
    if (!this.storageProvider.getObject) {
      throw new VideoEditorLocalRenderServiceError(
        "VIDEO_EDITOR_RENDER_STORAGE_UNSUPPORTED",
        "Video editor local rendering requires a storage provider with getObject support.",
      );
    }

    const inputTempDir = await mkdtemp(join(this.tmpRoot, "tapflow-video-render-"));
    const outputTempDir = await mkdtemp(join(this.tmpRoot, "tapflow-video-render-output-"));
    const outputPath = join(outputTempDir, "rendered-output.mp4");
    try {
      const assetFiles: Record<string, string> = {};
      for (let index = 0; index < input.plan.assetIds.length; index += 1) {
        const assetId = input.plan.assetIds[index];
        const lookup = input.assetLookups.get(assetId);
        if (!lookup) {
          throw new VideoEditorLocalRenderServiceError(
            "VIDEO_EDITOR_RENDER_ASSET_LOOKUP_MISSING",
            `Missing render asset lookup for ${assetId}`,
          );
        }
        const localPath = join(
          inputTempDir,
          `${sanitizeFilenameSegment(assetId)}-${index}${extensionForMimeType(lookup.mimeType)}`,
        );
        try {
          const object = await this.storageProvider.getObject({
            bucket: lookup.bucket,
            key: lookup.objectKey,
          });
          await writeFile(localPath, object.body);
        } catch (error) {
          throw new VideoEditorLocalRenderServiceError(
            "VIDEO_EDITOR_RENDER_ASSET_DOWNLOAD_FAILED",
            error instanceof Error ? error.message : `Failed to download render asset ${assetId}`,
          );
        }
        assetFiles[assetId] = localPath;
      }

      const args = this.buildArgs({
        assetFiles,
        outputPath,
        plan: input.plan,
      });
      await this.runFfmpeg({ args, outputPath });
      return {
        output: {
          durationMs: input.plan.output.durationMs,
          height: input.plan.output.height,
          localFilePath: outputPath,
          mimeType: input.plan.output.mimeType,
          width: input.plan.output.width,
        },
        tempDir: inputTempDir,
      };
    } finally {
      await rm(inputTempDir, { force: true, recursive: true });
    }
  }
}
