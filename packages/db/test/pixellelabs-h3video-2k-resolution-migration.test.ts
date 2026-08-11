import { readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, test } from "vitest";

const migrationFile = "000065_pixellelabs_h3video_2k_resolution.sql";

describe("PixelleLabs H3video 2K resolution migration", () => {
  test("restricts only the stable platform H3 route without touching credentials or pricing", async () => {
    const sql = await readFile(path.resolve(import.meta.dirname, `../migrations/${migrationFile}`), "utf8");

    expect(sql).toContain("video.pixellelabs.h3video-2k");
    expect(sql).toContain("route.tenant_id IS NULL");
    expect(sql).toContain('"2K"');
    expect(sql).toContain("{capabilities,resolutions}");
    expect(sql).toContain("{capabilities,defaults,resolution}");
    expect(sql).not.toContain("pricing =");
    expect(sql).not.toContain("credential_id =");
    expect(sql).not.toContain("connection_id =");
  });
});
