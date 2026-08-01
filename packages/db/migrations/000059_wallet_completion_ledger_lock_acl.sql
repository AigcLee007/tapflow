-- SELECT ... FOR UPDATE requires UPDATE table privilege in PostgreSQL. The
-- completion function locks the immutable reserve entry to serialize concurrent
-- settlement/refund attempts, so grant only that lock capability to the
-- dedicated NOLOGIN callback role. The API/Worker runtime role receives no
-- ledger table privileges.

DROP POLICY IF EXISTS billing_wallet_ledger_update_callback ON billing_wallet_ledger;
CREATE POLICY billing_wallet_ledger_update_callback
  ON billing_wallet_ledger FOR UPDATE TO tapflow_wallet_callback
  USING (current_user = 'tapflow_wallet_callback')
  WITH CHECK (current_user = 'tapflow_wallet_callback');

REVOKE UPDATE ON billing_wallet_ledger FROM PUBLIC;
GRANT UPDATE ON billing_wallet_ledger TO tapflow_wallet_callback;
