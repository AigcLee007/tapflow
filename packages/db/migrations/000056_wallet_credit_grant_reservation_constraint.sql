-- A personal grant's remaining balance includes credits that are temporarily
-- reserved for in-flight work. The previous combined check rejected every
-- non-zero reservation because a newly credited grant starts with
-- remaining_credits = original_credits.

ALTER TABLE billing_wallet_credit_grants
  DROP CONSTRAINT IF EXISTS billing_wallet_credit_grants_check;

ALTER TABLE billing_wallet_credit_grants
  ADD CONSTRAINT billing_wallet_credit_grants_remaining_credits_check
    CHECK (remaining_credits <= original_credits),
  ADD CONSTRAINT billing_wallet_credit_grants_reserved_credits_check
    CHECK (reserved_credits <= remaining_credits);
