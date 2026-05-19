import { randomUUID } from "node:crypto";

import {
  BillingService,
  createPgPool,
  hashBillingRedeemCode,
  withTenantTransaction,
} from "@aigc-flow/db";

type Args = {
  code: string;
  credits: number;
  email: string | null;
  tenantId: string | null;
  userId: string | null;
};

function parseArgs(argv: string[]): Args {
  const args: Args = {
    code: "QA-REDEEM-1000",
    credits: 1000,
    email: null,
    tenantId: null,
    userId: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    const next = argv[index + 1];
    if (!value.startsWith("--")) continue;

    switch (value) {
      case "--email":
        args.email = next ?? null;
        index += 1;
        break;
      case "--tenant-id":
        args.tenantId = next ?? null;
        index += 1;
        break;
      case "--user-id":
        args.userId = next ?? null;
        index += 1;
        break;
      case "--code":
        args.code = next?.trim() || args.code;
        index += 1;
        break;
      case "--credits":
        args.credits = Number.parseInt(next ?? "", 10) || args.credits;
        index += 1;
        break;
      default:
        break;
    }
  }

  return args;
}

async function resolveTarget(pool: ReturnType<typeof createPgPool>, args: Args) {
  if (args.tenantId && args.userId) {
    return {
      email: args.email,
      tenantId: args.tenantId,
      userId: args.userId,
    };
  }

  if (!args.email) {
    throw new Error("Provide --email or both --tenant-id and --user-id.");
  }

  const result = await pool.query<{
    email: string;
    tenant_id: string;
    user_id: string;
  }>(
    `
      SELECT
        users.email,
        tenant_memberships.tenant_id::text AS tenant_id,
        users.id::text AS user_id
      FROM users
      JOIN tenant_memberships
        ON tenant_memberships.user_id = users.id
      JOIN tenants
        ON tenants.id = tenant_memberships.tenant_id
      WHERE lower(users.email) = lower($1)
        AND tenant_memberships.status = 'active'
        AND tenants.status = 'active'
      ORDER BY tenant_memberships.created_at ASC, tenant_memberships.tenant_id ASC
      LIMIT 1
    `,
    [args.email],
  );

  const row = result.rows[0];
  if (!row) {
    throw new Error(`Unable to find an active tenant membership for ${args.email}.`);
  }

  return {
    email: row.email,
    tenantId: row.tenant_id,
    userId: row.user_id,
  };
}

function ensureSeedGuard() {
  if (process.env.NODE_ENV === "development" || process.env.DEV_SEED_ENABLED === "true") {
    return;
  }

  throw new Error(
    "Billing seed is only allowed in development. Set NODE_ENV=development or DEV_SEED_ENABLED=true.",
  );
}

async function seedRedeemCode(
  pool: ReturnType<typeof createPgPool>,
  input: {
    code: string;
    credits: number;
    tenantId: string;
    userId: string;
  },
) {
  const codeHash = hashBillingRedeemCode(input.code);

  await withTenantTransaction(
    { tenantId: input.tenantId, userId: input.userId },
    async (client) => {
      await client.query(
        `
          INSERT INTO billing_redeem_codes (
            tenant_id,
            code_hash,
            credits,
            status,
            max_redemptions,
            created_by,
            metadata
          )
          VALUES (
            $1::uuid,
            $2,
            $3::bigint,
            'active',
            1,
            $4::uuid,
            $5::jsonb
          )
          ON CONFLICT (code_hash) DO UPDATE
          SET
            tenant_id = EXCLUDED.tenant_id,
            credits = EXCLUDED.credits,
            status = 'active',
            max_redemptions = 1,
            created_by = EXCLUDED.created_by,
            metadata = EXCLUDED.metadata
        `,
        [
          input.tenantId,
          codeHash,
          input.credits,
          input.userId,
          JSON.stringify({
            note: "Created by npm run dev:seed-billing",
          }),
        ],
      );
    },
    pool,
  );
}

async function main() {
  ensureSeedGuard();

  const args = parseArgs(process.argv.slice(2));
  const pool = createPgPool();
  const billingService = new BillingService({ pool });

  try {
    const target = await resolveTarget(pool, args);

    const adminCredit = await billingService.creditAccount(
      { tenantId: target.tenantId, userId: target.userId },
      {
        amountCents: 5000,
        description: "Local QA seed credit",
        entryType: "admin_credit",
        idempotencyKey: `dev-seed:credit:${target.tenantId}`,
        metadata: {
          source: "dev-seed-billing",
        },
      },
    );

    const settledUsage = await billingService.recordUsageEvent(
      { tenantId: target.tenantId, userId: target.userId },
      {
        billableCents: 250,
        eventType: "qa.seed.usage",
        idempotencyKey: `dev-seed:usage:${target.tenantId}`,
        metadata: {
          note: "Local QA settled usage example",
        },
        modality: "image",
        rawCost: "0.25000000",
        status: "pending",
      },
    );

    await billingService.settleUsage(
      { tenantId: target.tenantId, userId: target.userId },
      {
        amountCents: 250,
        description: "Local QA settle example",
        idempotencyKey: `dev-seed:settle:${target.tenantId}`,
        metadata: {
          source: "dev-seed-billing",
        },
        usageEventId: settledUsage.id,
      },
    );

    await billingService.reserveUsage(
      { tenantId: target.tenantId, userId: target.userId },
      {
        amountCents: 125,
        description: "Local QA reserve example",
        idempotencyKey: `dev-seed:reserve:${target.tenantId}`,
        metadata: {
          source: "dev-seed-billing",
        },
      },
    );

    await billingService.refundUsage(
      { tenantId: target.tenantId, userId: target.userId },
      {
        amountCents: 125,
        description: "Local QA refund example",
        idempotencyKey: `dev-seed:refund:${target.tenantId}`,
        metadata: {
          source: "dev-seed-billing",
        },
      },
    );

    await seedRedeemCode(pool, {
      code: args.code,
      credits: args.credits,
      tenantId: target.tenantId,
      userId: target.userId,
    });

    const pendingPayment = await billingService.createPayment(
      { tenantId: target.tenantId, userId: target.userId },
      {
        amountCents: 1999,
        credits: 2000,
        idempotencyKey: `dev-seed:payment:${target.tenantId}`,
        metadata: {
          note: "Local QA pending payment example",
        },
        provider: "manual",
        status: "pending",
      },
    );

    const summary = await billingService.getBillingSummary({
      tenantId: target.tenantId,
      userId: target.userId,
    });

    console.log(
      JSON.stringify(
        {
          balanceCents: summary.account.balanceCents,
          email: target.email,
          pendingPaymentId: pendingPayment.id,
          redeemCode: args.code,
          reserveExampleCents: 125,
          settledUsageEventId: settledUsage.id,
          tenantId: target.tenantId,
          userId: target.userId,
          creditedLedgerId: adminCredit.id,
        },
        null,
        2,
      ),
    );
  } finally {
    await pool.end();
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
