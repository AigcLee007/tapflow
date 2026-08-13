import { readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, test } from "vitest";

const migrationFile = "000068_text_route_image_input_capabilities.sql";
const backfillMigrationFile = "000069_backfill_text_route_image_input_capabilities.sql";

describe("Text route image-input migration", () => {
  test("joins the route model through the update predicate", async () => {
    const sql = await readFile(path.resolve(import.meta.dirname, `../migrations/${migrationFile}`), "utf8");

    expect(sql).toContain("FROM ai_providers AS provider, ai_models AS model\nWHERE route.provider_id = provider.id\n  AND model.id = route.model_id");
    expect(sql).not.toContain("JOIN ai_models AS model ON model.id = route.model_id");
  });
});

describe("Text route image-input capability backfill", () => {
  test("creates the capabilities object before writing image-input fields", async () => {
    const sql = await readFile(path.resolve(import.meta.dirname, `../migrations/${backfillMigrationFile}`), "utf8");

    expect(sql).toContain("'{capabilities}'");
    expect(sql).toContain("COALESCE(route.request_config->'capabilities', '{}'::jsonb)");
    expect(sql).toContain("'{supportsImageInput}'");
    expect(sql).toContain("provider.key = 'aittco-text-relay'");
    expect(sql).toContain("model.model_key IN (SELECT model_key FROM verified_models)");
    expect(sql).not.toContain("pricing =");
    expect(sql).not.toContain("credential_id =");
    expect(sql).not.toContain("status =");
  });
});
