import { afterAll, describe, expect, test } from "vitest";
import { createPgPool, withTenantTransaction } from "@aigc-flow/db";
import { CredentialVault } from "@aigc-flow/ai-gateway-core";
import { runMigrations } from "../../../packages/db/src/migrator.js";
import { hasDatabaseEnv, withDatabase } from "../../../packages/db/test/helpers.js";
import { AiGatewayAdminService } from "../src/modules/ai-gateway/ai-gateway.service.js";
import { AiRouteTestService } from "../src/modules/ai-route-tests/ai-route-tests.service.js";
import { AiModelCatalogService } from "../src/modules/ai-model-catalog/ai-model-catalog.service.js";
import { resolvePlatformCapabilities } from "../src/modules/platform-access/platform-access.policy.js";

const originalDatabaseUrl = process.env.DATABASE_URL;
afterAll(() => { if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = originalDatabaseUrl; });
const describeWithDatabase = hasDatabaseEnv() ? describe : describe.skip;

describeWithDatabase("gateway non-BYPASSRLS platform permissions", () => {
  test("operator can inspect, test and operate existing routes while binding and pricing bypasses fail", async () => {
    await withDatabase(async ({ databaseUrl, createAppDatabaseUrl }) => {
      process.env.DATABASE_URL = databaseUrl;
      const adminPool = createPgPool();
      let appPool: ReturnType<typeof createPgPool> | undefined;
      try {
        await runMigrations(adminPool);
        const tenant = (await adminPool.query("INSERT INTO tenants (name, slug) VALUES ('Gateway permission test', 'gateway-permission-test') RETURNING id::text")).rows[0].id;
        const users = (await adminPool.query("INSERT INTO users (email) VALUES ('gateway-super@example.test'), ('gateway-operator@example.test'), ('gateway-tenant@example.test') RETURNING id::text, email")).rows;
        const superId = users.find((row) => row.email === "gateway-super@example.test").id;
        const operatorId = users.find((row) => row.email === "gateway-operator@example.test").id;
        const tenantUserId = users.find((row) => row.email === "gateway-tenant@example.test").id;
        await adminPool.query("INSERT INTO platform_role_assignments (user_id, role_key, version, reason) VALUES ($1, 'platform_super_admin', 1, 'Gateway test super assignment'), ($2, 'platform_operator', 1, 'Gateway test operator assignment')", [superId, operatorId]);
        await adminPool.query("INSERT INTO tenant_memberships (tenant_id,user_id,role_key,status) VALUES ($1,$2,'viewer','active'),($1,$3,'viewer','active')", [tenant,tenantUserId,operatorId]);
        appPool = createPgPool({ connectionString: await createAppDatabaseUrl() });
        expect((await appPool.query("SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user")).rows[0]).toEqual({ rolsuper: false, rolbypassrls: false });
        const superContext = { tenantId: tenant, userId: superId, permissions: resolvePlatformCapabilities("platform_super_admin") };
        const operator = { tenantId: tenant, userId: operatorId, permissions: resolvePlatformCapabilities("platform_operator") };
        const vault = new CredentialVault({ masterKey: "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=" });
        const service = new AiGatewayAdminService({ pool: appPool, credentialVault: vault });
        const provider = await service.createProvider(superContext, { key: "permission-test", kind: "mock", name: "Gateway test", defaultBaseUrl: "https://mock.local" });
        const model = await service.createModel(superContext, { providerId: provider.id, modelKey: "permission-image", displayName: "Image", modality: "image" });
        const credential = await service.createCredential(superContext, { providerId: provider.id, name: "Gateway test key", secret: "gateway-fixture-secret" });
        const connection = await service.createProviderConnection(superContext, { providerId: provider.id, credentialId: credential.id, name: "Gateway test connection", adapterKind: "mock" });
        await adminPool.query("INSERT INTO ai_model_catalog (model_id, model_key, display_name, modality, model_family) VALUES ($1, 'permission-image', 'Image', 'image', 'permission-image')", [model.id]);
        const route = await service.createRoute(superContext, { providerId: provider.id, modelId: model.id, connectionId: connection.id, credentialId: credential.id, routeKey: "image.permission-test", modality: "image", upstreamModel: "permission-image", status: "inactive" });
        await service.upsertPricing(superContext, { provider: provider.key, model: model.modelKey, route: route.routeKey, unit: "image_generation", unitCredits: 12, minChargeCredits: 12, active: true });
        expect(await service.listCredentials(operator)).toEqual([expect.objectContaining({ id: credential.id, maskedSecret: "••••••••" })]);
        expect((await service.listProviderConnections(operator))[0].metadata).toEqual({});
        expect((await service.listPricing(operator, {})).find((price) => price.route === route.routeKey)).toMatchObject({ active: true, unitCredits: 12, metadata: {} });
        const tester = new AiRouteTestService({ pool: appPool, credentialVault: vault, mediaRuntime: {
          generateImage: async () => ({ providerKey: provider.key, modelKey: model.modelKey, outputs: [], status: "succeeded" }),
        } as never });
        expect(await tester.testAdminDraftRoute(operator, route.id, {})).toMatchObject({ status: "ok" });
        expect(await service.updateRoute(operator, route.id, { routeLabel: "线路二", status: "active", priority: 2, weight: 50 })).toMatchObject({ routeLabel: "线路二", status: "active", priority: 2, weight: 50, requestConfig: {}, pricing: {} });
        expect(await service.setDefaultRoute(operator, route.id)).toMatchObject({ isDefault: true });
        expect((await adminPool.query("SELECT default_route_key FROM ai_model_catalog WHERE model_id=$1", [model.id])).rows[0].default_route_key).toBe(route.routeKey);
        expect((await adminPool.query("SELECT metadata FROM audit_logs WHERE action='ai.route.operate' ORDER BY created_at LIMIT 1")).rows[0].metadata).toMatchObject({ before: { status: "inactive" }, after: { status: "active" } });
        await expect(service.updateRoute(operator, route.id, { connectionId: null })).rejects.toMatchObject({ statusCode: 403 });
        await expect(withTenantTransaction(operator, (client) => client.query("UPDATE ai_routes SET request_config = '{\"model\":\"bypass\"}' WHERE id=$1", [route.id]), appPool)).rejects.toMatchObject({ code: "42501" });
        await expect(withTenantTransaction(operator, (client) => client.query("UPDATE ai_routes SET route_label='bypass' WHERE id=$1", [route.id]), appPool)).rejects.toMatchObject({ code: "42501" });
        await expect(withTenantTransaction(operator, (client) => client.query("UPDATE ai_model_catalog SET display_name='bypass' WHERE model_id=$1", [model.id]), appPool)).rejects.toMatchObject({ code: "42501" });
        const unauthorized = { tenantId: tenant, userId: tenantUserId };
        expect((await withTenantTransaction(unauthorized, (client) => client.query("UPDATE ai_routes SET route_label='bypass' WHERE id=$1", [route.id]), appPool)).rowCount).toBe(0);
        expect((await withTenantTransaction(operator, (client) => client.query("UPDATE api_credentials SET name='bypass' WHERE id=$1", [credential.id]), appPool)).rowCount).toBe(0);
        expect((await withTenantTransaction(operator, (client) => client.query("UPDATE ai_provider_connections SET base_url='https://bypass.test' WHERE id=$1", [connection.id]), appPool)).rowCount).toBe(0);
        expect((await withTenantTransaction(operator, (client) => client.query("UPDATE model_pricing SET unit_credits=1 WHERE route=$1", [route.routeKey]), appPool)).rowCount).toBe(0);
        expect((await withTenantTransaction(operator, (client) => client.query("UPDATE ai_models SET model_key='bypass' WHERE id=$1", [model.id]), appPool)).rowCount).toBe(0);
        expect((await withTenantTransaction(operator, (client) => client.query("UPDATE ai_providers SET default_base_url='https://bypass.test' WHERE id=$1", [provider.id]), appPool)).rowCount).toBe(0);

        const otherTenant = (await adminPool.query("INSERT INTO tenants (name, slug) VALUES ('Other gateway tenant', 'gateway-other-tenant') RETURNING id::text")).rows[0].id;
        const tenantRoutes = new Map<string, string>();
        for (const [tenantId, suffix] of [[tenant, "a"], [otherTenant, "b"], [otherTenant, "b-backup"]]) {
          const tenantCredential = (await adminPool.query(`INSERT INTO api_credentials
            (tenant_id,provider_id,name,encrypted_secret,nonce,auth_tag,key_version,secret_fingerprint,status)
            SELECT $1,provider_id,$2,encrypted_secret,nonce,auth_tag,key_version,secret_fingerprint,status
            FROM api_credentials WHERE id=$3 RETURNING id::text`, [tenantId, `Tenant ${suffix} key`, credential.id])).rows[0].id;
          const tenantConnection = (await adminPool.query(`INSERT INTO ai_provider_connections
            (tenant_id,provider_id,credential_id,name,adapter_kind,status)
            VALUES ($1,$2,$3,$4,'mock','active') RETURNING id::text`, [tenantId, provider.id, tenantCredential, `Tenant ${suffix} connection`])).rows[0].id;
          const tenantRoute = await adminPool.query(`INSERT INTO ai_routes
            (tenant_id,provider_id,model_id,credential_id,connection_id,route_key,modality,model_family,upstream_model,status)
            VALUES ($1,$2,$3,$4,$5,$6,'image','permission-image','permission-image','active') RETURNING id::text`,
            [tenantId,provider.id,model.id,tenantCredential,tenantConnection,`image.tenant-${suffix}`]);
          tenantRoutes.set(suffix, tenantRoute.rows[0].id);
          await adminPool.query(`INSERT INTO ai_model_catalog (tenant_id,model_id,model_key,display_name,modality,model_family,status)
            VALUES ($1,$2,$3,$4,'image','permission-image','active')`, [tenantId,model.id,`tenant-${suffix}-image`,`Tenant ${suffix} image`]);
          await adminPool.query(`INSERT INTO model_pricing (provider,model,route,unit,unit_credits,min_charge_credits,active)
            VALUES ($1,'permission-image',$2,'image_generation',5,5,true)`, [provider.key,`image.tenant-${suffix}`]);
        }
        expect((await service.listCredentials(operator)).map((item) => item.name)).toEqual(expect.arrayContaining(["Tenant a key", "Tenant b key"]));
        expect((await service.listProviderConnections(operator)).map((item) => item.name)).toEqual(expect.arrayContaining(["Tenant a connection", "Tenant b connection"]));
        expect((await service.listRoutes(operator)).map((item) => item.routeKey)).toEqual(expect.arrayContaining(["image.tenant-a", "image.tenant-b"]));
        expect((await service.listPricing(operator, {})).map((item) => item.route)).toEqual(expect.arrayContaining(["image.tenant-a", "image.tenant-b"]));
        const catalog = new AiModelCatalogService({ pool: appPool });
        expect((await catalog.listPlatformModels(operator, {})).map((item) => item.modelKey)).toEqual(expect.arrayContaining(["tenant-a-image", "tenant-b-image"]));
        expect((await catalog.listPlatformRoutes(operator, "tenant-b-image", {})).map((item) => item.routeKey)).toContain("image.tenant-b");
        expect((await service.listRuntimeRoutesForUi(unauthorized, {})).map((item) => item.routeKey)).not.toContain("image.tenant-b");
        expect((await catalog.listModels(unauthorized, {})).map((item) => item.modelKey)).not.toContain("tenant-b-image");
        await expect(catalog.listRoutesForModel(unauthorized, "tenant-b-image", {})).rejects.toMatchObject({ statusCode: 404 });
        const targetRouteId = tenantRoutes.get("b")!;
        const backupRouteId = tenantRoutes.get("b-backup")!;
        const tenantViewer = { ...unauthorized, permissions: ["flow:read"] };
        await expect(service.updateRoute(tenantViewer, targetRouteId, { status: "inactive" })).rejects.toMatchObject({ statusCode: 403 });
        await expect(tester.testAdminDraftRoute(tenantViewer, targetRouteId, {})).rejects.toMatchObject({ statusCode: 403 });
        await expect(service.setDefaultRoute(tenantViewer, targetRouteId)).rejects.toMatchObject({ statusCode: 403 });
        await expect(service.updateRoute(operator, targetRouteId, { credentialId: credential.id })).rejects.toMatchObject({ statusCode: 403 });
        await expect(service.updateRoute(operator, targetRouteId, { status: "active" })).rejects.toMatchObject({ code: "ROUTE_TEST_REQUIRED" });
        await service.updateRoute(operator, targetRouteId, { status: "inactive" });
        const realTester = new AiRouteTestService({ pool: appPool, credentialVault: vault });
        expect(await realTester.testAdminDraftRoute(operator, targetRouteId, { prompt: "Cross tenant authorized test" })).toMatchObject({ status: "ok" });
        expect((await adminPool.query("SELECT tenant_id::text,traffic_class,source,billed_user_id FROM ai_call_logs WHERE route_id=$1 AND status='succeeded'", [targetRouteId])).rows[0]).toMatchObject({ tenant_id: otherTenant, traffic_class: "admin_test", source: "admin", billed_user_id: null });
        for (const modality of ["text", "video"]) {
          const testModelId = (await adminPool.query("INSERT INTO ai_models (provider_id,model_key,display_name,modality) VALUES ($1,$2,$2,$3) RETURNING id::text", [provider.id,`permission-${modality}`,modality])).rows[0].id;
          const testRouteId = (await adminPool.query(`INSERT INTO ai_routes
            (tenant_id,provider_id,model_id,credential_id,connection_id,route_key,modality,model_family,upstream_model,status)
            SELECT tenant_id,provider_id,$2,credential_id,connection_id,$3,$4,$5,$5,'inactive' FROM ai_routes WHERE id=$1 RETURNING id::text`,
            [targetRouteId,testModelId,`${modality}.cross-tenant`,modality,`permission-${modality}`])).rows[0].id;
          expect(await realTester.testAdminDraftRoute(operator, testRouteId, { prompt: "Cross tenant admin test" })).toMatchObject({ status: "ok", routeId: testRouteId });
          expect((await adminPool.query("SELECT tenant_id::text,traffic_class,billed_user_id FROM ai_call_logs WHERE route_id=$1 AND status='succeeded'", [testRouteId])).rows[0]).toMatchObject({ tenant_id: otherTenant, traffic_class: "admin_test", billed_user_id: null });
        }
        await service.updateRoute(operator, targetRouteId, { status: "active" });
        await adminPool.query("UPDATE ai_routes SET is_default=true WHERE id=$1", [tenantRoutes.get("a")]);
        await service.setDefaultRoute(operator, targetRouteId);
        expect(await realTester.testAdminDraftRoute(operator, backupRouteId, {})).toMatchObject({ status: "ok" });
        await service.setDefaultRoute(operator, backupRouteId);
        expect((await adminPool.query("SELECT id::text,is_default FROM ai_routes WHERE id=ANY($1::uuid[]) ORDER BY id", [[route.id,tenantRoutes.get("a"),targetRouteId,backupRouteId]])).rows).toEqual(expect.arrayContaining([
          { id: route.id, is_default: true }, { id: tenantRoutes.get("a"), is_default: true },
          { id: targetRouteId, is_default: false }, { id: backupRouteId, is_default: true },
        ]));
        expect((await adminPool.query("SELECT DISTINCT default_route_key FROM ai_model_catalog WHERE tenant_id=$1", [otherTenant])).rows).toEqual([{ default_route_key: "image.tenant-b-backup" }]);
        await service.updateRoute(operator, backupRouteId, { status: "inactive" });
        expect((await adminPool.query("SELECT DISTINCT default_route_key FROM ai_model_catalog WHERE tenant_id=$1", [otherTenant])).rows).toEqual([{ default_route_key: null }]);
        await adminPool.query("UPDATE model_pricing SET active=false WHERE route='image.tenant-b-backup'");
        await expect(service.updateRoute(operator, backupRouteId, { status: "active" })).rejects.toMatchObject({ code: "PRICING_NOT_FOUND" });
        expect(await service.updateRoute(superContext, targetRouteId, { adminNotes: "Approved by platform" })).toMatchObject({ adminNotes: "Approved by platform" });
        const otherBindings = (await adminPool.query("SELECT connection_id::text,credential_id::text FROM ai_routes WHERE id=$1", [tenantRoutes.get("a")])).rows[0];
        await expect(service.updateRoute(superContext, targetRouteId, { connectionId: otherBindings.connection_id })).rejects.toMatchObject({ statusCode: 404 });
        await expect(service.updateRoute(superContext, targetRouteId, { credentialId: otherBindings.credential_id })).rejects.toMatchObject({ statusCode: 404 });
        await adminPool.query(`CREATE FUNCTION reject_gateway_audit() RETURNS trigger LANGUAGE plpgsql AS $$
          BEGIN IF NEW.action IN ('ai.route.operate','ai.route.update','ai.route.test') THEN RAISE EXCEPTION 'test audit unavailable'; END IF; RETURN NEW; END $$;
          CREATE TRIGGER reject_gateway_audit BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION reject_gateway_audit()`);
        await expect(service.updateRoute(operator, targetRouteId, { routeLabel: "must roll back" })).rejects.toThrow("test audit unavailable");
        expect((await adminPool.query("SELECT route_label FROM ai_routes WHERE id=$1", [targetRouteId])).rows[0].route_label).not.toBe("must roll back");
        await expect(service.updateRoute(superContext, targetRouteId, { adminNotes: "must roll back" })).rejects.toThrow("test audit unavailable");
        expect((await adminPool.query("SELECT admin_notes FROM ai_routes WHERE id=$1", [targetRouteId])).rows[0].admin_notes).toBe("Approved by platform");
        await adminPool.query("UPDATE ai_routes SET tested_revision=NULL,health_status=NULL WHERE id=$1", [targetRouteId]);
        const healthCount = (await adminPool.query("SELECT count(*)::int AS count FROM ai_route_health_checks WHERE route_id=$1", [targetRouteId])).rows[0].count;
        await expect(realTester.testAdminDraftRoute(operator, targetRouteId, {})).rejects.toThrow("test audit unavailable");
        expect((await adminPool.query("SELECT tested_revision,health_status FROM ai_routes WHERE id=$1", [targetRouteId])).rows[0]).toEqual({ tested_revision: null, health_status: null });
        expect((await adminPool.query("SELECT count(*)::int AS count FROM ai_route_health_checks WHERE route_id=$1", [targetRouteId])).rows[0].count).toBe(healthCount);
        await adminPool.query("DROP TRIGGER reject_gateway_audit ON audit_logs; DROP FUNCTION reject_gateway_audit()");
        // A forged scope alone cannot elevate an unassigned tenant user.
        expect((await withTenantTransaction(unauthorized, async (client) => {
          await client.query("SELECT set_config('app.platform_scope','platform:routes:read',true)");
          return client.query("SELECT id FROM ai_routes WHERE tenant_id=$1", [otherTenant]);
        }, appPool)).rowCount).toBe(0);
        await adminPool.query("DELETE FROM platform_role_assignments WHERE user_id=$1", [operatorId]);
        await expect(service.listRoutes(operator)).rejects.toMatchObject({ statusCode: 403 });
        await expect(service.listCredentials(operator)).rejects.toMatchObject({ statusCode: 403 });
        await expect(service.updateRoute(operator, targetRouteId, { status: "inactive" })).rejects.toMatchObject({ statusCode: 403 });
        await expect(service.setDefaultRoute(operator, targetRouteId)).rejects.toMatchObject({ statusCode: 403 });
        await expect(realTester.testAdminDraftRoute(operator, targetRouteId, {})).rejects.toMatchObject({ statusCode: 403 });
      } finally { await appPool?.end(); await adminPool.end(); }
    });
  }, 60_000);
});
