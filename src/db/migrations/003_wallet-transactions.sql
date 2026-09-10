-- Migration 003: Wallet Transactions (driver earnings and withdrawals)

CREATE TABLE wallet_transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  driver_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ride_id UUID REFERENCES rides(id),
  type VARCHAR(10) NOT NULL CHECK (type IN ('credit', 'debit')),
  amount DECIMAL(10,2) NOT NULL CHECK (amount > 0),
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Performance indices
CREATE INDEX idx_wallet_tx_driver ON wallet_transactions (driver_id);
CREATE INDEX idx_wallet_tx_driver_time ON wallet_transactions (driver_id, created_at DESC);
