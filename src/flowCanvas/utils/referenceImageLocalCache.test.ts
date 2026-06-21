import { describe, expect, it } from "vitest";

import { getCachedReferenceImageObjectUrl } from "./referenceImageLocalCache";

describe("referenceImageLocalCache", () => {
  it("returns null when IndexedDB is unavailable", async () => {
    expect(await getCachedReferenceImageObjectUrl("reference-upload-1")).toBeNull();
  });
});
