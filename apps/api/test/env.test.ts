import { afterEach, describe, expect, test } from "vitest";

import { getApiEnv } from "../src/config/env.js";

const originalEnv = { ...process.env };

function withRequiredProductionEnv(extra: Record<string, string> = {}) {
  process.env = {
    ...originalEnv,
    NODE_ENV: "production",
    CORS_ALLOWED_ORIGINS: "https://art.aittco.com",
    CREDENTIAL_MASTER_KEY: "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=",
    DATABASE_URL: "postgres://example",
    JWT_ACCESS_SECRET: "access-secret",
    JWT_REFRESH_SECRET: "refresh-secret",
    REDIS_URL: "redis://redis:6379",
    S3_ACCESS_KEY_ID: "access",
    S3_BUCKET: "bucket",
    S3_ENDPOINT: "https://s3.example.com",
    S3_REGION: "us-east-1",
    S3_SECRET_ACCESS_KEY: "secret",
    ...extra,
  };
}

describe("getApiEnv", () => {
  afterEach(() => {
    process.env = { ...originalEnv };
  });

  test("reads token ttl values from production environment variables", () => {
    withRequiredProductionEnv({
      ACCESS_TOKEN_TTL_SECONDS: "1800",
      REFRESH_TOKEN_TTL_SECONDS: "1209600",
    });

    const env = getApiEnv();

    expect(env.accessTokenTtlSeconds).toBe(1800);
    expect(env.refreshTokenTtlSeconds).toBe(1209600);
  });

  test("reads agent executor rollout limits from production environment variables", () => {
    withRequiredProductionEnv({
      AGENT_EXECUTOR_ALLOW_BATCH_IMAGE: "true",
      AGENT_EXECUTOR_ALLOW_IMAGE_EDIT: "false",
      AGENT_EXECUTOR_ALLOW_VIDEO: "false",
      AGENT_EXECUTOR_ENABLED: "true",
      AGENT_EXECUTOR_MAX_ESTIMATED_CREDITS: "30.5",
      AGENT_EXECUTOR_MAX_GENERATED_ITEMS: "4",
      AGENT_EXECUTOR_MAX_TOOL_ROUNDS: "5",
      AGENT_EXECUTOR_REQUIRE_APPROVAL: "true",
      AGENT_EXECUTOR_TOOL_TIMEOUT_MS: "120000",
      AGENT_EXECUTOR_TURN_TIMEOUT_MS: "240000",
    });

    const env = getApiEnv();

    expect(env.agentExecutorEnabled).toBe(true);
    expect(env.agentExecutorRequireApproval).toBe(true);
    expect(env.agentExecutorMaxToolRounds).toBe(5);
    expect(env.agentExecutorMaxGeneratedItems).toBe(4);
    expect(env.agentExecutorMaxEstimatedCredits).toBe(30.5);
    expect(env.agentExecutorTurnTimeoutMs).toBe(240000);
    expect(env.agentExecutorToolTimeoutMs).toBe(120000);
    expect(env.agentExecutorAllowBatchImage).toBe(true);
    expect(env.agentExecutorAllowImageEdit).toBe(false);
    expect(env.agentExecutorAllowVideo).toBe(false);
  });
});
