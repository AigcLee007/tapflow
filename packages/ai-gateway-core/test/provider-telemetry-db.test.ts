import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { describe, expect, test } from "vitest";
import { runMigrations, withTenantTransaction } from "@aigc-flow/db";
import { hasDatabaseEnv, withDatabase } from "../../db/test/helpers.js";
import { AiGateway } from "../src/ai-gateway.js";
import { CredentialVault } from "../src/credential-vault.js";
import { DatabaseMediaRuntime } from "../src/database-media-runtime.js";
import { OpenAiCompatibleTextAdapter } from "../src/openai-compatible-text-adapter.js";

const databaseSuite = hasDatabaseEnv() ? describe : describe.skip;
databaseSuite("provider telemetry persistence and tenant isolation", () => {
  test("stores four real requests, preserves pending routes, and isolates runtime snapshots with RLS", async () => {
    await withDatabase(async ({ databaseUrl, createAppDatabaseUrl }) => {
      const admin = new Pool({ connectionString: databaseUrl });
      let app: Pool | undefined;
      try {
        await runMigrations(admin);
        app = new Pool({ connectionString: await createAppDatabaseUrl() });
        const tenantId = randomUUID(); const otherTenantId = randomUUID(); const userId = randomUUID();
        const providerId = randomUUID(); const modelId = randomUUID(); const routeId = randomUUID(); const credentialId = randomUUID();
        const nodeRunId = randomUUID(); const workflowRunId = randomUUID();
        const vault = new CredentialVault({ masterKey: Buffer.alloc(32, 7).toString("base64") });
        const encrypted = vault.encryptSecret("sk-private-provider-secret");
        await admin.query("INSERT INTO users (id,email) VALUES ($1,'telemetry@example.test')", [userId]);
        await admin.query("INSERT INTO tenants(id,name,slug) VALUES ($1,'Telemetry','telemetry'),($2,'Other','telemetry-other')", [tenantId, otherTenantId]);
        await admin.query("INSERT INTO tenant_memberships(tenant_id,user_id,role_key,status) VALUES ($1,$2,'tenant_owner','active')", [tenantId, userId]);
        await admin.query("INSERT INTO ai_providers(id,key,name,kind,default_base_url) VALUES ($1,'telemetry','Telemetry','openai-compatible','https://provider.example')", [providerId]);
        await admin.query("INSERT INTO ai_models(id,provider_id,model_key,display_name,modality) VALUES ($1,$2,'gpt-image-2','Image','image')", [modelId, providerId]);
        await admin.query("INSERT INTO api_credentials(id,tenant_id,provider_id,name,encrypted_secret,nonce,auth_tag,key_version,secret_fingerprint) VALUES ($1,$2,$3,'test',$4,$5,$6,$7,$8)", [credentialId, tenantId, providerId, encrypted.encryptedSecret, encrypted.nonce, encrypted.authTag, encrypted.keyVersion, encrypted.secretFingerprint]);
        await admin.query("INSERT INTO ai_routes(id,tenant_id,provider_id,model_id,credential_id,route_key,modality,request_config) VALUES ($1,$2,$3,$4,$5,'image.telemetry','image',$6::jsonb)", [routeId, tenantId, providerId, modelId, credentialId, JSON.stringify({ async: true, pollPath: "/original/{task_id}", timeoutMs: 4000 })]);
        await admin.query("INSERT INTO ai_call_logs(tenant_id,status) VALUES ($1,'succeeded')", [tenantId]);
        const urls: string[] = [];
        const runtime = new DatabaseMediaRuntime({ pool: app, credentialVault: vault, aiGateway: new AiGateway({ "openai-compatible": new OpenAiCompatibleTextAdapter({ fetchImplementation: async (input) => {
          urls.push(String(input));
          return Response.json(urls.length === 1 ? { task_id: "provider-task" } : urls.length < 4 ? { task_id: "provider-task", status: "running" } : { task_id: "provider-task", status: "succeeded", data: [{ url: "https://assets.example/result?signature=private" }] }, { headers: { "x-request-id": `request-${urls.length}` } });
        } }) }) });
        const metadata = { nodeRunId, workflowRunId, billedUserId: userId, traceId: "trace-telemetry" };
        await runtime.generateImage({ tenantId, userId }, { prompt: "private prompt", routeKey: "image.telemetry" }, metadata);
        await admin.query("UPDATE ai_routes SET status='inactive', base_url_override='https://edited.example',request_config='{}' WHERE id=$1", [routeId]);
        for (let index = 0; index < 3; index += 1) await runtime.pollTask({ tenantId, userId }, "image", { providerTaskId: "provider-task", routeId }, metadata);
        expect(urls.slice(1)).toEqual(Array(3).fill("https://provider.example/original/provider-task"));
        const rows = (await admin.query("SELECT * FROM ai_call_logs WHERE tenant_id=$1 ORDER BY created_at,id", [tenantId])).rows;
        expect(rows.filter((row) => row.record_level === "request")).toHaveLength(4);
        expect(new Set(rows.filter((row) => row.record_level === "request").map((row) => row.execution_id))).toEqual(new Set([nodeRunId]));
        expect(rows.filter((row) => row.record_level === "request").map((row) => row.provider_request_id)).toEqual(["request-1", "request-2", "request-3", "request-4"]);
        expect(rows.find((row) => !row.execution_id)).toMatchObject({ record_level: "summary", traffic_class: "unknown", attempt: null, operation: null, request_dispatched: null });
        expect(rows.filter((row) => row.record_level === "summary" && row.execution_id).map((row) => row.status)).toEqual(["waiting_provider", "running", "running", "succeeded"]);
        expect(JSON.stringify(rows)).not.toMatch(/private prompt|sk-private-provider-secret|signature=private|Authorization/);
        const snapshots = await withTenantTransaction({ tenantId, userId }, (client) => client.query("SELECT * FROM ai_provider_task_routes"), app);
        expect(snapshots.rows).toHaveLength(1);
        expect(JSON.stringify(snapshots.rows)).not.toMatch(/encryptedSecret|encrypted_secret|authTag|auth_tag|nonce|sk-private-provider-secret/);
        await withTenantTransaction({ tenantId: otherTenantId, userId }, async (client) => {
          expect((await client.query("SELECT * FROM ai_provider_task_routes")).rows).toEqual([]);
          expect((await client.query("SELECT * FROM ai_call_logs")).rows).toEqual([]);
          await expect(client.query("INSERT INTO ai_provider_task_routes(tenant_id,execution_id,provider_task_id,route_snapshot,credential_id) VALUES ($1,'other','other','{}',$2)", [tenantId, credentialId])).rejects.toThrow(/row-level security/);
        }, app);
      } finally { await app?.end(); await admin.end(); }
    });
  }, 120_000);
});
