import { afterEach, describe, expect, test, vi } from "vitest";

import { createPgPool } from "../src/db.js";

const originalDatabaseUrl = process.env.DATABASE_URL;

afterEach(() => {
  vi.restoreAllMocks();
  if (originalDatabaseUrl === undefined) {
    delete process.env.DATABASE_URL;
  } else {
    process.env.DATABASE_URL = originalDatabaseUrl;
  }
});

describe("createPgPool", () => {
  test("handles idle client errors emitted by the pool", async () => {
    process.env.DATABASE_URL = "postgres://tapflow:test@127.0.0.1:5432/tapflow";
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const pool = createPgPool();
    const error = Object.assign(new Error("Connection terminated unexpectedly"), {
      client: {
        connectionParameters: {
          database: "tapflow",
          host: "db.internal.example",
          user: "tapflow_admin",
        },
      },
      code: "ECONNRESET",
    });

    expect(() => pool.emit("error", error, undefined as never)).not.toThrow();
    expect(consoleError).toHaveBeenCalledWith("[db] idle PostgreSQL client error", {
      code: "ECONNRESET",
      message: "Connection terminated unexpectedly",
      name: "Error",
      stack: expect.stringContaining("Connection terminated unexpectedly"),
    });
    expect(consoleError.mock.calls[0]?.[1]).not.toHaveProperty("client");

    await pool.end();
  });
});
