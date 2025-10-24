-- Migration: Sprite System
-- Purpose: Store sprite sheets, animations, and visual assets for CalOS
-- Features: Sprite sheets, animation sequences, frame metadata, categories

-- ============================================================================
-- SPRITE SHEETS
-- ============================================================================

CREATE TABLE IF NOT EXISTS sprite_sheets (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL UNIQUE, -- Unique identifier (e.g., 'desktop_icons')
  display_name VARCHAR(255), -- Human-readable name
  description TEXT,

  -- Image data
  image_url TEXT NOT NULL, -- URL to sprite sheet image
  image_width INTEGER NOT NULL,
  image_height INTEGER NOT NULL,

  -- Grid configuration
  frame_width INTEGER NOT NULL, -- Width of each frame
  frame_height INTEGER NOT NULL, -- Height of each frame
  frames INTEGER NOT NULL, -- Total number of frames
  columns INTEGER, -- Frames per row
  rows INTEGER, -- Number of rows

  -- Advanced options
  padding INTEGER DEFAULT 0, -- Pixels between frames
  offset_x INTEGER DEFAULT 0, -- Starting X offset
  offset_y INTEGER DEFAULT 0, -- Starting Y offset

  -- Metadata
  category VARCHAR(100), -- icons, characters, effects, ui, etc.
  tags TEXT[], -- Searchable tags
  metadata JSONB, -- Arbitrary metadata

  -- Tracking
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_by INTEGER, -- User ID (if applicable)

  -- Stats
  usage_count INTEGER DEFAULT 0, -- Track how many times used
  last_used_at TIMESTAMP
);

-- Indexes
CREATE INDEX idx_sprite_sheets_name ON sprite_sheets(name);
CREATE INDEX idx_sprite_sheets_category ON sprite_sheets(category);
CREATE INDEX idx_sprite_sheets_tags ON sprite_sheets USING gin(tags);
CREATE INDEX idx_sprite_sheets_metadata ON sprite_sheets USING gin(metadata);

-- ============================================================================
-- SPRITE ATLAS (Named sprite regions within a sheet)
-- ============================================================================

CREATE TABLE IF NOT EXISTS sprite_atlas (
  id SERIAL PRIMARY KEY,
  sheet_id INTEGER REFERENCES sprite_sheets(id) ON DELETE CASCADE,
  sprite_name VARCHAR(255) NOT NULL, -- Unique name within sheet

  -- Position and dimensions
  x INTEGER NOT NULL,
  y INTEGER NOT NULL,
  width INTEGER NOT NULL,
  height INTEGER NOT NULL,

  -- Pivot/origin point
  pivot_x DECIMAL(3,2) DEFAULT 0.5, -- 0.0 = left, 0.5 = center, 1.0 = right
  pivot_y DECIMAL(3,2) DEFAULT 0.5, -- 0.0 = top, 0.5 = center, 1.0 = bottom

  -- Metadata
  tags TEXT[],
  metadata JSONB,

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  UNIQUE(sheet_id, sprite_name)
);

CREATE INDEX idx_sprite_atlas_sheet ON sprite_atlas(sheet_id);
CREATE INDEX idx_sprite_atlas_name ON sprite_atlas(sheet_id, sprite_name);

-- ============================================================================
-- ANIMATION SEQUENCES
-- ============================================================================

CREATE TABLE IF NOT EXISTS animation_sequences (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL UNIQUE, -- Unique identifier (e.g., 'player_walk')
  display_name VARCHAR(255),
  description TEXT,

  -- Reference to sprite sheet
  sheet_id INTEGER REFERENCES sprite_sheets(id) ON DELETE CASCADE,

  -- Animation configuration
  frames INTEGER[], -- Array of frame indices [0, 1, 2, 3]
  frame_delays INTEGER[], -- Delay per frame in ms [100, 100, 100, 100]
  default_fps INTEGER DEFAULT 12, -- Frames per second (if frame_delays not specified)

  -- Playback settings
  loop BOOLEAN DEFAULT TRUE,
  ping_pong BOOLEAN DEFAULT FALSE, -- Play forward then backward

  -- Metadata
  category VARCHAR(100), -- walk, run, jump, idle, etc.
  tags TEXT[],
  metadata JSONB,

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_animation_sequences_name ON animation_sequences(name);
CREATE INDEX idx_animation_sequences_sheet ON animation_sequences(sheet_id);
CREATE INDEX idx_animation_sequences_category ON animation_sequences(category);

-- ============================================================================
-- VISUAL EFFECTS (Pre-defined particle/effect configs)
-- ============================================================================

CREATE TABLE IF NOT EXISTS visual_effects (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL UNIQUE, -- e.g., 'confetti_burst', 'sparkle_trail'
  display_name VARCHAR(255),
  description TEXT,

  -- Effect type
  effect_type VARCHAR(50) NOT NULL, -- particle, sprite_animation, canvas_effect

  -- Configuration (JSON)
  config JSONB NOT NULL, -- Effect-specific configuration

  -- Example configs:
  -- Particle: { particle_count: 50, colors: [...], spread: 360, velocity: 5 }
  -- Sprite: { sheet_id: 1, frames: [0,1,2,3], duration: 500 }
  -- Canvas: { shader: 'ripple', intensity: 10, duration: 300 }

  -- Preview
  preview_url TEXT, -- URL to preview GIF/image

  -- Metadata
  category VARCHAR(100), -- celebration, feedback, ambient, etc.
  tags TEXT[],

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_visual_effects_name ON visual_effects(name);
CREATE INDEX idx_visual_effects_type ON visual_effects(effect_type);
CREATE INDEX idx_visual_effects_category ON visual_effects(category);

-- ============================================================================
-- ICON ANIMATIONS (Desktop icon animation presets)
-- ============================================================================

CREATE TABLE IF NOT EXISTS icon_animations (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL UNIQUE, -- e.g., 'bounce', 'pulse', 'wiggle'
  display_name VARCHAR(255),
  description TEXT,

  -- Animation configuration
  animation_type VARCHAR(50) NOT NULL, -- css, sprite, canvas
  config JSONB NOT NULL,

  -- Example configs:
  -- CSS: { keyframes: [...], duration: 300, easing: 'ease-out' }
  -- Sprite: { sheet_id: 1, frames: [0,1,2], fps: 12 }
  -- Canvas: { draw_function: 'bounce', params: { height: 20 } }

  -- Usage context
  trigger VARCHAR(50), -- hover, click, drag_start, drag_end, create, delete

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_icon_animations_name ON icon_animations(name);
CREATE INDEX idx_icon_animations_trigger ON icon_animations(trigger);

-- ============================================================================
-- THEMES (Visual theme configurations)
-- ============================================================================

CREATE TABLE IF NOT EXISTS visual_themes (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL UNIQUE, -- e.g., 'ios-14', 'windows-xp'
  display_name VARCHAR(255),
  description TEXT,

  -- Theme assets
  sprite_sheets INTEGER[], -- Array of sprite sheet IDs
  icon_set_id INTEGER REFERENCES sprite_sheets(id), -- Default icon sprite sheet

  -- Visual configuration
  colors JSONB, -- Color palette
  fonts JSONB, -- Font configuration
  effects JSONB, -- Effect preferences

  -- UI configuration
  window_style JSONB, -- Window chrome, shadows, etc.
  desktop_style JSONB, -- Desktop background, grid, etc.

  -- Preview
  preview_url TEXT,
  thumbnail_url TEXT,

  -- Metadata
  is_system BOOLEAN DEFAULT FALSE,
  is_public BOOLEAN DEFAULT TRUE,
  created_by INTEGER,

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_visual_themes_name ON visual_themes(name);

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Get sprite sheet with all atlas sprites
CREATE OR REPLACE FUNCTION get_sprite_sheet_full(p_sheet_name VARCHAR)
RETURNS JSON AS $$
DECLARE
  result JSON;
BEGIN
  SELECT json_build_object(
    'sheet', row_to_json(s.*),
    'atlas', (
      SELECT json_agg(row_to_json(a.*))
      FROM sprite_atlas a
      WHERE a.sheet_id = s.id
    )
  )
  INTO result
  FROM sprite_sheets s
  WHERE s.name = p_sheet_name;

  RETURN result;
END;
$$ LANGUAGE plpgsql;

-- Get animation sequence with frame data
CREATE OR REPLACE FUNCTION get_animation_full(p_anim_name VARCHAR)
RETURNS JSON AS $$
DECLARE
  result JSON;
BEGIN
  SELECT json_build_object(
    'animation', row_to_json(a.*),
    'sprite_sheet', row_to_json(s.*)
  )
  INTO result
  FROM animation_sequences a
  JOIN sprite_sheets s ON a.sheet_id = s.id
  WHERE a.name = p_anim_name;

  RETURN result;
END;
$$ LANGUAGE plpgsql;

-- Update sprite sheet usage stats
CREATE OR REPLACE FUNCTION update_sprite_usage(p_sheet_id INTEGER)
RETURNS VOID AS $$
BEGIN
  UPDATE sprite_sheets
  SET usage_count = usage_count + 1,
      last_used_at = CURRENT_TIMESTAMP
  WHERE id = p_sheet_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_sprite_sheets_updated_at
  BEFORE UPDATE ON sprite_sheets
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_animation_sequences_updated_at
  BEFORE UPDATE ON animation_sequences
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_visual_effects_updated_at
  BEFORE UPDATE ON visual_effects
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_visual_themes_updated_at
  BEFORE UPDATE ON visual_themes
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- SEED DATA (Example sprites and animations)
-- ============================================================================

-- Example sprite sheet: Desktop icons
INSERT INTO sprite_sheets (name, display_name, description, image_url, image_width, image_height, frame_width, frame_height, frames, columns, rows, category) VALUES
  ('desktop_icons', 'Desktop Icons', 'Standard desktop application icons', '/sprites/desktop-icons.png', 512, 512, 64, 64, 64, 8, 8, 'icons'),
  ('ui_elements', 'UI Elements', 'User interface components', '/sprites/ui-elements.png', 256, 256, 32, 32, 64, 8, 8, 'ui'),
  ('particles', 'Particle Effects', 'Particle textures for effects', '/sprites/particles.png', 128, 128, 16, 16, 64, 8, 8, 'effects')
ON CONFLICT (name) DO NOTHING;

-- Example animation sequence
INSERT INTO animation_sequences (name, display_name, sheet_id, frames, default_fps, loop, category) VALUES
  (
    'icon_bounce',
    'Icon Bounce',
    (SELECT id FROM sprite_sheets WHERE name = 'desktop_icons'),
    ARRAY[0, 1, 2, 3, 2, 1],
    12,
    FALSE,
    'hover'
  )
ON CONFLICT (name) DO NOTHING;

-- Example visual effects
INSERT INTO visual_effects (name, display_name, effect_type, config, category) VALUES
  (
    'confetti_burst',
    'Confetti Burst',
    'particle',
    '{"count": 50, "colors": ["#ff0000", "#00ff00", "#0000ff", "#ffff00"], "spread": 360, "velocity": 5}'::jsonb,
    'celebration'
  ),
  (
    'sparkle_trail',
    'Sparkle Trail',
    'particle',
    '{"count": 10, "color": "#ffff00", "radius": 30, "decay": 0.02}'::jsonb,
    'ambient'
  ),
  (
    'ripple_effect',
    'Ripple Effect',
    'canvas_effect',
    '{"color": "rgba(255, 255, 255, 0.5)", "duration": 600, "maxRadius": null}'::jsonb,
    'feedback'
  )
ON CONFLICT (name) DO NOTHING;

-- Example icon animations
INSERT INTO icon_animations (name, display_name, animation_type, config, trigger) VALUES
  (
    'bounce',
    'Bounce',
    'css',
    '{"duration": 600, "height": 20, "iterations": 1}'::jsonb,
    'hover'
  ),
  (
    'pulse',
    'Pulse',
    'css',
    '{"duration": 800, "scale": 1.15, "iterations": 1}'::jsonb,
    'hover'
  ),
  (
    'wiggle',
    'Wiggle',
    'css',
    '{"duration": 400, "rotation": 8, "iterations": 1}'::jsonb,
    'hover'
  ),
  (
    'create_popup',
    'Create Animation',
    'css',
    '{"duration": 400, "from_scale": 0, "to_scale": 1}'::jsonb,
    'create'
  )
ON CONFLICT (name) DO NOTHING;

-- Example theme
INSERT INTO visual_themes (name, display_name, description, colors, is_system) VALUES
  (
    'classic',
    'Classic Theme',
    'Original CalOS look and feel',
    '{"primary": "#4a9eff", "secondary": "#6c757d", "success": "#28a745", "danger": "#dc3545"}'::jsonb,
    TRUE
  )
ON CONFLICT (name) DO NOTHING;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE sprite_sheets IS 'Sprite sheet definitions with grid layout';
COMMENT ON TABLE sprite_atlas IS 'Named sprite regions within a sprite sheet';
COMMENT ON TABLE animation_sequences IS 'Frame-by-frame animation definitions';
COMMENT ON TABLE visual_effects IS 'Pre-configured visual effects (particles, sprites, canvas)';
COMMENT ON TABLE icon_animations IS 'Desktop icon animation presets';
COMMENT ON TABLE visual_themes IS 'Visual theme configurations with assets and styles';

COMMENT ON FUNCTION get_sprite_sheet_full IS 'Get sprite sheet with all atlas data';
COMMENT ON FUNCTION get_animation_full IS 'Get animation with sprite sheet data';
COMMENT ON FUNCTION update_sprite_usage IS 'Increment usage counter and update last used timestamp';
