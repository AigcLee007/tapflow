ALTER TABLE billing_wallet_ledger
  DROP CONSTRAINT IF EXISTS billing_wallet_ledger_entry_type_check;

ALTER TABLE billing_wallet_ledger
  ADD CONSTRAINT billing_wallet_ledger_entry_type_check CHECK (entry_type IN (
    'payment', 'migration_credit', 'admin_credit', 'redeem', 'reserve', 'settle', 'refund', 'expire', 'payment_refund'
  ));
