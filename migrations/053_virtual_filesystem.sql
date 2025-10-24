-- Migration: Virtual Filesystem
-- Purpose: Store virtual folders and files for CalOS desktop environment
-- Features: Folders, files, permissions, metadata, path hierarchy

-- ============================================================================
-- VIRTUAL FOLDERS
-- ============================================================================

CREATE TABLE IF NOT EXISTS virtual_folders (
  id SERIAL PRIMARY KEY,
  user_id INTEGER, -- NULL for system folders
  parent_id INTEGER REFERENCES virtual_folders(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  path TEXT NOT NULL, -- Full path for fast lookups: /Desktop/MyFolder
  icon VARCHAR(10) DEFAULT '📁',
  color VARCHAR(20), -- Hex color for folder icon tint
  is_system BOOLEAN DEFAULT FALSE, -- System folders like /Desktop, /Documents
  is_desktop BOOLEAN DEFAULT FALSE, -- Show on desktop
  position_x INTEGER, -- Desktop icon position
  position_y INTEGER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  -- Ensure unique paths per user
  UNIQUE(user_id, path),
  -- Ensure unique names within parent folder
  UNIQUE(user_id, parent_id, name)
);

-- Index for fast path lookups
CREATE INDEX idx_virtual_folders_path ON virtual_folders(user_id, path);
CREATE INDEX idx_virtual_folders_parent ON virtual_folders(parent_id);
CREATE INDEX idx_virtual_folders_desktop ON virtual_folders(user_id, is_desktop) WHERE is_desktop = TRUE;

-- ============================================================================
-- VIRTUAL FILES
-- ============================================================================

CREATE TABLE IF NOT EXISTS virtual_files (
  id SERIAL PRIMARY KEY,
  user_id INTEGER, -- NULL for system files
  folder_id INTEGER REFERENCES virtual_folders(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  path TEXT NOT NULL, -- Full path: /Desktop/document.txt
  type VARCHAR(50) NOT NULL, -- document, image, video, app, link, etc.
  mime_type VARCHAR(100), -- application/json, image/png, etc.
  icon VARCHAR(10) DEFAULT '📄',
  size_bytes BIGINT DEFAULT 0,

  -- Content storage
  content_type VARCHAR(20) DEFAULT 'reference', -- reference, inline, external
  content_reference TEXT, -- Path to actual file, URL, or database key
  content_inline TEXT, -- Small files stored directly

  -- Metadata
  metadata JSONB, -- Arbitrary metadata (dimensions, duration, tags, etc.)
  is_desktop BOOLEAN DEFAULT FALSE, -- Show on desktop
  position_x INTEGER, -- Desktop icon position
  position_y INTEGER,

  -- Executable/app files
  is_executable BOOLEAN DEFAULT FALSE,
  execute_url TEXT, -- URL to open when executed (e.g., /calculator.html)

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_accessed_at TIMESTAMP,

  -- Ensure unique paths per user
  UNIQUE(user_id, path),
  -- Ensure unique names within folder
  UNIQUE(user_id, folder_id, name)
);

-- Indexes
CREATE INDEX idx_virtual_files_path ON virtual_files(user_id, path);
CREATE INDEX idx_virtual_files_folder ON virtual_files(folder_id);
CREATE INDEX idx_virtual_files_type ON virtual_files(type);
CREATE INDEX idx_virtual_files_desktop ON virtual_files(user_id, is_desktop) WHERE is_desktop = TRUE;
CREATE INDEX idx_virtual_files_metadata ON virtual_files USING gin(metadata) WHERE metadata IS NOT NULL;

-- ============================================================================
-- FILE PERMISSIONS (optional, for future multi-user)
-- ============================================================================

CREATE TABLE IF NOT EXISTS file_permissions (
  id SERIAL PRIMARY KEY,
  item_type VARCHAR(10) NOT NULL, -- 'folder' or 'file'
  item_id INTEGER NOT NULL,
  user_id INTEGER,
  group_id INTEGER,
  can_read BOOLEAN DEFAULT TRUE,
  can_write BOOLEAN DEFAULT FALSE,
  can_execute BOOLEAN DEFAULT FALSE,
  can_delete BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_file_permissions_item ON file_permissions(item_type, item_id);
CREATE INDEX idx_file_permissions_user ON file_permissions(user_id);

-- ============================================================================
-- RECENT FILES (for quick access)
-- ============================================================================

CREATE TABLE IF NOT EXISTS recent_files (
  id SERIAL PRIMARY KEY,
  user_id INTEGER,
  file_id INTEGER REFERENCES virtual_files(id) ON DELETE CASCADE,
  accessed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  access_count INTEGER DEFAULT 1,

  UNIQUE(user_id, file_id)
);

CREATE INDEX idx_recent_files_user ON recent_files(user_id, accessed_at DESC);

-- ============================================================================
-- TRASH / RECYCLE BIN
-- ============================================================================

CREATE TABLE IF NOT EXISTS trash_bin (
  id SERIAL PRIMARY KEY,
  user_id INTEGER,
  item_type VARCHAR(10) NOT NULL, -- 'folder' or 'file'
  item_id INTEGER NOT NULL,
  original_path TEXT NOT NULL,
  original_parent_id INTEGER,
  deleted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  deleted_by INTEGER,
  auto_delete_at TIMESTAMP DEFAULT (CURRENT_TIMESTAMP + INTERVAL '30 days')
);

CREATE INDEX idx_trash_bin_user ON trash_bin(user_id, deleted_at DESC);
CREATE INDEX idx_trash_bin_auto_delete ON trash_bin(auto_delete_at) WHERE auto_delete_at IS NOT NULL;

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Function to get folder contents (files + subfolders)
CREATE OR REPLACE FUNCTION get_folder_contents(p_folder_id INTEGER, p_user_id INTEGER DEFAULT NULL)
RETURNS TABLE (
  item_type TEXT,
  item_id INTEGER,
  name TEXT,
  icon TEXT,
  path TEXT,
  created_at TIMESTAMP,
  size_bytes BIGINT
) AS $$
BEGIN
  RETURN QUERY
  -- Subfolders
  SELECT
    'folder'::TEXT,
    id,
    name,
    icon,
    path,
    created_at,
    0::BIGINT
  FROM virtual_folders
  WHERE parent_id = p_folder_id
    AND (p_user_id IS NULL OR user_id = p_user_id)

  UNION ALL

  -- Files
  SELECT
    'file'::TEXT,
    id,
    name,
    icon,
    path,
    created_at,
    size_bytes
  FROM virtual_files
  WHERE folder_id = p_folder_id
    AND (p_user_id IS NULL OR user_id = p_user_id)

  ORDER BY item_type DESC, name ASC;
END;
$$ LANGUAGE plpgsql;

-- Function to get desktop items
CREATE OR REPLACE FUNCTION get_desktop_items(p_user_id INTEGER DEFAULT NULL)
RETURNS TABLE (
  item_type TEXT,
  item_id INTEGER,
  name TEXT,
  icon TEXT,
  position_x INTEGER,
  position_y INTEGER
) AS $$
BEGIN
  RETURN QUERY
  -- Desktop folders
  SELECT
    'folder'::TEXT,
    id,
    name,
    icon,
    position_x,
    position_y
  FROM virtual_folders
  WHERE is_desktop = TRUE
    AND (p_user_id IS NULL OR user_id = p_user_id)

  UNION ALL

  -- Desktop files
  SELECT
    'file'::TEXT,
    id,
    name,
    icon,
    position_x,
    position_y
  FROM virtual_files
  WHERE is_desktop = TRUE
    AND (p_user_id IS NULL OR user_id = p_user_id)

  ORDER BY position_y ASC, position_x ASC;
END;
$$ LANGUAGE plpgsql;

-- Function to update file access time
CREATE OR REPLACE FUNCTION update_file_access(p_file_id INTEGER, p_user_id INTEGER DEFAULT NULL)
RETURNS VOID AS $$
BEGIN
  -- Update last accessed time
  UPDATE virtual_files
  SET last_accessed_at = CURRENT_TIMESTAMP
  WHERE id = p_file_id;

  -- Update recent files
  INSERT INTO recent_files (user_id, file_id, accessed_at, access_count)
  VALUES (p_user_id, p_file_id, CURRENT_TIMESTAMP, 1)
  ON CONFLICT (user_id, file_id) DO UPDATE
  SET accessed_at = CURRENT_TIMESTAMP,
      access_count = recent_files.access_count + 1;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- SEED DATA (System Folders)
-- ============================================================================

-- Create root system folders
INSERT INTO virtual_folders (name, path, icon, is_system, parent_id) VALUES
  ('Desktop', '/Desktop', '🖥️', TRUE, NULL),
  ('Documents', '/Documents', '📝', TRUE, NULL),
  ('Downloads', '/Downloads', '⬇️', TRUE, NULL),
  ('Pictures', '/Pictures', '🖼️', TRUE, NULL),
  ('Music', '/Music', '🎵', TRUE, NULL),
  ('Videos', '/Videos', '🎬', TRUE, NULL),
  ('Applications', '/Applications', '📦', TRUE, NULL),
  ('Trash', '/Trash', '🗑️', TRUE, NULL)
ON CONFLICT (user_id, path) DO NOTHING;

-- Create some example desktop apps
INSERT INTO virtual_files (folder_id, name, path, type, icon, is_executable, execute_url, is_desktop, position_x, position_y) VALUES
  ((SELECT id FROM virtual_folders WHERE path = '/Desktop'), 'Calculator', '/Desktop/Calculator', 'app', '🧮', TRUE, '/calculators/xp-calculator.html', TRUE, 50, 50),
  ((SELECT id FROM virtual_folders WHERE path = '/Desktop'), 'Chat', '/Desktop/Chat', 'app', '💬', TRUE, '/chat.html', TRUE, 150, 50),
  ((SELECT id FROM virtual_folders WHERE path = '/Desktop'), 'Files', '/Desktop/Files', 'app', '📁', TRUE, '/files.html', TRUE, 250, 50),
  ((SELECT id FROM virtual_folders WHERE path = '/Desktop'), 'Settings', '/Desktop/Settings', 'app', '⚙️', TRUE, '/settings.html', TRUE, 350, 50)
ON CONFLICT (user_id, path) DO NOTHING;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE virtual_folders IS 'Virtual folder structure for CalOS desktop environment';
COMMENT ON TABLE virtual_files IS 'Virtual files with metadata and content references';
COMMENT ON TABLE file_permissions IS 'Access control for files and folders';
COMMENT ON TABLE recent_files IS 'Recently accessed files for quick access menu';
COMMENT ON TABLE trash_bin IS 'Deleted items with auto-cleanup after 30 days';
COMMENT ON FUNCTION get_folder_contents IS 'Get all items (files + folders) in a folder';
COMMENT ON FUNCTION get_desktop_items IS 'Get all items displayed on the desktop';
COMMENT ON FUNCTION update_file_access IS 'Update file access time and recent files list';
