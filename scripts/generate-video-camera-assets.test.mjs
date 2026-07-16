import assert from "node:assert/strict";
import { existsSync, statSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

import {
  CAMERA_IDS,
  CAMERA_LIBRARY_DIR,
  MANIFEST_PATH,
  loadManifest,
} from "./generate-video-camera-assets.mjs";

const EXPECTED_IDS = [
  "fixed", "follow", "spiral-up", "spiral-down", "tilt-up", "tilt-down",
  "pan-left", "pan-right", "crane-up", "crane-down", "truck-left", "truck-right",
  "dolly-in", "dolly-out", "zoom-in", "zoom-out", "dolly-zoom", "orbit", "roll",
  "fpv", "drone", "aerial", "handheld",
];

test("camera preview manifest has exactly the supported original motion IDs", () => {
  assert.deepEqual(CAMERA_IDS, EXPECTED_IDS);
  assert.ok(existsSync(MANIFEST_PATH), "manifest must be generated");

  const manifest = loadManifest();
  assert.equal(manifest.version, 1);
  assert.equal(manifest.attribution, "TapFlow original");
  assert.deepEqual(manifest.items.map((item) => item.id), EXPECTED_IDS);

  for (const item of manifest.items) {
    assert.match(item.label, /[\u4e00-\u9fff]/, `${item.id} needs a Chinese label`);
    assert.ok(item.durationMs >= 1000 && item.durationMs <= 4000);
    assert.equal(item.version, 1);
    assert.equal(item.attribution, "TapFlow original");
    assert.ok(["vp9", "vp8"].includes(item.codec), `${item.id} must record its actual WebM codec`);
    assert.equal(item.poster, `v1/${item.id}.webp`);
    assert.equal(item.preview, `v1/${item.id}.webm`);

    for (const relativePath of [item.poster, item.preview]) {
      const assetPath = resolve(CAMERA_LIBRARY_DIR, relativePath);
      assert.ok(existsSync(assetPath), `${relativePath} must exist`);
      assert.ok(statSync(assetPath).size > 0, `${relativePath} must not be empty`);
    }
  }
});
