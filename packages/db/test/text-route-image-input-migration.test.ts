import { readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, test } from "vitest";

const migrationFile = "000068_text_route_image_input_capabilities.sql";

describe("Text route image-input migration", () => {
  test("joins the route model through the update predicate", async () => {
    const sql = await readFile(path.resolve(import.meta.dirname, `../migrations/${migrationFile}`), "utf8");

    expect(sql).toContain("FROM ai_providers AS provider, ai_models AS model\nWHERE route.provider_id = provider.id\n  AND model.id = route.model_id");
    expect(sql).not.toContain("JOIN ai_models AS model ON model.id = route.model_id");
  });
});
