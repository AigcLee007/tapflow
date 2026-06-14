ALTER TABLE billing_accounts
  ALTER COLUMN balance_cents TYPE numeric(18, 4) USING balance_cents::numeric(18, 4),
  ALTER COLUMN reserved_cents TYPE numeric(18, 4) USING reserved_cents::numeric(18, 4);

ALTER TABLE usage_events
  ALTER COLUMN billable_cents TYPE numeric(18, 4) USING billable_cents::numeric(18, 4);

ALTER TABLE billing_ledger
  ALTER COLUMN amount_cents TYPE numeric(18, 4) USING amount_cents::numeric(18, 4);

ALTER TABLE model_pricing
  ALTER COLUMN unit_credits TYPE numeric(18, 4) USING unit_credits::numeric(18, 4),
  ALTER COLUMN min_charge_credits TYPE numeric(18, 4) USING min_charge_credits::numeric(18, 4);

INSERT INTO model_pricing (provider, model, route, unit, unit_credits, min_charge_credits, metadata, active)
VALUES
  (
    'pixellelabs',
    'gemini-3-pro-image-preview',
    'image.pixellelabs.nano-banana-pro',
    'image_generation',
    4,
    4,
    '{"source":"official-image-pricing-2026-06-14","sizeTiers":{"1K":4,"2K":4.5,"4K":5}}'::jsonb,
    true
  ),
  (
    'pixellelabs',
    'gemini-3.1-flash-image-preview',
    'image.pixellelabs.nano-banana-2',
    'image_generation',
    2.5,
    2.5,
    '{"source":"official-image-pricing-2026-06-14","sizeTiers":{"1K":2.5,"2K":3,"4K":3.5}}'::jsonb,
    true
  ),
  (
    'openai-compatible',
    'gpt-image-2',
    'image.gpt-image-2',
    'image_generation',
    2.5,
    2.5,
    '{"source":"official-image-pricing-2026-06-14","sizeTiers":{"1K":2.5,"2K":3,"4K":3.5}}'::jsonb,
    true
  ),
  (
    'openai-compatible',
    'gpt-image-2',
    'image.gpt-image-2.line2',
    'image_generation',
    3,
    3,
    '{"source":"official-image-pricing-2026-06-14","sizeTiers":{"1K":3,"2K":3.5,"4K":4}}'::jsonb,
    true
  )
ON CONFLICT (provider, model, route, unit)
DO UPDATE SET
  unit_credits = EXCLUDED.unit_credits,
  min_charge_credits = EXCLUDED.min_charge_credits,
  metadata = model_pricing.metadata || EXCLUDED.metadata,
  active = true;
