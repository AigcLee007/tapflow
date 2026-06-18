import { describe, expect, test, vi } from "vitest";

import { WorkbenchApiError, WorkbenchService } from "../src/modules/workbench/workbench.service.js";

function createMockPool(rowsByQuery: Array<unknown[]> = []) {
  const queries: Array<{ params?: unknown[]; sql: string }> = [];
  const client = {
    query: vi.fn(async (sql: string, params?: unknown[]) => {
      queries.push({ params, sql });
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
      [],
      [],
      [],
      [
        {
          charged_credits: null,
          created_at: "2026-06-18T00:00:00.000Z",
          display_mode: "merged",
          error_json: null,
          estimated_credits: "1",
          finished_at: "2026-06-18T00:00:00.000Z",
          id: "11111111-1111-4111-8111-111111111111",
          model_id: "pixellelabs.nano-banana-pro",
          params_json: {},
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
});
