import { readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, test } from "vitest";

const migrationPath = path.resolve(
  import.meta.dirname,
  "../migrations/000060_password_reset_challenges.sql",
);

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
