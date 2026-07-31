import { describe, expect, test, vi } from "vitest";

import { WorkbenchApiError, WorkbenchService } from "../src/modules/workbench/workbench.service.js";

function createMockPool(rowsByQuery: Array<unknown[]> = []) {
  const queries: Array<{ params?: unknown[]; sql: string }> = [];
  const client = {
    query: vi.fn(async (sql: string, params?: unknown[]) => {
      queries.push({ params, sql });
      if (
        sql === "BEGIN" ||
        sql === "COMMIT" ||
        sql === "ROLLBACK" ||
        sql.includes("set_config('app.tenant_id'") ||
        sql.includes("set_config('app.user_id'")
      ) {
        return { rows: [] };
      }
      const rows = rowsByQuery.shift() ?? [];
      return { rows };
    }),
    release: vi.fn(),
  };

  return {
    client,
    pool: {
      connect: vi.fn(async () => client),
    },
    queries,
  };
}

describe("WorkbenchService generation deletion", () => {
  test("marks a generation deleted and cancels non-terminal stuck work", async () => {
    const { pool, queries } = createMockPool([
      [
        {
          batch_id: null,
          batch_index: null,
          batch_role: "single",
          charged_credits: null,
          created_at: "2026-06-18T00:00:00.000Z",
          display_mode: "merged",
          error_json: null,
          estimated_credits: "1",
          finished_at: "2026-06-18T00:00:00.000Z",
          id: "11111111-1111-4111-8111-111111111111",
          model_id: "pixellelabs.nano-banana-pro",
          params_json: {},
          parent_generation_id: null,
          prompt: "stuck queued",
          reference_asset_ids: [],
          reference_upload_ids: [],
          requested_count: 1,
          reserve_ledger_id: null,
          reserved_credits: "0",
          route_key: "image.pixellelabs.nano-banana-pro",
          session_id: null,
          started_at: null,
          status: "canceled",
          updated_at: "2026-06-18T00:00:00.000Z",
          batch_total: null,
        },
      ],
      [],
      [],
      [],
      [],
    ]);
    const service = new WorkbenchService({
      generationQueue: null,
      pool: pool as never,
    });

    const deleted = await service.deleteGeneration(
      {
        tenantId: "22222222-2222-4222-8222-222222222222",
        traceId: "trace-1",
        userId: "33333333-3333-4333-8333-333333333333",
      },
      "11111111-1111-4111-8111-111111111111",
    );

    expect(deleted).toMatchObject({
      deleted: true,
      generationId: "11111111-1111-4111-8111-111111111111",
    });
    const updateQuery = queries.find((entry) => entry.sql.includes("UPDATE workbench_generations"));
    expect(updateQuery?.sql).toContain("deleted_at = now()");
    expect(updateQuery?.sql).toContain("status = CASE");
    expect(updateQuery?.sql).toContain("'canceled'");
  });

  test("listGenerations filters soft-deleted generation rows", async () => {
    const { pool, queries } = createMockPool([[], []]);
    const service = new WorkbenchService({
      generationQueue: null,
      pool: pool as never,
    });

    await service.listGenerations(
      {
        tenantId: "22222222-2222-4222-8222-222222222222",
        traceId: "trace-1",
        userId: "33333333-3333-4333-8333-333333333333",
      },
      { limit: 20 },
    );

    const listQuery = queries.find((entry) => entry.sql.includes("FROM workbench_generations"));
    expect(listQuery?.sql).toContain("deleted_at IS NULL");
  });

  test("deleteGeneration returns 404 when the generation is absent or already deleted", async () => {
    const { pool } = createMockPool([[], [], []]);
    const service = new WorkbenchService({
      generationQueue: null,
      pool: pool as never,
    });

    await expect(
      service.deleteGeneration(
        {
          tenantId: "22222222-2222-4222-8222-222222222222",
          traceId: "trace-1",
          userId: "33333333-3333-4333-8333-333333333333",
        },
        "11111111-1111-4111-8111-111111111111",
      ),
    ).rejects.toMatchObject<Partial<WorkbenchApiError>>({
      code: "WORKBENCH_GENERATION_NOT_FOUND",
      statusCode: 404,
    });
  });

  test("createGeneration creates a parent row and enqueues one child job per requested image", async () => {
    const client = {
      query: vi.fn(async (sql: string) => {
        if (
          sql === "BEGIN" ||
          sql === "COMMIT" ||
          sql === "ROLLBACK" ||
          sql.includes("set_config('app.tenant_id'") ||
          sql.includes("set_config('app.user_id'")
        ) {
          return { rows: [] };
        }
        if (sql.includes("FROM ai_routes AS route")) {
          return { rows: [{ min_charge_credits: "2", route_id: "route-1" }] };
        }
        if (sql.includes("INSERT INTO workbench_generations")) {
          const childInsertCount = client.query.mock.calls.filter(([entrySql]) => String(entrySql).includes("INSERT INTO workbench_generations")).length;
          if (childInsertCount === 1) {
            return {
              rows: [{
                batch_id: null,
                batch_index: null,
                batch_role: "parent",
                charged_credits: null,
                created_at: "2026-06-18T00:00:00.000Z",
                display_mode: "merged",
                error_json: null,
                estimated_credits: "4",
                finished_at: null,
                id: "11111111-1111-4111-8111-111111111111",
                model_id: "pixellelabs.nano-banana-pro",
                params_json: { aspect_ratio: "1:1" },
                parent_generation_id: null,
                prompt: "batch prompt",
                reference_asset_ids: [],
                reference_upload_ids: [],
                requested_count: 2,
                reserve_ledger_id: "reserve-ledger-1",
                reserved_credits: "4",
                route_key: "image.pixellelabs.nano-banana-pro",
                session_id: null,
                started_at: null,
                status: "queued",
                updated_at: "2026-06-18T00:00:00.000Z",
                batch_total: 2,
              }],
            };
          }
          if (childInsertCount === 2) {
            return {
              rows: [{
                batch_id: "11111111-1111-4111-8111-111111111111",
                batch_index: 0,
                batch_role: "child",
                charged_credits: null,
                created_at: "2026-06-18T00:00:00.000Z",
                display_mode: "merged",
                error_json: null,
                estimated_credits: "0",
                finished_at: null,
                id: "22222222-2222-4222-8222-222222222222",
                model_id: "pixellelabs.nano-banana-pro",
                params_json: { aspect_ratio: "1:1" },
                parent_generation_id: "11111111-1111-4111-8111-111111111111",
                prompt: "batch prompt",
                reference_asset_ids: [],
                reference_upload_ids: [],
                requested_count: 1,
                reserve_ledger_id: null,
                reserved_credits: "0",
                route_key: "image.pixellelabs.nano-banana-pro",
                session_id: null,
                started_at: null,
                status: "queued",
                updated_at: "2026-06-18T00:00:00.000Z",
                batch_total: 2,
              }],
            };
          }
          return {
            rows: [{
              batch_id: "11111111-1111-4111-8111-111111111111",
              batch_index: 1,
              batch_role: "child",
              charged_credits: null,
              created_at: "2026-06-18T00:00:00.000Z",
              display_mode: "merged",
              error_json: null,
              estimated_credits: "0",
              finished_at: null,
              id: "33333333-3333-4333-8333-333333333333",
              model_id: "pixellelabs.nano-banana-pro",
              params_json: { aspect_ratio: "1:1" },
              parent_generation_id: "11111111-1111-4111-8111-111111111111",
              prompt: "batch prompt",
              reference_asset_ids: [],
              reference_upload_ids: [],
              requested_count: 1,
              reserve_ledger_id: null,
              reserved_credits: "0",
              route_key: "image.pixellelabs.nano-banana-pro",
              session_id: null,
              started_at: null,
              status: "queued",
              updated_at: "2026-06-18T00:00:00.000Z",
              batch_total: 2,
            }],
          };
        }
        if (sql.includes("UPDATE workbench_generations") || sql.includes("FROM workbench_results")) {
          return { rows: [] };
        }
        return { rows: [] };
      }),
      release: vi.fn(),
    };
    const pool = {
      connect: vi.fn(async () => client),
    };
    const generationQueue = {
      add: vi.fn(async () => ({ id: "job-1" })),
    };
    const reserveUsageWithClient = vi.fn(async () => ({ id: "reserve-ledger-1" }));
    const service = new WorkbenchService({
      personalWalletService: {
        reserveUsageWithClient,
      } as never,
      generationQueue: generationQueue as never,
      pool: pool as never,
    });

    const created = await service.createGeneration(
      {
        tenantId: "22222222-2222-4222-8222-222222222222",
        traceId: "trace-1",
        userId: "44444444-4444-4444-8444-444444444444",
      },
      {
        displayMode: "merged",
        modelId: "pixellelabs.nano-banana-pro",
        params: { aspect_ratio: "1:1" },
        prompt: "batch prompt",
        referenceAssetIds: [],
        referenceUploadIds: [],
        requestedCount: 2,
        routeKey: "image.pixellelabs.nano-banana-pro",
      },
    );

    expect(created.batchRole).toBe("parent");
    expect(created.requestedCount).toBe(2);
    expect(created.batch?.totalCount).toBe(2);
    expect(created.batch?.children).toHaveLength(2);
    expect(generationQueue.add).toHaveBeenCalledTimes(2);
    expect(generationQueue.add.mock.calls[0]?.[1]).toMatchObject({
      generationId: "22222222-2222-4222-8222-222222222222",
      tenantId: "22222222-2222-4222-8222-222222222222",
    });
    expect(generationQueue.add.mock.calls[1]?.[1]).toMatchObject({
      generationId: "33333333-3333-4333-8333-333333333333",
      tenantId: "22222222-2222-4222-8222-222222222222",
    });
    expect(reserveUsageWithClient).toHaveBeenCalledTimes(1);
  });

  test("createGeneration applies membership discount before reserving credits", async () => {
    const client = {
      query: vi.fn(async (sql: string) => {
        if (
          sql === "BEGIN" ||
          sql === "COMMIT" ||
          sql === "ROLLBACK" ||
          sql.includes("set_config('app.tenant_id'") ||
          sql.includes("set_config('app.user_id'")
        ) {
          return { rows: [] };
        }
        if (sql.includes("FROM ai_routes AS route")) {
          return { rows: [{ min_charge_credits: "10", route_id: "route-1" }] };
        }
        if (sql.includes("SELECT membership_tier")) {
          return { rows: [{ membership_tier: "gold" }] };
        }
        if (sql.includes("INSERT INTO workbench_generations")) {
          return {
            rows: [{
              batch_id: null,
              batch_index: null,
              batch_role: "single",
              charged_credits: null,
              created_at: "2026-06-18T00:00:00.000Z",
              display_mode: "merged",
              error_json: null,
              estimated_credits: "9",
              finished_at: null,
              id: "11111111-1111-4111-8111-111111111111",
              model_id: "pixellelabs.nano-banana-pro",
              params_json: {},
              parent_generation_id: null,
              prompt: "discount prompt",
              reference_asset_ids: [],
              reference_upload_ids: [],
              requested_count: 1,
              reserve_ledger_id: "reserve-ledger-1",
              reserved_credits: "9",
              route_key: "image.pixellelabs.nano-banana-pro",
              session_id: null,
              started_at: null,
              status: "queued",
              updated_at: "2026-06-18T00:00:00.000Z",
              batch_total: null,
            }],
          };
        }
        return { rows: [] };
      }),
      release: vi.fn(),
    };
    const pool = {
      connect: vi.fn(async () => client),
    };
    const generationQueue = {
      add: vi.fn(async () => ({ id: "job-1" })),
    };
    const reserveUsageWithClient = vi.fn(async () => ({ id: "reserve-ledger-1" }));
    const service = new WorkbenchService({
      personalWalletService: {
        reserveUsageWithClient,
      } as never,
      generationQueue: generationQueue as never,
      pool: pool as never,
    });

    const created = await service.createGeneration(
      {
        tenantId: "22222222-2222-4222-8222-222222222222",
        traceId: "trace-1",
        userId: "44444444-4444-4444-8444-444444444444",
      },
      {
        displayMode: "merged",
        modelId: "pixellelabs.nano-banana-pro",
        params: {},
        prompt: "discount prompt",
        referenceAssetIds: [],
        referenceUploadIds: [],
        requestedCount: 1,
        routeKey: "image.pixellelabs.nano-banana-pro",
      },
    );

    expect(created.estimatedCredits).toBe(9);
    expect(created.reservedCredits).toBe(9);
    expect(reserveUsageWithClient).toHaveBeenCalledWith(
      client,
      { tenantId: "22222222-2222-4222-8222-222222222222", userId: "44444444-4444-4444-8444-444444444444" },
      expect.objectContaining({
        amountCredits: 9,
        metadata: expect.objectContaining({
          discountMultiplier: 0.9,
          discountedCredits: 9,
          membershipTier: "gold",
          originalCredits: 10,
        }),
      }),
    );
  });
});
