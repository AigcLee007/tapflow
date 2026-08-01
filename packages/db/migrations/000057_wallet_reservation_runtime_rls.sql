-- Wallet mutators execute as the dedicated callback role while forced RLS is
-- enabled. Reserve needs to insert allocation rows, and settle/refund need to
-- read the reserve ledger plus read and update those allocations.

DROP POLICY IF EXISTS billing_wallet_ledger_select_callback ON billing_wallet_ledger;
CREATE POLICY billing_wallet_ledger_select_callback
  ON billing_wallet_ledger FOR SELECT TO tapflow_wallet_callback
  USING (current_user = 'tapflow_wallet_callback');

DROP POLICY IF EXISTS billing_wallet_credit_reservations_select_callback
  ON billing_wallet_credit_reservations;
CREATE POLICY billing_wallet_credit_reservations_select_callback
  ON billing_wallet_credit_reservations FOR SELECT TO tapflow_wallet_callback
  USING (current_user = 'tapflow_wallet_callback');

DROP POLICY IF EXISTS billing_wallet_credit_reservations_insert_callback
  ON billing_wallet_credit_reservations;
CREATE POLICY billing_wallet_credit_reservations_insert_callback
  ON billing_wallet_credit_reservations FOR INSERT TO tapflow_wallet_callback
  WITH CHECK (current_user = 'tapflow_wallet_callback');

DROP POLICY IF EXISTS billing_wallet_credit_reservations_update_callback
  ON billing_wallet_credit_reservations;
CREATE POLICY billing_wallet_credit_reservations_update_callback
  ON billing_wallet_credit_reservations FOR UPDATE TO tapflow_wallet_callback
  USING (current_user = 'tapflow_wallet_callback')
  WITH CHECK (current_user = 'tapflow_wallet_callback');

GRANT SELECT, INSERT ON billing_wallet_ledger TO tapflow_wallet_callback;
GRANT SELECT, INSERT, UPDATE ON billing_wallet_credit_reservations TO tapflow_wallet_callback;
