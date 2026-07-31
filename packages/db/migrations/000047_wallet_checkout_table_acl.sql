-- Reassert the callback-owner table privileges required by checkout functions.
-- These functions are SECURITY DEFINER and must read/write through the
-- tapflow_wallet_callback role; the API role only receives EXECUTE privileges.
GRANT USAGE ON SCHEMA public TO tapflow_wallet_callback;
GRANT SELECT ON billing_recharge_plans TO tapflow_wallet_callback;
GRANT SELECT, INSERT, UPDATE ON billing_wallets TO tapflow_wallet_callback;
GRANT SELECT, INSERT, UPDATE ON billing_wallet_payments TO tapflow_wallet_callback;

-- A managed database may have created or replaced these functions under the
-- migration role even though their bodies are SECURITY DEFINER. Restore the
-- callback owner so the API role cannot become the table privilege boundary.
DO $$
BEGIN
  EXECUTE format('GRANT tapflow_wallet_callback TO %I', current_user);
  ALTER FUNCTION app.create_wallet_payment(uuid, text, text, text)
    OWNER TO tapflow_wallet_callback;
  ALTER FUNCTION app.mark_wallet_payment_checkout(uuid, text, text)
    OWNER TO tapflow_wallet_callback;
  ALTER FUNCTION app.get_wallet_payment_by_order(text)
    OWNER TO tapflow_wallet_callback;
  EXECUTE format('REVOKE tapflow_wallet_callback FROM %I', current_user);
END;
$$;
