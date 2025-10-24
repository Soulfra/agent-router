-- Migration: Automated Flows (DocuSign-style)
--
-- Purpose: Store automated multi-step flows like payment, signup, subscription
-- Like DocuSign but for payments and workflows

-- ============================================================
-- Automated Flows Table
-- ============================================================
CREATE TABLE IF NOT EXISTS automated_flows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  description TEXT,

  -- Steps definition (multi-step flow)
  steps JSONB NOT NULL DEFAULT '[]', -- [{order, name, type, config, retryConfig}]

  -- Trigger configuration
  trigger VARCHAR(50) NOT NULL DEFAULT 'manual', -- manual, api, webhook, schedule, event

  -- Metadata
  metadata JSONB DEFAULT '{}', -- category, emoji, completion_badge

  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_automated_flows_trigger ON automated_flows(trigger);
CREATE INDEX idx_automated_flows_metadata ON automated_flows USING GIN(metadata);

COMMENT ON TABLE automated_flows IS 'Multi-step automated flows (like DocuSign)';
COMMENT ON COLUMN automated_flows.steps IS 'Array of steps with order, type, config';
COMMENT ON COLUMN automated_flows.trigger IS 'How flow is triggered: manual, api, webhook, schedule';

-- ============================================================
-- Flow Executions Table (Execution History)
-- ============================================================
CREATE TABLE IF NOT EXISTS flow_executions (
  id VARCHAR(100) PRIMARY KEY, -- exec_{timestamp}_{random}
  flow_id UUID REFERENCES automated_flows(id) ON DELETE CASCADE,

  -- Execution status
  status VARCHAR(20) NOT NULL DEFAULT 'in_progress', -- in_progress, completed, failed
  current_step INT DEFAULT 0,

  -- Context and results
  context JSONB DEFAULT '{}', -- Trigger data + execution context
  step_results JSONB DEFAULT '{}', -- Results from each step

  -- Error handling
  error_message TEXT,

  -- Timestamps
  started_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP,
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_flow_executions_flow ON flow_executions(flow_id);
CREATE INDEX idx_flow_executions_status ON flow_executions(status);
CREATE INDEX idx_flow_executions_started ON flow_executions(started_at DESC);

COMMENT ON TABLE flow_executions IS 'Execution history for automated flows';
COMMENT ON COLUMN flow_executions.step_results IS 'Results from each step execution';

-- ============================================================
-- Flow Templates (Pre-built flows)
-- ============================================================
INSERT INTO automated_flows (name, description, steps, trigger, metadata) VALUES
(
  'Payment Flow',
  'Complete payment processing with credits and badge reward',
  '[
    {"order": 0, "name": "Validate Payment Method", "type": "condition", "config": {"condition": {"field": "payment_method_id", "operator": "not_equals", "value": null}}},
    {"order": 1, "name": "Charge Payment", "type": "action", "config": {"action_code": "stripe_charge"}, "retryConfig": {"maxRetries": 3}},
    {"order": 2, "name": "Add Credits", "type": "database", "config": {"query": "INSERT INTO user_credits"}},
    {"order": 3, "name": "Award Badge", "type": "badge", "config": {"badge_type": "first_purchase"}},
    {"order": 4, "name": "Send Email", "type": "notify", "config": {"type": "email"}}
  ]',
  'api',
  '{"category": "payment", "emoji": "💰", "completion_badge": "first_purchase"}'
),
(
  'Signup Flow',
  'Complete user onboarding with verification',
  '[
    {"order": 0, "name": "Create Account", "type": "database", "config": {"query": "INSERT INTO users"}},
    {"order": 1, "name": "Send Verification Email", "type": "notify", "config": {"type": "email"}},
    {"order": 2, "name": "Award Newcomer Badge", "type": "badge", "config": {"badge_type": "newcomer"}},
    {"order": 3, "name": "Send Welcome Email", "type": "notify", "config": {"type": "email"}}
  ]',
  'api',
  '{"category": "authentication", "emoji": "👤", "completion_badge": "newcomer"}'
),
(
  'Subscription Flow',
  'Setup recurring subscription with automated billing',
  '[
    {"order": 0, "name": "Validate Plan", "type": "condition", "config": {"condition": {"field": "plan_id", "operator": "not_equals", "value": null}}},
    {"order": 1, "name": "Create Stripe Subscription", "type": "http", "config": {"method": "POST", "url": "https://api.stripe.com/v1/subscriptions"}},
    {"order": 2, "name": "Save Subscription", "type": "database", "config": {"query": "INSERT INTO user_subscriptions"}},
    {"order": 3, "name": "Award Subscriber Badge", "type": "badge", "config": {"badge_type": "subscriber"}},
    {"order": 4, "name": "Send Confirmation", "type": "notify", "config": {"type": "email"}}
  ]',
  'api',
  '{"category": "subscription", "emoji": "🔄", "completion_badge": "subscriber"}'
),
(
  'Affiliate Flow',
  'Process affiliate referral and payout commission',
  '[
    {"order": 0, "name": "Validate Referral", "type": "condition", "config": {"condition": {"field": "referrer_id", "operator": "not_equals", "value": null}}},
    {"order": 1, "name": "Check Purchase", "type": "condition", "config": {"condition": {"field": "payment_status", "operator": "equals", "value": "succeeded"}}},
    {"order": 2, "name": "Calculate Commission", "type": "database", "config": {"query": "SELECT amount * 0.10"}},
    {"order": 3, "name": "Add Commission", "type": "database", "config": {"query": "INSERT INTO affiliate_commissions"}},
    {"order": 4, "name": "Payout", "type": "http", "config": {"method": "POST", "url": "https://api.stripe.com/v1/transfers"}},
    {"order": 5, "name": "Award Badge", "type": "badge", "config": {"badge_type": "affiliate"}},
    {"order": 6, "name": "Send Notification", "type": "notify", "config": {"type": "email"}}
  ]',
  'webhook',
  '{"category": "affiliate", "emoji": "💸", "completion_badge": "affiliate"}'
),
(
  'Webhook Processing Flow',
  'Process incoming webhooks with validation',
  '[
    {"order": 0, "name": "Validate Signature", "type": "condition", "config": {"condition": {"field": "signature_valid", "operator": "equals", "value": true}}},
    {"order": 1, "name": "Log Event", "type": "database", "config": {"query": "INSERT INTO webhook_events"}},
    {"order": 2, "name": "Process Event", "type": "action", "config": {"action_code": "process_webhook"}},
    {"order": 3, "name": "Notify Admin", "type": "notify", "config": {"type": "email"}}
  ]',
  'webhook',
  '{"category": "webhook", "emoji": "🔗"}'
)
ON CONFLICT DO NOTHING;

-- ============================================================
-- Indexes for searching by emoji/category
-- ============================================================
CREATE INDEX idx_automated_flows_category ON automated_flows((metadata->>'category'));
CREATE INDEX idx_automated_flows_emoji ON automated_flows((metadata->>'emoji'));

-- ============================================================
-- Grant Permissions
-- ============================================================
COMMENT ON TABLE automated_flows IS 'DocuSign-style automated flows';
COMMENT ON TABLE flow_executions IS 'Execution history with step-by-step results';
