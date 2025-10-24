-- Migration 079: Theme & Plugin Marketplace
-- WordPress-style marketplace for CALOS ecosystem
--
-- Purpose:
-- - Theme marketplace (visual themes, automation, context profiles, plugins)
-- - Plugin manager (install, update, rate, review)
-- - Revenue sharing (70% creator, 30% platform)
-- - Self-hosted + hosted model
--
-- Revenue Model:
-- - Free themes: Creator gets exposure, we get contribution (MIT license)
-- - Paid themes: 70% creator, 30% us
-- - Pro/Enterprise plans: $29-99/month
--
-- Contribution Model:
-- - Self-hosters can submit themes (moderation queue)
-- - Contributors get credit + reputation
-- - Popular free themes → Featured on marketplace

-- ============================================================================
-- MARKETPLACE THEMES
-- ============================================================================

CREATE TABLE IF NOT EXISTS marketplace_themes (
  theme_id VARCHAR(100) PRIMARY KEY,

  -- Basic info
  name TEXT NOT NULL,
  slug VARCHAR(255) NOT NULL UNIQUE,
  description TEXT NOT NULL,
  long_description TEXT,
  category VARCHAR(50) NOT NULL,     -- 'visual', 'automation', 'context', 'plugin'

  -- Version management
  version VARCHAR(50) NOT NULL,      -- Semantic versioning (e.g., '1.2.3')
  changelog TEXT,

  -- Author
  author_id UUID REFERENCES users(user_id) ON DELETE SET NULL,
  author_name TEXT NOT NULL,

  -- Pricing
  price_cents INTEGER DEFAULT 0,
  currency VARCHAR(10) DEFAULT 'USD',
  is_free BOOLEAN DEFAULT true,

  -- Metadata
  tags JSONB DEFAULT '[]',           -- ['dark-mode', 'minimal', 'enterprise']
  screenshot_url TEXT,
  screenshots JSONB DEFAULT '[]',    -- Array of screenshot URLs
  demo_url TEXT,
  repo_url TEXT,
  documentation TEXT,                -- Markdown documentation
  dependencies JSONB DEFAULT '{}',   -- { "calos-core": ">=1.0.0", "node": ">=18" }
  license VARCHAR(50) DEFAULT 'MIT',
  theme_manifest JSONB NOT NULL,     -- Full theme configuration (colors, fonts, layout, etc.)

  -- Stats
  downloads INTEGER DEFAULT 0,
  rating_avg NUMERIC(3,2) DEFAULT 0.0,
  rating_count INTEGER DEFAULT 0,
  featured BOOLEAN DEFAULT false,

  -- Status
  status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'published', 'rejected', 'archived'
  rejection_reason TEXT,
  submitted_at TIMESTAMP,
  published_at TIMESTAMP,

  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_marketplace_themes_slug
  ON marketplace_themes(slug);

CREATE INDEX IF NOT EXISTS idx_marketplace_themes_author_id
  ON marketplace_themes(author_id);

CREATE INDEX IF NOT EXISTS idx_marketplace_themes_category
  ON marketplace_themes(category);

CREATE INDEX IF NOT EXISTS idx_marketplace_themes_status
  ON marketplace_themes(status);

CREATE INDEX IF NOT EXISTS idx_marketplace_themes_featured
  ON marketplace_themes(featured)
  WHERE featured = true;

CREATE INDEX IF NOT EXISTS idx_marketplace_themes_downloads
  ON marketplace_themes(downloads DESC);

CREATE INDEX IF NOT EXISTS idx_marketplace_themes_rating
  ON marketplace_themes(rating_avg DESC, rating_count DESC);

COMMENT ON TABLE marketplace_themes IS 'Marketplace themes (visual, automation, context, plugins)';
COMMENT ON COLUMN marketplace_themes.category IS 'Theme category: visual, automation, context, plugin';
COMMENT ON COLUMN marketplace_themes.theme_manifest IS 'Full theme configuration (JSON)';
COMMENT ON COLUMN marketplace_themes.status IS 'Moderation status: pending, published, rejected, archived';

-- ============================================================================
-- MARKETPLACE INSTALLATIONS
-- ============================================================================

CREATE TABLE IF NOT EXISTS marketplace_installations (
  installation_id VARCHAR(100) PRIMARY KEY,

  -- User & theme
  user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  theme_id VARCHAR(100) NOT NULL REFERENCES marketplace_themes(theme_id) ON DELETE CASCADE,

  -- Version installed
  version VARCHAR(50) NOT NULL,

  -- Status
  status VARCHAR(50) DEFAULT 'active', -- 'active', 'inactive', 'uninstalled'

  -- Timestamps
  installed_at TIMESTAMP DEFAULT NOW(),
  uninstalled_at TIMESTAMP,
  updated_at TIMESTAMP DEFAULT NOW(),

  -- Unique constraint (one installation per user per theme)
  UNIQUE(user_id, theme_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_marketplace_installs_user_id
  ON marketplace_installations(user_id);

CREATE INDEX IF NOT EXISTS idx_marketplace_installs_theme_id
  ON marketplace_installations(theme_id);

CREATE INDEX IF NOT EXISTS idx_marketplace_installs_status
  ON marketplace_installations(status);

COMMENT ON TABLE marketplace_installations IS 'Installed themes per user';
COMMENT ON COLUMN marketplace_installations.status IS 'Installation status: active, inactive, uninstalled';

-- ============================================================================
-- MARKETPLACE REVIEWS
-- ============================================================================

CREATE TABLE IF NOT EXISTS marketplace_reviews (
  review_id VARCHAR(100) PRIMARY KEY,

  -- Theme & user
  theme_id VARCHAR(100) NOT NULL REFERENCES marketplace_themes(theme_id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,

  -- Review
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  review_text TEXT,

  -- Moderation
  flagged BOOLEAN DEFAULT false,
  flag_reason TEXT,

  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),

  -- Unique constraint (one review per user per theme)
  UNIQUE(theme_id, user_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_marketplace_reviews_theme_id
  ON marketplace_reviews(theme_id);

CREATE INDEX IF NOT EXISTS idx_marketplace_reviews_user_id
  ON marketplace_reviews(user_id);

CREATE INDEX IF NOT EXISTS idx_marketplace_reviews_flagged
  ON marketplace_reviews(flagged)
  WHERE flagged = true;

COMMENT ON TABLE marketplace_reviews IS 'User reviews and ratings for themes';
COMMENT ON COLUMN marketplace_reviews.rating IS 'Rating from 1 to 5 stars';

-- ============================================================================
-- MARKETPLACE PURCHASES
-- ============================================================================

CREATE TABLE IF NOT EXISTS marketplace_purchases (
  purchase_id VARCHAR(100) PRIMARY KEY,

  -- Buyer & theme
  user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  theme_id VARCHAR(100) NOT NULL REFERENCES marketplace_themes(theme_id) ON DELETE CASCADE,

  -- Pricing
  price_cents INTEGER NOT NULL,
  currency VARCHAR(10) DEFAULT 'USD',

  -- Revenue split (for reporting)
  creator_revenue_cents INTEGER NOT NULL,   -- 70% to creator
  platform_revenue_cents INTEGER NOT NULL,  -- 30% to platform

  -- Payment
  payment_intent_id VARCHAR(255),           -- Stripe Payment Intent ID
  payment_status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'completed', 'failed', 'refunded'

  -- Status
  status VARCHAR(50) DEFAULT 'pending',     -- 'pending', 'completed', 'failed', 'refunded'
  refund_id VARCHAR(255),
  refunded_at TIMESTAMP,

  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_marketplace_purchases_user_id
  ON marketplace_purchases(user_id);

CREATE INDEX IF NOT EXISTS idx_marketplace_purchases_theme_id
  ON marketplace_purchases(theme_id);

CREATE INDEX IF NOT EXISTS idx_marketplace_purchases_status
  ON marketplace_purchases(status);

CREATE INDEX IF NOT EXISTS idx_marketplace_purchases_payment_intent
  ON marketplace_purchases(payment_intent_id)
  WHERE payment_intent_id IS NOT NULL;

COMMENT ON TABLE marketplace_purchases IS 'Paid theme purchases';
COMMENT ON COLUMN marketplace_purchases.creator_revenue_cents IS '70% of sale goes to creator';
COMMENT ON COLUMN marketplace_purchases.platform_revenue_cents IS '30% of sale goes to platform';

-- ============================================================================
-- MARKETPLACE PAYOUTS (for creators)
-- ============================================================================

CREATE TABLE IF NOT EXISTS marketplace_payouts (
  payout_id VARCHAR(100) PRIMARY KEY,

  -- Creator
  creator_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,

  -- Payout details
  amount_cents INTEGER NOT NULL,
  currency VARCHAR(10) DEFAULT 'USD',

  -- Period
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,

  -- Payment method
  payout_method VARCHAR(50) DEFAULT 'stripe', -- 'stripe', 'paypal', 'bank_transfer'
  payout_account_id VARCHAR(255),             -- Stripe Connect account ID

  -- Status
  status VARCHAR(50) DEFAULT 'pending',       -- 'pending', 'processing', 'completed', 'failed'
  completed_at TIMESTAMP,
  failed_reason TEXT,

  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_marketplace_payouts_creator_id
  ON marketplace_payouts(creator_id);

CREATE INDEX IF NOT EXISTS idx_marketplace_payouts_status
  ON marketplace_payouts(status);

CREATE INDEX IF NOT EXISTS idx_marketplace_payouts_period
  ON marketplace_payouts(period_start, period_end);

COMMENT ON TABLE marketplace_payouts IS 'Payouts to theme creators (70% revenue share)';
COMMENT ON COLUMN marketplace_payouts.payout_method IS 'Payment method: stripe, paypal, bank_transfer';

-- ============================================================================
-- MARKETPLACE ANALYTICS
-- ============================================================================

CREATE TABLE IF NOT EXISTS marketplace_analytics (
  analytics_id SERIAL PRIMARY KEY,

  -- Theme
  theme_id VARCHAR(100) NOT NULL REFERENCES marketplace_themes(theme_id) ON DELETE CASCADE,

  -- Event
  event_type VARCHAR(50) NOT NULL,   -- 'view', 'download', 'install', 'uninstall', 'purchase'
  user_id UUID REFERENCES users(user_id) ON DELETE SET NULL,

  -- Context
  user_agent TEXT,
  ip_address VARCHAR(50),
  country VARCHAR(10),

  -- Timestamp
  created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_marketplace_analytics_theme_id
  ON marketplace_analytics(theme_id);

CREATE INDEX IF NOT EXISTS idx_marketplace_analytics_event_type
  ON marketplace_analytics(event_type);

CREATE INDEX IF NOT EXISTS idx_marketplace_analytics_created_at
  ON marketplace_analytics(created_at DESC);

COMMENT ON TABLE marketplace_analytics IS 'Analytics for marketplace themes (views, downloads, installs)';
COMMENT ON COLUMN marketplace_analytics.event_type IS 'Event type: view, download, install, uninstall, purchase';

-- ============================================================================
-- FUNCTIONS
-- ============================================================================

/**
 * Update theme rating when review is added/updated
 */
CREATE OR REPLACE FUNCTION update_theme_rating()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE marketplace_themes
  SET
    rating_avg = (
      SELECT AVG(rating)
      FROM marketplace_reviews
      WHERE theme_id = COALESCE(NEW.theme_id, OLD.theme_id)
    ),
    rating_count = (
      SELECT COUNT(*)
      FROM marketplace_reviews
      WHERE theme_id = COALESCE(NEW.theme_id, OLD.theme_id)
    )
  WHERE theme_id = COALESCE(NEW.theme_id, OLD.theme_id);

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_theme_rating ON marketplace_reviews;
CREATE TRIGGER trigger_update_theme_rating
  AFTER INSERT OR UPDATE OR DELETE ON marketplace_reviews
  FOR EACH ROW
  EXECUTE FUNCTION update_theme_rating();

COMMENT ON FUNCTION update_theme_rating IS 'Auto-update theme rating average when reviews change';

/**
 * Track theme view analytics
 */
CREATE OR REPLACE FUNCTION track_theme_view(
  p_theme_id VARCHAR(100),
  p_user_id UUID DEFAULT NULL,
  p_user_agent TEXT DEFAULT NULL,
  p_ip_address VARCHAR(50) DEFAULT NULL
)
RETURNS VOID AS $$
BEGIN
  INSERT INTO marketplace_analytics (
    theme_id,
    event_type,
    user_id,
    user_agent,
    ip_address
  ) VALUES (
    p_theme_id,
    'view',
    p_user_id,
    p_user_agent,
    p_ip_address
  );
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION track_theme_view IS 'Track when user views a theme';

/**
 * Get creator earnings summary
 */
CREATE OR REPLACE FUNCTION get_creator_earnings(
  p_creator_id UUID,
  p_start_date TIMESTAMP DEFAULT NOW() - INTERVAL '30 days',
  p_end_date TIMESTAMP DEFAULT NOW()
)
RETURNS TABLE (
  total_sales INTEGER,
  total_revenue_cents BIGINT,
  creator_revenue_cents BIGINT,
  platform_revenue_cents BIGINT,
  pending_payout_cents BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*)::INTEGER as total_sales,
    SUM(p.price_cents) as total_revenue_cents,
    SUM(p.creator_revenue_cents) as creator_revenue_cents,
    SUM(p.platform_revenue_cents) as platform_revenue_cents,
    (
      SELECT COALESCE(SUM(creator_revenue_cents), 0)
      FROM marketplace_purchases
      WHERE theme_id IN (
        SELECT theme_id FROM marketplace_themes WHERE author_id = p_creator_id
      )
        AND status = 'completed'
        AND purchase_id NOT IN (
          SELECT purchase_id FROM marketplace_payouts WHERE creator_id = p_creator_id AND status = 'completed'
        )
    ) as pending_payout_cents
  FROM marketplace_purchases p
  JOIN marketplace_themes t ON p.theme_id = t.theme_id
  WHERE t.author_id = p_creator_id
    AND p.status = 'completed'
    AND p.created_at >= p_start_date
    AND p.created_at <= p_end_date;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_creator_earnings IS 'Get creator earnings summary (total sales, revenue, pending payout)';

/**
 * Get top themes by downloads
 */
CREATE OR REPLACE FUNCTION get_top_themes(
  p_limit INTEGER DEFAULT 10,
  p_category VARCHAR(50) DEFAULT NULL
)
RETURNS TABLE (
  theme_id VARCHAR(100),
  name TEXT,
  slug VARCHAR(255),
  category VARCHAR(50),
  downloads INTEGER,
  rating_avg NUMERIC(3,2),
  price_cents INTEGER,
  is_free BOOLEAN
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    t.theme_id,
    t.name,
    t.slug,
    t.category,
    t.downloads,
    t.rating_avg,
    t.price_cents,
    t.is_free
  FROM marketplace_themes t
  WHERE t.status = 'published'
    AND (p_category IS NULL OR t.category = p_category)
  ORDER BY t.downloads DESC, t.rating_avg DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_top_themes IS 'Get top themes by downloads (optionally filtered by category)';

-- ============================================================================
-- SEED DATA / DEFAULTS
-- ============================================================================

-- Official CALOS themes (featured)
INSERT INTO marketplace_themes (
  theme_id,
  name,
  slug,
  description,
  long_description,
  category,
  version,
  author_id,
  author_name,
  is_free,
  featured,
  status,
  theme_manifest,
  downloads,
  rating_avg,
  rating_count,
  published_at
) VALUES
(
  'theme_official_light',
  'CALOS Light',
  'calos-light',
  'Clean, modern light theme for CALOS',
  'The official light theme for CALOS. Features a clean, minimal design with excellent readability.',
  'visual',
  '1.0.0',
  NULL,
  'CALOS Official',
  true,
  true,
  'published',
  '{"colors": {"primary": "#007bff", "background": "#ffffff", "text": "#212529"}}',
  1250,
  4.8,
  156,
  NOW()
),
(
  'theme_official_dark',
  'CALOS Dark',
  'calos-dark',
  'Modern dark theme with blue accents',
  'The official dark theme for CALOS. Perfect for late-night coding sessions.',
  'visual',
  '1.0.0',
  NULL,
  'CALOS Official',
  true,
  true,
  'published',
  '{"colors": {"primary": "#0d6efd", "background": "#1a1a1a", "text": "#e0e0e0"}}',
  3420,
  4.9,
  287,
  NOW()
),
(
  'theme_official_hc',
  'CALOS High Contrast',
  'calos-high-contrast',
  'Accessibility-focused high contrast theme',
  'High contrast theme optimized for accessibility. Meets WCAG AAA standards.',
  'visual',
  '1.0.0',
  NULL,
  'CALOS Official',
  true,
  true,
  'published',
  '{"colors": {"primary": "#ffff00", "background": "#000000", "text": "#ffffff"}}',
  567,
  4.7,
  89,
  NOW()
);


