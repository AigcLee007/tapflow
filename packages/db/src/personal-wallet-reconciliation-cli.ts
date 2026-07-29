import { createPgPool } from "./db.js";
import { reconcileLegacyReservations } from "./personal-wallet-reconciliation.js";

function parseMode(args: string[]): { dryRun: boolean } | null {
  if (args.length === 1 && args[0] === "--dry-run") return { dryRun: true };
  if (
    args.length === 3
    && args[0] === "--write"
    && args[1] === "--confirm"
    && args[2] === "LEGACY_RESERVATION_RECONCILIATION"
  ) return { dryRun: false };
  return null;
}

async function main(): Promise<void> {
  const mode = parseMode(process.argv.slice(2));
  if (!mode) {
    process.stderr.write(
      "Usage: personal-wallet-reconciliation-cli (--dry-run | --write --confirm LEGACY_RESERVATION_RECONCILIATION)\n",
    );
    process.exitCode = 1;
    return;
  }

  const pool = createPgPool();
  try {
    const report = await reconcileLegacyReservations(pool, mode);
    process.stdout.write(`${JSON.stringify(report)}\n`);
    if (!report.verificationMatched) process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

void main().catch((error: unknown) => {
  process.stderr.write(JSON.stringify({
    error: error instanceof Error ? error.message : "LEGACY_RESERVATION_RECONCILIATION_FAILED",
  }) + "\n");
  process.exitCode = 1;
});
