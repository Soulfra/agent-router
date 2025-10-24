-- Migration: Translation Cache System
-- Purpose: Store pre-loaded translations for offline use, eliminating API rate limits
-- Related to: lib/translation-adapter.js, MyMemory API

-- ============================================================================
-- TRANSLATION CACHE
-- ============================================================================

CREATE TABLE IF NOT EXISTS translation_cache (
  id SERIAL PRIMARY KEY,
  source_text TEXT NOT NULL,
  source_lang VARCHAR(10) NOT NULL,
  target_lang VARCHAR(10) NOT NULL,
  translated_text TEXT NOT NULL,
  confidence_score DECIMAL(3,2), -- Match score from MyMemory (0.00-1.00)
  provider VARCHAR(50) DEFAULT 'mymemory',
  context VARCHAR(100), -- e.g. 'calculator', 'ui', 'general'
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_used_at TIMESTAMP,
  use_count INTEGER DEFAULT 0,

  -- Ensure unique translations per language pair
  UNIQUE(source_text, source_lang, target_lang, context)
);

-- Index for fast translation lookups
CREATE INDEX idx_translation_lookup ON translation_cache(source_text, source_lang, target_lang);

-- Index for finding all translations in a specific language
CREATE INDEX idx_translation_target_lang ON translation_cache(target_lang);

-- Index for context-specific queries (e.g., all calculator translations)
CREATE INDEX idx_translation_context ON translation_cache(context, target_lang);

-- ============================================================================
-- TRANSLATION USAGE STATISTICS
-- ============================================================================

CREATE TABLE IF NOT EXISTS translation_stats (
  id SERIAL PRIMARY KEY,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  language_pair VARCHAR(25) NOT NULL, -- e.g. 'en-es', 'fr-de'
  api_calls INTEGER DEFAULT 0,
  cache_hits INTEGER DEFAULT 0,
  total_chars_translated INTEGER DEFAULT 0,

  UNIQUE(date, language_pair)
);

-- Index for date-based queries
CREATE INDEX idx_translation_stats_date ON translation_stats(date);

-- ============================================================================
-- LANGUAGE PREFERENCES
-- ============================================================================

CREATE TABLE IF NOT EXISTS user_language_preferences (
  id SERIAL PRIMARY KEY,
  user_id INTEGER, -- NULL for anonymous/guest users
  ip_address VARCHAR(45), -- IPv4 or IPv6
  detected_language VARCHAR(10), -- From Accept-Language header
  preferred_language VARCHAR(10), -- User's explicit choice
  country_code VARCHAR(2), -- From geolocation
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_used_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Index for IP-based language detection
CREATE INDEX idx_user_lang_ip ON user_language_preferences(ip_address);

-- Index for user-based lookups
CREATE INDEX idx_user_lang_user ON user_language_preferences(user_id);

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Function to update translation usage count
CREATE OR REPLACE FUNCTION update_translation_usage()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE translation_cache
  SET use_count = use_count + 1,
      last_used_at = CURRENT_TIMESTAMP
  WHERE id = NEW.id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function to record translation stats
CREATE OR REPLACE FUNCTION record_translation_stat(
  p_language_pair VARCHAR(25),
  p_api_call BOOLEAN DEFAULT FALSE,
  p_cache_hit BOOLEAN DEFAULT FALSE,
  p_char_count INTEGER DEFAULT 0
)
RETURNS VOID AS $$
BEGIN
  INSERT INTO translation_stats (date, language_pair, api_calls, cache_hits, total_chars_translated)
  VALUES (
    CURRENT_DATE,
    p_language_pair,
    CASE WHEN p_api_call THEN 1 ELSE 0 END,
    CASE WHEN p_cache_hit THEN 1 ELSE 0 END,
    p_char_count
  )
  ON CONFLICT (date, language_pair) DO UPDATE
  SET
    api_calls = translation_stats.api_calls + CASE WHEN p_api_call THEN 1 ELSE 0 END,
    cache_hits = translation_stats.cache_hits + CASE WHEN p_cache_hit THEN 1 ELSE 0 END,
    total_chars_translated = translation_stats.total_chars_translated + p_char_count;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- SEED DATA (Common UI Translations)
-- ============================================================================

-- English UI strings (baseline)
INSERT INTO translation_cache (source_text, source_lang, target_lang, translated_text, confidence_score, context, provider) VALUES
  ('Files', 'en', 'en', 'Files', 1.00, 'ui', 'native'),
  ('Chat', 'en', 'en', 'Chat', 1.00, 'ui', 'native'),
  ('API Keys', 'en', 'en', 'API Keys', 1.00, 'ui', 'native'),
  ('Models', 'en', 'en', 'Models', 1.00, 'ui', 'native'),
  ('App Store', 'en', 'en', 'App Store', 1.00, 'ui', 'native'),
  ('Settings', 'en', 'en', 'Settings', 1.00, 'ui', 'native'),
  ('Calculator', 'en', 'en', 'Calculator', 1.00, 'ui', 'native'),
  ('Theme', 'en', 'en', 'Theme', 1.00, 'ui', 'native'),
  ('Language', 'en', 'en', 'Language', 1.00, 'ui', 'native'),
  ('Save', 'en', 'en', 'Save', 1.00, 'ui', 'native'),
  ('Cancel', 'en', 'en', 'Cancel', 1.00, 'ui', 'native'),
  ('Delete', 'en', 'en', 'Delete', 1.00, 'ui', 'native'),
  ('Close', 'en', 'en', 'Close', 1.00, 'ui', 'native'),
  ('Open', 'en', 'en', 'Open', 1.00, 'ui', 'native'),
  ('Loading...', 'en', 'en', 'Loading...', 1.00, 'ui', 'native'),
  ('Error', 'en', 'en', 'Error', 1.00, 'ui', 'native'),
  ('Success', 'en', 'en', 'Success', 1.00, 'ui', 'native'),
  ('Offline Mode', 'en', 'en', 'Offline Mode', 1.00, 'ui', 'native'),
  ('Online', 'en', 'en', 'Online', 1.00, 'ui', 'native')
ON CONFLICT (source_text, source_lang, target_lang, context) DO NOTHING;

-- Spanish translations
INSERT INTO translation_cache (source_text, source_lang, target_lang, translated_text, confidence_score, context, provider) VALUES
  ('Files', 'en', 'es', 'Archivos', 1.00, 'ui', 'mymemory'),
  ('Chat', 'en', 'es', 'Chat', 1.00, 'ui', 'mymemory'),
  ('API Keys', 'en', 'es', 'Claves API', 1.00, 'ui', 'mymemory'),
  ('Models', 'en', 'es', 'Modelos', 1.00, 'ui', 'mymemory'),
  ('App Store', 'en', 'es', 'Tienda', 1.00, 'ui', 'mymemory'),
  ('Settings', 'en', 'es', 'Configuración', 1.00, 'ui', 'mymemory'),
  ('Calculator', 'en', 'es', 'Calculadora', 1.00, 'ui', 'mymemory'),
  ('Theme', 'en', 'es', 'Tema', 1.00, 'ui', 'mymemory'),
  ('Language', 'en', 'es', 'Idioma', 1.00, 'ui', 'mymemory'),
  ('Save', 'en', 'es', 'Guardar', 1.00, 'ui', 'mymemory'),
  ('Cancel', 'en', 'es', 'Cancelar', 1.00, 'ui', 'mymemory'),
  ('Delete', 'en', 'es', 'Eliminar', 1.00, 'ui', 'mymemory'),
  ('Close', 'en', 'es', 'Cerrar', 1.00, 'ui', 'mymemory'),
  ('Open', 'en', 'es', 'Abrir', 1.00, 'ui', 'mymemory'),
  ('Loading...', 'en', 'es', 'Cargando...', 1.00, 'ui', 'mymemory'),
  ('Error', 'en', 'es', 'Error', 1.00, 'ui', 'mymemory'),
  ('Success', 'en', 'es', 'Éxito', 1.00, 'ui', 'mymemory'),
  ('Offline Mode', 'en', 'es', 'Modo Sin Conexión', 1.00, 'ui', 'mymemory'),
  ('Online', 'en', 'es', 'En Línea', 1.00, 'ui', 'mymemory')
ON CONFLICT (source_text, source_lang, target_lang, context) DO NOTHING;

-- Calculator-specific translations (English baseline)
INSERT INTO translation_cache (source_text, source_lang, target_lang, translated_text, confidence_score, context, provider) VALUES
  ('XP Calculator', 'en', 'en', 'XP Calculator', 1.00, 'calculator', 'native'),
  ('Current Level', 'en', 'en', 'Current Level', 1.00, 'calculator', 'native'),
  ('Target Level', 'en', 'en', 'Target Level', 1.00, 'calculator', 'native'),
  ('Current XP', 'en', 'en', 'Current XP', 1.00, 'calculator', 'native'),
  ('XP Needed', 'en', 'en', 'XP Needed', 1.00, 'calculator', 'native'),
  ('Calculate', 'en', 'en', 'Calculate', 1.00, 'calculator', 'native'),
  ('Clear', 'en', 'en', 'Clear', 1.00, 'calculator', 'native'),
  ('Result', 'en', 'en', 'Result', 1.00, 'calculator', 'native')
ON CONFLICT (source_text, source_lang, target_lang, context) DO NOTHING;

-- Spanish calculator translations
INSERT INTO translation_cache (source_text, source_lang, target_lang, translated_text, confidence_score, context, provider) VALUES
  ('XP Calculator', 'en', 'es', 'Calculadora de XP', 1.00, 'calculator', 'mymemory'),
  ('Current Level', 'en', 'es', 'Nivel Actual', 1.00, 'calculator', 'mymemory'),
  ('Target Level', 'en', 'es', 'Nivel Objetivo', 1.00, 'calculator', 'mymemory'),
  ('Current XP', 'en', 'es', 'XP Actual', 1.00, 'calculator', 'mymemory'),
  ('XP Needed', 'en', 'es', 'XP Necesaria', 1.00, 'calculator', 'mymemory'),
  ('Calculate', 'en', 'es', 'Calcular', 1.00, 'calculator', 'mymemory'),
  ('Clear', 'en', 'es', 'Limpiar', 1.00, 'calculator', 'mymemory'),
  ('Result', 'en', 'es', 'Resultado', 1.00, 'calculator', 'mymemory')
ON CONFLICT (source_text, source_lang, target_lang, context) DO NOTHING;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE translation_cache IS 'Cached translations for offline use, eliminating API rate limits';
COMMENT ON TABLE translation_stats IS 'Daily statistics for translation usage and API call tracking';
COMMENT ON TABLE user_language_preferences IS 'User language preferences based on geolocation and browser settings';
COMMENT ON FUNCTION record_translation_stat IS 'Records daily translation statistics (API calls, cache hits, character count)';
