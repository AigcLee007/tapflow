CREATE TABLE IF NOT EXISTS announcement_reads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  announcement_id uuid NOT NULL REFERENCES announcements(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  read_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, announcement_id, user_id)
);

CREATE INDEX IF NOT EXISTS announcement_reads_user_tenant_read_at_idx
  ON announcement_reads (tenant_id, user_id, read_at DESC);

ALTER TABLE announcement_reads ENABLE ROW LEVEL SECURITY;
ALTER TABLE announcement_reads FORCE ROW LEVEL SECURITY;

CREATE POLICY announcement_reads_select_current_user
  ON announcement_reads
  FOR SELECT
  USING (tenant_id = app.current_tenant_id() AND user_id = app.current_user_id());

CREATE POLICY announcement_reads_insert_current_user
  ON announcement_reads
  FOR INSERT
  WITH CHECK (tenant_id = app.current_tenant_id() AND user_id = app.current_user_id());

CREATE POLICY announcement_reads_select_system_admin
  ON announcement_reads
  FOR SELECT
  USING (app.current_is_system_admin());
