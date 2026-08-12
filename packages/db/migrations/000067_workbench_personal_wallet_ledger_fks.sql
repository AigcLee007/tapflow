ALTER TABLE workbench_generations
  DROP CONSTRAINT IF EXISTS workbench_generations_reserve_ledger_id_fkey,
  DROP CONSTRAINT IF EXISTS workbench_generations_settle_ledger_id_fkey,
  DROP CONSTRAINT IF EXISTS workbench_generations_refund_ledger_id_fkey;

ALTER TABLE workbench_generations
  ADD CONSTRAINT workbench_generations_reserve_ledger_id_fkey
    FOREIGN KEY (reserve_ledger_id)
    REFERENCES billing_wallet_ledger(id)
    ON DELETE SET NULL
    NOT VALID,
  ADD CONSTRAINT workbench_generations_settle_ledger_id_fkey
    FOREIGN KEY (settle_ledger_id)
    REFERENCES billing_wallet_ledger(id)
    ON DELETE SET NULL
    NOT VALID,
  ADD CONSTRAINT workbench_generations_refund_ledger_id_fkey
    FOREIGN KEY (refund_ledger_id)
    REFERENCES billing_wallet_ledger(id)
    ON DELETE SET NULL
    NOT VALID;
