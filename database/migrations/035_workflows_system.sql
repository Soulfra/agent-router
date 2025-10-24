-- Migration: Workflows System
--
-- Purpose: Store visual workflows from workflow-builder.html
-- Integrates with EXISTING systems (Scheduler, Webhooks, Actions Engine)

-- ============================================================
-- Workflows Table
-- ============================================================
CREATE TABLE IF NOT EXISTS workflows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  description TEXT,

  -- Trigger configuration
  trigger_type VARCHAR(50) NOT NULL DEFAULT 'manual', -- manual, schedule, webhook, event
  trigger_config JSONB DEFAULT '{}', -- interval, cron, webhook_id, etc.

  -- Workflow structure (from visual builder)
  nodes JSONB NOT NULL DEFAULT '[]', -- [{id, type, name, config, x, y}]
  connections JSONB NOT NULL DEFAULT '[]', -- [{from, to}]

  -- Status
  enabled BOOLEAN DEFAULT TRUE,
  status VARCHAR(20) DEFAULT 'active', -- active, paused, error

  -- Metadata
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  created_by UUID REFERENCES users(user_id) ON DELETE SET NULL,

  -- Execution statistics
  total_executions INT DEFAULT 0,
  successful_executions INT DEFAULT 0,
  failed_executions INT DEFAULT 0,
  last_execution_at TIMESTAMP,
  last_execution_status VARCHAR(20)
);

CREATE INDEX idx_workflows_trigger_type ON workflows(trigger_type);
CREATE INDEX idx_workflows_enabled ON workflows(enabled);
CREATE INDEX idx_workflows_created_by ON workflows(created_by);
CREATE INDEX idx_workflows_created_at ON workflows(created_at DESC);

-- ============================================================
-- Workflow Executions Table (Execution History)
-- ============================================================
CREATE TABLE IF NOT EXISTS workflow_executions (
  id SERIAL PRIMARY KEY,
  execution_id VARCHAR(100) UNIQUE NOT NULL,
  workflow_id UUID REFERENCES workflows(id) ON DELETE CASCADE,

  -- Execution result
  status VARCHAR(20) NOT NULL, -- success, failed, timeout
  duration_ms INT,
  error_message TEXT,

  -- Context and results
  context JSONB DEFAULT '{}', -- Trigger data + execution context
  node_results JSONB DEFAULT '{}', -- Results from each node

  -- Metadata
  executed_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_workflow_executions_workflow ON workflow_executions(workflow_id);
CREATE INDEX idx_workflow_executions_status ON workflow_executions(status);
CREATE INDEX idx_workflow_executions_executed_at ON workflow_executions(executed_at DESC);

-- ============================================================
-- Update workflow statistics trigger
-- ============================================================
CREATE OR REPLACE FUNCTION update_workflow_stats()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE workflows
  SET
    total_executions = total_executions + 1,
    successful_executions = CASE WHEN NEW.status = 'success'
      THEN successful_executions + 1
      ELSE successful_executions
    END,
    failed_executions = CASE WHEN NEW.status = 'failed'
      THEN failed_executions + 1
      ELSE failed_executions
    END,
    last_execution_at = NEW.executed_at,
    last_execution_status = NEW.status
  WHERE id = NEW.workflow_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER workflow_execution_stats
  AFTER INSERT ON workflow_executions
  FOR EACH ROW
  EXECUTE FUNCTION update_workflow_stats();

-- ============================================================
-- Workflow Templates (Optional - Pre-built Workflows)
-- ============================================================
CREATE TABLE IF NOT EXISTS workflow_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  category VARCHAR(50), -- automation, integration, data-processing
  icon VARCHAR(10),

  -- Template structure (same as workflow)
  nodes JSONB NOT NULL DEFAULT '[]',
  connections JSONB NOT NULL DEFAULT '[]',
  default_config JSONB DEFAULT '{}',

  -- Metadata
  created_at TIMESTAMP DEFAULT NOW(),
  usage_count INT DEFAULT 0
);

CREATE INDEX idx_workflow_templates_category ON workflow_templates(category);

-- ============================================================
-- Insert default templates
-- ============================================================
INSERT INTO workflow_templates (name, description, category, icon, nodes, connections) VALUES
(
  'Scheduled Task',
  'Run a task at regular intervals',
  'automation',
  '⏰',
  '[
    {"id": "trigger", "type": "trigger", "name": "Every 5 minutes", "x": 100, "y": 100},
    {"id": "http", "type": "http", "name": "Fetch Data", "x": 400, "y": 100, "config": {"method": "GET"}}
  ]',
  '[{"from": "trigger", "to": "http"}]'
),
(
  'Webhook Responder',
  'Respond to webhook events',
  'integration',
  '🔗',
  '[
    {"id": "trigger", "type": "trigger", "name": "Webhook Received", "x": 100, "y": 100},
    {"id": "action", "type": "action", "name": "Process Data", "x": 400, "y": 100}
  ]',
  '[{"from": "trigger", "to": "action"}]'
),
(
  'Conditional Flow',
  'Execute different actions based on conditions',
  'automation',
  '🔀',
  '[
    {"id": "trigger", "type": "trigger", "name": "Start", "x": 100, "y": 100},
    {"id": "condition", "type": "condition", "name": "Check Value", "x": 400, "y": 100},
    {"id": "action1", "type": "action", "name": "If True", "x": 600, "y": 50},
    {"id": "action2", "type": "action", "name": "If False", "x": 600, "y": 150}
  ]',
  '[
    {"from": "trigger", "to": "condition"},
    {"from": "condition", "to": "action1"},
    {"from": "condition", "to": "action2"}
  ]'
)
ON CONFLICT DO NOTHING;

-- ============================================================
-- Grant Permissions
-- ============================================================
COMMENT ON TABLE workflows IS 'Visual workflows created in workflow-builder.html';
COMMENT ON TABLE workflow_executions IS 'Execution history for all workflows';
COMMENT ON TABLE workflow_templates IS 'Pre-built workflow templates for quick start';

COMMENT ON COLUMN workflows.trigger_type IS 'How workflow is triggered: manual, schedule, webhook, event';
COMMENT ON COLUMN workflows.nodes IS 'Visual nodes from workflow builder';
COMMENT ON COLUMN workflows.connections IS 'Connections between nodes';
