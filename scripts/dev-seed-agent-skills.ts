import { createPgPool } from "@aigc-flow/db";

import { seedOfficialSkills } from "../apps/api/src/modules/agent/official-skill-seed.js";

function ensureSeedGuard(): void {
  if (process.env.NODE_ENV === "development" || process.env.DEV_SEED_ENABLED === "true") return;
  throw new Error("Agent Skill seed is only allowed in development. Set NODE_ENV=development or DEV_SEED_ENABLED=true.");
}

async function main(): Promise<void> {
  ensureSeedGuard();
  const pool = createPgPool();
  try {
    const result = await seedOfficialSkills(pool);
    console.log(JSON.stringify({ ...result, scope: "official", status: "published" }, null, 2));
  } finally {
    await pool.end();
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
