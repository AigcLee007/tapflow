ALTER TABLE workbench_reference_uploads
  ALTER COLUMN expires_at SET DEFAULT now() + interval '7 days';

UPDATE workbench_reference_uploads
SET expires_at = created_at + interval '7 days',
    updated_at = now()
WHERE status = 'active'
  AND expires_at > now()
  AND expires_at <= created_at + interval '25 hours';
