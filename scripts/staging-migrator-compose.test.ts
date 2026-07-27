import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const compose = readFileSync("docker-compose.staging.yml", "utf8");

function extractTopLevelBlock(name: string): string | undefined {
  const lines = compose.split(/\r?\n/);
  const start = lines.findIndex((line) => line.startsWith(`${name}:`));

  if (start === -1) {
    return undefined;
  }

  const end = lines.findIndex((line, index) => index > start && /^\S/.test(line));
  return lines.slice(start, end === -1 ? undefined : end).join("\n");
}

function extractServiceBlock(name: string): string | undefined {
  const services = extractTopLevelBlock("services");
  if (!services) {
    return undefined;
  }

  const lines = services.split("\n");
  const start = lines.findIndex((line) => line === `  ${name}:`);

  if (start === -1) {
    return undefined;
  }

  const end = lines.findIndex(
    (line, index) => index > start && /^  [A-Za-z0-9_-]+:\s*$/.test(line),
  );
  return lines.slice(start, end === -1 ? undefined : end).join("\n");
}

describe("staging database migrator Compose service", () => {
  it("isolates the migration database URL in a one-shot tools service", () => {
    const sharedEnvironment = extractTopLevelBlock("x-tapflow-env");
    const api = extractServiceBlock("tapflow-api");
    const worker = extractServiceBlock("tapflow-worker");
    const migrator = extractServiceBlock("tapflow-migrator");

    expect(sharedEnvironment).toBeDefined();
    expect(api).toBeDefined();
    expect(worker).toBeDefined();
    expect(sharedEnvironment).not.toContain("MIGRATION_DATABASE_URL");
    expect(api).not.toContain("MIGRATION_DATABASE_URL");
    expect(worker).not.toContain("MIGRATION_DATABASE_URL");

    if (!migrator) {
      throw new Error("Missing Compose service tapflow-migrator");
    }

    expect(migrator).toContain('profiles: ["tools"]');
    expect(migrator).toContain("DATABASE_URL: ${MIGRATION_DATABASE_URL:-}");
    expect(migrator).toContain('command: ["node", "packages/db/dist/cli.js"]');
    expect(migrator).not.toMatch(/^\s+ports:/m);
    expect(migrator).not.toContain("tapflow-redis");
  });
});
