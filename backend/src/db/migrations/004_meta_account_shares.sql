-- ──────────────────────────────────────────────────────────────────────────────
-- meta_account_shares
-- Allows an admin to share a Meta ad account with additional clients so they
-- can view its campaigns/metrics without owning (or duplicating) the account.
-- ──────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS meta_account_shares (
  meta_account_id UUID NOT NULL REFERENCES meta_accounts (id) ON DELETE CASCADE,
  client_id       UUID NOT NULL REFERENCES clients (id)       ON DELETE CASCADE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (meta_account_id, client_id)
);

CREATE INDEX IF NOT EXISTS idx_meta_account_shares_client ON meta_account_shares (client_id);
