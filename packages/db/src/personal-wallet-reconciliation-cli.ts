import { createPgPool } from "./db.js";
import { parseLegacyReservationMode, reconcileLegacyReservations } from "./personal-wallet-reconciliation.js";

async function main(): Promise<void> {
  const mode = parseLegacyReservationMode(process.argv.slice(2));
  if (!mode) {
    process.stderr.write(
      "Usage: personal-wallet-reconciliation-cli (--dry-run | --write --confirm LEGACY_RESERVATION_RECONCILIATION [--cancel-non-terminal])\n",
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
