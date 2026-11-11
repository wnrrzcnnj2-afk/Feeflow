CREATE TABLE IF NOT EXISTS memberships (
  wallet TEXT PRIMARY KEY,
  expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS payments (
  signature TEXT PRIMARY KEY,
  wallet TEXT NOT NULL,
  paid_at INTEGER NOT NULL,
  amount INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS payments_wallet_idx ON payments(wallet);