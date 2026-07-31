-- Harden the first personal-wallet operations without rewriting deployed migrations.
-- In particular, a user reserve must never expire another user's grants.

ALTER TABLE billing_redeem_code_redemptions
  ADD COLUMN IF NOT EXISTS wallet_ledger_id uuid REFERENCES billing_wallet_ledger(id) ON DELETE SET NULL;

ALTER TABLE billing_redeem_code_redemptions
  DROP CONSTRAINT IF EXISTS billing_redeem_code_redemptions_tenant_id_redeem_code_id_user_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS uq_billing_redeem_code_redemptions_code_user
  ON billing_redeem_code_redemptions (redeem_code_id, user_id)
  WHERE user_id IS NOT NULL;

-- Supabase owns the automatic ADMIN TRUE, SET FALSE callback membership. Add
-- a separate current-grantor SET membership only for this transaction so the
-- managed membership remains untouched while preserving callback ownership.
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

CREATE OR REPLACE FUNCTION app.wallet_reserve(
  p_user_id uuid,
  p_tenant_id uuid,
  p_amount numeric,
  p_idempotency_key text,
  p_workflow_run_id uuid DEFAULT NULL,
  p_node_run_id uuid DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS TABLE (id uuid, wallet_id uuid, user_id uuid, tenant_id uuid, usage_event_id uuid, entry_type text, amount_credits numeric, idempotency_key text, created_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, app
AS $$
DECLARE
  v_wallet billing_wallets%ROWTYPE;
  v_grant billing_wallet_credit_grants%ROWTYPE;
  v_ledger billing_wallet_ledger%ROWTYPE;
  v_need numeric;
  v_take numeric;
BEGIN
  IF p_amount <= 0 OR p_idempotency_key = '' THEN
    RAISE EXCEPTION 'invalid wallet reserve';
  END IF;
  IF NULLIF(current_setting('app.user_id', true), '') IS NOT NULL
    AND current_setting('app.user_id', true)::uuid <> p_user_id THEN
    RAISE EXCEPTION 'WALLET_FORBIDDEN';
  END IF;

  SELECT * INTO v_wallet FROM billing_wallets WHERE user_id = p_user_id FOR UPDATE;
  IF NOT FOUND OR v_wallet.status <> 'active' THEN
    RAISE EXCEPTION 'INSUFFICIENT_BALANCE';
  END IF;

  SELECT * INTO v_ledger
  FROM billing_wallet_ledger
  WHERE user_id = p_user_id AND idempotency_key = p_idempotency_key;
  IF FOUND THEN
    IF v_ledger.entry_type <> 'reserve'
      OR v_ledger.tenant_id IS DISTINCT FROM p_tenant_id
      OR v_ledger.amount_credits <> -p_amount THEN
      RAISE EXCEPTION 'WALLET_IDEMPOTENCY_CONFLICT';
    END IF;
    RETURN QUERY SELECT v_ledger.id, v_ledger.wallet_id, v_ledger.user_id, v_ledger.tenant_id,
      v_ledger.usage_event_id, v_ledger.entry_type, v_ledger.amount_credits,
      v_ledger.idempotency_key, v_ledger.created_at;
    RETURN;
  END IF;

  PERFORM app.wallet_expire_due_for_user(p_user_id, now());
  SELECT * INTO v_wallet FROM billing_wallets WHERE user_id = p_user_id FOR UPDATE;
  IF v_wallet.balance_credits - v_wallet.reserved_credits < p_amount THEN
    RAISE EXCEPTION 'INSUFFICIENT_BALANCE';
  END IF;

  INSERT INTO billing_wallet_ledger (
    wallet_id, user_id, tenant_id, workflow_run_id, node_run_id,
    entry_type, amount_credits, idempotency_key, metadata
  ) VALUES (
    v_wallet.id, p_user_id, p_tenant_id, p_workflow_run_id, p_node_run_id,
    'reserve', -p_amount, p_idempotency_key, COALESCE(p_metadata, '{}'::jsonb)
  ) RETURNING * INTO v_ledger;

  v_need := p_amount;
  FOR v_grant IN
    SELECT *
    FROM billing_wallet_credit_grants
    WHERE wallet_id = v_wallet.id
      AND status = 'active'
      AND (expires_at IS NULL OR expires_at > now())
      AND remaining_credits > reserved_credits
    ORDER BY expires_at ASC NULLS LAST, created_at ASC, id ASC FOR UPDATE
  LOOP
    EXIT WHEN v_need <= 0;
    v_take := LEAST(v_need, v_grant.remaining_credits - v_grant.reserved_credits);
    UPDATE billing_wallet_credit_grants
    SET reserved_credits = reserved_credits + v_take, updated_at = now()
    WHERE id = v_grant.id;
    INSERT INTO billing_wallet_credit_reservations (
      wallet_id, user_id, wallet_ledger_id, credit_grant_id, amount_credits, metadata
    ) VALUES (
      v_wallet.id, p_user_id, v_ledger.id, v_grant.id, v_take,
      COALESCE(p_metadata, '{}'::jsonb)
    );
    v_need := v_need - v_take;
  END LOOP;

  IF v_need > 0 THEN
    RAISE EXCEPTION 'INSUFFICIENT_BALANCE';
  END IF;

  UPDATE billing_wallets
  SET reserved_credits = reserved_credits + p_amount, updated_at = now()
  WHERE id = v_wallet.id;

  RETURN QUERY SELECT v_ledger.id, v_ledger.wallet_id, v_ledger.user_id, v_ledger.tenant_id,
    v_ledger.usage_event_id, v_ledger.entry_type, v_ledger.amount_credits,
    v_ledger.idempotency_key, v_ledger.created_at;
END;
$$;

CREATE OR REPLACE FUNCTION app.wallet_redeem_code(
  p_user_id uuid,
  p_tenant_id uuid,
  p_code_hash text,
  p_idempotency_key text,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS TABLE (
  id uuid, wallet_id uuid, user_id uuid, tenant_id uuid, usage_event_id uuid,
  entry_type text, amount_credits numeric, idempotency_key text, created_at timestamptz,
  redemption_id uuid
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, app
AS $$
DECLARE
  v_code billing_redeem_codes%ROWTYPE;
  v_redemption billing_redeem_code_redemptions%ROWTYPE;
  v_ledger billing_wallet_ledger%ROWTYPE;
BEGIN
  IF p_user_id IS NULL OR p_tenant_id IS NULL OR p_code_hash = '' OR p_idempotency_key = '' THEN
    RAISE EXCEPTION 'invalid wallet redeem';
  END IF;
  IF NULLIF(current_setting('app.user_id', true), '') IS NOT NULL
    AND current_setting('app.user_id', true)::uuid <> p_user_id THEN
    RAISE EXCEPTION 'WALLET_FORBIDDEN';
  END IF;

  SELECT * INTO v_redemption
  FROM billing_redeem_code_redemptions
  WHERE user_id = p_user_id AND idempotency_key = p_idempotency_key
  FOR UPDATE;
  IF FOUND THEN
    SELECT * INTO v_ledger FROM billing_wallet_ledger WHERE id = v_redemption.wallet_ledger_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'REDEEM_LEDGER_NOT_FOUND'; END IF;
    RETURN QUERY SELECT v_ledger.id, v_ledger.wallet_id, v_ledger.user_id, v_ledger.tenant_id,
      v_ledger.usage_event_id, v_ledger.entry_type, v_ledger.amount_credits,
      v_ledger.idempotency_key, v_ledger.created_at, v_redemption.id;
    RETURN;
  END IF;

  SELECT * INTO v_code
  FROM billing_redeem_codes
  WHERE code_hash = p_code_hash
    AND (tenant_id IS NULL OR tenant_id = p_tenant_id)
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'REDEEM_CODE_NOT_FOUND'; END IF;
  IF v_code.status <> 'active' THEN RAISE EXCEPTION 'REDEEM_CODE_INACTIVE'; END IF;
  IF v_code.expires_at IS NOT NULL AND v_code.expires_at <= now() THEN RAISE EXCEPTION 'REDEEM_CODE_EXPIRED'; END IF;
  IF v_code.redeemed_count >= v_code.max_redemptions THEN RAISE EXCEPTION 'REDEEM_CODE_EXHAUSTED'; END IF;

  SELECT * INTO v_redemption
  FROM billing_redeem_code_redemptions
  WHERE redeem_code_id = v_code.id AND user_id = p_user_id
  FOR UPDATE;
  IF FOUND THEN RAISE EXCEPTION 'REDEEM_CODE_ALREADY_REDEEMED'; END IF;

  SELECT * INTO v_ledger
  FROM app.wallet_credit(
    p_user_id, v_code.credits, NULL, p_idempotency_key,
    v_code.id::text, 'redeem',
    COALESCE(p_metadata, '{}'::jsonb) || jsonb_build_object('redeemCodeId', v_code.id, 'codeHash', p_code_hash)
  );

  INSERT INTO billing_redeem_code_redemptions (
    redeem_code_id, tenant_id, user_id, wallet_ledger_id, idempotency_key
  ) VALUES (
    v_code.id, p_tenant_id, p_user_id, v_ledger.id, p_idempotency_key
  ) RETURNING * INTO v_redemption;

  UPDATE billing_redeem_codes
  SET redeemed_count = redeemed_count + 1
  WHERE id = v_code.id;

  RETURN QUERY SELECT v_ledger.id, v_ledger.wallet_id, v_ledger.user_id, v_ledger.tenant_id,
    v_ledger.usage_event_id, v_ledger.entry_type, v_ledger.amount_credits,
    v_ledger.idempotency_key, v_ledger.created_at, v_redemption.id;
END;
$$;

CREATE OR REPLACE FUNCTION app.wallet_settle_or_refund(
  p_operation text, p_user_id uuid, p_tenant_id uuid, p_reserve_ledger_id uuid,
  p_usage_event_id uuid, p_idempotency_key text, p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS TABLE (id uuid, wallet_id uuid, user_id uuid, tenant_id uuid, usage_event_id uuid, entry_type text, amount_credits numeric, idempotency_key text, created_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, app
AS $$
DECLARE
  v_wallet billing_wallets%ROWTYPE;
  v_reserve billing_wallet_ledger%ROWTYPE;
  v_ledger billing_wallet_ledger%ROWTYPE;
  v_reservation billing_wallet_credit_reservations%ROWTYPE;
  v_grant billing_wallet_credit_grants%ROWTYPE;
  v_total numeric := 0;
  v_expired_refund numeric := 0;
BEGIN
  IF p_operation NOT IN ('settle', 'refund') OR p_idempotency_key = ''
    OR (p_operation = 'settle' AND p_usage_event_id IS NULL) THEN
    RAISE EXCEPTION 'invalid wallet completion';
  END IF;
  SELECT * INTO v_wallet FROM billing_wallets WHERE user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'WALLET_NOT_FOUND'; END IF;
  SELECT * INTO v_ledger FROM billing_wallet_ledger
  WHERE user_id = p_user_id AND idempotency_key = p_idempotency_key;
  IF FOUND THEN
    IF v_ledger.entry_type <> p_operation
      OR v_ledger.tenant_id IS DISTINCT FROM p_tenant_id
      OR (p_operation = 'settle' AND v_ledger.usage_event_id IS DISTINCT FROM p_usage_event_id) THEN
      RAISE EXCEPTION 'WALLET_IDEMPOTENCY_CONFLICT';
    END IF;
    RETURN QUERY SELECT v_ledger.id, v_ledger.wallet_id, v_ledger.user_id, v_ledger.tenant_id,
      v_ledger.usage_event_id, v_ledger.entry_type, v_ledger.amount_credits,
      v_ledger.idempotency_key, v_ledger.created_at;
    RETURN;
  END IF;
  SELECT * INTO v_reserve FROM billing_wallet_ledger
  WHERE id = p_reserve_ledger_id AND user_id = p_user_id AND entry_type = 'reserve'
  FOR UPDATE;
  IF NOT FOUND OR v_reserve.tenant_id IS DISTINCT FROM p_tenant_id THEN
    RAISE EXCEPTION 'RESERVATION_NOT_FOUND';
  END IF;
  FOR v_reservation IN SELECT * FROM billing_wallet_credit_reservations
    WHERE user_id = p_user_id AND wallet_ledger_id = p_reserve_ledger_id AND status = 'reserved'
    FOR UPDATE
  LOOP
    SELECT * INTO v_grant FROM billing_wallet_credit_grants WHERE id = v_reservation.credit_grant_id FOR UPDATE;
    v_total := v_total + v_reservation.amount_credits;
    IF p_operation = 'settle' THEN
      UPDATE billing_wallet_credit_grants
      SET remaining_credits = remaining_credits - v_reservation.amount_credits,
          reserved_credits = reserved_credits - v_reservation.amount_credits,
          status = CASE WHEN remaining_credits - v_reservation.amount_credits = 0 THEN 'exhausted' ELSE status END,
          updated_at = now()
      WHERE id = v_grant.id;
      UPDATE billing_wallet_credit_reservations
      SET status = 'settled', usage_event_id = p_usage_event_id, updated_at = now()
      WHERE id = v_reservation.id;
    ELSE
      -- An expired grant may only release its reservation; it must not become spendable again.
      IF v_grant.status = 'expired' THEN
        v_expired_refund := v_expired_refund + v_reservation.amount_credits;
      END IF;
      UPDATE billing_wallet_credit_grants
      SET reserved_credits = reserved_credits - v_reservation.amount_credits,
          remaining_credits = CASE WHEN status = 'expired'
            THEN reserved_credits - v_reservation.amount_credits ELSE remaining_credits END,
          updated_at = now()
      WHERE id = v_grant.id;
      UPDATE billing_wallet_credit_reservations SET status = 'refunded', updated_at = now()
      WHERE id = v_reservation.id;
    END IF;
  END LOOP;
  IF v_total <= 0 THEN RAISE EXCEPTION 'RESERVATION_NOT_FOUND'; END IF;
  INSERT INTO billing_wallet_ledger (
    wallet_id, user_id, tenant_id, usage_event_id, entry_type, amount_credits, idempotency_key, metadata
  ) VALUES (
    v_wallet.id, p_user_id, p_tenant_id,
    CASE WHEN p_operation = 'settle' THEN p_usage_event_id ELSE NULL END,
    p_operation, CASE WHEN p_operation = 'settle' THEN -v_total ELSE v_total END,
    p_idempotency_key, COALESCE(p_metadata, '{}'::jsonb)
  ) RETURNING * INTO v_ledger;
  UPDATE billing_wallets
  SET balance_credits = CASE
        WHEN p_operation = 'settle' THEN balance_credits - v_total
        WHEN p_operation = 'refund' THEN GREATEST(balance_credits - v_expired_refund, 0)
        ELSE balance_credits
      END,
      reserved_credits = reserved_credits - v_total,
      updated_at = now()
  WHERE id = v_wallet.id;
  RETURN QUERY SELECT v_ledger.id, v_ledger.wallet_id, v_ledger.user_id, v_ledger.tenant_id,
    v_ledger.usage_event_id, v_ledger.entry_type, v_ledger.amount_credits,
    v_ledger.idempotency_key, v_ledger.created_at;
END;
$$;

-- Apply function ACLs while the callback owner is active. SESSION_USER is the
-- API/migration database role even though CURRENT_USER is the callback role.
REVOKE ALL ON FUNCTION app.wallet_expire_due_for_user(uuid, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.wallet_reserve(uuid, uuid, numeric, text, uuid, uuid, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.wallet_redeem_code(uuid, uuid, text, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.wallet_settle_or_refund(text, uuid, uuid, uuid, uuid, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.wallet_reserve(uuid, uuid, numeric, text, uuid, uuid, jsonb) TO SESSION_USER;
GRANT EXECUTE ON FUNCTION app.wallet_redeem_code(uuid, uuid, text, text, jsonb) TO SESSION_USER;
GRANT EXECUTE ON FUNCTION app.wallet_settle_or_refund(text, uuid, uuid, uuid, uuid, text, jsonb) TO SESSION_USER;

RESET ROLE;

CREATE POLICY billing_redeem_codes_select_callback ON billing_redeem_codes FOR SELECT TO tapflow_wallet_callback
  USING (current_user = 'tapflow_wallet_callback');
CREATE POLICY billing_redeem_codes_update_callback ON billing_redeem_codes FOR UPDATE TO tapflow_wallet_callback
  USING (current_user = 'tapflow_wallet_callback') WITH CHECK (current_user = 'tapflow_wallet_callback');
CREATE POLICY billing_redeem_redemptions_select_callback ON billing_redeem_code_redemptions FOR SELECT TO tapflow_wallet_callback
  USING (current_user = 'tapflow_wallet_callback');
CREATE POLICY billing_redeem_redemptions_insert_callback ON billing_redeem_code_redemptions FOR INSERT TO tapflow_wallet_callback
  WITH CHECK (current_user = 'tapflow_wallet_callback');

GRANT SELECT, UPDATE ON billing_redeem_codes TO tapflow_wallet_callback;
GRANT SELECT, INSERT ON billing_redeem_code_redemptions TO tapflow_wallet_callback;
REVOKE CREATE ON SCHEMA app FROM tapflow_wallet_callback;
-- Remove only the current-grantor membership and preserve Supabase's managed grant.
REVOKE tapflow_wallet_callback FROM CURRENT_USER GRANTED BY CURRENT_USER;
