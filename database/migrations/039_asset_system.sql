/**
 * Migration 039: Asset & Inventory System
 *
 * Tables for asset compilation and game inventory:
 * - Resource manifests (compiled assets)
 * - Resource states (loading/loaded/failed)
 * - Game assets (items, tilemaps, characters)
 * - Player inventories
 * - Inventory items
 * - Equipped items
 */

-- ============================================================================
-- RESOURCE MANIFESTS
-- ============================================================================

CREATE TABLE IF NOT EXISTS resource_manifests (
  app_id UUID PRIMARY KEY REFERENCES user_installed_apps(app_id) ON DELETE CASCADE,
  manifest_data JSONB NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_resource_manifests_app ON resource_manifests(app_id);

COMMENT ON TABLE resource_manifests IS 'Asset compilation manifests for app instances';

-- ============================================================================
-- RESOURCE STATES
-- ============================================================================

CREATE TABLE IF NOT EXISTS resource_states (
  app_id UUID NOT NULL REFERENCES user_installed_apps(app_id) ON DELETE CASCADE,
  resource_id TEXT NOT NULL,
  resource_type TEXT NOT NULL, -- 'code', 'wasm', 'image', 'audio', 'model', 'data'
  resource_path TEXT NOT NULL,
  state TEXT DEFAULT 'empty', -- 'empty', 'loading', 'loaded', 'failed'
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  PRIMARY KEY (app_id, resource_id)
);

CREATE INDEX IF NOT EXISTS idx_resource_states_app ON resource_states(app_id);
CREATE INDEX IF NOT EXISTS idx_resource_states_type ON resource_states(resource_type);
CREATE INDEX IF NOT EXISTS idx_resource_states_state ON resource_states(state);

COMMENT ON TABLE resource_states IS 'Track loading state of app resources (empty vs loaded)';

-- ============================================================================
-- GAME ASSETS
-- ============================================================================

CREATE TABLE IF NOT EXISTS game_assets (
  app_id UUID PRIMARY KEY REFERENCES user_installed_apps(app_id) ON DELETE CASCADE,
  asset_data JSONB NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_game_assets_app ON game_assets(app_id);

COMMENT ON TABLE game_assets IS 'Game-specific assets (inventory definitions, tilemaps, characters)';

-- ============================================================================
-- PLAYER INVENTORIES
-- ============================================================================

CREATE TABLE IF NOT EXISTS player_inventories (
  app_id UUID NOT NULL REFERENCES user_installed_apps(app_id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  total_slots INT DEFAULT 20,
  created_at TIMESTAMP DEFAULT NOW(),
  PRIMARY KEY (app_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_player_inventories_user ON player_inventories(user_id);
CREATE INDEX IF NOT EXISTS idx_player_inventories_app ON player_inventories(app_id);

COMMENT ON TABLE player_inventories IS 'Player inventory configuration (total slots, etc)';

-- ============================================================================
-- INVENTORY ITEMS
-- ============================================================================

CREATE TABLE IF NOT EXISTS inventory_items (
  app_id UUID NOT NULL REFERENCES user_installed_apps(app_id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  slot_index INT NOT NULL,
  item_id TEXT NOT NULL,
  item_type TEXT NOT NULL, -- 'potion', 'weapon', 'armor', 'consumable', etc
  item_name TEXT NOT NULL,
  quantity INT DEFAULT 1,
  rarity TEXT DEFAULT 'common', -- 'common', 'uncommon', 'rare', 'epic', 'legendary'
  stackable BOOLEAN DEFAULT false,
  max_stack INT DEFAULT 99,
  value INT DEFAULT 0,
  metadata JSONB DEFAULT '{}',
  acquired_at TIMESTAMP DEFAULT NOW(),
  PRIMARY KEY (app_id, user_id, slot_index),
  FOREIGN KEY (app_id, user_id) REFERENCES player_inventories(app_id, user_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_inventory_items_user ON inventory_items(user_id);
CREATE INDEX IF NOT EXISTS idx_inventory_items_app ON inventory_items(app_id);
CREATE INDEX IF NOT EXISTS idx_inventory_items_type ON inventory_items(item_type);
CREATE INDEX IF NOT EXISTS idx_inventory_items_rarity ON inventory_items(rarity);

COMMENT ON TABLE inventory_items IS 'Items in player inventory (potions, weapons, armor)';

-- ============================================================================
-- EQUIPPED ITEMS
-- ============================================================================

CREATE TABLE IF NOT EXISTS equipped_items (
  app_id UUID NOT NULL REFERENCES user_installed_apps(app_id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  equipment_slot TEXT NOT NULL, -- 'head', 'body', 'weapon', 'shield', etc
  item_id TEXT NOT NULL,
  item_type TEXT NOT NULL,
  item_name TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  equipped_at TIMESTAMP DEFAULT NOW(),
  PRIMARY KEY (app_id, user_id, equipment_slot),
  FOREIGN KEY (app_id, user_id) REFERENCES player_inventories(app_id, user_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_equipped_items_user ON equipped_items(user_id);
CREATE INDEX IF NOT EXISTS idx_equipped_items_app ON equipped_items(app_id);

COMMENT ON TABLE equipped_items IS 'Items currently equipped by player';

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Auto-update updated_at on resource manifests
CREATE OR REPLACE FUNCTION update_resource_manifest_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_resource_manifests_updated
  BEFORE UPDATE ON resource_manifests
  FOR EACH ROW
  EXECUTE FUNCTION update_resource_manifest_timestamp();

-- Auto-update updated_at on resource states
CREATE OR REPLACE FUNCTION update_resource_state_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_resource_states_updated
  BEFORE UPDATE ON resource_states
  FOR EACH ROW
  EXECUTE FUNCTION update_resource_state_timestamp();

-- Auto-update updated_at on game assets
CREATE OR REPLACE FUNCTION update_game_assets_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_game_assets_updated
  BEFORE UPDATE ON game_assets
  FOR EACH ROW
  EXECUTE FUNCTION update_game_assets_timestamp();

-- ============================================================================
-- VIEWS
-- ============================================================================

-- View: Inventory summary
CREATE OR REPLACE VIEW inventory_summary AS
SELECT
  pi.app_id,
  pi.user_id,
  pi.total_slots,
  COUNT(ii.slot_index) as used_slots,
  pi.total_slots - COUNT(ii.slot_index) as empty_slots,
  ROUND((COUNT(ii.slot_index)::numeric / pi.total_slots) * 100, 2) as capacity_percent,
  SUM(ii.value * ii.quantity) as total_value
FROM player_inventories pi
LEFT JOIN inventory_items ii ON ii.app_id = pi.app_id AND ii.user_id = pi.user_id
GROUP BY pi.app_id, pi.user_id, pi.total_slots;

COMMENT ON VIEW inventory_summary IS 'Summary of player inventory status';

-- View: Resource loading progress
CREATE OR REPLACE VIEW resource_loading_progress AS
SELECT
  app_id,
  COUNT(*) as total_resources,
  COUNT(CASE WHEN state = 'empty' THEN 1 END) as empty,
  COUNT(CASE WHEN state = 'loading' THEN 1 END) as loading,
  COUNT(CASE WHEN state = 'loaded' THEN 1 END) as loaded,
  COUNT(CASE WHEN state = 'failed' THEN 1 END) as failed,
  ROUND((COUNT(CASE WHEN state = 'loaded' THEN 1 END)::numeric / COUNT(*)) * 100, 2) as load_percent
FROM resource_states
GROUP BY app_id;

COMMENT ON VIEW resource_loading_progress IS 'Resource loading progress by app';

-- View: Item rarity distribution
CREATE OR REPLACE VIEW item_rarity_distribution AS
SELECT
  app_id,
  user_id,
  rarity,
  COUNT(*) as count,
  SUM(quantity) as total_quantity
FROM inventory_items
GROUP BY app_id, user_id, rarity
ORDER BY app_id, user_id, rarity;

COMMENT ON VIEW item_rarity_distribution IS 'Distribution of items by rarity tier';

-- ============================================================================
-- INDEXES FOR PERFORMANCE
-- ============================================================================

-- Composite indexes for common queries
CREATE INDEX IF NOT EXISTS idx_inventory_items_user_type ON inventory_items(user_id, item_type);
CREATE INDEX IF NOT EXISTS idx_inventory_items_user_rarity ON inventory_items(user_id, rarity);
CREATE INDEX IF NOT EXISTS idx_inventory_items_stackable ON inventory_items(app_id, user_id, item_id) WHERE stackable = true;

-- ============================================================================
-- CLEANUP FUNCTIONS
-- ============================================================================

-- Function: Reset resource states to empty
CREATE OR REPLACE FUNCTION reset_resource_states(p_app_id UUID)
RETURNS INT AS $$
DECLARE
  updated_count INT;
BEGIN
  UPDATE resource_states
  SET state = 'empty', updated_at = NOW()
  WHERE app_id = p_app_id;

  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN updated_count;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION reset_resource_states IS 'Reset all resource states to empty for an app';

-- Function: Clear player inventory
CREATE OR REPLACE FUNCTION clear_player_inventory(p_app_id UUID, p_user_id UUID)
RETURNS INT AS $$
DECLARE
  deleted_count INT;
BEGIN
  DELETE FROM inventory_items
  WHERE app_id = p_app_id AND user_id = p_user_id;

  GET DIAGNOSTICS deleted_count = ROW_COUNT;

  DELETE FROM equipped_items
  WHERE app_id = p_app_id AND user_id = p_user_id;

  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION clear_player_inventory IS 'Clear all items from player inventory';

-- Function: Get inventory stats
CREATE OR REPLACE FUNCTION get_inventory_stats(p_app_id UUID, p_user_id UUID)
RETURNS TABLE (
  total_items INT,
  by_type JSONB,
  by_rarity JSONB,
  total_value BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*)::INT as total_items,
    jsonb_object_agg(item_type, count) as by_type,
    jsonb_object_agg(rarity, rarity_count) as by_rarity,
    SUM(value * quantity)::BIGINT as total_value
  FROM (
    SELECT
      item_type,
      rarity,
      value,
      quantity,
      COUNT(*) OVER (PARTITION BY item_type) as count,
      COUNT(*) OVER (PARTITION BY rarity) as rarity_count
    FROM inventory_items
    WHERE app_id = p_app_id AND user_id = p_user_id
  ) stats
  GROUP BY stats.total_items;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_inventory_stats IS 'Get comprehensive inventory statistics';

-- ============================================================================
-- GRANT PERMISSIONS
-- ============================================================================

-- Grant permissions to app user (adjust as needed)
-- GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_user;
-- GRANT SELECT ON ALL VIEWS IN SCHEMA public TO app_user;
-- GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO app_user;

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================

SELECT 'Migration 039: Asset & Inventory System - Complete' as status;
