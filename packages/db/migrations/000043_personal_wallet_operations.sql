-- Wallet mutations are implemented as fixed SECURITY DEFINER operations. The
-- API role has EXECUTE only; it cannot write personal financial tables directly.
CREATE OR REPLACE FUNCTION app.wallet_credit(
  p_user_id uuid,
  p_amount numeric,
  p_expires_at timestamptz,
  p_idempotency_key text,
  p_source_id text,
  p_source_type text,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS TABLE (
  id uuid,
  wallet_id uuid,
  user_id uuid,
  tenant_id uuid,
  usage_event_id uuid,
  entry_type text,
  amount_credits numeric,
  idempotency_key text,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app
AS $$
DECLARE
  v_wallet billing_wallets%ROWTYPE;
BEGIN
  IF p_amount <= 0 OR p_idempotency_key = '' OR p_source_type NOT IN ('payment', 'redeem', 'admin_grant', 'migration') THEN
    RAISE EXCEPTION 'invalid wallet credit';
  END IF;
  INSERT INTO billing_wallets (user_id) VALUES (p_user_id) ON CONFLICT (user_id) DO NOTHING;
  SELECT * INTO v_wallet FROM billing_wallets WHERE user_id = p_user_id FOR UPDATE;
  RETURN QUERY
  INSERT INTO billing_wallet_ledger (wallet_id, user_id, entry_type, amount_credits, idempotency_key, metadata)
  VALUES (v_wallet.id, p_user_id,
    CASE p_source_type WHEN 'payment' THEN 'payment' WHEN 'migration' THEN 'migration_credit' ELSE 'admin_credit' END,
    p_amount, p_idempotency_key, COALESCE(p_metadata, '{}'::jsonb))
  ON CONFLICT (user_id, idempotency_key) DO NOTHING
  RETURNING billing_wallet_ledger.id, billing_wallet_ledger.wallet_id, billing_wallet_ledger.user_id,
    billing_wallet_ledger.tenant_id, billing_wallet_ledger.usage_event_id, billing_wallet_ledger.entry_type,
    billing_wallet_ledger.amount_credits, billing_wallet_ledger.idempotency_key, billing_wallet_ledger.created_at;
  IF NOT FOUND THEN
    RETURN QUERY SELECT ledger.id, ledger.wallet_id, ledger.user_id, ledger.tenant_id, ledger.usage_event_id,
      ledger.entry_type, ledger.amount_credits, ledger.idempotency_key, ledger.created_at
    FROM billing_wallet_ledger ledger WHERE ledger.user_id = p_user_id AND ledger.idempotency_key = p_idempotency_key;
    RETURN;
  END IF;
  INSERT INTO billing_wallet_credit_grants (wallet_id, user_id, source_type, source_id, original_credits, remaining_credits, expires_at, metadata)
  VALUES (v_wallet.id, p_user_id, p_source_type, p_source_id, p_amount, p_amount, p_expires_at, COALESCE(p_metadata, '{}'::jsonb));
  UPDATE billing_wallets SET balance_credits = balance_credits + p_amount, updated_at = now() WHERE id = v_wallet.id;
END;
$$;

CREATE OR REPLACE FUNCTION app.wallet_expire_due(
  p_limit integer DEFAULT 500,
  p_now timestamptz DEFAULT now()
)
RETURNS TABLE (expired_credits numeric, expired_grant_count integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app
AS $$
DECLARE
  v_grant billing_wallet_credit_grants%ROWTYPE;
  v_available numeric;
  v_count integer := 0;
  v_total numeric := 0;
BEGIN
  FOR v_grant IN
    SELECT * FROM billing_wallet_credit_grants
    WHERE status = 'active' AND expires_at IS NOT NULL AND expires_at <= p_now
    ORDER BY expires_at ASC, created_at ASC, id ASC
    LIMIT GREATEST(COALESCE(p_limit, 500), 1)
    FOR UPDATE SKIP LOCKED
  LOOP
    v_available := v_grant.remaining_credits - v_grant.reserved_credits;
    IF v_available > 0 THEN
      INSERT INTO billing_wallet_ledger (wallet_id, user_id, entry_type, amount_credits, idempotency_key, metadata)
      VALUES (v_grant.wallet_id, v_grant.user_id, 'expire', -v_available, 'expire:' || v_grant.id::text,
        jsonb_build_object('grantId', v_grant.id, 'expiresAt', v_grant.expires_at))
      ON CONFLICT (user_id, idempotency_key) DO NOTHING;
      UPDATE billing_wallets SET balance_credits = GREATEST(balance_credits - v_available, 0), updated_at = p_now
      WHERE id = v_grant.wallet_id;
      v_total := v_total + v_available;
    END IF;
    UPDATE billing_wallet_credit_grants SET remaining_credits = reserved_credits, status = 'expired', updated_at = p_now WHERE id = v_grant.id;
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
DECLARE v_wallet billing_wallets%ROWTYPE; v_grant billing_wallet_credit_grants%ROWTYPE; v_ledger billing_wallet_ledger%ROWTYPE; v_need numeric; v_take numeric;
BEGIN
  IF p_amount <= 0 OR p_idempotency_key = '' THEN RAISE EXCEPTION 'invalid wallet reserve'; END IF;
  PERFORM app.wallet_expire_due(500, now());
  SELECT * INTO v_wallet FROM billing_wallets WHERE user_id = p_user_id FOR UPDATE;
  IF NOT FOUND OR v_wallet.status <> 'active' OR v_wallet.balance_credits - v_wallet.reserved_credits < p_amount THEN RAISE EXCEPTION 'INSUFFICIENT_BALANCE'; END IF;
  SELECT * INTO v_ledger FROM billing_wallet_ledger WHERE user_id = p_user_id AND idempotency_key = p_idempotency_key;
  IF FOUND THEN RETURN QUERY SELECT v_ledger.id, v_ledger.wallet_id, v_ledger.user_id, v_ledger.tenant_id, v_ledger.usage_event_id, v_ledger.entry_type, v_ledger.amount_credits, v_ledger.idempotency_key, v_ledger.created_at; RETURN; END IF;
  INSERT INTO billing_wallet_ledger (wallet_id, user_id, tenant_id, workflow_run_id, node_run_id, entry_type, amount_credits, idempotency_key, metadata)
  VALUES (v_wallet.id, p_user_id, p_tenant_id, p_workflow_run_id, p_node_run_id, 'reserve', -p_amount, p_idempotency_key, COALESCE(p_metadata, '{}'::jsonb)) RETURNING * INTO v_ledger;
  v_need := p_amount;
  FOR v_grant IN SELECT * FROM billing_wallet_credit_grants WHERE wallet_id = v_wallet.id AND status = 'active' AND remaining_credits > reserved_credits ORDER BY expires_at ASC NULLS LAST, created_at ASC, id ASC FOR UPDATE LOOP
    EXIT WHEN v_need <= 0;
    v_take := LEAST(v_need, v_grant.remaining_credits - v_grant.reserved_credits);
    UPDATE billing_wallet_credit_grants SET reserved_credits = reserved_credits + v_take, updated_at = now() WHERE id = v_grant.id;
    INSERT INTO billing_wallet_credit_reservations (wallet_id, user_id, wallet_ledger_id, credit_grant_id, amount_credits, metadata) VALUES (v_wallet.id, p_user_id, v_ledger.id, v_grant.id, v_take, COALESCE(p_metadata, '{}'::jsonb));
    v_need := v_need - v_take;
  END LOOP;
  IF v_need > 0 THEN RAISE EXCEPTION 'INSUFFICIENT_BALANCE'; END IF;
  UPDATE billing_wallets SET reserved_credits = reserved_credits + p_amount, updated_at = now() WHERE id = v_wallet.id;
  RETURN QUERY SELECT v_ledger.id, v_ledger.wallet_id, v_ledger.user_id, v_ledger.tenant_id, v_ledger.usage_event_id, v_ledger.entry_type, v_ledger.amount_credits, v_ledger.idempotency_key, v_ledger.created_at;
END;
$$;

CREATE OR REPLACE FUNCTION app.wallet_settle_or_refund(
  p_operation text,
  p_user_id uuid,
  p_tenant_id uuid,
  p_reserve_ledger_id uuid,
  p_usage_event_id uuid,
  p_idempotency_key text,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS TABLE (id uuid, wallet_id uuid, user_id uuid, tenant_id uuid, usage_event_id uuid, entry_type text, amount_credits numeric, idempotency_key text, created_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, app
AS $$
DECLARE v_wallet billing_wallets%ROWTYPE; v_ledger billing_wallet_ledger%ROWTYPE; v_reservation billing_wallet_credit_reservations%ROWTYPE; v_grant billing_wallet_credit_grants%ROWTYPE; v_total numeric := 0;
BEGIN
  IF p_operation NOT IN ('settle', 'refund') OR p_idempotency_key = '' OR (p_operation = 'settle' AND p_usage_event_id IS NULL) THEN RAISE EXCEPTION 'invalid wallet completion'; END IF;
  SELECT * INTO v_wallet FROM billing_wallets WHERE user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'WALLET_NOT_FOUND'; END IF;
  SELECT * INTO v_ledger FROM billing_wallet_ledger WHERE user_id = p_user_id AND idempotency_key = p_idempotency_key;
  IF FOUND THEN RETURN QUERY SELECT v_ledger.id, v_ledger.wallet_id, v_ledger.user_id, v_ledger.tenant_id, v_ledger.usage_event_id, v_ledger.entry_type, v_ledger.amount_credits, v_ledger.idempotency_key, v_ledger.created_at; RETURN; END IF;
  FOR v_reservation IN SELECT * FROM billing_wallet_credit_reservations WHERE user_id = p_user_id AND wallet_ledger_id = p_reserve_ledger_id AND status = 'reserved' FOR UPDATE LOOP
    SELECT * INTO v_grant FROM billing_wallet_credit_grants WHERE id = v_reservation.credit_grant_id FOR UPDATE;
    v_total := v_total + v_reservation.amount_credits;
    IF p_operation = 'settle' THEN
      UPDATE billing_wallet_credit_grants SET remaining_credits = remaining_credits - v_reservation.amount_credits, reserved_credits = reserved_credits - v_reservation.amount_credits, status = CASE WHEN remaining_credits - v_reservation.amount_credits = 0 THEN 'exhausted' ELSE status END, updated_at = now() WHERE id = v_grant.id;
      UPDATE billing_wallet_credit_reservations SET status = 'settled', usage_event_id = p_usage_event_id, updated_at = now() WHERE id = v_reservation.id;
    ELSE
      UPDATE billing_wallet_credit_grants SET reserved_credits = reserved_credits - v_reservation.amount_credits, remaining_credits = CASE WHEN status = 'expired' THEN reserved_credits - v_reservation.amount_credits ELSE remaining_credits END, updated_at = now() WHERE id = v_grant.id;
      UPDATE billing_wallet_credit_reservations SET status = 'refunded', updated_at = now() WHERE id = v_reservation.id;
    END IF;
  END LOOP;
  IF v_total <= 0 THEN RAISE EXCEPTION 'RESERVATION_NOT_FOUND'; END IF;
  INSERT INTO billing_wallet_ledger (wallet_id, user_id, tenant_id, usage_event_id, entry_type, amount_credits, idempotency_key, metadata)
  VALUES (v_wallet.id, p_user_id, p_tenant_id, CASE WHEN p_operation = 'settle' THEN p_usage_event_id ELSE NULL END, p_operation, CASE WHEN p_operation = 'settle' THEN -v_total ELSE v_total END, p_idempotency_key, COALESCE(p_metadata, '{}'::jsonb)) RETURNING * INTO v_ledger;
  IF p_operation = 'settle' THEN UPDATE billing_wallets SET balance_credits = balance_credits - v_total, reserved_credits = reserved_credits - v_total, updated_at = now() WHERE id = v_wallet.id;
  ELSE UPDATE billing_wallets SET reserved_credits = reserved_credits - v_total, updated_at = now() WHERE id = v_wallet.id; END IF;
  RETURN QUERY SELECT v_ledger.id, v_ledger.wallet_id, v_ledger.user_id, v_ledger.tenant_id, v_ledger.usage_event_id, v_ledger.entry_type, v_ledger.amount_credits, v_ledger.idempotency_key, v_ledger.created_at;
END;
$$;

-- The callback role owns every mutator so forced RLS applies the dedicated
-- callback/service policies instead of granting the shared API role table access.
REVOKE ALL ON FUNCTION app.wallet_credit(uuid, numeric, timestamptz, text, text, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.wallet_expire_due(integer, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.wallet_reserve(uuid, uuid, numeric, text, uuid, uuid, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.wallet_settle_or_refund(text, uuid, uuid, uuid, uuid, text, jsonb) FROM PUBLIC;
DO $$
BEGIN
  GRANT USAGE, CREATE ON SCHEMA app TO tapflow_wallet_callback;
  GRANT SELECT, INSERT, UPDATE ON billing_wallets, billing_wallet_credit_grants, billing_wallet_credit_reservations TO tapflow_wallet_callback;
  GRANT SELECT, INSERT ON billing_wallet_ledger TO tapflow_wallet_callback;
  EXECUTE format('GRANT tapflow_wallet_callback TO %I', current_user);
  EXECUTE format('GRANT EXECUTE ON FUNCTION app.wallet_credit(uuid, numeric, timestamptz, text, text, text, jsonb) TO %I', current_user);
  EXECUTE format('GRANT EXECUTE ON FUNCTION app.wallet_expire_due(integer, timestamptz) TO %I', current_user);
  EXECUTE format('GRANT EXECUTE ON FUNCTION app.wallet_reserve(uuid, uuid, numeric, text, uuid, uuid, jsonb) TO %I', current_user);
  EXECUTE format('GRANT EXECUTE ON FUNCTION app.wallet_settle_or_refund(text, uuid, uuid, uuid, uuid, text, jsonb) TO %I', current_user);
  ALTER FUNCTION app.wallet_credit(uuid, numeric, timestamptz, text, text, text, jsonb) OWNER TO tapflow_wallet_callback;
  ALTER FUNCTION app.wallet_expire_due(integer, timestamptz) OWNER TO tapflow_wallet_callback;
  ALTER FUNCTION app.wallet_reserve(uuid, uuid, numeric, text, uuid, uuid, jsonb) OWNER TO tapflow_wallet_callback;
  ALTER FUNCTION app.wallet_settle_or_refund(text, uuid, uuid, uuid, uuid, text, jsonb) OWNER TO tapflow_wallet_callback;
  EXECUTE format('REVOKE tapflow_wallet_callback FROM %I', current_user);
  REVOKE CREATE ON SCHEMA app FROM tapflow_wallet_callback;
END;
$$;
