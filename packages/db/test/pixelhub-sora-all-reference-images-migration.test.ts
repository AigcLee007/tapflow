import { readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, test } from "vitest";

const migrationFile = "000064_pixelhub_sora_all_reference_images.sql";

describe("PixelHub Sora all-reference images migration", () => {
  test("removes only the obsolete video-or-audio requirement from the platform route", async () => {
    const sql = await readFile(path.resolve(import.meta.dirname, `../migrations/${migrationFile}`), "utf8");

    expect(sql).toContain("video.pixelhub.sora-v3-pro");
    expect(sql).toContain("route.tenant_id IS NULL");
    expect(sql).toContain("- 'requiresVideoOrAudio'");
    expect(sql).toContain("route.request_config");
    expect(sql).not.toContain("UPDATE ai_models AS model");
    expect(sql).not.toContain("pricing =");
    expect(sql).not.toContain("credential_id =");
    expect(sql).not.toContain("connection_id =");
  });
});
