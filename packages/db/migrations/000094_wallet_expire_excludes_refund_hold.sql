-- Refund-held payment grants must not be expired while a refund outcome is unresolved.
GRANT USAGE, CREATE ON SCHEMA app TO tapflow_wallet_callback;
GRANT tapflow_wallet_callback TO CURRENT_USER WITH INHERIT FALSE, SET TRUE GRANTED BY CURRENT_USER;
SET LOCAL ROLE tapflow_wallet_callback;

CREATE OR REPLACE FUNCTION app.wallet_expire_due_for_user(
  p_user_id uuid,
  p_now timestamptz DEFAULT now()
)
RETURNS TABLE (expired_credits numeric, expired_grant_count integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app
AS $$
DECLARE
  v_wallet billing_wallets%ROWTYPE;
  v_grant billing_wallet_credit_grants%ROWTYPE;
  v_available numeric;
  v_count integer := 0;
  v_total numeric := 0;
BEGIN
  SELECT * INTO v_wallet
  FROM billing_wallets
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 0::numeric, 0;
    RETURN;
  END IF;

  FOR v_grant IN
    SELECT *
    FROM billing_wallet_credit_grants
    WHERE wallet_id = v_wallet.id
      AND status = 'active'
      AND NOT refund_hold
      AND expires_at IS NOT NULL
      AND expires_at <= p_now
    ORDER BY expires_at ASC, created_at ASC, id ASC
    FOR UPDATE
  LOOP
    v_available := v_grant.remaining_credits - v_grant.reserved_credits;
    IF v_available > 0 THEN
      INSERT INTO billing_wallet_ledger (
        wallet_id, user_id, entry_type, amount_credits, idempotency_key, metadata
      ) VALUES (
        v_grant.wallet_id, v_grant.user_id, 'expire', -v_available,
        'expire:' || v_grant.id::text,
        jsonb_build_object('grantId', v_grant.id, 'expiresAt', v_grant.expires_at)
      ) ON CONFLICT (user_id, idempotency_key) DO NOTHING;

      UPDATE billing_wallets
      SET balance_credits = GREATEST(balance_credits - v_available, 0),
          updated_at = p_now
      WHERE id = v_wallet.id;
      v_total := v_total + v_available;
    END IF;

    UPDATE billing_wallet_credit_grants
    SET remaining_credits = reserved_credits,
        status = 'expired',
        updated_at = p_now
    WHERE id = v_grant.id;
    v_count := v_count + 1;
  END LOOP;

  RETURN QUERY SELECT v_total, v_count;
END;
$$;

ALTER FUNCTION app.wallet_expire_due_for_user(uuid, timestamptz) OWNER TO tapflow_wallet_callback;
REVOKE ALL ON FUNCTION app.wallet_expire_due_for_user(uuid, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.wallet_expire_due_for_user(uuid, timestamptz) TO SESSION_USER;

DO $$
DECLARE
  runtime_role name := COALESCE(NULLIF(current_setting('app.api_database_role', true), ''), session_user);
BEGIN
  IF runtime_role = 'tapflow_wallet_callback' THEN
    RAISE EXCEPTION 'API_DATABASE_ROLE must be the runtime API role, not the callback owner';
  END IF;
  EXECUTE format('GRANT EXECUTE ON FUNCTION app.wallet_expire_due_for_user(uuid, timestamptz) TO %I', runtime_role);
END;
$$;

RESET ROLE;
REVOKE CREATE ON SCHEMA app FROM tapflow_wallet_callback;
REVOKE tapflow_wallet_callback FROM CURRENT_USER GRANTED BY CURRENT_USER;
