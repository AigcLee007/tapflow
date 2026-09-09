-- V6 extends the existing tenant-scoped V5 conversation records.
ALTER TABLE agent_turns
  ADD COLUMN IF NOT EXISTS progress_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS capability_refs_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS result_refs_json jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE agent_v5_decisions
  ADD COLUMN IF NOT EXISTS idempotency_key text NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_v5_decisions_tenant_idempotency
  ON agent_v5_decisions(tenant_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

ALTER TABLE agent_turns ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_turns FORCE ROW LEVEL SECURITY;
ALTER TABLE agent_v5_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_v5_decisions FORCE ROW LEVEL SECURITY;
