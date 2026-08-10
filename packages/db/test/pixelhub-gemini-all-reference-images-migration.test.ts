import { readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, test } from "vitest";

const migrationFile = "000063_pixelhub_gemini_all_reference_images.sql";

describe("PixelHub Gemini all-reference images migration", () => {
  test("removes only the obsolete required-video constraint from the platform route", async () => {
    const sql = await readFile(path.resolve(import.meta.dirname, `../migrations/${migrationFile}`), "utf8");

    expect(sql).toContain("video.pixelhub.gemini-omni-flash");
    expect(sql).toContain("route.tenant_id IS NULL");
    expect(sql).toContain("- 'minVideos'");
    expect(sql).toContain("route.request_config");
    expect(sql).not.toContain("UPDATE ai_models AS model");
    expect(sql).not.toContain("pricing =");
    expect(sql).not.toContain("credential_id =");
    expect(sql).not.toContain("connection_id =");
  });
});
