import type { PoolClient } from "pg";

const SAFE_SAVEPOINT_NAME = /^[a-z][a-z0-9_]*$/;

function assertSavepointName(savepointName: string): void {
  if (!SAFE_SAVEPOINT_NAME.test(savepointName)) {
    throw new Error(`Invalid savepoint name: ${savepointName}`);
  }
}

export async function createRecoverableSavepoint(
  client: Pick<PoolClient, "query">,
  savepointName: string,
): Promise<void> {
  assertSavepointName(savepointName);
  await client.query(`SAVEPOINT ${savepointName}`);
}

export async function rollbackToRecoverableSavepoint(
  client: Pick<PoolClient, "query">,
  savepointName: string,
): Promise<void> {
  assertSavepointName(savepointName);
  await client.query(`ROLLBACK TO SAVEPOINT ${savepointName}`);
  await client.query(`RELEASE SAVEPOINT ${savepointName}`);
}
