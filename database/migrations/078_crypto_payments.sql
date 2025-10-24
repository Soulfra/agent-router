-- Migration 078: Cryptocurrency Payment System
-- Coinbase Commerce integration for Bitcoin, Ethereum, USDC, etc.
--
-- Purpose:
-- - Accept crypto payments (BTC, ETH, LTC, BCH, USDC, USDT, DAI)
-- - Track payment status via webhooks
-- - QuickBooks sync for crypto revenue
-- - Automatic USD conversion
--
-- Revenue Model:
-- - Coinbase charges: 1% transaction fee
-- - We charge customer: 1.5% (keep 0.5% spread)
--
-- Compliance:
-- - KYC/AML via Coinbase
-- - Tax reporting (1099-MISC)
-- - IRS Form 8300 for transactions >$10k

-- ============================================================================
-- CRYPTO CHARGES
-- ============================================================================

CREATE TABLE IF NOT EXISTS crypto_charges (
  charge_id VARCHAR(100) PRIMARY KEY,

  -- Coinbase Commerce IDs
  coinbase_charge_id VARCHAR(255) NOT NULL UNIQUE,
  coinbase_charge_code VARCHAR(50) NOT NULL UNIQUE,

  -- Ownership
  user_id UUID REFERENCES users(user_id) ON DELETE SET NULL,

  -- Charge details
  amount_usd NUMERIC(10,2) NOT NULL,
  currency VARCHAR(10) DEFAULT 'USD',
  name TEXT NOT NULL,                     -- Product/service name
  description TEXT,

  -- Status
  status VARCHAR(50) DEFAULT 'new',       -- 'new', 'pending', 'confirmed', 'failed', 'delayed', 'resolved', 'canceled'

  -- Payment data (from Coinbase webhooks)
  pricing JSONB DEFAULT '{}',             -- Exchange rates for each coin
  addresses JSONB DEFAULT '{}',           -- Payment addresses per coin
  payment_data JSONB DEFAULT '{}',        -- Actual payment details (when paid)

  -- QuickBooks sync
  quickbooks_synced BOOLEAN DEFAULT false,
  quickbooks_journal_entry_id VARCHAR(255),
  quickbooks_synced_at TIMESTAMP,

  -- Metadata
  metadata JSONB DEFAULT '{}',

  -- Status timestamps
  confirmed_at TIMESTAMP,
  failed_at TIMESTAMP,
  canceled_at TIMESTAMP,
  resolved_at TIMESTAMP,

  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_crypto_charges_user_id
  ON crypto_charges(user_id);

CREATE INDEX IF NOT EXISTS idx_crypto_charges_coinbase_id
  ON crypto_charges(coinbase_charge_id);

CREATE INDEX IF NOT EXISTS idx_crypto_charges_code
  ON crypto_charges(coinbase_charge_code);

CREATE INDEX IF NOT EXISTS idx_crypto_charges_status
  ON crypto_charges(status);

CREATE INDEX IF NOT EXISTS idx_crypto_charges_created_at
  ON crypto_charges(created_at DESC);

COMMENT ON TABLE crypto_charges IS 'Cryptocurrency payment charges (Coinbase Commerce)';
COMMENT ON COLUMN crypto_charges.status IS 'Charge status: new, pending, confirmed, failed, delayed, resolved, canceled';
COMMENT ON COLUMN crypto_charges.addresses IS 'Payment addresses per cryptocurrency (BTC, ETH, etc.)';
COMMENT ON COLUMN crypto_charges.payment_data IS 'Actual payment details once paid (coin used, amount, etc.)';

-- ============================================================================
-- CRYPTO WEBHOOKS (Event log)
-- ============================================================================

CREATE TABLE IF NOT EXISTS crypto_webhooks (
  webhook_id SERIAL PRIMARY KEY,

  -- Event details
  event_id VARCHAR(255) NOT NULL,         -- Coinbase event ID
  event_type VARCHAR(100) NOT NULL,       -- 'charge:created', 'charge:confirmed', etc.
  charge_id VARCHAR(100) REFERENCES crypto_charges(charge_id),

  -- Payload
  payload JSONB NOT NULL,

  -- Processing
  processed BOOLEAN DEFAULT false,
  processed_at TIMESTAMP,
  error_message TEXT,

  -- Timestamps
  received_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_crypto_webhooks_event_id
  ON crypto_webhooks(event_id);

CREATE INDEX IF NOT EXISTS idx_crypto_webhooks_event_type
  ON crypto_webhooks(event_type);

CREATE INDEX IF NOT EXISTS idx_crypto_webhooks_charge_id
  ON crypto_webhooks(charge_id);

CREATE INDEX IF NOT EXISTS idx_crypto_webhooks_processed
  ON crypto_webhooks(processed);

COMMENT ON TABLE crypto_webhooks IS 'Coinbase Commerce webhook event log';
COMMENT ON COLUMN crypto_webhooks.event_type IS 'Webhook event type (charge:created, charge:confirmed, etc.)';

-- ============================================================================
-- FUNCTIONS
-- ============================================================================

/**
 * Update crypto charge timestamp
 */
CREATE OR REPLACE FUNCTION update_crypto_charge_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_crypto_charge_timestamp ON crypto_charges;
CREATE TRIGGER trigger_update_crypto_charge_timestamp
  BEFORE UPDATE ON crypto_charges
  FOR EACH ROW
  EXECUTE FUNCTION update_crypto_charge_timestamp();

/**
 * Get crypto revenue summary
 */
CREATE OR REPLACE FUNCTION get_crypto_revenue_summary(
  p_user_id UUID DEFAULT NULL,
  p_start_date TIMESTAMP DEFAULT NOW() - INTERVAL '30 days',
  p_end_date TIMESTAMP DEFAULT NOW()
)
RETURNS TABLE (
  total_charges BIGINT,
  confirmed_charges BIGINT,
  total_revenue_usd NUMERIC,
  avg_charge_usd NUMERIC,
  coins_used TEXT[]
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*) as total_charges,
    COUNT(*) FILTER (WHERE status = 'confirmed') as confirmed_charges,
    SUM(amount_usd) FILTER (WHERE status = 'confirmed') as total_revenue_usd,
    AVG(amount_usd) FILTER (WHERE status = 'confirmed') as avg_charge_usd,
    ARRAY_AGG(DISTINCT jsonb_object_keys(payment_data)) FILTER (WHERE status = 'confirmed') as coins_used
  FROM crypto_charges
  WHERE (p_user_id IS NULL OR user_id = p_user_id)
    AND created_at >= p_start_date
    AND created_at <= p_end_date;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_crypto_revenue_summary IS 'Get cryptocurrency revenue summary for date range';

-- ============================================================================
-- SEED DATA / DEFAULTS
-- ============================================================================

-- None needed - this is a user-driven system


