import { readFile } from "node:fs/promises";
import path from "node:path";

import { afterAll, describe, expect, test } from "vitest";

import { createPgPool } from "../src/db.js";
import { runMigrations } from "../src/migrator.js";
import { hasDatabaseEnv, insertUser, withDatabase } from "./helpers.js";

const migrationPath = path.resolve(
  import.meta.dirname,
  "../migrations/000060_password_reset_challenges.sql",
);
const originalDatabaseUrl = process.env.DATABASE_URL;
const describeWithDatabase = hasDatabaseEnv() ? describe : describe.skip;

afterAll(() => {
  if (originalDatabaseUrl === undefined) {
    delete process.env.DATABASE_URL;
  } else {
    process.env.DATABASE_URL = originalDatabaseUrl;
  }
});

describe("000060_password_reset_challenges.sql", () => {
  test("extends email challenge purposes and reasons with password reset", async () => {
    const sql = await readFile(migrationPath, "utf8");

    expect(sql).toContain("auth_email_challenges_purpose_check");
    expect(sql).toContain("auth_email_challenges_reason_check");

    for (const purpose of [
      "registration",
      "email_verification",
      "login_device_verification",
      "password_reset",
    ]) {
      expect(sql).toContain(`'${purpose}'`);
    }

    for (const reason of [
      "email_unverified",
      "new_device",
      "trust_expired",
      "anomalous_login",
      "password_reset",
    ]) {
      expect(sql).toContain(`'${reason}'`);
    }
  });
});

describeWithDatabase("000060_password_reset_challenges.sql database constraints", () => {
  test("accepts every existing and password-reset value, but rejects unknown values", async () => {
    await withDatabase(async ({ databaseUrl }) => {
      process.env.DATABASE_URL = databaseUrl;
      const pool = createPgPool();

      try {
        const migrationResult = await runMigrations(pool);
        expect(migrationResult.appliedMigrations).toContain(
          "000060_password_reset_challenges.sql",
        );

        const userId = await insertUser(pool, {
          email: "password-reset-migration@example.com",
        });
        const purposes = [
          "registration",
          "email_verification",
          "login_device_verification",
          "password_reset",
        ];
        const reasons = [
          "email_unverified",
          "new_device",
          "trust_expired",
          "anomalous_login",
          "password_reset",
        ];

        for (const [index, purpose] of purposes.entries()) {
          await pool.query(
            `
              INSERT INTO auth_email_challenges (
                user_id, purpose, reason, challenge_token_hash, code_hash,
                last_sent_at, expires_at
              )
              VALUES ($1, $2, $3, $4, $5, now(), now() + interval '10 minutes')
            `,
            [userId, purpose, "email_unverified", `purpose-token-${index}`, `purpose-code-${index}`],
          );
        }

        for (const [index, reason] of reasons.entries()) {
          await pool.query(
            `
              INSERT INTO auth_email_challenges (
                user_id, purpose, reason, challenge_token_hash, code_hash,
                last_sent_at, expires_at
              )
              VALUES ($1, 'password_reset', $2, $3, $4, now(), now() + interval '10 minutes')
            `,
            [userId, reason, `reason-token-${index}`, `reason-code-${index}`],
          );
        }

        await expect(
          pool.query(
            `
              INSERT INTO auth_email_challenges (
                user_id, purpose, reason, challenge_token_hash, code_hash,
                last_sent_at, expires_at
              )
              VALUES ($1, 'unknown_purpose', 'password_reset', 'invalid-purpose-token', 'code', now(), now())
            `,
            [userId],
          ),
        ).rejects.toMatchObject({ code: "23514" });

        await expect(
          pool.query(
            `
              INSERT INTO auth_email_challenges (
                user_id, purpose, reason, challenge_token_hash, code_hash,
                last_sent_at, expires_at
              )
              VALUES ($1, 'password_reset', 'unknown_reason', 'invalid-reason-token', 'code', now(), now())
            `,
            [userId],
          ),
        ).rejects.toMatchObject({ code: "23514" });
      } finally {
        await pool.end();
      }
    });
  });
});
