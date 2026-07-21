ALTER TABLE prompt_entry_media
  ADD COLUMN IF NOT EXISTS id uuid,
  ADD COLUMN IF NOT EXISTS storage_key text,
  ADD COLUMN IF NOT EXISTS original_filename text,
  ADD COLUMN IF NOT EXISTS mime_type text,
  ADD COLUMN IF NOT EXISTS size_bytes bigint,
  ADD COLUMN IF NOT EXISTS width integer,
  ADD COLUMN IF NOT EXISTS height integer;

UPDATE prompt_entry_media
SET id = gen_random_uuid()
WHERE id IS NULL;

ALTER TABLE prompt_entry_media
  ALTER COLUMN id SET NOT NULL,
  ALTER COLUMN asset_id DROP NOT NULL;

ALTER TABLE prompt_entry_media
  DROP CONSTRAINT IF EXISTS prompt_entry_media_pkey;

ALTER TABLE prompt_entry_media
  ADD CONSTRAINT prompt_entry_media_pkey PRIMARY KEY (id);

ALTER TABLE prompt_entry_media
  ADD CONSTRAINT prompt_entry_media_storage_location_valid
  CHECK (
    (asset_id IS NOT NULL AND storage_key IS NULL)
    OR (asset_id IS NULL AND storage_key IS NOT NULL)
  );

CREATE UNIQUE INDEX IF NOT EXISTS prompt_entry_media_storage_key_idx
  ON prompt_entry_media (storage_key)
  WHERE storage_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS prompt_entry_media_prompt_sort_idx
  ON prompt_entry_media (prompt_id, sort_order, id);
