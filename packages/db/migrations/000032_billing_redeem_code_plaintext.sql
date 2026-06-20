ALTER TABLE billing_redeem_codes
  ADD COLUMN IF NOT EXISTS code text;

CREATE UNIQUE INDEX IF NOT EXISTS billing_redeem_codes_code_unique_idx
  ON billing_redeem_codes (upper(code))
  WHERE code IS NOT NULL;
