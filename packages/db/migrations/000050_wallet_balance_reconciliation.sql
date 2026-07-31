-- Wallet mutators run as the dedicated callback role. PostgreSQL applies SELECT
-- visibility while locating rows for UPDATE, so an UPDATE-only policy can
-- silently affect zero rows even though the surrounding transaction succeeds.
DROP POLICY IF EXISTS billing_wallets_select_callback ON billing_wallets;
CREATE POLICY billing_wallets_select_callback ON billing_wallets FOR SELECT TO tapflow_wallet_callback
  USING (current_user = 'tapflow_wallet_callback');

GRANT SELECT, UPDATE ON billing_wallets TO tapflow_wallet_callback;

-- Credit grants are the allocation-level source of truth. Repair cached wallet
-- totals for payments already credited before callback wallet visibility existed.
WITH grant_totals AS (
  SELECT
    wallet_id,
    COALESCE(SUM(remaining_credits), 0)::numeric(18, 4) AS balance_credits,
    COALESCE(SUM(reserved_credits), 0)::numeric(18, 4) AS reserved_credits
  FROM billing_wallet_credit_grants
  GROUP BY wallet_id
), wallet_totals AS (
  SELECT
    wallet.id AS wallet_id,
    COALESCE(grant_totals.balance_credits, 0)::numeric(18, 4) AS balance_credits,
    COALESCE(grant_totals.reserved_credits, 0)::numeric(18, 4) AS reserved_credits
  FROM billing_wallets AS wallet
  LEFT JOIN grant_totals ON grant_totals.wallet_id = wallet.id
)
UPDATE billing_wallets AS wallet
SET
  balance_credits = totals.balance_credits,
  reserved_credits = totals.reserved_credits,
  updated_at = now()
FROM wallet_totals AS totals
WHERE wallet.id = totals.wallet_id
  AND (
    wallet.balance_credits IS DISTINCT FROM totals.balance_credits
    OR wallet.reserved_credits IS DISTINCT FROM totals.reserved_credits
  );
