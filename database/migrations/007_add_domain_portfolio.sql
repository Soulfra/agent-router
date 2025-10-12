-- Domain Portfolio & Trademark Rotation System
-- For: Matthew Mauer's 12-domain network

-- ============================================================================
-- DOMAIN PORTFOLIO TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS domain_portfolio (
  domain_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  domain_name VARCHAR(255) UNIQUE NOT NULL,

  -- WHOIS Information
  registrar VARCHAR(255),
  registration_date DATE,
  expiry_date DATE,
  nameservers TEXT[],

  -- Owner Information (transparent, not hidden)
  owner_name VARCHAR(255) DEFAULT 'Matthew Mauer',
  owner_email VARCHAR(255),
  owner_github VARCHAR(255) DEFAULT 'matthewmauer',

  -- Brand Information
  brand_name VARCHAR(255),
  brand_tagline TEXT,
  brand_description TEXT,
  logo_url TEXT,
  primary_color VARCHAR(7),
  secondary_color VARCHAR(7),

  -- Categorization (from RADI system)
  category VARCHAR(50), -- 'creative', 'business', 'technical', 'interactive', 'social', 'visual'
  primary_radi VARCHAR(50),
  secondary_radi TEXT[],

  -- Services/Features
  services TEXT[],
  keywords TEXT[],

  -- Status
  status VARCHAR(50) DEFAULT 'active', -- 'active', 'coming_soon', 'archived'
  interfaces_count INT DEFAULT 0,

  -- SEO & Analytics
  monthly_visitors INT DEFAULT 0,
  conversion_rate DECIMAL(5,2) DEFAULT 0.00,
  avg_session_duration INT DEFAULT 0, -- seconds

  -- Metadata
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  last_whois_check TIMESTAMP
);

-- ============================================================================
-- TRADEMARK INFORMATION TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS trademark_info (
  trademark_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  domain_id UUID REFERENCES domain_portfolio(domain_id) ON DELETE CASCADE,

  trademark_name VARCHAR(255) NOT NULL,
  trademark_symbol VARCHAR(10), -- '™', '®', '℠'
  registration_number VARCHAR(100),
  registration_date DATE,
  expiry_date DATE,
  trademark_class VARCHAR(100), -- e.g., "Class 9: Computer software"
  jurisdiction VARCHAR(100), -- 'US', 'EU', 'International'

  description TEXT,
  status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'registered', 'expired'

  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- ============================================================================
-- PARTNER ROTATIONS TABLE
-- Tracks which partners are shown on which domains
-- ============================================================================
CREATE TABLE IF NOT EXISTS partner_rotations (
  rotation_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_domain_id UUID REFERENCES domain_portfolio(domain_id) ON DELETE CASCADE,
  displayed_partner_ids UUID[] NOT NULL,

  -- Rotation metadata
  rotation_strategy VARCHAR(50) DEFAULT 'weighted', -- 'random', 'weighted', 'category_match', 'least_shown'
  display_count INT DEFAULT 0,
  last_rotated_at TIMESTAMP DEFAULT NOW(),

  -- Analytics
  total_impressions INT DEFAULT 0,
  total_clicks INT DEFAULT 0,
  click_through_rate DECIMAL(5,2) DEFAULT 0.00,

  created_at TIMESTAMP DEFAULT NOW()
);

-- ============================================================================
-- PARTNER CLICK TRACKING
-- Track individual partner clicks for analytics
-- ============================================================================
CREATE TABLE IF NOT EXISTS partner_clicks (
  click_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_domain_id UUID REFERENCES domain_portfolio(domain_id),
  target_domain_id UUID REFERENCES domain_portfolio(domain_id),

  -- Session information (privacy-preserving)
  session_id UUID, -- Anonymous session ID
  referrer TEXT,

  -- Analytics
  clicked_at TIMESTAMP DEFAULT NOW(),
  converted BOOLEAN DEFAULT FALSE, -- Did they sign up/purchase?
  conversion_value DECIMAL(10,2) DEFAULT 0.00
);

-- ============================================================================
-- KEYWORD TRACKING FOR ADWORDS
-- Track keywords for cheap SLD strategies
-- ============================================================================
CREATE TABLE IF NOT EXISTS keyword_tracking (
  keyword_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  keyword VARCHAR(255) UNIQUE NOT NULL,

  -- Associated domains
  primary_domain_id UUID REFERENCES domain_portfolio(domain_id),
  related_domain_ids UUID[],

  -- Performance metrics
  search_volume INT DEFAULT 0,
  competition_level VARCHAR(20), -- 'low', 'medium', 'high'
  suggested_bid DECIMAL(10,2), -- CPC in USD

  -- Conversion data
  total_mentions INT DEFAULT 0,
  total_conversions INT DEFAULT 0,
  conversion_rate DECIMAL(5,2) DEFAULT 0.00,
  cost_per_conversion DECIMAL(10,2),

  -- AdWords data
  quality_score INT, -- 1-10
  impressions INT DEFAULT 0,
  clicks INT DEFAULT 0,
  cost_spent DECIMAL(10,2) DEFAULT 0.00,

  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- ============================================================================
-- CROSS-DOMAIN ANALYTICS
-- Track user journeys across the portfolio
-- ============================================================================
CREATE TABLE IF NOT EXISTS cross_domain_analytics (
  event_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL, -- Anonymous session across domains

  -- Event details
  event_type VARCHAR(50), -- 'visit', 'partner_click', 'conversion', 'signup', 'purchase'
  source_domain_id UUID REFERENCES domain_portfolio(domain_id),
  target_domain_id UUID REFERENCES domain_portfolio(domain_id),

  -- UTM parameters
  utm_source VARCHAR(255),
  utm_medium VARCHAR(255),
  utm_campaign VARCHAR(255),
  utm_content VARCHAR(255),

  -- Conversion tracking
  conversion_type VARCHAR(50), -- 'signup', 'purchase', 'trial', 'contact'
  conversion_value DECIMAL(10,2),

  -- Metadata
  user_agent TEXT,
  referrer TEXT,
  page_path TEXT,

  timestamp TIMESTAMP DEFAULT NOW()
);

-- ============================================================================
-- INDEXES FOR PERFORMANCE
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_domain_portfolio_status ON domain_portfolio(status);
CREATE INDEX IF NOT EXISTS idx_domain_portfolio_category ON domain_portfolio(category);
CREATE INDEX IF NOT EXISTS idx_partner_rotations_source ON partner_rotations(source_domain_id);
CREATE INDEX IF NOT EXISTS idx_partner_clicks_source ON partner_clicks(source_domain_id);
CREATE INDEX IF NOT EXISTS idx_partner_clicks_target ON partner_clicks(target_domain_id);
CREATE INDEX IF NOT EXISTS idx_partner_clicks_session ON partner_clicks(session_id);
CREATE INDEX IF NOT EXISTS idx_keyword_tracking_keyword ON keyword_tracking(keyword);
CREATE INDEX IF NOT EXISTS idx_cross_domain_session ON cross_domain_analytics(session_id);
CREATE INDEX IF NOT EXISTS idx_cross_domain_source ON cross_domain_analytics(source_domain_id);
CREATE INDEX IF NOT EXISTS idx_cross_domain_timestamp ON cross_domain_analytics(timestamp);

-- ============================================================================
-- VIEWS FOR COMMON QUERIES
-- ============================================================================

-- Active domains with brand info
CREATE OR REPLACE VIEW active_domains AS
SELECT
  domain_id,
  domain_name,
  brand_name,
  brand_tagline,
  logo_url,
  primary_color,
  category,
  primary_radi,
  services,
  interfaces_count,
  monthly_visitors
FROM domain_portfolio
WHERE status = 'active'
ORDER BY monthly_visitors DESC;

-- Partner performance summary
CREATE OR REPLACE VIEW partner_performance AS
SELECT
  dp.domain_id,
  dp.domain_name,
  COUNT(DISTINCT pc.click_id) as total_clicks_received,
  COUNT(DISTINCT pc.source_domain_id) as unique_sources,
  AVG(pc.conversion_value) as avg_conversion_value,
  SUM(CASE WHEN pc.converted THEN 1 ELSE 0 END) as total_conversions
FROM domain_portfolio dp
LEFT JOIN partner_clicks pc ON pc.target_domain_id = dp.domain_id
WHERE dp.status = 'active'
GROUP BY dp.domain_id, dp.domain_name
ORDER BY total_clicks_received DESC;

-- Keyword performance for AdWords
CREATE OR REPLACE VIEW keyword_performance AS
SELECT
  k.keyword,
  k.search_volume,
  k.competition_level,
  k.suggested_bid,
  k.quality_score,
  k.clicks,
  k.impressions,
  CASE
    WHEN k.impressions > 0 THEN ROUND((k.clicks::DECIMAL / k.impressions) * 100, 2)
    ELSE 0
  END as ctr_percentage,
  k.cost_spent,
  CASE
    WHEN k.clicks > 0 THEN ROUND(k.cost_spent / k.clicks, 2)
    ELSE 0
  END as actual_cpc,
  k.total_conversions,
  k.cost_per_conversion,
  dp.domain_name as primary_domain
FROM keyword_tracking k
LEFT JOIN domain_portfolio dp ON k.primary_domain_id = dp.domain_id
ORDER BY k.quality_score DESC, k.clicks DESC;

-- Cross-domain conversion funnel
CREATE OR REPLACE VIEW conversion_funnel AS
SELECT
  session_id,
  MIN(timestamp) as first_touch,
  MAX(timestamp) as last_touch,
  EXTRACT(EPOCH FROM (MAX(timestamp) - MIN(timestamp))) as session_duration_seconds,
  COUNT(*) as total_events,
  COUNT(DISTINCT source_domain_id) as domains_visited,
  MAX(CASE WHEN event_type IN ('signup', 'purchase') THEN 1 ELSE 0 END) as converted,
  SUM(conversion_value) as total_value
FROM cross_domain_analytics
GROUP BY session_id
ORDER BY first_touch DESC;

-- ============================================================================
-- SEED DATA: Matthew Mauer's 12 Domains
-- ============================================================================
INSERT INTO domain_portfolio (
  domain_name, brand_name, brand_tagline, category, primary_radi,
  secondary_radi, services, status, interfaces_count
) VALUES
  ('soulfra.com', 'Soulfra', 'AI-powered creative collaboration', 'creative', 'creative',
   ARRAY['interactive', 'social'], ARRAY['auth', 'gaming', 'creative-tools'], 'active', 150),

  ('deathtodata.com', 'DeathToData', 'Search where YOU get paid. Not Google.', 'interactive', 'interactive',
   ARRAY['technical', 'creative'], ARRAY['gaming', 'tutorials', 'code-adventures'], 'active', 45),

  ('finishthisidea.com', 'FinishThisIdea', 'Complete your projects, finally', 'business', 'business',
   ARRAY['technical', 'creative'], ARRAY['project-completion', 'productivity', 'collaboration'], 'active', 200),

  ('dealordelete.com', 'DealOrDelete', 'Decide faster, regret never', 'business', 'business',
   ARRAY['visual', 'interactive'], ARRAY['decision-making', 'optimization'], 'active', 80),

  ('saveorsink.com', 'SaveOrSink', 'Rescue failing systems', 'technical', 'technical',
   ARRAY['business'], ARRAY['system-rescue', 'recovery'], 'active', 35),

  ('cringeproof.com', 'CringeProof', 'Communicate without regret', 'social', 'social',
   ARRAY['visual', 'creative'], ARRAY['social-optimization', 'communication'], 'active', 25),

  ('finishthisrepo.com', 'FinishThisRepo', 'Complete your code, ship your project', 'technical', 'technical',
   ARRAY['business'], ARRAY['code-completion', 'development'], 'active', 60),

  ('ipomyagent.com', 'IPOMyAgent', 'Monetize your AI agents', 'business', 'business',
   ARRAY['social', 'technical'], ARRAY['ai-agents', 'monetization'], 'active', 40),

  ('hollowtown.com', 'HollowTown', 'Immersive virtual experiences', 'interactive', 'interactive',
   ARRAY['creative', 'visual'], ARRAY['gaming', 'virtual-experiences'], 'active', 90),

  ('hookclinic.com', 'HookClinic', 'Write hooks that convert', 'creative', 'creative',
   ARRAY['business', 'social'], ARRAY['content-creation', 'engagement'], 'active', 30),

  ('businessaiclassroom.com', 'Business AI Classroom', 'Learn AI for business', 'business', 'business',
   ARRAY['technical', 'social'], ARRAY['education', 'training'], 'active', 50),

  ('roughsparks.com', 'RoughSparks', 'Creative collaboration for music', 'creative', 'creative',
   ARRAY['visual', 'social'], ARRAY['music-production', 'creative-collaboration'], 'coming_soon', 0)
ON CONFLICT (domain_name) DO NOTHING;

-- ============================================================================
-- FUNCTIONS FOR ROTATION LOGIC
-- ============================================================================

-- Function to get partner suggestions for a domain
CREATE OR REPLACE FUNCTION get_partner_suggestions(
  p_source_domain_id UUID,
  p_count INT DEFAULT 4
)
RETURNS TABLE (
  domain_id UUID,
  domain_name VARCHAR,
  brand_name VARCHAR,
  logo_url TEXT,
  primary_color VARCHAR,
  relevance_score DECIMAL
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    dp.domain_id,
    dp.domain_name,
    dp.brand_name,
    dp.logo_url,
    dp.primary_color,
    -- Relevance score based on category match and least recently shown
    (
      CASE WHEN dp.category = (SELECT category FROM domain_portfolio WHERE domain_id = p_source_domain_id) THEN 0.5 ELSE 0.0 END +
      CASE WHEN dp.primary_radi = (SELECT primary_radi FROM domain_portfolio WHERE domain_id = p_source_domain_id) THEN 0.3 ELSE 0.0 END +
      (1.0 / (COALESCE((SELECT COUNT(*) FROM partner_clicks WHERE target_domain_id = dp.domain_id), 0) + 1))
    )::DECIMAL(5,2) as relevance_score
  FROM domain_portfolio dp
  WHERE dp.status = 'active'
    AND dp.domain_id != p_source_domain_id
  ORDER BY relevance_score DESC, RANDOM()
  LIMIT p_count;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- TRIGGERS FOR AUTOMATIC UPDATES
-- ============================================================================

-- Update timestamp on domain portfolio changes
CREATE OR REPLACE FUNCTION update_domain_portfolio_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER domain_portfolio_update_trigger
BEFORE UPDATE ON domain_portfolio
FOR EACH ROW
EXECUTE FUNCTION update_domain_portfolio_timestamp();

-- ============================================================================
-- COMMENTS FOR DOCUMENTATION
-- ============================================================================
COMMENT ON TABLE domain_portfolio IS 'Matthew Mauer portfolio of 12 domains with WHOIS and brand information';
COMMENT ON TABLE trademark_info IS 'Trademark registrations for domain brands';
COMMENT ON TABLE partner_rotations IS 'Tracks which partner domains are displayed on each site';
COMMENT ON TABLE partner_clicks IS 'Analytics for partner link clicks and conversions';
COMMENT ON TABLE keyword_tracking IS 'Keyword performance for AdWords optimization';
COMMENT ON TABLE cross_domain_analytics IS 'User journey tracking across the entire portfolio';
