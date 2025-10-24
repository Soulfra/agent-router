-- Migration 060: Accessibility Preferences
-- Adds explicit accessibility columns to user_preferences table
-- Enables high contrast, font size, reduced motion, screen reader mode, and color blind modes

-- Add accessibility preference columns
ALTER TABLE user_preferences
ADD COLUMN IF NOT EXISTS high_contrast BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS font_size VARCHAR(20) DEFAULT 'medium', -- small, medium, large, xlarge
ADD COLUMN IF NOT EXISTS reduced_motion BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS screen_reader_mode BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS color_blind_mode VARCHAR(20) DEFAULT 'none'; -- none, deuteranopia, protanopia, tritanopia

-- Add comment
COMMENT ON COLUMN user_preferences.high_contrast IS 'High contrast mode for better visibility';
COMMENT ON COLUMN user_preferences.font_size IS 'Preferred font size: small, medium, large, xlarge';
COMMENT ON COLUMN user_preferences.reduced_motion IS 'Reduce animations and transitions';
COMMENT ON COLUMN user_preferences.screen_reader_mode IS 'Optimize for screen readers';
COMMENT ON COLUMN user_preferences.color_blind_mode IS 'Color blind accessibility mode: none, deuteranopia, protanopia, tritanopia';

-- Create index for quick preference lookups
CREATE INDEX IF NOT EXISTS idx_user_preferences_accessibility
ON user_preferences(user_id, high_contrast, screen_reader_mode);

-- Function to get user accessibility context
-- Returns formatted string for AI context enrichment
CREATE OR REPLACE FUNCTION get_user_accessibility_context(p_user_id UUID)
RETURNS TEXT AS $$
DECLARE
  context_text TEXT := '';
  prefs RECORD;
BEGIN
  -- Get user preferences
  SELECT
    high_contrast,
    font_size,
    reduced_motion,
    screen_reader_mode,
    color_blind_mode,
    theme
  INTO prefs
  FROM user_preferences
  WHERE user_id = p_user_id;

  -- If no preferences found, return empty
  IF NOT FOUND THEN
    RETURN '';
  END IF;

  -- Build accessibility context string
  context_text := 'User Accessibility Settings:';

  IF prefs.high_contrast THEN
    context_text := context_text || ' High contrast mode enabled.';
  END IF;

  IF prefs.font_size != 'medium' THEN
    context_text := context_text || ' Font size: ' || prefs.font_size || '.';
  END IF;

  IF prefs.reduced_motion THEN
    context_text := context_text || ' Reduced motion enabled (avoid animated examples).';
  END IF;

  IF prefs.screen_reader_mode THEN
    context_text := context_text || ' Screen reader mode (provide descriptive text for visual elements).';
  END IF;

  IF prefs.color_blind_mode != 'none' THEN
    context_text := context_text || ' Color blind mode: ' || prefs.color_blind_mode || '.';
  END IF;

  IF prefs.theme IS NOT NULL THEN
    context_text := context_text || ' Theme: ' || prefs.theme || '.';
  END IF;

  -- If only header, return empty (no accessibility needs)
  IF context_text = 'User Accessibility Settings:' THEN
    RETURN '';
  END IF;

  RETURN context_text;
END;
$$ LANGUAGE plpgsql;

-- Function to update user accessibility preferences
CREATE OR REPLACE FUNCTION update_user_accessibility_preferences(
  p_user_id UUID,
  p_high_contrast BOOLEAN DEFAULT NULL,
  p_font_size VARCHAR(20) DEFAULT NULL,
  p_reduced_motion BOOLEAN DEFAULT NULL,
  p_screen_reader_mode BOOLEAN DEFAULT NULL,
  p_color_blind_mode VARCHAR(20) DEFAULT NULL
)
RETURNS BOOLEAN AS $$
BEGIN
  -- Update only non-NULL parameters
  UPDATE user_preferences
  SET
    high_contrast = COALESCE(p_high_contrast, high_contrast),
    font_size = COALESCE(p_font_size, font_size),
    reduced_motion = COALESCE(p_reduced_motion, reduced_motion),
    screen_reader_mode = COALESCE(p_screen_reader_mode, screen_reader_mode),
    color_blind_mode = COALESCE(p_color_blind_mode, color_blind_mode),
    updated_at = NOW()
  WHERE user_id = p_user_id;

  -- If no row exists, create one with defaults
  IF NOT FOUND THEN
    INSERT INTO user_preferences (
      user_id,
      high_contrast,
      font_size,
      reduced_motion,
      screen_reader_mode,
      color_blind_mode
    ) VALUES (
      p_user_id,
      COALESCE(p_high_contrast, FALSE),
      COALESCE(p_font_size, 'medium'),
      COALESCE(p_reduced_motion, FALSE),
      COALESCE(p_screen_reader_mode, FALSE),
      COALESCE(p_color_blind_mode, 'none')
    );
  END IF;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- View for user context profile (combines preferences with user data)
CREATE OR REPLACE VIEW user_context_profiles AS
SELECT
  u.user_id,
  u.username,
  u.email,
  up.theme,
  up.language,
  up.timezone,
  up.high_contrast,
  up.font_size,
  up.reduced_motion,
  up.screen_reader_mode,
  up.color_blind_mode,
  up.email_notifications,
  up.show_skill_notifications,
  up.show_xp_gains,
  up.preferences as custom_preferences,
  get_user_accessibility_context(u.user_id) as accessibility_context
FROM users u
LEFT JOIN user_preferences up ON up.user_id = u.user_id;

COMMENT ON VIEW user_context_profiles IS 'Complete user context profile including accessibility settings for AI enrichment';

-- Grant permissions
GRANT SELECT ON user_context_profiles TO PUBLIC;
