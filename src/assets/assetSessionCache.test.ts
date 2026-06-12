import { describe, expect, it } from "vitest";

import {
  clearAssetSessionCache,
  getAssetSessionSnapshot,
  setAssetSessionSnapshot,
} from "./assetSessionCache";

describe("assetSessionCache", () => {
  it("stores snapshots by identity and params key", () => {
    clearAssetSessionCache();
    setAssetSessionSnapshot("user:tenant:session", "image:root", {
      assets: [],
      folders: [],
      mediaCounts: { all: 2, audio: 0, image: 2, video: 0 },
      staleAt: Date.now() + 30_000,
      total: 2,
    });

    expect(getAssetSessionSnapshot("user:tenant:session", "image:root")?.total).toBe(2);
    expect(getAssetSessionSnapshot("other", "image:root")).toBeNull();
  });
});
