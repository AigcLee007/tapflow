import { describe, expect, it, vi } from "vitest";

import { __assetsServiceTestUtils } from "../src/modules/assets/assets.service.js";

describe("loadSignedAssetCandidates", () => {
  it("uses one tenant-scoped query and deduplicates requested asset ids", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });

    await expect(
      __assetsServiceTestUtils.loadSignedAssetCandidates(
        { query } as never,
        "11111111-1111-4111-8111-111111111111",
        [
          "22222222-2222-4222-8222-222222222222",
          "22222222-2222-4222-8222-222222222222",
        ],
      ),
    ).resolves.toEqual(new Map());

    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0]?.[1]).toEqual([
      "11111111-1111-4111-8111-111111111111",
      ["22222222-2222-4222-8222-222222222222"],
    ]);
  });
});
