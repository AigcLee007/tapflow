import type { Pool, PoolClient } from "pg";

import { BillingService } from "./billing.js";

const EPSILON = 0.0001;

export type LegacyReservationStatus = {
  nodeStatus: string | null;
  workflowStatus: string | null;
};

export type LegacyReservationMode = {
  cancelNonTerminal: boolean;
  dryRun: boolean;
};

export function parseLegacyReservationMode(args: string[]): LegacyReservationMode | null {
  if (args.length === 1 && args[0] === "--dry-run") {
    return { cancelNonTerminal: false, dryRun: true };
  }
  if (
    args.length === 3
    && args[0] === "--write"
    && args[1] === "--confirm"
    && args[2] === "LEGACY_RESERVATION_RECONCILIATION"
  ) {
    return { cancelNonTerminal: false, dryRun: false };
  }
  if (
    args.length === 4
    && args[0] === "--write"
    && args[1] === "--confirm"
    && args[2] === "LEGACY_RESERVATION_RECONCILIATION"
    && args[3] === "--cancel-non-terminal"
  ) {
    return { cancelNonTerminal: true, dryRun: false };
  }
  return null;
}

export function isTerminalLegacyReservation(status: LegacyReservationStatus): boolean {
  return status.workflowStatus === "failed"
    || status.workflowStatus === "canceled"
    || status.workflowStatus === "cancelled";
}

export function shouldRepairOrphanGrant(input: {
  grantReservedCredits: number;
  rowReservedCredits: number;
}): boolean {
  return input.grantReservedCredits - input.rowReservedCredits > EPSILON;
}

export type LegacyReservationReconciliationReport = {
  activeReservationCount: number;
  dryRun: boolean;
  orphanGrantCount: number;
  orphanReservedCredits: number;
  repairedGrantCount: number;
  releasedCredits: number;
  terminalReservationCount: number;
  terminalReservationCredits: number;
  unlinkedReservationCount: number;
  verificationMatched: boolean;
  nonTerminalReservationCount: number;
};

type ReservationRow = LegacyReservationStatus & {
  amountCredits: number;
  billingLedgerId: string;
  id: string;
  nodeRunId: string | null;
  tenantId: string;
  workflowRunId: string | null;
};

type OrphanGrantRow = {
  accountCurrency: string;
  billingAccountId: string;
  grantId: string;
  grantReservedCredits: number;
  rowReservedCredits: number;
  tenantId: string;
};

type ReconciliationState = {
  orphanGrants: OrphanGrantRow[];
  reservations: ReservationRow[];
};

function asNumber(value: string | number | null | undefined): number {
  return Number(value ?? 0);
}

function sum(values: Iterable<number>): number {
  return Number([...values].reduce((total, value) => total + value, 0).toFixed(4));
}

async function setSystemAdmin(client: PoolClient): Promise<void> {
  await client.query("SELECT set_config('app.is_system_admin', 'true', true)");
}

async function loadState(client: PoolClient): Promise<ReconciliationState> {
  const reservations = await client.query<{
    amount_credits: string;
    billing_ledger_id: string;
    id: string;
    node_run_id: string | null;
    node_status: string | null;
    tenant_id: string;
    workflow_run_id: string | null;
    workflow_status: string | null;
  }>(`
    SELECT
      reservation.id::text AS id,
      reservation.tenant_id::text AS tenant_id,
      reservation.billing_ledger_id::text AS billing_ledger_id,
      reservation.amount_credits::text AS amount_credits,
      node_run.id::text AS node_run_id,
      node_run.status AS node_status,
      workflow_run.id::text AS workflow_run_id,
      workflow_run.status AS workflow_status
    FROM billing_credit_reservations reservation
    LEFT JOIN billing_ledger ledger ON ledger.id = reservation.billing_ledger_id
    LEFT JOIN usage_events usage_event ON usage_event.id = ledger.usage_event_id
    LEFT JOIN LATERAL (
      SELECT candidate.id, candidate.workflow_run_id, candidate.status
      FROM node_runs candidate
      WHERE candidate.id = usage_event.node_run_id
         OR candidate.id::text = ledger.metadata->>'nodeRunId'
      ORDER BY (candidate.id = usage_event.node_run_id) DESC
      LIMIT 1
    ) node_run ON true
    LEFT JOIN LATERAL (
      SELECT candidate.id, candidate.status
      FROM workflow_runs candidate
      WHERE candidate.id = usage_event.workflow_run_id
         OR candidate.id = node_run.workflow_run_id
         OR candidate.id::text = ledger.metadata->>'workflowRunId'
      ORDER BY (candidate.id = usage_event.workflow_run_id) DESC
      LIMIT 1
    ) workflow_run ON true
    WHERE reservation.status = 'reserved'
    ORDER BY reservation.created_at ASC, reservation.id ASC
  `);

  const orphanGrants = await client.query<{
    account_currency: string;
    billing_account_id: string;
    grant_id: string;
    grant_reserved_credits: string;
    row_reserved_credits: string;
    tenant_id: string;
  }>(`
    SELECT
      credit_grant.id::text AS grant_id,
      credit_grant.tenant_id::text AS tenant_id,
      credit_grant.billing_account_id::text AS billing_account_id,
      account.currency AS account_currency,
      credit_grant.reserved_credits::text AS grant_reserved_credits,
      COALESCE(SUM(reservation.amount_credits) FILTER (WHERE reservation.status = 'reserved'), 0)::text AS row_reserved_credits
    FROM billing_credit_grants credit_grant
    JOIN billing_accounts account ON account.id = credit_grant.billing_account_id
    LEFT JOIN billing_credit_reservations reservation ON reservation.credit_grant_id = credit_grant.id
    GROUP BY credit_grant.id, credit_grant.tenant_id, credit_grant.billing_account_id, account.currency, credit_grant.reserved_credits
    HAVING credit_grant.reserved_credits - COALESCE(SUM(reservation.amount_credits) FILTER (WHERE reservation.status = 'reserved'), 0) > ${EPSILON}
    ORDER BY credit_grant.id ASC
  `);

  return {
    reservations: reservations.rows.map((row) => ({
      amountCredits: asNumber(row.amount_credits),
      billingLedgerId: row.billing_ledger_id,
      id: row.id,
      nodeRunId: row.node_run_id,
      nodeStatus: row.node_status,
      tenantId: row.tenant_id,
      workflowRunId: row.workflow_run_id,
      workflowStatus: row.workflow_status,
    })),
    orphanGrants: orphanGrants.rows.map((row) => ({
      accountCurrency: row.account_currency,
      billingAccountId: row.billing_account_id,
      grantId: row.grant_id,
      grantReservedCredits: asNumber(row.grant_reserved_credits),
      rowReservedCredits: asNumber(row.row_reserved_credits),
      tenantId: row.tenant_id,
    })).filter((row) => shouldRepairOrphanGrant(row)),
  };
}

function makeReport(
  dryRun: boolean,
  state: ReconciliationState,
  postWriteState: ReconciliationState | null,
  releasedCredits: number,
  repairedGrantCount: number,
): LegacyReservationReconciliationReport {
  const terminal = state.reservations.filter((row) => isTerminalLegacyReservation(row));
  const nonTerminal = state.reservations.length - terminal.length;
  const verificationState = postWriteState ?? state;
  return {
    activeReservationCount: verificationState.reservations.length,
    dryRun,
    orphanGrantCount: verificationState.orphanGrants.length,
    orphanReservedCredits: sum(verificationState.orphanGrants.map((row) => row.grantReservedCredits - row.rowReservedCredits)),
    repairedGrantCount,
    releasedCredits,
    terminalReservationCount: terminal.length,
    terminalReservationCredits: sum(terminal.map((row) => row.amountCredits)),
    unlinkedReservationCount: verificationState.reservations.filter((row) => !row.workflowRunId).length,
    verificationMatched: verificationState.reservations.length === 0 && verificationState.orphanGrants.length === 0,
    nonTerminalReservationCount: postWriteState
      ? postWriteState.reservations.filter((row) => !isTerminalLegacyReservation(row)).length
      : nonTerminal,
  };
}

async function repairOrphanGrant(client: PoolClient, row: OrphanGrantRow): Promise<void> {
  const difference = Number((row.grantReservedCredits - row.rowReservedCredits).toFixed(4));
  await client.query(
    `INSERT INTO billing_ledger (
       tenant_id, billing_account_id, entry_type, amount_cents, currency,
       idempotency_key, description, metadata
     ) VALUES ($1::uuid, $2::uuid, 'reconciliation', 0, $3,
       $4, $5, $6::jsonb)
     ON CONFLICT (tenant_id, idempotency_key) DO NOTHING`,
    [
      row.tenantId,
      row.billingAccountId,
      row.accountCurrency,
      `reconcile:legacy-orphan-grant:${row.grantId}`,
      "Release orphaned legacy credit reservation counter",
      JSON.stringify({
        grantId: row.grantId,
        previousReservedCredits: row.grantReservedCredits,
        releasedCredits: difference,
        rowReservedCredits: row.rowReservedCredits,
      }),
    ],
  );
  await client.query(
    `UPDATE billing_credit_grants
     SET reserved_credits = $2::numeric, updated_at = now()
     WHERE id = $1::uuid`,
    [row.grantId, row.rowReservedCredits],
  );
  await client.query(
    `UPDATE billing_accounts account
     SET reserved_cents = COALESCE((
       SELECT SUM(credit_grant.reserved_credits)
       FROM billing_credit_grants credit_grant
       WHERE credit_grant.billing_account_id = account.id
     ), 0), updated_at = now()
     WHERE account.id = $1::uuid`,
    [row.billingAccountId],
  );
}

async function cancelNonTerminalWorkflows(
  client: PoolClient,
  rows: ReservationRow[],
): Promise<void> {
  const workflowRunIds = [...new Set(rows.map((row) => row.workflowRunId).filter((id): id is string => Boolean(id)))];

  for (const workflowRunId of workflowRunIds) {
    await client.query(
      `UPDATE node_runs
       SET
         status = 'canceled',
         error_json = COALESCE(error_json, '{}'::jsonb) || $2::jsonb,
         finished_at = COALESCE(finished_at, now()),
         updated_at = now()
       WHERE workflow_run_id = $1::uuid
         AND status NOT IN ('failed', 'canceled', 'succeeded')`,
      [workflowRunId, JSON.stringify({ reconciliation: "legacy-reservation", reason: "PERSONAL_WALLET_CUTOVER" })],
    );
    const workflow = await client.query<{ tenant_id: string }>(
      `UPDATE workflow_runs
       SET
         status = 'canceled',
         canceled_at = now(),
         error_json = COALESCE(error_json, '{}'::jsonb) || $2::jsonb,
         finished_at = COALESCE(finished_at, now()),
         updated_at = now()
       WHERE id = $1::uuid
         AND status NOT IN ('failed', 'canceled', 'succeeded')
       RETURNING tenant_id::text AS tenant_id`,
      [workflowRunId, JSON.stringify({ reconciliation: "legacy-reservation", reason: "PERSONAL_WALLET_CUTOVER" })],
    );
    const tenantId = workflow.rows[0]?.tenant_id ?? rows.find((row) => row.workflowRunId === workflowRunId)?.tenantId;
    if (!tenantId) throw new Error("LEGACY_RESERVATION_TENANT_ID_REQUIRED");
    const sequence = await client.query<{ next_sequence: number }>(
      `SELECT COALESCE(MAX(sequence), 0) + 1 AS next_sequence
       FROM workflow_run_events
       WHERE workflow_run_id = $1::uuid`,
      [workflowRunId],
    );
    await client.query(
      `INSERT INTO workflow_run_events (
         tenant_id, workflow_run_id, event_type, sequence, payload
       ) VALUES ($1::uuid, $2::uuid, 'workflow.run.canceled', $3::int, $4::jsonb)`,
      [
        tenantId,
        workflowRunId,
        sequence.rows[0]?.next_sequence ?? 1,
        JSON.stringify({ status: "canceled", reason: "PERSONAL_WALLET_CUTOVER" }),
      ],
    );
  }
}

export async function reconcileLegacyReservations(
  pool: Pool,
  options: LegacyReservationMode,
): Promise<LegacyReservationReconciliationReport> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ");
    await setSystemAdmin(client);
    if (!options.dryRun) {
      await client.query(
        "LOCK TABLE billing_credit_reservations, billing_credit_grants, billing_accounts, billing_ledger IN SHARE ROW EXCLUSIVE MODE",
      );
    }

    const state = await loadState(client);
    const terminal = state.reservations.filter((row) => isTerminalLegacyReservation(row));
    if (!options.dryRun && state.reservations.length !== terminal.length && !options.cancelNonTerminal) {
      throw new Error("LEGACY_RESERVATION_NON_TERMINAL_BLOCKED");
    }

    if (!options.dryRun) {
      if (options.cancelNonTerminal && state.reservations.length !== terminal.length) {
        await cancelNonTerminalWorkflows(client, state.reservations.filter((row) => !isTerminalLegacyReservation(row)));
      }
      const billingService = new BillingService({ pool });
      const rowsToRefund = options.cancelNonTerminal ? state.reservations : terminal;
      for (const row of rowsToRefund) {
        await billingService.refundUsageWithClient(client, row.tenantId, {
          amountCents: row.amountCredits,
          idempotencyKey: `reconcile:legacy-reservation-refund:${row.id}`,
          metadata: {
            nodeRunId: row.nodeRunId,
            reserveLedgerId: row.billingLedgerId,
            reconciliation: "legacy-reservation",
            reservationId: row.id,
            workflowRunId: row.workflowRunId,
          },
        });
      }
      for (const row of state.orphanGrants) {
        await repairOrphanGrant(client, row);
      }
    }

    const postWriteState = options.dryRun ? null : await loadState(client);
    const report = makeReport(
      options.dryRun,
      state,
      postWriteState,
      options.dryRun ? 0 : sum(terminal.map((row) => row.amountCredits)),
      options.dryRun ? 0 : state.orphanGrants.length,
    );
    await client.query(options.dryRun ? "ROLLBACK" : "COMMIT");
    return report;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}
