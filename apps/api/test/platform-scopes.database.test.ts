import { randomUUID } from "node:crypto";
import { createPgPool, withUserTransaction } from "@aigc-flow/db";
import { describe, expect, test } from "vitest";
import { runMigrations } from "../../../packages/db/src/migrator.js";
import { hasDatabaseEnv, withDatabase } from "../../../packages/db/test/helpers.js";
import { AdminApiService } from "../src/modules/admin/admin.service.js";
import { PlatformAccessService } from "../src/modules/platform-access/platform-access.service.js";
import { resolvePlatformCapabilities } from "../src/modules/platform-access/platform-access.policy.js";
import { withPlatformTransaction } from "../src/http/platform-transaction.js";
import { PaymentsService } from "../src/modules/payments/payments.service.js";
import { getApiEnv } from "../src/config/env.js";
import { listPlatformAudit } from "../src/modules/audit/platform-audit.js";

(hasDatabaseEnv() ? describe : describe.skip)("platform scoped database access", () => {
  test("operators read other workspaces without wallet write access and cannot manage platform users", async () => {
    await withDatabase(async ({ databaseUrl, createAppDatabaseUrl }) => {
      const admin = createPgPool({ connectionString: databaseUrl });
      let pool = admin;
      try {
        await runMigrations(admin);
        pool = createPgPool({ connectionString: await createAppDatabaseUrl() });
        const [owner, operator, first, second, t1, t2, project, flow, run, version] = Array.from({ length: 10 }, () => randomUUID());
        for (const id of [owner, operator, first, second]) {
          await admin.query("INSERT INTO users(id,email,email_verified_at) VALUES($1,$2,now())", [id, `${id}@scopes.test`]);
        }
        for (const tenant of [t1, t2]) await admin.query("INSERT INTO tenants(id,name,slug) VALUES($1,'Test workspace',$2)", [tenant,tenant]);
        for (const id of [first, second]) {
          await admin.query("INSERT INTO tenant_memberships(tenant_id,user_id,role_key) VALUES($1,$2,'flow_developer')", [t2,id]);
          await admin.query("INSERT INTO billing_wallets(user_id,balance_credits) VALUES($1,100)", [id]);
        }
        await admin.query("INSERT INTO usage_events(tenant_id,billed_user_id,event_type,modality,status,idempotency_key,billable_cents) VALUES($1,$2,'generation','image','settled','first',7),($1,$3,'generation','image','settled','second',23)", [t2,first,second]);
        await admin.query("INSERT INTO projects(id,tenant_id,name,created_by) VALUES($1,$2,'Private project',$3)", [project,t2,first]);
        await admin.query("INSERT INTO flows(id,tenant_id,project_id,title) VALUES($1,$2,$3,'Private flow')", [flow,t2,project]);
        await admin.query("INSERT INTO flow_versions(id,tenant_id,flow_id,version,graph_json,compiled_graph_json,checksum) VALUES($1,$2,$3,1,'{}','{}','test')", [version,t2,flow]);
        await admin.query("INSERT INTO workflow_runs(id,tenant_id,flow_id,created_by,billed_user_id,status,flow_version_id) VALUES($1,$2,$3,$4,$4,'failed',$5)", [run,t2,flow,first,version]);
        await admin.query("UPDATE workflow_runs SET error_json=$2::jsonb WHERE id=$1",[run,JSON.stringify({code:"UPSTREAM_ERROR",message:"private-user-prompt",secret:"private-credential"})]);
        await admin.query("INSERT INTO node_runs(tenant_id,workflow_run_id,node_id,node_type,error_json,output_json) VALUES($1,$2,'test','text.generate',$3::jsonb,$4::jsonb)",[t2,run,JSON.stringify({code:"UPSTREAM_ERROR",message:"private-user-prompt"}),JSON.stringify({text:"private-output"})]);
        await admin.query("SELECT app.bootstrap_platform_super_admin($1,'Reviewed local test owner','BOOTSTRAP_PLATFORM_SUPER_ADMIN')", [owner]);
        const access = new PlatformAccessService({ pool });
        await access.changeRole({userId:owner}, {targetUserId:operator,roleKey:"platform_operator",expectedVersion:0,reason:"Approved local test operator"});
        const context = { userId:operator, tenantId:t1, roles:["platform_operator"], permissions:resolvePlatformCapabilities("platform_operator"), isAuthenticated:true,sessionId:null,requestId:"scopes",traceId:"scopes",ipHash:null,userAgent:null };
        const service = new AdminApiService({ pool });
        const firstPage = await service.searchUsers(context, { query: "@scopes.test", limit: 2 });
        expect(firstPage.hasMore).toBe(true);
        const secondPage = await service.searchUsers(context, { query: "@scopes.test", limit: 2, cursor: firstPage.nextCursor! });
        expect(new Set([...firstPage.items, ...secondPage.items].map(user => user.id)).size).toBe(4);
        expect(secondPage.hasMore).toBe(false);
        await expect(service.searchUsers(context, { query: "changed", limit: 2, cursor: firstPage.nextCursor! })).rejects.toMatchObject({ statusCode: 400 });
        const superContext = { ...context, userId: owner, roles: ["platform_super_admin"], permissions: resolvePlatformCapabilities("platform_super_admin") };
        await admin.query("CREATE FUNCTION reject_wallet_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action LIKE 'admin.user.%credits%' THEN RAISE EXCEPTION 'audit storage unavailable'; END IF; RETURN NEW; END $$");
        await admin.query("CREATE TRIGGER reject_wallet_audit BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION reject_wallet_audit()");
        for (const action of ["grant", "adjust"] as const) {
          const adjustment = { credits: 10, reason: "Local atomic audit test", targetUserId: first, tenantId: t2, idempotencyKey: `atomic-${action}` };
          await expect(action === "grant" ? service.grantCredits(superContext, adjustment) : service.adjustCredits(superContext, { ...adjustment, direction: "add" })).rejects.toThrow("audit storage unavailable");
          expect((await admin.query("SELECT balance_credits::text AS balance FROM billing_wallets WHERE user_id=$1", [first])).rows[0].balance).toBe("100.0000");
        }
        await admin.query("DROP TRIGGER reject_wallet_audit ON audit_logs");
        const payments = new PaymentsService(getApiEnv(), { pool });
        await payments.walletPayments.createAdminPlan({ key: "scope_plan", name: "Scope plan", amountCents: 990, credits: 100, validityDays: 365, active: true, sortOrder: 0 });
        const payment = await payments.walletPayments.createPendingPayment({ userId: second }, { planKey: "scope_plan", merchantOrderId: "TFSCOPE01", idempotencyKey: "scope-payment" });
        await payments.walletPayments.applyVerifiedNotification({ merchantOrderId: "TFSCOPE01", amountCents: 990, eventTime: new Date().toISOString(), openOrderId: "scope-order", providerState: "OD", transactionId: "scope-transaction" });
        expect(await payments.listAdminPayments(context)).toEqual(expect.arrayContaining([expect.objectContaining({ id: payment.id, userId: second, eligible: true })]));
        await expect(payments.listAdminPayments({ userId: first })).rejects.toMatchObject({ statusCode: 403 });
        await withPlatformTransaction(pool, context, "platform:payments:read", async client => {
          expect((await client.query("SELECT current_setting('app.is_system_admin') AS flag")).rows[0].flag).toBe("false");
          expect((await client.query("UPDATE billing_wallet_payments SET status='refunded' WHERE id=$1 RETURNING id", [payment.id])).rowCount).toBe(0);
        });
        expect((await service.getUser(context, first)).memberships[0].usedCredits).toBe(7);
        expect((await service.getUser({...context,tenantId:null}, second)).memberships[0].usedCredits).toBe(23);
        expect((await service.getUser(context, first)).wallet.balanceCredits).toBe(100);
        expect((await service.listWorkflowRuns(context)).items.map(x=>x.id)).toContain(run);
        expect((await service.listWorkflowRuns(context,{tenantId:t2})).items).toHaveLength(1);
        expect((await service.listWorkflowRuns(context,{tenantId:t1})).items).toHaveLength(0);
        expect((await service.getWorkflowRun(context,run)).workflowRun.tenantId).toBe(t2);
        expect(JSON.stringify(await service.getWorkflowRun(context,run))).not.toContain("private-");
        await withPlatformTransaction(pool,context,"platform:users:read", async client => {
          expect((await client.query("SELECT current_setting('app.is_system_admin') AS flag")).rows[0].flag).toBe("false");
          expect((await client.query("UPDATE billing_wallets SET balance_credits=999 WHERE user_id=$1 RETURNING id", [first])).rowCount).toBe(0);
        });
        await expect(withPlatformTransaction(pool,{userId:first},"platform:users:read",async()=>null)).rejects.toMatchObject({statusCode:403});
        await expect(service.updateUserStatus(context,{targetUserId:owner,status:"disabled",reason:"Attempt owner suspension"})).rejects.toMatchObject({statusCode:403});
        await service.updateUserStatus(context,{targetUserId:first,status:"disabled",reason:"Confirmed abuse in local test"});
        expect((await admin.query("SELECT status FROM users WHERE id=$1",[first])).rows[0].status).toBe("disabled");
        expect((await admin.query("SELECT metadata->>'reason' AS reason FROM audit_logs WHERE action='admin.user.update_status'")).rows[0].reason).toBe("Confirmed abuse in local test");
        await admin.query("INSERT INTO audit_logs(tenant_id,actor_user_id,action,resource_type,metadata) VALUES($1,$2,'billing.payment.refund','payment',$3::jsonb)", [t1, owner, JSON.stringify({ reason: "Sensitive payment reason", prompt: "private-prompt", apiKey: "private-key" })]);
        const operatorAudit = await listPlatformAudit(pool, context, {}, "local-audit-test");
        expect(operatorAudit.items.some(item => item.action === "admin.user.update_status")).toBe(true);
        expect(operatorAudit.items.some(item => item.action === "billing.payment.refund" || item.action.startsWith("platform.role."))).toBe(false);
        const superAudit = await listPlatformAudit(pool, superContext, {}, "local-audit-test");
        expect(superAudit.items.some(item => item.action === "platform.role.bootstrap")).toBe(true);
        expect(superAudit.items.some(item => item.action === "billing.payment.refund")).toBe(true);
        expect(JSON.stringify(superAudit)).not.toContain("private-");
        const retryInput = { credits: 10, reason: "Approved retry grant", targetUserId: second, tenantId: t2, idempotencyKey: "stable-admin-grant", validityMode: "months" as const, validityMonths: 1 };
        const grants = await Promise.all([service.grantCredits({ ...superContext, tenantId: null }, retryInput), service.grantCredits({ ...superContext, tenantId: null }, retryInput)]);
        expect(grants[0].ledgerEntry.id).toBe(grants[1].ledgerEntry.id);
        await expect(service.grantCredits(superContext, { ...retryInput, credits: 20 })).rejects.toMatchObject({ statusCode: 409, code: "WALLET_IDEMPOTENCY_CONFLICT" });
        expect((await admin.query("SELECT count(*)::int AS count FROM audit_logs WHERE metadata->>'idempotencyKey'=$1", [retryInput.idempotencyKey])).rows[0].count).toBe(1);
        const debitInput = { credits: 5, reason: "Approved retry adjustment", direction: "subtract" as const, targetUserId: second, tenantId: t2, idempotencyKey: "stable-admin-debit" };
        const debits = await Promise.all([service.adjustCredits(superContext, debitInput), service.adjustCredits(superContext, debitInput)]);
        expect(debits[0].ledgerEntry.id).toBe(debits[1].ledgerEntry.id);
        await expect(service.adjustCredits(superContext, { ...debitInput, reason: "Different request" })).rejects.toMatchObject({ statusCode: 409 });
        await withUserTransaction({userId:second},async client=>{
          expect((await client.query("SELECT * FROM billing_wallets WHERE user_id=$1",[first])).rows).toHaveLength(0);
        },pool);
      } finally { if(pool!==admin) await pool.end(); await admin.end(); }
    });
  },120_000);
});
