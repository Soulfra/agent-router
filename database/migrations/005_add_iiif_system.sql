-- Migration 005: IIIF Image Management System
-- IIIF v3 compliant image server with manifest generation

-- IIIF Images metadata
CREATE TABLE IF NOT EXISTS iiif_images (
  id SERIAL PRIMARY KEY,
  filename VARCHAR(255) NOT NULL UNIQUE,
  original_filename VARCHAR(255),

  -- Image dimensions
  width INT NOT NULL,
  height INT NOT NULL,
  format VARCHAR(20),
  file_size BIGINT,

  -- Storage paths
  storage_path TEXT NOT NULL,
  thumbnail_path TEXT,

  -- Metadata
  title VARCHAR(500),
  description TEXT,
  metadata JSONB DEFAULT '{}',
  tags TEXT[],

  -- Session-based user tracking (matches knowledge system pattern)
  user_id VARCHAR(100),
  session_id VARCHAR(100),

  -- Timestamps
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- IIIF Manifests (Presentation API v3)
CREATE TABLE IF NOT EXISTS iiif_manifests (
  id SERIAL PRIMARY KEY,
  manifest_id VARCHAR(255) NOT NULL UNIQUE,

  -- Manifest content
  title VARCHAR(500),
  description TEXT,
  author VARCHAR(255),
  manifest_json JSONB NOT NULL,

  -- Access control
  is_public BOOLEAN DEFAULT false,

  -- Session-based user tracking
  user_id VARCHAR(100),
  session_id VARCHAR(100),

  -- Timestamps
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Canvas to image mapping for multi-page manifests
CREATE TABLE IF NOT EXISTS iiif_canvas_images (
  id SERIAL PRIMARY KEY,
  manifest_id INT REFERENCES iiif_manifests(id) ON DELETE CASCADE,
  image_id INT REFERENCES iiif_images(id) ON DELETE CASCADE,
  canvas_order INT NOT NULL,
  canvas_label VARCHAR(255),
  UNIQUE(manifest_id, canvas_order)
);

-- IIIF cache tracking for performance monitoring
CREATE TABLE IF NOT EXISTS iiif_cache_stats (
  id SERIAL PRIMARY KEY,
  image_id INT REFERENCES iiif_images(id) ON DELETE CASCADE,
  request_path TEXT NOT NULL,
  cache_key VARCHAR(255) UNIQUE,
  hit_count INT DEFAULT 0,
  last_accessed TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_iiif_images_filename ON iiif_images(filename);
CREATE INDEX IF NOT EXISTS idx_iiif_images_user ON iiif_images(user_id);
CREATE INDEX IF NOT EXISTS idx_iiif_images_session ON iiif_images(session_id);
CREATE INDEX IF NOT EXISTS idx_iiif_images_created ON iiif_images(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_iiif_images_tags ON iiif_images USING GIN(tags);

CREATE INDEX IF NOT EXISTS idx_iiif_manifests_manifest_id ON iiif_manifests(manifest_id);
CREATE INDEX IF NOT EXISTS idx_iiif_manifests_user ON iiif_manifests(user_id);
CREATE INDEX IF NOT EXISTS idx_iiif_manifests_public ON iiif_manifests(is_public);

CREATE INDEX IF NOT EXISTS idx_iiif_cache_key ON iiif_cache_stats(cache_key);
CREATE INDEX IF NOT EXISTS idx_iiif_cache_image ON iiif_cache_stats(image_id);

-- Update trigger for iiif_images.updated_at
CREATE OR REPLACE FUNCTION update_iiif_images_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_iiif_images_timestamp
BEFORE UPDATE ON iiif_images
FOR EACH ROW
EXECUTE FUNCTION update_iiif_images_timestamp();

-- Update trigger for iiif_manifests.updated_at
CREATE OR REPLACE FUNCTION update_iiif_manifests_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_iiif_manifests_timestamp
BEFORE UPDATE ON iiif_manifests
FOR EACH ROW
EXECUTE FUNCTION update_iiif_manifests_timestamp();

-- View for recent images
CREATE OR REPLACE VIEW recent_iiif_images AS
SELECT
  id,
  filename,
  title,
  width,
  height,
  format,
  thumbnail_path,
  user_id,
  created_at
FROM iiif_images
ORDER BY created_at DESC;

-- Success indicator
SELECT 'Migration 005: IIIF Image Management System - Completed' as status;
