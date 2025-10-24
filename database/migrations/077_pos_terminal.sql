-- Migration 077: POS Terminal System
-- Square competitor for in-person and online payments
--
-- Purpose:
-- - Process card payments (Stripe Terminal)
-- - Process QR code payments
-- - Process cash payments
-- - Generate receipts
-- - Track inventory
-- - Multi-location support
-- - QuickBooks sync
--
-- Revenue Model:
-- - 2.6% + $0.10 per swipe (match Square)
-- - 2.9% + $0.30 per online transaction
-- - No monthly fees
--
-- PCI Compliance:
-- - Stripe handles all card data (PCI Level 1)
-- - We never see/store card numbers
-- - End-to-end encryption

-- ============================================================================
-- POS LOCATIONS
-- ============================================================================

CREATE TABLE IF NOT EXISTS pos_locations (
  location_id VARCHAR(100) PRIMARY KEY,

  -- Business ownership
  user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,

  -- Location details
  location_name TEXT NOT NULL,
  address_line1 TEXT,
  address_line2 TEXT,
  city TEXT,
  state VARCHAR(50),
  zip_code VARCHAR(20),
  country VARCHAR(10) DEFAULT 'US',
  phone VARCHAR(50),

  -- Terminal configuration
  terminal_reader_id VARCHAR(255),    -- Stripe Terminal reader ID
  receipt_printer_id VARCHAR(255),    -- Thermal printer ID
  cash_drawer_enabled BOOLEAN DEFAULT false,

  -- Status
  status VARCHAR(50) DEFAULT 'active', -- 'active', 'inactive', 'suspended'

  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_pos_locations_user_id
  ON pos_locations(user_id);

CREATE INDEX IF NOT EXISTS idx_pos_locations_status
  ON pos_locations(status);

COMMENT ON TABLE pos_locations IS 'POS terminal locations (physical stores)';
COMMENT ON COLUMN pos_locations.terminal_reader_id IS 'Stripe Terminal card reader ID';

-- ============================================================================
-- POS TRANSACTIONS
-- ============================================================================

CREATE TABLE IF NOT EXISTS pos_transactions (
  transaction_id VARCHAR(100) PRIMARY KEY,

  -- Location
  location_id VARCHAR(100) REFERENCES pos_locations(location_id),

  -- Payment provider IDs
  payment_intent_id VARCHAR(255),     -- Stripe Payment Intent ID
  session_id VARCHAR(255),            -- Stripe Checkout Session ID (for QR)

  -- Transaction details
  amount_cents INTEGER NOT NULL,
  currency VARCHAR(10) DEFAULT 'usd',
  payment_method VARCHAR(50) NOT NULL, -- 'card', 'cash', 'qr', 'crypto'

  -- Status
  status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'completed', 'failed', 'refunded', 'canceled'

  -- Refund tracking
  refund_id VARCHAR(255),
  refunded_at TIMESTAMP,

  -- QuickBooks sync
  quickbooks_synced BOOLEAN DEFAULT false,
  quickbooks_journal_entry_id VARCHAR(255),
  quickbooks_synced_at TIMESTAMP,

  -- Metadata
  metadata JSONB DEFAULT '{}',

  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_pos_txn_location_id
  ON pos_transactions(location_id);

CREATE INDEX IF NOT EXISTS idx_pos_txn_status
  ON pos_transactions(status);

CREATE INDEX IF NOT EXISTS idx_pos_txn_payment_method
  ON pos_transactions(payment_method);

CREATE INDEX IF NOT EXISTS idx_pos_txn_created_at
  ON pos_transactions(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_pos_txn_payment_intent
  ON pos_transactions(payment_intent_id)
  WHERE payment_intent_id IS NOT NULL;

COMMENT ON TABLE pos_transactions IS 'POS terminal transactions (card, cash, QR, crypto)';
COMMENT ON COLUMN pos_transactions.payment_method IS 'Payment method: card, cash, qr, crypto';
COMMENT ON COLUMN pos_transactions.status IS 'Transaction status: pending, completed, failed, refunded, canceled';

-- ============================================================================
-- POS RECEIPTS
-- ============================================================================

CREATE TABLE IF NOT EXISTS pos_receipts (
  receipt_id VARCHAR(100) PRIMARY KEY,

  -- Transaction
  transaction_id VARCHAR(100) NOT NULL REFERENCES pos_transactions(transaction_id) ON DELETE CASCADE,

  -- Receipt formats
  receipt_text TEXT,                  -- Plain text (for thermal printers)
  receipt_html TEXT,                  -- HTML (for email)

  -- Email delivery
  email_sent_to VARCHAR(255),
  email_sent_at TIMESTAMP,

  -- Print status
  printed BOOLEAN DEFAULT false,
  printed_at TIMESTAMP,

  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_pos_receipts_transaction_id
  ON pos_receipts(transaction_id);

COMMENT ON TABLE pos_receipts IS 'Generated receipts for POS transactions';
COMMENT ON COLUMN pos_receipts.receipt_text IS 'Plain text receipt (for thermal printers)';
COMMENT ON COLUMN pos_receipts.receipt_html IS 'HTML receipt (for email)';

-- ============================================================================
-- POS INVENTORY (Simple inventory tracking)
-- ============================================================================

CREATE TABLE IF NOT EXISTS pos_inventory (
  item_id VARCHAR(100) PRIMARY KEY,

  -- Location
  location_id VARCHAR(100) REFERENCES pos_locations(location_id) ON DELETE CASCADE,

  -- Item details
  item_name TEXT NOT NULL,
  description TEXT,
  sku VARCHAR(100),
  barcode VARCHAR(100),

  -- Pricing
  price_cents INTEGER NOT NULL,
  cost_cents INTEGER,                 -- Cost of goods (for profit tracking)
  tax_rate NUMERIC(5,2) DEFAULT 0.00, -- Tax rate (e.g., 8.25 = 8.25%)

  -- Inventory
  quantity_on_hand INTEGER DEFAULT 0,
  reorder_point INTEGER DEFAULT 0,    -- Alert when stock falls below this
  reorder_quantity INTEGER DEFAULT 0, -- How much to reorder

  -- Status
  status VARCHAR(50) DEFAULT 'active', -- 'active', 'out_of_stock', 'discontinued'

  -- Integration
  stripe_product_id VARCHAR(255),     -- Stripe Product ID
  quickbooks_item_id VARCHAR(255),    -- QuickBooks Item ID

  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_pos_inventory_location_id
  ON pos_inventory(location_id);

CREATE INDEX IF NOT EXISTS idx_pos_inventory_sku
  ON pos_inventory(sku)
  WHERE sku IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_pos_inventory_barcode
  ON pos_inventory(barcode)
  WHERE barcode IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_pos_inventory_status
  ON pos_inventory(status);

COMMENT ON TABLE pos_inventory IS 'POS inventory items (products for sale)';
COMMENT ON COLUMN pos_inventory.reorder_point IS 'Alert when stock falls below this quantity';

-- ============================================================================
-- POS TRANSACTION ITEMS (Line items per transaction)
-- ============================================================================

CREATE TABLE IF NOT EXISTS pos_transaction_items (
  item_id SERIAL PRIMARY KEY,

  -- Transaction
  transaction_id VARCHAR(100) NOT NULL REFERENCES pos_transactions(transaction_id) ON DELETE CASCADE,

  -- Inventory item
  inventory_item_id VARCHAR(100) REFERENCES pos_inventory(item_id),

  -- Item details (denormalized for historical accuracy)
  item_name TEXT NOT NULL,
  quantity INTEGER DEFAULT 1,
  unit_price_cents INTEGER NOT NULL,
  total_price_cents INTEGER NOT NULL,
  tax_cents INTEGER DEFAULT 0,

  -- Discounts
  discount_percent NUMERIC(5,2) DEFAULT 0.00,
  discount_amount_cents INTEGER DEFAULT 0,

  -- Metadata
  metadata JSONB DEFAULT '{}',

  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_pos_txn_items_transaction_id
  ON pos_transaction_items(transaction_id);

CREATE INDEX IF NOT EXISTS idx_pos_txn_items_inventory_id
  ON pos_transaction_items(inventory_item_id);

COMMENT ON TABLE pos_transaction_items IS 'Line items for POS transactions';
COMMENT ON COLUMN pos_transaction_items.inventory_item_id IS 'Reference to inventory (can be NULL for custom items)';

-- ============================================================================
-- FUNCTIONS
-- ============================================================================

/**
 * Update inventory when transaction completes
 */
CREATE OR REPLACE FUNCTION update_inventory_on_sale()
RETURNS TRIGGER AS $$
BEGIN
  -- Only update inventory when transaction completes
  IF NEW.status = 'completed' AND (OLD.status IS NULL OR OLD.status != 'completed') THEN

    -- Decrement inventory for each line item
    UPDATE pos_inventory i
    SET quantity_on_hand = quantity_on_hand - ti.quantity
    FROM pos_transaction_items ti
    WHERE ti.transaction_id = NEW.transaction_id
      AND ti.inventory_item_id = i.item_id;

    -- Check for low stock alerts
    PERFORM item_id
    FROM pos_inventory
    WHERE location_id IN (SELECT location_id FROM pos_transactions WHERE transaction_id = NEW.transaction_id)
      AND quantity_on_hand <= reorder_point
      AND status != 'discontinued';

    -- TODO: Trigger low stock alert notification

  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_inventory_on_sale ON pos_transactions;
CREATE TRIGGER trigger_update_inventory_on_sale
  AFTER INSERT OR UPDATE ON pos_transactions
  FOR EACH ROW
  EXECUTE FUNCTION update_inventory_on_sale();

COMMENT ON FUNCTION update_inventory_on_sale IS 'Auto-decrement inventory when transaction completes';

/**
 * Calculate daily sales for location
 */
CREATE OR REPLACE FUNCTION get_daily_sales(
  p_location_id VARCHAR(100),
  p_date DATE DEFAULT CURRENT_DATE
)
RETURNS TABLE (
  total_sales_cents BIGINT,
  transaction_count BIGINT,
  avg_transaction_cents NUMERIC,
  card_sales_cents BIGINT,
  cash_sales_cents BIGINT,
  qr_sales_cents BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    SUM(amount_cents) as total_sales_cents,
    COUNT(*) as transaction_count,
    AVG(amount_cents) as avg_transaction_cents,
    SUM(CASE WHEN payment_method = 'card' THEN amount_cents ELSE 0 END) as card_sales_cents,
    SUM(CASE WHEN payment_method = 'cash' THEN amount_cents ELSE 0 END) as cash_sales_cents,
    SUM(CASE WHEN payment_method = 'qr' THEN amount_cents ELSE 0 END) as qr_sales_cents
  FROM pos_transactions
  WHERE location_id = p_location_id
    AND DATE(created_at) = p_date
    AND status = 'completed';
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_daily_sales IS 'Get daily sales summary for location';

-- ============================================================================
-- SEED DATA / DEFAULTS
-- ============================================================================

-- None needed - this is a user-driven system


