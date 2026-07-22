ALTER TABLE prompt_entries
  ADD COLUMN IF NOT EXISTS prompt_text_zh text,
  ADD COLUMN IF NOT EXISTS prompt_text_en text;

UPDATE prompt_entries
SET prompt_text_en = prompt_text
WHERE NULLIF(BTRIM(prompt_text_en), '') IS NULL
  AND NULLIF(BTRIM(prompt_text), '') IS NOT NULL;

ALTER TABLE prompt_entries
  DROP CONSTRAINT IF EXISTS prompt_entries_bilingual_text_required;

ALTER TABLE prompt_entries
  ADD CONSTRAINT prompt_entries_bilingual_text_required
  CHECK (
    NULLIF(BTRIM(COALESCE(prompt_text_zh, '')), '') IS NOT NULL
    OR NULLIF(BTRIM(COALESCE(prompt_text_en, '')), '') IS NOT NULL
  );

ALTER TABLE prompt_entry_media
  ADD COLUMN IF NOT EXISTS preview_storage_key text,
  ADD COLUMN IF NOT EXISTS thumbnail_storage_key text;

CREATE UNIQUE INDEX IF NOT EXISTS prompt_entry_media_preview_storage_key_idx
  ON prompt_entry_media (preview_storage_key)
  WHERE preview_storage_key IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS prompt_entry_media_thumbnail_storage_key_idx
  ON prompt_entry_media (thumbnail_storage_key)
  WHERE thumbnail_storage_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS prompt_entry_media_prompt_sort_idx
  ON prompt_entry_media (prompt_id, sort_order, id);
