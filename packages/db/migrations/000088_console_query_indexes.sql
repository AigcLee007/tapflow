-- Read-only console access. The existing project model grants access through
-- active tenant membership; no project_members table exists.
CREATE FUNCTION app.console_member(p_tenant_id uuid) RETURNS boolean
LANGUAGE sql STABLE SET search_path = pg_catalog, public, app AS $$
 SELECT EXISTS (SELECT 1 FROM tenant_memberships m WHERE m.tenant_id=p_tenant_id AND m.user_id=app.current_user_id() AND m.status='active')
$$;
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['projects','flows'] LOOP
  EXECUTE format('CREATE POLICY %I ON %I FOR SELECT USING (app.console_member(tenant_id) OR app.platform_scope_allows(ARRAY[%L,%L]))',t||'_console_read',t,'platform:usage:read','platform:tasks:read');
 END LOOP;
 FOREACH t IN ARRAY ARRAY['workbench_generations','agent_sessions','agent_tasks'] LOOP
  EXECUTE format('CREATE POLICY %I ON %I FOR SELECT USING ((created_by=app.current_user_id() AND app.console_member(tenant_id)) OR app.platform_scope_allows(ARRAY[%L,%L]))',t||'_console_read',t,'platform:usage:read','platform:tasks:read');
 END LOOP;
END $$;
CREATE POLICY workflow_runs_console_self_read ON workflow_runs FOR SELECT USING (
 created_by=app.current_user_id() AND app.console_member(tenant_id)
 AND EXISTS (SELECT 1 FROM flows f JOIN projects p ON p.id=f.project_id AND p.tenant_id=f.tenant_id
 WHERE f.id=workflow_runs.flow_id AND f.tenant_id=workflow_runs.tenant_id AND f.deleted_at IS NULL AND p.deleted_at IS NULL)
);
CREATE POLICY node_runs_console_self_read ON node_runs FOR SELECT USING (
 EXISTS(SELECT 1 FROM workflow_runs w WHERE w.id=node_runs.workflow_run_id AND w.tenant_id=node_runs.tenant_id AND w.created_by=app.current_user_id() AND app.console_member(w.tenant_id))
);
CREATE INDEX idx_console_usage_created ON usage_events(created_at DESC,id DESC);
CREATE INDEX idx_console_usage_user_created ON usage_events(billed_user_id,created_at DESC,id DESC);
CREATE INDEX idx_console_workflow_user_created ON workflow_runs(created_by,created_at DESC,id DESC);
CREATE INDEX idx_console_workflow_created ON workflow_runs(created_at DESC,id DESC);
CREATE INDEX idx_console_workbench_user_created ON workbench_generations(created_by,created_at DESC,id DESC);
CREATE INDEX idx_console_workbench_created ON workbench_generations(created_at DESC,id DESC);
CREATE INDEX idx_console_workbench_usage ON workbench_generations(billing_usage_event_id) WHERE billing_usage_event_id IS NOT NULL;
CREATE INDEX idx_console_nodes_created ON node_runs(created_at DESC,id DESC);
CREATE INDEX idx_console_agent_user_created ON agent_tasks(created_by,created_at DESC,id DESC);
CREATE INDEX idx_console_agent_created ON agent_tasks(created_at DESC,id DESC);
CREATE INDEX idx_console_calls_created ON ai_call_logs(created_at DESC,id DESC);
