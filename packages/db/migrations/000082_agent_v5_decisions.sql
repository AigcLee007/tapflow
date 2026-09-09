-- V5 keeps its product-facing conversation state separate from legacy plans.
ALTER TABLE agent_turns
  ADD COLUMN IF NOT EXISTS context_snapshot_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS requires_confirmation boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS result_ids_json jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_turns_v5_idempotency
  ON agent_turns(tenant_id, idempotency_key)
  WHERE agent_version = 'v5' AND idempotency_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS agent_v5_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  session_id uuid NOT NULL REFERENCES agent_sessions(id) ON DELETE CASCADE,
  turn_id uuid NOT NULL REFERENCES agent_turns(id) ON DELETE CASCADE,
  decision_json jsonb NOT NULL,
  from_phase text NOT NULL,
  to_phase text NOT NULL,
  created_by uuid NULL REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agent_v5_decisions_tenant_session_turn_created
  ON agent_v5_decisions(tenant_id, session_id, turn_id, created_at ASC);

ALTER TABLE agent_v5_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_v5_decisions FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS agent_v5_decisions_select_current_tenant ON agent_v5_decisions;
CREATE POLICY agent_v5_decisions_select_current_tenant
  ON agent_v5_decisions
  FOR SELECT
  USING (tenant_id = app.current_tenant_id());

DROP POLICY IF EXISTS agent_v5_decisions_insert_current_tenant ON agent_v5_decisions;
CREATE POLICY agent_v5_decisions_insert_current_tenant
  ON agent_v5_decisions
  FOR INSERT
  WITH CHECK (tenant_id = app.current_tenant_id());

DROP POLICY IF EXISTS agent_v5_decisions_update_current_tenant ON agent_v5_decisions;
CREATE POLICY agent_v5_decisions_update_current_tenant
  ON agent_v5_decisions
  FOR UPDATE
  USING (tenant_id = app.current_tenant_id())
  WITH CHECK (tenant_id = app.current_tenant_id());

DROP POLICY IF EXISTS agent_v5_decisions_delete_current_tenant ON agent_v5_decisions;
CREATE POLICY agent_v5_decisions_delete_current_tenant
  ON agent_v5_decisions
  FOR DELETE
  USING (tenant_id = app.current_tenant_id());
