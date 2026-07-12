import assert from "node:assert/strict";
import test from "node:test";

import { buildImportPlan, parseRouteImportCommand } from "./import-gpt-image-2-routes-lib.mjs";

test("buildImportPlan defines separate async and sync GPT-Image-2 routes", () => {
  const routes = buildImportPlan();

  assert.deepEqual(routes.map((route) => ({
    apiMode: route.apiMode,
    baseUrl: route.baseUrl,
    credits: route.credits,
    envKey: route.envKey,
    routeKey: route.routeKey,
  })), [
    {
      apiMode: "async",
      baseUrl: "https://api.mouxihub.com",
      credits: 12,
      envKey: "MOUXIHUB_GPT_IMAGE_2_API_KEY",
      routeKey: "image.gpt-image-2.mouxihub-official",
    },
    {
      apiMode: "sync",
      baseUrl: "https://api.pixellelabs.com",
      credits: 3,
      envKey: "PIXELLELABS_GPT_IMAGE_2_API_KEY",
      routeKey: "image.gpt-image-2.pixellelabs-stable",
    },
  ]);

  assert.equal(routes[0].requestConfig.async, true);
  assert.equal(routes[0].requestConfig.pollPath, "/v1/images/tasks/{task_id}");
  assert.equal(routes[1].requestConfig.async, undefined);
  assert.equal(routes[1].requestConfig.pollPath, undefined);
});

test("parseRouteImportCommand requires a default route for publication", () => {
  assert.deepEqual(parseRouteImportCommand(["--publish", "image.gpt-image-2.mouxihub-official"]), {
    apply: false,
    help: false,
    publishDefaultRouteKey: "image.gpt-image-2.mouxihub-official",
    test: false,
  });
  assert.throws(() => parseRouteImportCommand(["--publish"]), /requires a route key/);
  assert.throws(
    () => parseRouteImportCommand(["--apply", "--publish", "image.gpt-image-2.mouxihub-official"]),
    /cannot be combined/,
  );
});

test("parseRouteImportCommand accepts a standalone route test command", () => {
  assert.deepEqual(parseRouteImportCommand(["--test"]), {
    apply: false,
    help: false,
    publishDefaultRouteKey: null,
    test: true,
  });
  assert.throws(() => parseRouteImportCommand(["--test", "--apply"]), /cannot be combined/);
});
