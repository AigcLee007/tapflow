import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, test } from "vitest";

const scriptPath = path.resolve("scripts/write-build-version.cjs");

describe("write-build-version", () => {
  test("writes a build version manifest to the requested output directory", async () => {
    const distDir = await mkdtemp(path.join(tmpdir(), "tapflow-version-"));

    try {
      const result = spawnSync(process.execPath, [scriptPath, distDir], {
        cwd: process.cwd(),
        env: {
          ...process.env,
          BUILD_VERSION: "test-version-123",
          BUILD_COMMIT: "test-commit",
        },
        encoding: "utf8",
      });

      expect(result.status).toBe(0);

      const rawManifest = await readFile(path.join(distDir, "version.json"), "utf8");
      const manifest = JSON.parse(rawManifest) as {
        builtAt?: string;
        commit?: string;
        version?: string;
      };

      expect(manifest.version).toBe("test-version-123");
      expect(manifest.commit).toBe("test-commit");
      expect(new Date(manifest.builtAt || "").toString()).not.toBe("Invalid Date");
    } finally {
      await rm(distDir, { recursive: true, force: true });
    }
  });
});
