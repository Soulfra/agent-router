-- Migration 146: SEO Tracking System
-- Track keyword rankings, backlinks, and dragon keywords for long-term SEO

-- SEO Keywords Table
-- Tracks keyword positions over time for trend analysis
CREATE TABLE IF NOT EXISTS seo_keywords (
  id SERIAL PRIMARY KEY,
  keyword VARCHAR(255) NOT NULL,
  domain VARCHAR(255) NOT NULL,
  position INTEGER,
  volume INTEGER DEFAULT 0,
  difficulty INTEGER DEFAULT 0,
  cpc DECIMAL(10, 2) DEFAULT 0.00,
  traffic INTEGER DEFAULT 0,
  url TEXT,
  tracked_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  INDEX idx_keyword (keyword),
  INDEX idx_domain (domain),
  INDEX idx_tracked_at (tracked_at)
);

-- SEO Backlinks Table
-- Monitors backlinks to legal documentation and case law citations
CREATE TABLE IF NOT EXISTS seo_backlinks (
  id SERIAL PRIMARY KEY,
  url_from TEXT NOT NULL,
  url_to TEXT NOT NULL,
  anchor TEXT,
  domain_rating INTEGER DEFAULT 0,
  traffic INTEGER DEFAULT 0,
  first_seen TIMESTAMP WITH TIME ZONE,
  last_seen TIMESTAMP WITH TIME ZONE,
  tracked_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  UNIQUE (url_from, url_to),
  INDEX idx_url_to (url_to),
  INDEX idx_domain_rating (domain_rating)
);

-- Dragon Keywords View
-- High-difficulty (60+), high-volume (1000+) keywords worth targeting
CREATE OR REPLACE VIEW dragon_keywords AS
SELECT
  keyword,
  domain,
  AVG(position) as avg_position,
  MAX(volume) as volume,
  MAX(difficulty) as difficulty,
  MAX(cpc) as cpc,
  COUNT(*) as tracking_count,
  MAX(tracked_at) as last_tracked,
  -- Potential value = volume * CPC * CTR difference between current position and #1
  CASE
    WHEN AVG(position) IS NULL THEN MAX(volume) * MAX(cpc) * 0.285 -- Not ranking, potential = volume * CPC * 28.5% CTR
    WHEN AVG(position) <= 1 THEN 0 -- Already #1, no potential gain
    ELSE MAX(volume) * MAX(cpc) * (0.285 -
      CASE
        WHEN AVG(position) <= 10 THEN
          CASE FLOOR(AVG(position))
            WHEN 2 THEN 0.152
            WHEN 3 THEN 0.098
            WHEN 4 THEN 0.069
            WHEN 5 THEN 0.052
            WHEN 6 THEN 0.041
            WHEN 7 THEN 0.034
            WHEN 8 THEN 0.029
            WHEN 9 THEN 0.025
            WHEN 10 THEN 0.022
            ELSE 0.01
          END
        WHEN AVG(position) <= 20 THEN 0.01
        ELSE 0.005
      END
    )
  END as potential_value
FROM seo_keywords
WHERE difficulty >= 60
  AND volume >= 1000
GROUP BY keyword, domain
ORDER BY potential_value DESC, difficulty DESC;

-- Keyword Ranking Trends Function
-- Get keyword position history over time
CREATE OR REPLACE FUNCTION get_keyword_trend(
  p_keyword VARCHAR(255),
  p_domain VARCHAR(255),
  p_days INTEGER DEFAULT 30
)
RETURNS TABLE (
  date DATE,
  position INTEGER,
  volume INTEGER,
  traffic INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    DATE(tracked_at) as date,
    AVG(position)::INTEGER as position,
    MAX(volume)::INTEGER as volume,
    SUM(traffic)::INTEGER as traffic
  FROM seo_keywords
  WHERE keyword = p_keyword
    AND domain = p_domain
    AND tracked_at >= NOW() - (p_days || ' days')::INTERVAL
  GROUP BY DATE(tracked_at)
  ORDER BY date DESC;
END;
$$ LANGUAGE plpgsql;

-- Alert on Ranking Drops Function
-- Returns keywords that dropped >5 positions in last 7 days
CREATE OR REPLACE FUNCTION get_ranking_drops(
  p_domain VARCHAR(255),
  p_threshold INTEGER DEFAULT 5
)
RETURNS TABLE (
  keyword VARCHAR(255),
  old_position INTEGER,
  new_position INTEGER,
  drop INTEGER,
  volume INTEGER,
  potential_loss DECIMAL(10, 2)
) AS $$
BEGIN
  RETURN QUERY
  WITH recent_positions AS (
    SELECT
      k.keyword,
      k.position,
      k.volume,
      k.cpc,
      k.tracked_at,
      LAG(k.position) OVER (PARTITION BY k.keyword ORDER BY k.tracked_at DESC) as prev_position
    FROM seo_keywords k
    WHERE k.domain = p_domain
      AND k.tracked_at >= NOW() - '7 days'::INTERVAL
  )
  SELECT
    rp.keyword,
    rp.prev_position::INTEGER as old_position,
    rp.position::INTEGER as new_position,
    (rp.position - rp.prev_position)::INTEGER as drop,
    rp.volume::INTEGER,
    (rp.volume * rp.cpc * 0.01 * (rp.position - rp.prev_position))::DECIMAL(10, 2) as potential_loss
  FROM recent_positions rp
  WHERE rp.prev_position IS NOT NULL
    AND (rp.position - rp.prev_position) >= p_threshold
  ORDER BY drop DESC, volume DESC;
END;
$$ LANGUAGE plpgsql;

-- Case Law Citation Backlinks View
-- Filter backlinks specifically to legal documentation
CREATE OR REPLACE VIEW case_law_backlinks AS
SELECT
  id,
  url_from,
  url_to,
  anchor,
  domain_rating,
  traffic,
  first_seen,
  last_seen,
  CASE
    WHEN url_to LIKE '%case-law.html%' THEN 'Case Law Database'
    WHEN url_to LIKE '%terms-of-service%' THEN 'Terms of Service'
    WHEN url_to LIKE '%privacy-policy%' THEN 'Privacy Policy'
    WHEN url_to LIKE '%terms-crypto%' THEN 'Crypto Terms'
    WHEN url_to LIKE '%terms-finance%' THEN 'Finance Terms'
    WHEN url_to LIKE '%terms-healthcare%' THEN 'Healthcare Terms'
    WHEN url_to LIKE '%terms-legal%' THEN 'Legal Services Terms'
    WHEN url_to LIKE '%terms-education%' THEN 'Education Terms'
    ELSE 'Other Legal Docs'
  END as doc_type
FROM seo_backlinks
WHERE url_to LIKE '%case-law%'
  OR url_to LIKE '%terms-%'
  OR url_to LIKE '%privacy%'
ORDER BY domain_rating DESC, traffic DESC;

COMMENT ON TABLE seo_keywords IS 'Tracks keyword rankings over time for SEO analysis';
COMMENT ON TABLE seo_backlinks IS 'Monitors backlinks to legal documentation for authority building';
COMMENT ON VIEW dragon_keywords IS 'High-difficulty (60+), high-volume (1000+) keywords worth targeting for long-term SEO';
COMMENT ON VIEW case_law_backlinks IS 'Backlinks specifically to legal documentation and case law citations';
