// @vitest-environment node

import { describe, expect, test, vi } from "vitest";

import {
  assertProductionBackfillAllowed,
  buildBackfillSummary,
  buildVariantBackfillJobId,
  parseBackfillArgs,
  runBackfill,
} from "./backfill-asset-variants.ts";

const tenantId = "11111111-1111-4111-8111-111111111111";

describe("backfill-asset-variants script", () => {
  test("defaults to audit mode and parses bounded apply options", () => {
    expect(parseBackfillArgs([])).toEqual({
      apply: false,
      batchSize: 25,
      limit: 500,
      missing: "any",
      tenantId: null,
    });
    expect(parseBackfillArgs([
      "--apply",
      "--batch-size=10",
      "--limit=80",
      "--missing=thumb",
      `--tenant-id=${tenantId}`,
    ])).toEqual({
      apply: true,
      batchSize: 10,
      limit: 80,
      missing: "thumb",
      tenantId,
    });
  });

  test("rejects unsafe production-wide applies without explicit acknowledgement", () => {
    expect(() => assertProductionBackfillAllowed({
      apply: true,
      batchSize: 25,
      limit: 500,
      missing: "any",
      tenantId: null,
    }, { NODE_ENV: "production" })).toThrow(/ASSET_VARIANT_BACKFILL_PRODUCTION_ACK/);
    expect(() => assertProductionBackfillAllowed({
      apply: true,
      batchSize: 25,
      limit: 500,
      missing: "any",
      tenantId,
    }, { NODE_ENV: "production" })).not.toThrow();
  });

  test("uses deterministic queue job identifiers", () => {
    expect(buildVariantBackfillJobId("asset-1")).toBe("asset-image-variant-asset-1-v1");
  });

  test("summarizes asset counts and bytes without object storage identifiers", () => {
    expect(buildBackfillSummary([
      { id: "asset-a", tenant_id: tenantId, original_size_bytes: "42", missing_thumb: true, missing_preview: false },
      { id: "asset-b", tenant_id: tenantId, original_size_bytes: "100", missing_thumb: true, missing_preview: true },
    ])).toEqual({ missingPreviewCount: 1, missingThumbCount: 2, originalBytes: 142, selectedCount: 2 });
  });

  test("audits missing variants without creating a redis queue", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [
      { id: "asset-a", tenant_id: tenantId, original_size_bytes: "42", missing_thumb: true, missing_preview: false },
    ] });
    const createQueueFactory = vi.fn();
    const log = vi.fn();

    await runBackfill([], {
      createPgPool: () => ({ end: vi.fn(), query }) as never,
      createQueueFactory,
      createRedisConnection: vi.fn(),
      log,
      resolveQueuePrefix: (value) => value || "tapflow",
      resolveRedisUrl: () => "redis://localhost:6379",
    });

    expect(query).toHaveBeenCalledTimes(1);
    expect(createQueueFactory).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith(expect.stringContaining('"selectedCount":1'));
  });

  test("enqueues every selected asset only in explicit apply mode", async () => {
    const add = vi.fn(async () => ({}));
    const close = vi.fn(async () => {});
    const query = vi.fn().mockResolvedValue({ rows: [
      { id: "asset-a", tenant_id: tenantId, original_size_bytes: "42", missing_thumb: true, missing_preview: false },
      { id: "asset-b", tenant_id: tenantId, original_size_bytes: "100", missing_thumb: false, missing_preview: true },
    ] });
    const closeRedisConnection = vi.fn(async () => {});

    await runBackfill(["--apply", `--tenant-id=${tenantId}`, "--batch-size=1"], {
      closeRedisConnection,
      createPgPool: () => ({ end: vi.fn(async () => {}), query }) as never,
      createQueueFactory: () => ({ createQueue: () => ({ add, close }) }) as never,
      createRedisConnection: () => ({}) as never,
      log: vi.fn(),
      resolveQueuePrefix: (value) => value || "tapflow",
      resolveRedisUrl: () => "redis://localhost:6379",
    });

    expect(add).toHaveBeenCalledWith(
      "asset.image-variants.create",
      { assetId: "asset-a", tenantId },
      { jobId: "asset-image-variant-asset-a-v1" },
    );
    expect(add).toHaveBeenCalledWith(
      "asset.image-variants.create",
      { assetId: "asset-b", tenantId },
      { jobId: "asset-image-variant-asset-b-v1" },
    );
    expect(close).toHaveBeenCalledTimes(1);
    expect(closeRedisConnection).toHaveBeenCalledTimes(1);
  });
});
