-- Account System + IIIF Integration Schema
-- For CALOS with Soulfra integration

-- ============================================================================
-- USER ACCOUNTS & SESSIONS
-- ============================================================================

-- User accounts table
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(255) UNIQUE,
  display_name VARCHAR(255),
  email VARCHAR(255) UNIQUE,

  -- Soulfra integration
  soulfra_id VARCHAR(255) UNIQUE,
  vibe_score INT DEFAULT 0,
  vibes_balance BIGINT DEFAULT 0,
  trust_level INT DEFAULT 1,

  -- Session tracking
  session_token VARCHAR(255) UNIQUE,
  ip_address INET,
  browser_fingerprint VARCHAR(255),

  -- Preferences
  preferences JSONB DEFAULT '{}',
  theme VARCHAR(50) DEFAULT 'dark',

  -- Timestamps
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Session storage
CREATE TABLE IF NOT EXISTS user_sessions (
  id SERIAL PRIMARY KEY,
  user_id INT REFERENCES users(id) ON DELETE CASCADE,
  session_token VARCHAR(255) UNIQUE NOT NULL,
  ip_address INET,
  user_agent TEXT,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- User activity log
CREATE TABLE IF NOT EXISTS user_activity (
  id SERIAL PRIMARY KEY,
  user_id INT REFERENCES users(id) ON DELETE CASCADE,
  activity_type VARCHAR(100),
  activity_data JSONB,
  ip_address INET,
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- IIIF IMAGE MANAGEMENT
-- ============================================================================

-- IIIF images metadata
CREATE TABLE IF NOT EXISTS iiif_images (
  id SERIAL PRIMARY KEY,
  filename VARCHAR(255) NOT NULL UNIQUE,
  original_filename VARCHAR(255),
  collection_id INT,
  user_id INT REFERENCES users(id),

  -- Image dimensions
  width INT NOT NULL,
  height INT NOT NULL,
  format VARCHAR(20),
  file_size BIGINT,

  -- Storage
  storage_path TEXT,
  thumbnail_path TEXT,

  -- Metadata
  title VARCHAR(500),
  description TEXT,
  metadata JSONB,
  tags TEXT[],

  -- Timestamps
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- IIIF manifests
CREATE TABLE IF NOT EXISTS iiif_manifests (
  id SERIAL PRIMARY KEY,
  manifest_id VARCHAR(255) NOT NULL UNIQUE,
  collection_id INT,
  user_id INT REFERENCES users(id),

  -- Manifest content
  title VARCHAR(500),
  description TEXT,
  author VARCHAR(255),
  manifest_json JSONB NOT NULL,

  -- Access control
  is_public BOOLEAN DEFAULT false,

  -- Timestamps
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Canvas to image mapping
CREATE TABLE IF NOT EXISTS iiif_canvas_images (
  id SERIAL PRIMARY KEY,
  manifest_id INT REFERENCES iiif_manifests(id) ON DELETE CASCADE,
  image_id INT REFERENCES iiif_images(id) ON DELETE CASCADE,
  canvas_order INT NOT NULL,
  canvas_label VARCHAR(255),
  UNIQUE(manifest_id, canvas_order)
);

-- IIIF cache tracking
CREATE TABLE IF NOT EXISTS iiif_cache (
  id SERIAL PRIMARY KEY,
  image_id INT REFERENCES iiif_images(id) ON DELETE CASCADE,
  request_path TEXT NOT NULL,
  cache_key VARCHAR(255) UNIQUE,
  cached_file_path TEXT,
  cache_size BIGINT,
  hit_count INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_accessed TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- KNOWLEDGE BASE (Voice Notes, Documents)
-- ============================================================================

-- Notes and voice recordings
CREATE TABLE IF NOT EXISTS notes (
  id SERIAL PRIMARY KEY,
  user_id INT REFERENCES users(id),
  title VARCHAR(500),
  content TEXT,
  source VARCHAR(50), -- 'voice', 'upload', 'manual', 'api'
  source_file VARCHAR(255),
  mime_type VARCHAR(100),

  -- Organization
  category VARCHAR(100),
  tags TEXT[],

  -- Voice-specific
  audio_path TEXT,
  transcription_confidence FLOAT,

  -- Timestamps
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Note chunks (for large documents)
CREATE TABLE IF NOT EXISTS note_chunks (
  id SERIAL PRIMARY KEY,
  note_id INT REFERENCES notes(id) ON DELETE CASCADE,
  chunk_order INT NOT NULL,
  chunk_text TEXT,
  metadata JSONB,
  UNIQUE(note_id, chunk_order)
);

-- Chat sessions with knowledge base
CREATE TABLE IF NOT EXISTS knowledge_chats (
  id SERIAL PRIMARY KEY,
  session_id VARCHAR(255) NOT NULL,
  user_id INT REFERENCES users(id),
  query TEXT NOT NULL,
  response TEXT,
  source_notes INT[],
  voice_input BOOLEAN DEFAULT false,
  voice_output BOOLEAN DEFAULT false,
  audio_response_path TEXT,
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- VIBES & TRUST SYSTEM
-- ============================================================================

-- VIBES transactions
CREATE TABLE IF NOT EXISTS vibes_transactions (
  id SERIAL PRIMARY KEY,
  user_id INT REFERENCES users(id),
  amount BIGINT NOT NULL,
  transaction_type VARCHAR(50), -- 'earn', 'spend', 'transfer'
  source VARCHAR(100), -- 'deathtod

ata', 'agent_usage', 'trust_bonus'
  description TEXT,
  balance_after BIGINT,
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Trust score history
CREATE TABLE IF NOT EXISTS trust_history (
  id SERIAL PRIMARY KEY,
  user_id INT REFERENCES users(id),
  old_score INT,
  new_score INT,
  reason VARCHAR(255),
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_users_session_token ON users(session_token);
CREATE INDEX IF NOT EXISTS idx_users_soulfra_id ON users(soulfra_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_token ON user_sessions(session_token);
CREATE INDEX IF NOT EXISTS idx_user_activity_user_time ON user_activity(user_id, timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_iiif_images_filename ON iiif_images(filename);
CREATE INDEX IF NOT EXISTS idx_iiif_images_user ON iiif_images(user_id);
CREATE INDEX IF NOT EXISTS idx_iiif_manifests_user ON iiif_manifests(user_id);
CREATE INDEX IF NOT EXISTS idx_iiif_cache_key ON iiif_cache(cache_key);

CREATE INDEX IF NOT EXISTS idx_notes_user ON notes(user_id);
CREATE INDEX IF NOT EXISTS idx_notes_created ON notes(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_knowledge_chats_session ON knowledge_chats(session_id);

CREATE INDEX IF NOT EXISTS idx_vibes_transactions_user ON vibes_transactions(user_id, timestamp DESC);
