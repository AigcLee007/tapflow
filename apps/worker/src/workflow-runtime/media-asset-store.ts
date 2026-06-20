import { createHash, randomUUID } from "node:crypto";

import {
  buildAssetObjectKey,
  type StorageProvider,
} from "@aigc-flow/storage";
import type { PoolClient } from "pg";
import sharp from "sharp";

import type { MediaOutput } from "@aigc-flow/ai-gateway-core";
import type { WorkerLogger } from "../logger.js";
import { createImageVariants } from "./media-variants.js";

export type FetchResponseLike = {
  arrayBuffer(): Promise<ArrayBuffer>;
  headers: {
    get(name: string): string | null;
  };
  ok: boolean;
  status: number;
};

export type FetchLike = (url: string) => Promise<FetchResponseLike>;

export type AssetRef = {
  assetId: string;
  durationMs?: number;
  height?: number;
  kind: "image" | "video";
  mimeType: string;
  timing?: PersistedAssetTiming;
  width?: number;
};

export type PersistedAssetTiming = {
  asset_db_insert_ms: number;
  asset_original_upload_ms: number;
  asset_variant_processing_ms: number;
  provider_output_download_ms: number;
};

export type MediaVariantQueue = {
  add(name: string, payload: Record<string, unknown>): Promise<unknown>;
};

type AssetPersistenceLogContext = {
  generationId?: string | null;
  logger?: WorkerLogger | null;
  routeKey?: string | null;
  traceId?: string | null;
};

function elapsedMs(startedAt: number): number {
  return Math.max(0, Date.now() - startedAt);
}

async function readImageDimensions(input: {
  body: Buffer;
  mimeType: string;
}): Promise<{ height: number | null; width: number | null }> {
  if (!/^image\/(png|jpe?g|webp)$/i.test(input.mimeType)) {
    return { height: null, width: null };
  }

  try {
    const metadata = await sharp(input.body, { failOn: "none" }).rotate().metadata();
    return {
      height: metadata.height ?? null,
      width: metadata.width ?? null,
    };
  } catch {
    return { height: null, width: null };
  }
}

function defaultMimeType(kind: "image" | "video"): string {
  return kind === "image" ? "image/png" : "video/mp4";
}

function mimeTypeToExtension(mimeType: string): string {
  switch (mimeType.toLowerCase()) {
    case "image/jpeg":
      return ".jpg";
    case "image/png":
      return ".png";
    case "image/webp":
      return ".webp";
    case "video/mp4":
      return ".mp4";
    case "video/webm":
      return ".webm";
    default:
      return "";
  }
}

function parseBase64Payload(input: string): {
  buffer: Buffer;
  mimeType: string | null;
} {
  const dataUrlMatch = input.match(/^data:([^;]+);base64,(.+)$/i);
  if (dataUrlMatch) {
    return {
      buffer: Buffer.from(dataUrlMatch[2] ?? "", "base64"),
      mimeType: dataUrlMatch[1] ?? null,
    };
  }

  return {
    buffer: Buffer.from(input, "base64"),
    mimeType: null,
  };
}

function inferFilename(options: {
  explicitFilename?: string | null;
  index: number;
  kind: "image" | "video";
  mimeType: string;
  url?: string | null;
}): string {
  if (options.explicitFilename?.trim()) {
    return options.explicitFilename.trim();
  }

  if (options.url) {
    try {
      const parsed = new URL(options.url);
      const pathname = parsed.pathname.split("/").filter(Boolean).pop();
      if (pathname) {
        return pathname;
      }
    } catch {
      // Ignore URL parsing failures and use the generated fallback below.
    }
  }

  const extension = mimeTypeToExtension(options.mimeType) || (options.kind === "image" ? ".png" : ".mp4");
  return `${options.kind}-output-${options.index + 1}${extension}`;
}

async function resolveOutputBinary(
  fetchFn: FetchLike,
  kind: "image" | "video",
  output: MediaOutput,
  index: number,
): Promise<{
  body: Buffer;
  filename: string;
  mimeType: string;
}> {
  if (output.url?.trim()) {
    const response = await fetchFn(output.url.trim());
    if (!response.ok) {
      throw new Error(`Failed to download provider output: HTTP ${response.status}`);
    }

    const mimeType = output.mimeType?.trim() || response.headers.get("content-type") || defaultMimeType(kind);
    return {
      body: Buffer.from(await response.arrayBuffer()),
      filename: inferFilename({
        explicitFilename: output.filename ?? null,
        index,
        kind,
        mimeType,
        url: output.url,
      }),
      mimeType,
    };
  }

  if (output.base64?.trim()) {
    const parsed = parseBase64Payload(output.base64.trim());
    const mimeType = output.mimeType?.trim() || parsed.mimeType || defaultMimeType(kind);
    return {
      body: parsed.buffer,
      filename: inferFilename({
        explicitFilename: output.filename ?? null,
        index,
        kind,
        mimeType,
      }),
      mimeType,
    };
  }

  throw new Error("Provider output did not include a supported url or base64 payload");
}

export class MediaAssetStore {
  readonly assetBucket: string;
  readonly fetchFn: FetchLike;
  readonly storageProvider: StorageProvider;
  readonly variantMode: "async" | "sync";
  readonly variantQueue: MediaVariantQueue | null;

  constructor(options: {
    assetBucket: string;
    fetchFn?: FetchLike;
    storageProvider: StorageProvider;
    variantMode?: "async" | "sync";
    variantQueue?: MediaVariantQueue | null;
  }) {
    this.assetBucket = options.assetBucket;
    this.fetchFn =
      options.fetchFn ??
      (async (url: string) => {
        const response = await fetch(url);
        return {
          arrayBuffer: () => response.arrayBuffer(),
          headers: {
            get: (name: string) => response.headers.get(name),
          },
          ok: response.ok,
          status: response.status,
        };
      });
    this.storageProvider = options.storageProvider;
    this.variantMode = options.variantMode ?? "sync";
    this.variantQueue = options.variantQueue ?? null;
  }

  async persistOutputs(
    client: PoolClient,
    input: {
      kind: "image" | "video";
      nodeRunId: string | null;
      outputs: MediaOutput[];
      projectId: string | null;
      tenantId: string;
      workflowRunId: string | null;
    },
    logContext?: AssetPersistenceLogContext,
  ): Promise<AssetRef[]> {
    const assetRefs: AssetRef[] = [];

    for (let index = 0; index < input.outputs.length; index += 1) {
      const output = input.outputs[index];
      if (!output) {
        continue;
      }

      const persistStartedAt = Date.now();
      logContext?.logger?.info(
        {
          event: "asset.persist.started",
          generationId: logContext.generationId ?? null,
          index,
          nodeRunId: input.nodeRunId,
          routeKey: logContext.routeKey ?? null,
          tenantId: input.tenantId,
          traceId: logContext.traceId ?? null,
          workflowRunId: input.workflowRunId,
        },
        "asset persistence started",
      );

      const downloadStartedAt = Date.now();
      const binary = await resolveOutputBinary(this.fetchFn, input.kind, output, index);
      const providerOutputDownloadMs = elapsedMs(downloadStartedAt);
      const measuredDimensions = input.kind === "image"
        ? await readImageDimensions({
            body: binary.body,
            mimeType: binary.mimeType,
          })
        : { height: null, width: null };
      const width = measuredDimensions.width ?? output.width ?? null;
      const height = measuredDimensions.height ?? output.height ?? null;
      const assetId = randomUUID();
      const objectKey = buildAssetObjectKey({
        assetId,
        filename: binary.filename,
        tenantId: input.tenantId,
      });
      logContext?.logger?.info(
        {
          assetId,
          durationMs: providerOutputDownloadMs,
          event: "asset.persist.output_download.finished",
          generationId: logContext.generationId ?? null,
          mimeType: binary.mimeType,
          nodeRunId: input.nodeRunId,
          objectKey,
          routeKey: logContext.routeKey ?? null,
          sizeBytes: binary.body.byteLength,
          tenantId: input.tenantId,
          traceId: logContext.traceId ?? null,
          workflowRunId: input.workflowRunId,
        },
        "asset output download finished",
      );
      const checksumSha256 = createHash("sha256").update(binary.body).digest("hex");

      const originalUploadStartedAt = Date.now();
      await this.storageProvider.putObject({
        body: binary.body,
        bucket: this.assetBucket,
        contentType: binary.mimeType,
        key: objectKey,
        metadata: {
          ...(input.nodeRunId ? { nodeRunId: input.nodeRunId } : {}),
          ...(input.workflowRunId ? { workflowRunId: input.workflowRunId } : {}),
        },
      });
      const assetOriginalUploadMs = elapsedMs(originalUploadStartedAt);
      logContext?.logger?.info(
        {
          assetId,
          bucket: this.assetBucket,
          durationMs: assetOriginalUploadMs,
          event: "asset.persist.original_upload.finished",
          generationId: logContext.generationId ?? null,
          nodeRunId: input.nodeRunId,
          objectKey,
          routeKey: logContext.routeKey ?? null,
          tenantId: input.tenantId,
          traceId: logContext.traceId ?? null,
          workflowRunId: input.workflowRunId,
        },
        "asset original upload finished",
      );

      const assetDbInsertStartedAt = Date.now();
      await client.query(
        `
          INSERT INTO assets (
            id,
            tenant_id,
            project_id,
            workflow_run_id,
            node_run_id,
            owner_user_id,
            kind,
            mime_type,
            bucket,
            object_key,
            original_filename,
            size_bytes,
            checksum_sha256,
            width,
            height,
            duration_ms,
            metadata,
            status
          )
          VALUES (
            $1::uuid,
            $2::uuid,
            $3::uuid,
            $4::uuid,
            $5::uuid,
            NULL,
            $6,
            $7,
            $8,
            $9,
            $10,
            $11::bigint,
            $12,
            $13::int,
            $14::int,
            $15::int,
            $16::jsonb,
            'available'
          )
        `,
        [
          assetId,
          input.tenantId,
          input.projectId,
          input.workflowRunId,
          input.nodeRunId,
          input.kind,
          binary.mimeType,
          this.assetBucket,
          objectKey,
          binary.filename,
          binary.body.byteLength,
          checksumSha256,
          width,
          height,
          output.durationMs ?? null,
          JSON.stringify({
            measuredHeight: measuredDimensions.height,
            measuredWidth: measuredDimensions.width,
            providerHeight: output.height ?? null,
            providerWidth: output.width ?? null,
            source: "workflow-runner",
          }),
        ],
      );
      const assetDbInsertMs = elapsedMs(assetDbInsertStartedAt);
      logContext?.logger?.info(
        {
          assetId,
          durationMs: assetDbInsertMs,
          event: "asset.persist.db_insert.finished",
          generationId: logContext.generationId ?? null,
          height,
          nodeRunId: input.nodeRunId,
          routeKey: logContext.routeKey ?? null,
          tenantId: input.tenantId,
          traceId: logContext.traceId ?? null,
          width,
          workflowRunId: input.workflowRunId,
        },
        "asset db insert finished",
      );

      const variantProcessingStartedAt = Date.now();
      if (input.kind === "image" && this.variantMode === "async") {
        if (!this.variantQueue) {
          throw new Error("variantQueue is required when MediaAssetStore variantMode is async");
        }
        await this.variantQueue.add("asset.image-variants.create", {
          assetId,
          tenantId: input.tenantId,
        });
      } else if (input.kind === "image") {
        const variants = await createImageVariants({
          body: binary.body,
          mimeType: binary.mimeType,
        });
        logContext?.logger?.info(
          {
            assetId,
            durationMs: elapsedMs(variantProcessingStartedAt),
            event: "asset.variant.generate.finished",
            generationId: logContext.generationId ?? null,
            nodeRunId: input.nodeRunId,
            routeKey: logContext.routeKey ?? null,
            tenantId: input.tenantId,
            traceId: logContext.traceId ?? null,
            variantCount: variants.length,
            workflowRunId: input.workflowRunId,
          },
          "asset variant generation finished",
        );

        for (const variant of variants) {
          const variantObjectKey = buildAssetObjectKey({
            assetId,
            filename: `${variant.variantKey}.webp`,
            tenantId: input.tenantId,
          });

          const variantUploadStartedAt = Date.now();
          await this.storageProvider.putObject({
            body: variant.body,
            bucket: this.assetBucket,
            contentType: variant.mimeType,
            key: variantObjectKey,
            metadata: {
              assetId,
              ...(input.nodeRunId ? { nodeRunId: input.nodeRunId } : {}),
              variantKey: variant.variantKey,
              ...(input.workflowRunId ? { workflowRunId: input.workflowRunId } : {}),
            },
          });
          const variantUploadMs = elapsedMs(variantUploadStartedAt);
          logContext?.logger?.info(
            {
              assetId,
              bucket: this.assetBucket,
              durationMs: variantUploadMs,
              event: "asset.variant.upload.finished",
              generationId: logContext.generationId ?? null,
              nodeRunId: input.nodeRunId,
              routeKey: logContext.routeKey ?? null,
              tenantId: input.tenantId,
              traceId: logContext.traceId ?? null,
              variantKey: variant.variantKey,
              workflowRunId: input.workflowRunId,
            },
            "asset variant upload finished",
          );

          const variantDbInsertStartedAt = Date.now();
          await client.query(
            `
              INSERT INTO asset_variants (
                tenant_id,
                asset_id,
                variant_key,
                bucket,
                object_key,
                mime_type,
                width,
                height,
                size_bytes,
                metadata
              )
              VALUES (
                $1::uuid,
                $2::uuid,
                $3,
                $4,
                $5,
                $6,
                $7::int,
                $8::int,
                $9::bigint,
                $10::jsonb
              )
              ON CONFLICT (asset_id, variant_key) DO UPDATE SET
                bucket = EXCLUDED.bucket,
                object_key = EXCLUDED.object_key,
                mime_type = EXCLUDED.mime_type,
                width = EXCLUDED.width,
                height = EXCLUDED.height,
                size_bytes = EXCLUDED.size_bytes,
                metadata = EXCLUDED.metadata
            `,
            [
              input.tenantId,
              assetId,
              variant.variantKey,
              this.assetBucket,
              variantObjectKey,
              variant.mimeType,
              variant.width,
              variant.height,
              variant.body.byteLength,
              JSON.stringify({
                source: "workflow-runner",
              }),
            ],
          );
          const variantDbInsertMs = elapsedMs(variantDbInsertStartedAt);
          logContext?.logger?.info(
            {
              assetId,
              durationMs: variantDbInsertMs,
              event: "asset.variant.db_insert.finished",
              generationId: logContext.generationId ?? null,
              nodeRunId: input.nodeRunId,
              routeKey: logContext.routeKey ?? null,
              tenantId: input.tenantId,
              traceId: logContext.traceId ?? null,
              variantKey: variant.variantKey,
              workflowRunId: input.workflowRunId,
            },
            "asset variant db insert finished",
          );
        }
      }
      const assetVariantProcessingMs = elapsedMs(variantProcessingStartedAt);
      logContext?.logger?.info(
        {
          assetId,
          durationMs: elapsedMs(persistStartedAt),
          event: "asset.persist.completed",
          generationId: logContext.generationId ?? null,
          nodeRunId: input.nodeRunId,
          routeKey: logContext.routeKey ?? null,
          tenantId: input.tenantId,
          traceId: logContext.traceId ?? null,
          workflowRunId: input.workflowRunId,
        },
        "asset persistence completed",
      );

      assetRefs.push({
        assetId,
        durationMs: output.durationMs ?? undefined,
        height: height ?? undefined,
        kind: input.kind,
        mimeType: binary.mimeType,
        timing: {
          asset_db_insert_ms: assetDbInsertMs,
          asset_original_upload_ms: assetOriginalUploadMs,
          asset_variant_processing_ms: assetVariantProcessingMs,
          provider_output_download_ms: providerOutputDownloadMs,
        },
        width: width ?? undefined,
      });
    }

    return assetRefs;
  }
}
