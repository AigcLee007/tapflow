-- Runtime wallet functions must be executable by the API database role.
-- Migrations use a separate direct/session connection, so SESSION_USER there
-- is not necessarily the role used by the long-running API pool.
GRANT USAGE, CREATE ON SCHEMA app TO tapflow_wallet_callback;
GRANT tapflow_wallet_callback TO CURRENT_USER WITH INHERIT FALSE, SET TRUE GRANTED BY CURRENT_USER;
SET LOCAL ROLE tapflow_wallet_callback;

DO $$
DECLARE
  runtime_role name := COALESCE(
    NULLIF(current_setting('app.api_database_role', true), ''),
    session_user
  );
BEGIN
  IF runtime_role = 'tapflow_wallet_callback' THEN
    RAISE EXCEPTION 'API_DATABASE_ROLE must be the runtime API role, not the callback owner';
  END IF;

  EXECUTE format(
    'GRANT EXECUTE ON FUNCTION app.list_active_billing_recharge_plans() TO %I',
    runtime_role
  );
  EXECUTE format(
    'GRANT EXECUTE ON FUNCTION app.create_wallet_payment(uuid, text, text, text) TO %I',
    runtime_role
  );
  EXECUTE format(
    'GRANT EXECUTE ON FUNCTION app.mark_wallet_payment_checkout(uuid, text, text) TO %I',
    runtime_role
  );
  EXECUTE format(
    'GRANT EXECUTE ON FUNCTION app.get_wallet_payment_by_order(text) TO %I',
    runtime_role
  );
  EXECUTE format(
    'GRANT EXECUTE ON FUNCTION app.apply_xunhu_payment_notification(text, bigint, text, text, text, timestamptz) TO %I',
    runtime_role
  );
  EXECUTE format(
    'GRANT EXECUTE ON FUNCTION app.wallet_reserve(uuid, uuid, numeric, text, uuid, uuid, jsonb) TO %I',
    runtime_role
  );
  EXECUTE format(
    'GRANT EXECUTE ON FUNCTION app.wallet_redeem_code(uuid, uuid, text, text, jsonb) TO %I',
    runtime_role
  );
  EXECUTE format(
    'GRANT EXECUTE ON FUNCTION app.wallet_settle_or_refund(text, uuid, uuid, uuid, uuid, text, jsonb) TO %I',
    runtime_role
  );
END;
$$;

RESET ROLE;
REVOKE CREATE ON SCHEMA app FROM tapflow_wallet_callback;
REVOKE tapflow_wallet_callback FROM CURRENT_USER GRANTED BY CURRENT_USER;
