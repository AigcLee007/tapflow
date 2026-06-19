import path from "node:path";
import { describe, expect, test } from "vitest";

import { resolveStaticCacheControl } from "./serve-dist.cjs";

describe("serve-dist cache headers", () => {
  const distDir = path.resolve("dist");
  const indexFile = path.join(distDir, "index.html");

  test("serves version manifest without browser caching", () => {
    expect(resolveStaticCacheControl(path.join(distDir, "version.json"), { distDir, indexFile })).toBe(
      "no-store, no-cache, must-revalidate",
    );
  });

  test("keeps hashed assets immutable", () => {
    expect(resolveStaticCacheControl(path.join(distDir, "assets", "app.js"), { distDir, indexFile })).toBe(
      "public, max-age=31536000, immutable",
    );
  });
});
