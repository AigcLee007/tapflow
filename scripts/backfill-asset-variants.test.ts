// @vitest-environment node

import { describe, expect, test } from "vitest";

describe("backfill-asset-variants script", () => {
  test("can be imported without executing the backfill job", async () => {
    const module = await import("./backfill-asset-variants.ts");

    expect(module.parseLimitArg(["--limit=20"])).toBe(20);
    expect(module.parseLimitArg([])).toBe(50);
  });

  test("direct execution detection handles relative script paths", async () => {
    const module = await import("./backfill-asset-variants.ts");

    expect(
      module.isDirectExecution("file:///D:/tapnow-flow/scripts/backfill-asset-variants.ts", "./scripts/backfill-asset-variants.ts"),
    ).toBe(true);
  });
});
