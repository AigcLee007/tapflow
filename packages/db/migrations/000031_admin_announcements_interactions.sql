ALTER TABLE announcements
  ADD COLUMN IF NOT EXISTS pinned boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS announcements_tenant_status_pinned_published_idx
  ON announcements (tenant_id, status, pinned DESC, published_at DESC, created_at DESC);
