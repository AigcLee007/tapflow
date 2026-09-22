import { randomUUID } from "node:crypto";
import { createPgPool, withUserTransaction } from "@aigc-flow/db";
import { describe, expect, test } from "vitest";
import { runMigrations } from "../../../packages/db/src/migrator.js";
import { hasDatabaseEnv, withDatabase } from "../../../packages/db/test/helpers.js";
import { ConsoleQueryService } from "../src/modules/console-query/console-query.service.js";
import { PlatformAccessService } from "../src/modules/platform-access/platform-access.service.js";
import { withPlatformTransaction } from "../src/http/platform-transaction.js";
(hasDatabaseEnv() ? describe : describe.skip)("console query database boundary", () => {
    test("pages personal billing globally, authorizes tasks, hides private data and counts execution once", async () => {
        await withDatabase(async ({ databaseUrl, createAppDatabaseUrl }) => {
            const admin = createPgPool({ connectionString: databaseUrl });
            let pool = admin;
            try {
                await runMigrations(admin);
                pool = createPgPool({ connectionString: await createAppDatabaseUrl() });
                const [a, b, operator, t1, t2, project, flow, version, run, node, wb] = Array.from({ length: 11 }, () => randomUUID());
                for (const id of [a, b, operator])
                    await admin.query("INSERT INTO users(id,email,email_verified_at) VALUES($1,$2,now())", [id, `${id}@console.test`]);
                for (const id of [t1, t2])
                    await admin.query("INSERT INTO tenants(id,name,slug) VALUES($1::uuid,'Test',$1::text)", [id]);
                for (const t of [t1, t2])
                    for (const u of [a, b])
                        await admin.query("INSERT INTO tenant_memberships(tenant_id,user_id,role_key) VALUES($1,$2,'flow_developer')", [t, u]);
                const owner = randomUUID();
                await admin.query("INSERT INTO users(id,email,email_verified_at) VALUES($1,$2,now())", [owner, `${owner}@console.test`]);
                await admin.query("SELECT app.bootstrap_platform_super_admin($1,'Local query test owner','BOOTSTRAP_PLATFORM_SUPER_ADMIN')", [owner]);
                await new PlatformAccessService({ pool }).changeRole({ userId: owner }, { targetUserId: operator, roleKey: 'platform_operator', expectedVersion: 0, reason: 'Local console query operator' });
                await admin.query("INSERT INTO projects(id,tenant_id,name,created_by) VALUES($1,$2,'private-name',$3)", [project, t2, a]);
                await admin.query("INSERT INTO flows(id,tenant_id,project_id,title) VALUES($1,$2,$3,'private-title')", [flow, t2, project]);
                await admin.query("INSERT INTO flow_versions(id,tenant_id,flow_id,version,graph_json,compiled_graph_json,checksum) VALUES($1,$2,$3,1,'{}','{}','x')", [version, t2, flow]);
                await admin.query("INSERT INTO workflow_runs(id,tenant_id,flow_id,flow_version_id,created_by,billed_user_id,status,output_json) VALUES($1::uuid,$2,$3,$4,$5,$5,'succeeded','{\"text\":\"private-output\"}')", [run, t2, flow, version, a]);
                await admin.query("INSERT INTO node_runs(id,tenant_id,workflow_run_id,node_id,node_type,status,output_json,finished_at) VALUES($1,$2,$3,'n','video.generate','succeeded','{\"text\":\"private-output\"}',now())", [node, t2, run]);
                await admin.query("INSERT INTO workbench_generations(id,tenant_id,created_by,billed_user_id,prompt,model_id,route_key,status) VALUES($1,$2,$3,$3,'private-prompt','m','r','failed')", [wb, t2, a]);
                const usageIds: string[] = [];
                const sameTime = (await admin.query("SELECT (date_trunc('second',now()-interval '1 minute')+interval '0.123456 seconds')::text AS stamp")).rows[0].stamp;
                for (let i = 0; i < 5; i++) {
                    const id = randomUUID();
                    usageIds.push(id);
                    await admin.query("INSERT INTO usage_events(id,tenant_id,billed_user_id,workflow_run_id,node_run_id,event_type,modality,status,idempotency_key,billable_cents,metadata,created_at) VALUES($1::uuid,$2,$3,$4,$5,'generation','video','settled',$1::text,7,'{\"prompt\":\"private-prompt\"}',$6::timestamptz)", [id, i % 2 ? t1 : t2, a, i === 0 ? run : null, i === 0 ? node : null, sameTime]);
                }
                const otherUsage = randomUUID();
                await admin.query("INSERT INTO usage_events(id,tenant_id,billed_user_id,event_type,modality,status,idempotency_key,billable_cents) VALUES($1::uuid,$2,$3,'generation','image','settled',$1::text,29)", [otherUsage, t2, b]);
                for (let i = 0; i < 4; i++)
                    await admin.query("INSERT INTO ai_call_logs(tenant_id,workflow_run_id,node_run_id,status,request_summary,response_summary) VALUES($1,$2,$3,'succeeded',$4,'{\"status\":\"running\"}')", [t2, run, node, JSON.stringify({ providerTaskId: 'poll', prompt: 'private-call' })]);
                const service = new ConsoleQueryService({ pool, cursorSecret: 'query-test-secret' });
                const first = await service.listUsage({ userId: a }, 'self', { limit: 2 });
                expect(first.items).toHaveLength(2);
                expect(first.hasMore).toBe(true);
                const all = [...first.items];
                let cursor = first.nextCursor;
                await admin.query("INSERT INTO usage_events(tenant_id,billed_user_id,event_type,modality,status,idempotency_key,billable_cents) VALUES($1,$2,'generation','image','settled','later',100)", [t1, a]);
                while (cursor) {
                    const page = await service.listUsage({ userId: a }, 'self', { limit: 2, cursor });
                    all.push(...page.items);
                    cursor = page.nextCursor;
                }
                expect(new Set(all.map(x => x.id)).size).toBe(6);
                expect(all.filter(x => x.usageEventId)).toHaveLength(5);
                expect(all.find(x => x.id === `workbench:${wb}`)).toMatchObject({ billingStatus: 'unbilled', chargedCredits: null });
                expect(JSON.stringify(all)).not.toContain('private-');
                await expect(service.getUsage({ userId: b }, 'self', `usage:${usageIds[0]}`)).rejects.toMatchObject({ statusCode: 404 });
                await expect(service.listUsage({ userId: a }, 'platform', {})).rejects.toMatchObject({ statusCode: 403 });
                expect((await service.listTasks({ userId: a }, 'self', {})).items).toHaveLength(2);
                expect((await service.listTasks({ userId: b }, 'self', {})).items).toHaveLength(0);
                expect((await service.listTasks({ userId: operator }, 'platform', {})).items).toHaveLength(2);
                await withPlatformTransaction(pool, { userId: operator }, 'platform:tasks:read', async (client) => {
                    expect((await client.query("SELECT current_setting('app.is_system_admin') AS flag")).rows[0].flag).toBe('false');
                    expect((await client.query("UPDATE workbench_generations SET status='succeeded' WHERE id=$1 RETURNING id", [wb])).rowCount).toBe(0);
                });
                const overview = await service.overview({ userId: a }, 'self', { asOf: first.asOf });
                expect(overview.usage).toMatchObject({ total: 6, settled: 5, unbilled: 1, chargedCredits: '35.0000' });
                expect(overview.generation).toMatchObject({ total: 2, succeeded: 1, failed: 1, successRate: 0.5 });
                const provider = randomUUID(), model = randomUUID();
                await admin.query("INSERT INTO ai_providers(id,key,name,kind) VALUES($1::uuid,$1::text,'Test','mock')", [provider]);
                await admin.query("INSERT INTO ai_models(id,provider_id,model_key,display_name,modality) VALUES($1,$2,'test','Test','video')", [model, provider]);
                await admin.query("UPDATE usage_events SET model_id=$1 WHERE id=$2", [model, usageIds[0]]);
                expect((await service.listTasks({ userId: a }, 'self', { modelId: model })).items.map(x => x.id)).toEqual([`workflow:${run}`]);
                expect((await service.overview({ userId: a }, 'self', { modelId: model })).generation).toMatchObject({ total: 1, succeeded: 1, failed: 0 });
                // A Workbench generation may be created before the snapshot while its
                // usage event is recorded afterwards. Historical model/route filters
                // must not discover that future association through the task arrays.
                const futureProvider = randomUUID(), futureModel = randomUUID(), futureRoute = randomUUID(), futureUsage = randomUUID();
                await admin.query("INSERT INTO ai_providers(id,key,name,kind) VALUES($1::uuid,$1::text,'Future Test','mock')", [futureProvider]);
                await admin.query("INSERT INTO ai_models(id,provider_id,model_key,display_name,modality) VALUES($1,$2,'future-test','Future Test','video')", [futureModel, futureProvider]);
                await admin.query("INSERT INTO ai_routes(id,tenant_id,provider_id,model_id,route_key,modality) VALUES($1,$2,$3,$4,$5,'video')", [futureRoute, t2, futureProvider, futureModel, `future-${futureRoute}`]);
                const futureCreatedAt = new Date(new Date(first.asOf).getTime() + 1000).toISOString();
                await admin.query("INSERT INTO usage_events(id,tenant_id,billed_user_id,model_id,route_id,event_type,modality,status,idempotency_key,billable_cents,created_at) VALUES($1,$2,$3,$4,$5,'generation','video','pending',$1::text,0,$6::timestamptz)", [futureUsage, t2, a, futureModel, futureRoute, futureCreatedAt]);
                await admin.query("UPDATE workbench_generations SET billing_usage_event_id=$1 WHERE id=$2", [futureUsage, wb]);
                expect((await service.listTasks({ userId: a }, 'self', { asOf: first.asOf, modelId: futureModel, routeId: futureRoute })).items).toHaveLength(0);
                expect((await service.overview({ userId: a }, 'self', { asOf: first.asOf, modelId: futureModel, routeId: futureRoute })).generation).toMatchObject({ total: 0, succeeded: 0, failed: 0 });
                expect((await service.listCalls({ userId: operator }, {})).items).toHaveLength(4);
                expect(JSON.stringify(await service.listCalls({ userId: operator }, {}))).not.toContain('private-');
                await admin.query(`INSERT INTO ai_call_logs(
                  tenant_id,workflow_run_id,node_run_id,provider_id,model_id,route_id,status,
                  record_level,operation,traffic_class,execution_id,actor_user_id,billed_user_id,
                  attempt,request_dispatched,http_status,request_summary,response_summary
                ) VALUES
                  ($1,$2,$3,$4,$5,NULL,'http_succeeded','request','submit','user_generation','execution-1',$6,$6,1,true,202,'{}','{}'),
                  ($1,$2,$3,$4,$5,NULL,'http_succeeded','request','poll','user_generation','execution-1',$6,$6,2,true,200,'{}','{}')`,
                  [t2, run, node, provider, model, a]);
                const callsWithTelemetry = await service.listCalls({ userId: operator }, {});
                expect(callsWithTelemetry.items.filter(item => item.recordLevel === 'request')).toEqual([
                  expect.objectContaining({ operation: 'poll', transportStatus: 'http_succeeded', trafficClass: 'user_generation' }),
                  expect.objectContaining({ operation: 'submit', transportStatus: 'http_succeeded', trafficClass: 'user_generation' }),
                ]);
                expect(callsWithTelemetry.items.filter(item => item.recordLevel === 'summary')).toHaveLength(4);
                await admin.query(`INSERT INTO ai_call_logs(
                  tenant_id,workflow_run_id,node_run_id,status,record_level,operation,traffic_class,actor_user_id,
                  request_dispatched,http_status,request_summary,response_summary
                ) VALUES($1,$2,$3,'http_failed','request','submit','admin_test',$4,true,500,'{}','{}')`, [t2, run, node, operator]);
                expect((await service.overview({ userId: operator }, 'platform', {})).upstream).toMatchObject({
                  total: 2, operationCoverage: 'request', requestSuccessRate: 1, adminTestTotal: 1, adminTestSuccessRate: 0,
                });
                for (const [status, code] of [['failed', 'PROVIDER_TIMEOUT'], ['failed', 'PIXELHUB_TASK_TIMEOUT'], ['canceled', null]])
                    await admin.query("INSERT INTO node_runs(tenant_id,workflow_run_id,node_id,node_type,status,error_json) VALUES($1,$2,$3,'video.generate',$4,$5)", [t2, run, randomUUID(), status, code ? JSON.stringify({ code, message: 'private-error' }) : null]);
                expect((await service.overview({ userId: a }, 'self', {})).generation).toMatchObject({ total: 5, succeeded: 1, failed: 1, canceled: 1, pendingOrUnknown: 2, successRate: 0.5 });
                const parent = randomUUID();
                await admin.query("INSERT INTO workbench_generations(id,tenant_id,created_by,billed_user_id,prompt,model_id,route_key,status,batch_role,batch_total) VALUES($1,$2,$3,$3,'private-prompt','m','r','succeeded','parent',2)", [parent, t2, a]);
                expect((await service.overview({ userId: a }, 'self', {})).generation.total).toBe(5);
                expect((await service.listUsage({ userId: a }, 'self', {})).items.some(x => x.id === `workbench:${parent}`)).toBe(false);
                const wallet = randomUUID();
                await admin.query("INSERT INTO billing_wallets(id,user_id) VALUES($1,$2)", [wallet, a]);
                const personalUsage = randomUUID();
                await admin.query("INSERT INTO usage_events(id,tenant_id,billed_user_id,event_type,modality,status,idempotency_key,billable_cents) VALUES($1::uuid,$2,$3,'generation','image','pending',$1::text,99)", [personalUsage, t2, a]);
                await admin.query("INSERT INTO billing_wallet_ledger(wallet_id,user_id,tenant_id,usage_event_id,entry_type,amount_credits,idempotency_key) VALUES($1,$2,$3,$4,'settle',-1.125,'actual-settlement')", [wallet, a, t2, personalUsage]);
                expect((await service.getUsage({ userId: a }, 'self', `usage:${personalUsage}`)).item).toMatchObject({ billingStatus: 'settled', chargedCredits: '1.1250' });
                expect((await service.overview({ userId: a }, 'self', {})).usage.chargedCredits).toBe('136.1250');
                for (let i = 0; i < 25; i++)
                    await admin.query("INSERT INTO billing_wallet_ledger(wallet_id,user_id,tenant_id,entry_type,amount_credits,idempotency_key,metadata,created_at) VALUES($1,$2,$3,'admin_credit',0.125,$4,'{\"secret\":\"private-secret\"}',$5)", [wallet, a, i % 2 ? t1 : t2, `ledger-${i}`, sameTime]);
                const ledger = [];
                let activity = await service.listActivity({ userId: a }, { limit: 7 });
                ledger.push(...activity.items);
                while (activity.nextCursor) {
                    activity = await service.listActivity({ userId: a }, { limit: 7, cursor: activity.nextCursor });
                    ledger.push(...activity.items);
                }
                expect(ledger).toHaveLength(26);
                expect(new Set(ledger.map(x => x.id)).size).toBe(26);
                expect(ledger.some(x => x.amountCredits === '0.1250')).toBe(true);
                expect(JSON.stringify(ledger)).not.toContain('private-');
                expect((await service.listActivity({ userId: b }, {})).items).toHaveLength(0);
                const platformLedger = await service.listUserActivity({ userId: operator }, a, { limit: 100 });
                expect(platformLedger.items).toHaveLength(26);
                expect(platformLedger.scope).toBe('platform');
                expect((await service.listUserActivity({ userId: operator }, b, {})).items).toHaveLength(0);
                await expect(service.listUserActivity({ userId: b }, a, {})).rejects.toMatchObject({ statusCode: 403 });
                const reservedNode = randomUUID(), grant = randomUUID();
                await admin.query("INSERT INTO node_runs(id,tenant_id,workflow_run_id,node_id,node_type,status) VALUES($1,$2,$3,'reserved','image.generate','failed')", [reservedNode, t2, run]);
                await admin.query("INSERT INTO billing_wallet_credit_grants(id,wallet_id,user_id,source_type,original_credits,remaining_credits) VALUES($1,$2,$3,'admin_grant',10,10)", [grant, wallet, a]);
                for (const [reserve, nodeId] of [[randomUUID(), reservedNode], [randomUUID(), null]]) {
                    await admin.query("INSERT INTO billing_wallet_ledger(id,wallet_id,user_id,tenant_id,node_run_id,entry_type,amount_credits,idempotency_key) VALUES($1::uuid,$2,$3,$4,$5,'reserve',-2,$1::text)", [reserve, wallet, a, t2, nodeId]);
                    await admin.query("INSERT INTO billing_wallet_credit_reservations(wallet_id,user_id,wallet_ledger_id,credit_grant_id,amount_credits) VALUES($1,$2,$3,$4,2)", [wallet, a, reserve, grant]);
                    if (!nodeId)
                        await admin.query("UPDATE workbench_generations SET reserve_ledger_id=$1 WHERE id=$2", [reserve, wb]);
                }
                for (const id of [`node:${reservedNode}`, `workbench:${wb}`])
                    expect((await service.getUsage({ userId: a }, 'self', id)).item).toMatchObject({ billingStatus: 'reserved', chargedCredits: null });
                await admin.query("UPDATE billing_wallet_credit_reservations SET status='refunded' WHERE user_id=$1", [a]);
                for (const id of [`node:${reservedNode}`, `workbench:${wb}`])
                    expect((await service.getUsage({ userId: a }, 'self', id)).item).toMatchObject({ billingStatus: 'released', chargedCredits: null });
            await admin.query("UPDATE workbench_generations SET billing_usage_event_id=$1 WHERE id=$2", [personalUsage, wb]);
            expect((await service.overview({ userId: a }, 'self', { asOf: first.asOf })).usage.total).toBe(6);
            await admin.query("UPDATE tenant_memberships SET status='disabled' WHERE tenant_id=$1 AND user_id=$2", [t2, a]);
                expect((await service.listTasks({ userId: a }, 'self', {})).items).toHaveLength(0);
                expect((await service.listUsage({ userId: a }, 'self', {})).items.filter(x => x.usageEventId)).toHaveLength(7);
                await withUserTransaction({ userId: a }, async (client) => { expect((await client.query("SELECT id FROM workbench_generations")).rows).toHaveLength(0); }, pool);
            }
            finally {
                if (pool !== admin)
                    await pool.end();
                await admin.end();
            }
        });
    }, 120000);
});
