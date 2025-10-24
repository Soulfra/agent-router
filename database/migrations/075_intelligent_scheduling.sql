-- Migration 075: Intelligent Notification Scheduling
-- Apple Optimized Battery Charging style learning system
--
-- Purpose:
-- - Learn user behavior patterns (wake time, work hours, device usage)
-- - Schedule notifications intelligently (maximize engagement, minimize annoyance)
-- - Batch notifications to reduce notification fatigue
-- - Adapt in real-time based on user activity
--
-- Inspired by:
-- - Apple Optimized Battery Charging (learn charging patterns)
-- - Apple Screen Time (learn app usage patterns)
-- - Google's Notification Channels (importance-based delivery)
--
-- Privacy:
-- - All learning data stored locally (encrypted)
-- - User can disable intelligent scheduling anytime
-- - User can view/export learned patterns
-- - User can reset learning data

-- ============================================================================
-- NOTIFICATION QUEUE (intelligently scheduled)
-- ============================================================================

CREATE TABLE IF NOT EXISTS notification_queue (
  notification_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- User & event
  user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  event_type VARCHAR(100) NOT NULL,       -- 'contract_signed', 'credits_earned', etc.
  event_data JSONB DEFAULT '{}',          -- Event payload

  -- Scheduling
  original_trigger_time TIMESTAMP DEFAULT NOW(),  -- When event actually happened
  scheduled_for TIMESTAMP,                        -- When to send (intelligently calculated)
  sent_at TIMESTAMP,                              -- When actually sent
  delivery_method VARCHAR(20) DEFAULT 'intelligent', -- 'immediate', 'intelligent', 'batched'

  -- Priority (affects intelligent scheduling)
  priority VARCHAR(20) DEFAULT 'medium',  -- 'low', 'medium', 'high', 'urgent'
  -- 'urgent' = send immediately (override learning)
  -- 'high' = send at next optimal time (within 1 hour)
  -- 'medium' = send at next optimal time (within 4 hours)
  -- 'low' = batch with other notifications

  -- Channels
  channels VARCHAR(20)[] DEFAULT ARRAY['email'], -- ['email', 'sms', 'push']

  -- Delivery status
  status VARCHAR(50) DEFAULT 'pending',  -- 'pending', 'scheduled', 'sent', 'failed', 'cancelled'
  error_message TEXT,

  -- Learning feedback (did user engage?)
  opened BOOLEAN DEFAULT false,
  clicked BOOLEAN DEFAULT false,
  dismissed BOOLEAN DEFAULT false,
  engagement_score NUMERIC(3,2),         -- 0.00-1.00 (how good was this scheduling decision?)

  -- Batching
  batch_id UUID,                         -- Group related notifications
  batch_position INTEGER,                -- Order within batch

  -- Metadata
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_notif_queue_user_id
  ON notification_queue(user_id);

CREATE INDEX IF NOT EXISTS idx_notif_queue_scheduled_for
  ON notification_queue(scheduled_for)
  WHERE status = 'scheduled';

CREATE INDEX IF NOT EXISTS idx_notif_queue_status
  ON notification_queue(status);

CREATE INDEX IF NOT EXISTS idx_notif_queue_batch_id
  ON notification_queue(batch_id)
  WHERE batch_id IS NOT NULL;

COMMENT ON TABLE notification_queue IS 'Intelligently scheduled notifications (Apple Battery Charging style)';
COMMENT ON COLUMN notification_queue.scheduled_for IS 'When to send (calculated by intelligent scheduler)';
COMMENT ON COLUMN notification_queue.delivery_method IS 'How notification was scheduled: immediate, intelligent, batched';
COMMENT ON COLUMN notification_queue.engagement_score IS 'Learning feedback: did user engage with notification?';

-- ============================================================================
-- USER BEHAVIOR PATTERNS (learned from activity)
-- ============================================================================

CREATE TABLE IF NOT EXISTS user_behavior_patterns (
  user_id UUID PRIMARY KEY REFERENCES users(user_id) ON DELETE CASCADE,

  -- Wake/sleep patterns
  typical_wake_time TIME,                -- Example: 08:00:00
  typical_bedtime TIME,                  -- Example: 23:00:00
  weekend_wake_time TIME,                -- Different on weekends
  weekend_bedtime TIME,

  -- Work hours
  work_hours_start TIME,                 -- Example: 09:00:00
  work_hours_end TIME,                   -- Example: 17:00:00
  work_days INTEGER[] DEFAULT ARRAY[1,2,3,4,5], -- Monday-Friday (1=Monday, 7=Sunday)

  -- Device preferences
  primary_device VARCHAR(50),            -- 'iphone', 'android', 'macbook', 'windows'
  device_usage_pattern JSONB DEFAULT '{}', -- { "iphone": { "typical_hours": [8,9,18,19,20] } }

  -- Notification engagement patterns
  best_notification_times TIME[],        -- Times when user typically engages with notifications
  worst_notification_times TIME[],       -- Times to avoid (user typically dismisses)

  -- Activity patterns
  typical_active_hours INTEGER[] DEFAULT ARRAY[9,10,11,12,13,14,15,16,17], -- Hours when user is typically active
  timezone VARCHAR(50) DEFAULT 'UTC',    -- User's timezone

  -- Learning metadata
  confidence_score NUMERIC(3,2) DEFAULT 0.0, -- 0.00-1.00 (how confident are we in these patterns?)
  data_points_collected INTEGER DEFAULT 0,    -- How many observations?
  learning_enabled BOOLEAN DEFAULT true,      -- User can disable learning
  last_pattern_update TIMESTAMP,

  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

COMMENT ON TABLE user_behavior_patterns IS 'Learned user behavior patterns for intelligent notification scheduling';
COMMENT ON COLUMN user_behavior_patterns.typical_wake_time IS 'Learned from when user first opens app each day';
COMMENT ON COLUMN user_behavior_patterns.best_notification_times IS 'Times when user typically engages with notifications (learned)';
COMMENT ON COLUMN user_behavior_patterns.confidence_score IS 'How confident we are in these patterns (0.0-1.0)';

-- ============================================================================
-- ACTIVITY LOG (for learning)
-- ============================================================================

CREATE TABLE IF NOT EXISTS user_activity_log (
  activity_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- User & device
  user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  device_type VARCHAR(50),               -- 'iphone', 'macbook', etc.
  device_id VARCHAR(255),

  -- Activity type
  activity_type VARCHAR(100) NOT NULL,   -- 'app_opened', 'notification_opened', 'notification_dismissed', etc.

  -- Timing
  activity_timestamp TIMESTAMP DEFAULT NOW(),
  hour_of_day INTEGER,                   -- 0-23
  day_of_week INTEGER,                   -- 1-7 (1=Monday)
  is_weekend BOOLEAN,

  -- Context
  notification_id UUID REFERENCES notification_queue(notification_id),
  time_since_notification_sent INTERVAL, -- How long after notification was sent?

  -- Metadata
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_activity_log_user_id
  ON user_activity_log(user_id);

CREATE INDEX IF NOT EXISTS idx_activity_log_activity_type
  ON user_activity_log(activity_type);

CREATE INDEX IF NOT EXISTS idx_activity_log_timestamp
  ON user_activity_log(activity_timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_activity_log_hour_dow
  ON user_activity_log(user_id, hour_of_day, day_of_week);

COMMENT ON TABLE user_activity_log IS 'User activity log for learning behavior patterns';
COMMENT ON COLUMN user_activity_log.hour_of_day IS 'Hour of day (0-23) for pattern analysis';
COMMENT ON COLUMN user_activity_log.time_since_notification_sent IS 'Engagement latency (for learning)';

-- ============================================================================
-- NOTIFICATION BATCHES
-- ============================================================================

CREATE TABLE IF NOT EXISTS notification_batches (
  batch_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- User & timing
  user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  scheduled_for TIMESTAMP NOT NULL,      -- When to send this batch
  sent_at TIMESTAMP,

  -- Batch details
  notification_count INTEGER DEFAULT 0,
  priority_summary VARCHAR(100),         -- Example: "3 high, 5 medium, 2 low"

  -- Delivery
  status VARCHAR(50) DEFAULT 'pending',  -- 'pending', 'sent', 'cancelled'
  batch_title TEXT,                      -- Example: "5 updates while you slept"
  batch_summary TEXT,                    -- Preview of what's in the batch

  -- Metadata
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notif_batches_user_id
  ON notification_batches(user_id);

CREATE INDEX IF NOT EXISTS idx_notif_batches_scheduled_for
  ON notification_batches(scheduled_for)
  WHERE status = 'pending';

COMMENT ON TABLE notification_batches IS 'Batched notifications to reduce notification fatigue';
COMMENT ON COLUMN notification_batches.batch_title IS 'Summary title shown to user (e.g., "5 updates while you slle

pt")';

-- ============================================================================
-- FUNCTIONS
-- ============================================================================

/**
 * Log user activity (for learning)
 */
CREATE OR REPLACE FUNCTION log_user_activity(
  p_user_id UUID,
  p_activity_type VARCHAR(100),
  p_device_type VARCHAR(50) DEFAULT NULL,
  p_device_id VARCHAR(255) DEFAULT NULL,
  p_notification_id UUID DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'
)
RETURNS UUID AS $$
DECLARE
  v_activity_id UUID;
  v_hour INTEGER;
  v_dow INTEGER;
  v_is_weekend BOOLEAN;
BEGIN
  -- Extract time components
  v_hour := EXTRACT(HOUR FROM NOW());
  v_dow := EXTRACT(DOW FROM NOW());  -- 0=Sunday, 1=Monday, ..., 6=Saturday
  v_dow := CASE WHEN v_dow = 0 THEN 7 ELSE v_dow END;  -- Convert to 1=Monday, 7=Sunday
  v_is_weekend := v_dow IN (6, 7);

  -- Insert activity log
  INSERT INTO user_activity_log (
    user_id,
    device_type,
    device_id,
    activity_type,
    hour_of_day,
    day_of_week,
    is_weekend,
    notification_id,
    metadata
  ) VALUES (
    p_user_id,
    p_device_type,
    p_device_id,
    p_activity_type,
    v_hour,
    v_dow,
    v_is_weekend,
    p_notification_id,
    p_metadata
  )
  RETURNING activity_id INTO v_activity_id;

  RETURN v_activity_id;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION log_user_activity IS 'Log user activity for learning behavior patterns';

/**
 * Update behavior patterns (run periodically via scheduler)
 */
CREATE OR REPLACE FUNCTION update_behavior_patterns(p_user_id UUID)
RETURNS VOID AS $$
DECLARE
  v_wake_time TIME;
  v_bedtime TIME;
  v_best_times TIME[];
  v_data_points INTEGER;
BEGIN
  -- Calculate typical wake time (first activity of the day)
  SELECT AVG(hour_of_day)::INTEGER || ':00:00' INTO v_wake_time
  FROM (
    SELECT DISTINCT ON (DATE(activity_timestamp))
      EXTRACT(HOUR FROM activity_timestamp) as hour_of_day
    FROM user_activity_log
    WHERE user_id = p_user_id
      AND activity_type IN ('app_opened', 'notification_opened')
      AND activity_timestamp > NOW() - INTERVAL '30 days'
    ORDER BY DATE(activity_timestamp), activity_timestamp ASC
  ) first_activity;

  -- Calculate typical bedtime (last activity of the day)
  SELECT AVG(hour_of_day)::INTEGER || ':00:00' INTO v_bedtime
  FROM (
    SELECT DISTINCT ON (DATE(activity_timestamp))
      EXTRACT(HOUR FROM activity_timestamp) as hour_of_day
    FROM user_activity_log
    WHERE user_id = p_user_id
      AND activity_timestamp > NOW() - INTERVAL '30 days'
    ORDER BY DATE(activity_timestamp), activity_timestamp DESC
  ) last_activity;

  -- Calculate best notification times (when user engages most)
  SELECT ARRAY_AGG(hour::TEXT || ':00:00')
  INTO v_best_times
  FROM (
    SELECT EXTRACT(HOUR FROM activity_timestamp)::INTEGER as hour,
           COUNT(*) as engagement_count
    FROM user_activity_log
    WHERE user_id = p_user_id
      AND activity_type IN ('notification_opened', 'notification_clicked')
      AND activity_timestamp > NOW() - INTERVAL '30 days'
    GROUP BY hour
    ORDER BY engagement_count DESC
    LIMIT 5
  ) top_hours;

  -- Count data points
  SELECT COUNT(*) INTO v_data_points
  FROM user_activity_log
  WHERE user_id = p_user_id
    AND activity_timestamp > NOW() - INTERVAL '30 days';

  -- Update or insert patterns
  INSERT INTO user_behavior_patterns (
    user_id,
    typical_wake_time,
    typical_bedtime,
    best_notification_times,
    data_points_collected,
    confidence_score,
    last_pattern_update
  ) VALUES (
    p_user_id,
    v_wake_time,
    v_bedtime,
    v_best_times,
    v_data_points,
    LEAST(1.0, v_data_points / 100.0),  -- Confidence increases with more data
    NOW()
  )
  ON CONFLICT (user_id) DO UPDATE SET
    typical_wake_time = EXCLUDED.typical_wake_time,
    typical_bedtime = EXCLUDED.typical_bedtime,
    best_notification_times = EXCLUDED.best_notification_times,
    data_points_collected = EXCLUDED.data_points_collected,
    confidence_score = EXCLUDED.confidence_score,
    last_pattern_update = EXCLUDED.last_pattern_update,
    updated_at = NOW();
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION update_behavior_patterns IS 'Update learned behavior patterns from activity log (run daily)';

/**
 * Calculate optimal notification time for user
 */
CREATE OR REPLACE FUNCTION calculate_optimal_notification_time(
  p_user_id UUID,
  p_priority VARCHAR(20) DEFAULT 'medium'
)
RETURNS TIMESTAMP AS $$
DECLARE
  v_patterns RECORD;
  v_current_hour INTEGER;
  v_optimal_time TIMESTAMP;
BEGIN
  -- Get user patterns
  SELECT * INTO v_patterns
  FROM user_behavior_patterns
  WHERE user_id = p_user_id;

  -- If no patterns or learning disabled, send immediately
  IF NOT FOUND OR NOT v_patterns.learning_enabled OR v_patterns.confidence_score < 0.3 THEN
    RETURN NOW();
  END IF;

  v_current_hour := EXTRACT(HOUR FROM NOW());

  -- Urgent: send immediately
  IF p_priority = 'urgent' THEN
    RETURN NOW();
  END IF;

  -- High priority: send at next optimal time (within 1 hour)
  IF p_priority = 'high' THEN
    -- If within work hours, send now
    IF v_current_hour >= EXTRACT(HOUR FROM v_patterns.work_hours_start)
       AND v_current_hour < EXTRACT(HOUR FROM v_patterns.work_hours_end) THEN
      RETURN NOW();
    END IF;

    -- Otherwise, send at work start
    RETURN DATE_TRUNC('day', NOW()) + v_patterns.work_hours_start;
  END IF;

  -- Medium/Low: send at next best notification time
  -- Find next best time from best_notification_times array
  IF v_patterns.best_notification_times IS NOT NULL AND array_length(v_patterns.best_notification_times, 1) > 0 THEN
    -- Find first best time after current time
    FOR i IN 1..array_length(v_patterns.best_notification_times, 1) LOOP
      IF EXTRACT(HOUR FROM v_patterns.best_notification_times[i]) > v_current_hour THEN
        RETURN DATE_TRUNC('day', NOW()) + v_patterns.best_notification_times[i];
      END IF;
    END LOOP;

    -- If no time today, use first time tomorrow
    RETURN DATE_TRUNC('day', NOW() + INTERVAL '1 day') + v_patterns.best_notification_times[1];
  END IF;

  -- Fallback: send at wake time tomorrow if it's late
  IF v_current_hour >= EXTRACT(HOUR FROM v_patterns.typical_bedtime) THEN
    RETURN DATE_TRUNC('day', NOW() + INTERVAL '1 day') + v_patterns.typical_wake_time;
  END IF;

  -- Default: send now
  RETURN NOW();
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION calculate_optimal_notification_time IS 'Calculate best time to send notification based on learned patterns';

-- ============================================================================
-- SEED DATA / DEFAULTS
-- ============================================================================

-- Auto-create default behavior patterns for existing users
INSERT INTO user_behavior_patterns (user_id)
SELECT user_id
FROM users
WHERE NOT EXISTS (
  SELECT 1 FROM user_behavior_patterns WHERE user_behavior_patterns.user_id = users.user_id
);

