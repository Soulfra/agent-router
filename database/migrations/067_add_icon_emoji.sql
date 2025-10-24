-- Migration: Add icon_emoji column to learning_paths
-- Fixes error: column lp.icon_emoji does not exist
-- This column is referenced in lib/learning-engine.js:91

-- Add icon_emoji column to learning_paths table
ALTER TABLE learning_paths
ADD COLUMN IF NOT EXISTS icon_emoji TEXT;

-- Add a helpful comment
COMMENT ON COLUMN learning_paths.icon_emoji IS 'Emoji icon for the learning path (e.g., 🎓, 🚀, 💻)';

-- Update existing rows with a default emoji (optional)
UPDATE learning_paths
SET icon_emoji = '📚'
WHERE icon_emoji IS NULL;
