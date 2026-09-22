ALTER TABLE agent_result_refs ADD COLUMN IF NOT EXISTS step_id text;
ALTER TABLE agent_result_refs ADD COLUMN IF NOT EXISTS attempt_no integer NOT NULL DEFAULT 1;
ALTER TABLE agent_result_refs ADD COLUMN IF NOT EXISTS source_run_id uuid;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'agent_result_refs_source_run_fk') THEN
    ALTER TABLE agent_result_refs ADD CONSTRAINT agent_result_refs_source_run_fk FOREIGN KEY (tenant_id, source_run_id) REFERENCES workflow_runs(tenant_id, id);
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_agent_result_refs_lineage ON agent_result_refs(tenant_id, run_id, step_id, kind, attempt_no);
