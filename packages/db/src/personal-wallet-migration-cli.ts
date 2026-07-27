import { createPgPool } from "./db.js";
import { migrateTenantBalancesToPersonalWallets } from "./personal-wallet-migration.js";

function parseMode(args: string[]): { dryRun: boolean } | null {
  if (args.length === 1 && args[0] === "--dry-run") return { dryRun: true };
  if (
    args.length === 3 &&
    args[0] === "--write" &&
    args[1] === "--confirm" &&
    args[2] === "PERSONAL_WALLET_CUTOVER"
  ) return { dryRun: false };
  return null;
}

async function main(): Promise<void> {
  const mode = parseMode(process.argv.slice(2));
  if (!mode) {
    process.stderr.write("Usage: personal-wallet-migration-cli (--dry-run | --write --confirm PERSONAL_WALLET_CUTOVER)\n");
    process.exitCode = 1;
    return;
  }
  const pool = createPgPool();
  try {
    const report = await migrateTenantBalancesToPersonalWallets(pool, mode);
    process.stdout.write(`${JSON.stringify(report)}\n`);
    if (!report.verificationMatched || report.activeReservationCount > 0 || report.unresolvedTenants.length > 0) {
      process.exitCode = 1;
    }
  } finally {
    await pool.end();
  }
}

void main().catch((error: unknown) => {
  process.stderr.write(`${JSON.stringify({ error: error instanceof Error ? error.message : "PERSONAL_WALLET_MIGRATION_FAILED" })}\n`);
  process.exitCode = 1;
});
