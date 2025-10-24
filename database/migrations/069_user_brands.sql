-- Migration 069: User Brands (White-Label)
-- Creates table for custom branding configurations
--
-- Purpose:
-- - Store user/tenant custom branding (logo, colors, domain)
-- - Apply branding to LLM responses
-- - White-label CALOS for resellers
--
-- Usage:
--   Branding is automatically applied by routes/llm-proxy-routes.js
--   when user makes LLM requests

CREATE TABLE IF NOT EXISTS user_brands (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Ownership (can be user or tenant)
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  tenant_id VARCHAR(255),

  -- Branding configuration
  brand_name VARCHAR(255) NOT NULL,
  logo_url TEXT,
  primary_color VARCHAR(7), -- Hex color (e.g., #FF5733)
  secondary_color VARCHAR(7),
  custom_domain VARCHAR(255),

  -- Response branding
  signature TEXT, -- Appended to LLM responses (e.g., "Powered by Acme Corp")
  watermark TEXT, -- Subtle watermark (e.g., company name)
  footer_html TEXT, -- Custom footer for web responses

  -- Email branding
  email_from_name VARCHAR(255),
  email_reply_to VARCHAR(255),
  email_header_html TEXT,
  email_footer_html TEXT,

  -- API branding
  api_name VARCHAR(255), -- Custom API name (e.g., "Acme AI API")
  api_docs_url TEXT,
  api_support_url TEXT,

  -- Settings
  enabled BOOLEAN DEFAULT true,
  apply_to_llm_responses BOOLEAN DEFAULT true,
  apply_to_emails BOOLEAN DEFAULT true,
  apply_to_api BOOLEAN DEFAULT true,

  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),

  -- Constraints
  CONSTRAINT user_brands_owner_check CHECK (
    (user_id IS NOT NULL AND tenant_id IS NULL) OR
    (user_id IS NULL AND tenant_id IS NOT NULL)
  )
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_user_brands_user_id
  ON user_brands(user_id)
  WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_user_brands_tenant_id
  ON user_brands(tenant_id)
  WHERE tenant_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_user_brands_custom_domain
  ON user_brands(custom_domain)
  WHERE custom_domain IS NOT NULL;

-- Comments
COMMENT ON TABLE user_brands IS 'Custom branding configurations for white-label deployments';
COMMENT ON COLUMN user_brands.signature IS 'Text appended to LLM responses';
COMMENT ON COLUMN user_brands.watermark IS 'Subtle watermark for responses';
COMMENT ON COLUMN user_brands.custom_domain IS 'Custom domain for branded deployment';

-- Default branding for CALOS (tenant_id = 'system')
INSERT INTO user_brands (
  tenant_id,
  brand_name,
  signature,
  watermark,
  api_name,
  enabled,
  apply_to_llm_responses,
  apply_to_emails,
  apply_to_api
) VALUES (
  'system',
  'CALOS',
  'Powered by CALOS - AI Agent Router',
  'CALOS',
  'CALOS AI API',
  true,
  false, -- Don't apply to responses by default
  false,
  false
) ON CONFLICT DO NOTHING;
