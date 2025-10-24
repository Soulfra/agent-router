/**
 * Migration 041: Remove Cookie Tracking (Privacy-First)
 *
 * This migration removes cookie-based tracking in favor of session-based analytics.
 *
 * Changes:
 * - Drop cookie_id columns from identity resolution tables (if they exist)
 * - Remove any cookie-related tracking tables
 * - Document transition to privacy-first approach
 *
 * What we removed:
 * - Third-party cookie tracking
 * - Persistent cookie IDs
 * - Cross-site tracking identifiers
 *
 * What we kept:
 * - Session IDs (temporary, first-party)
 * - User authentication tokens
 * - Referral/affiliate codes (URL-based)
 */

-- ============================================================================
-- REMOVE COOKIE TRACKING COLUMNS
-- ============================================================================

-- Drop cookie_id from identity_graph table (if exists)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'identity_graph'
  ) THEN
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'identity_graph'
        AND column_name = 'cookie_id'
    ) THEN
      ALTER TABLE identity_graph DROP COLUMN IF EXISTS cookie_id;
      RAISE NOTICE 'Dropped cookie_id from identity_graph';
    END IF;
  END IF;
END $$;

-- Drop cookie tracking tables (if exist)
DROP TABLE IF EXISTS cookie_tracking CASCADE;
DROP TABLE IF EXISTS third_party_cookies CASCADE;
DROP TABLE IF EXISTS tracking_pixels CASCADE;

-- ============================================================================
-- REMOVE ANALYTICS COOKIES
-- ============================================================================

-- Drop Google Analytics related tables (if exist)
DROP TABLE IF EXISTS ga_events CASCADE;
DROP TABLE IF EXISTS ga_sessions CASCADE;
DROP TABLE IF EXISTS ga_user_properties CASCADE;

-- Drop Facebook Pixel related tables (if exist)
DROP TABLE IF EXISTS fb_pixel_events CASCADE;
DROP TABLE IF EXISTS fb_conversions CASCADE;

-- ============================================================================
-- DOCUMENT PRIVACY-FIRST APPROACH
-- ============================================================================

COMMENT ON SCHEMA public IS 'Privacy-first analytics - NO cookie tracking, NO third-party analytics, NO cross-site tracking. Uses session-based server-side analytics only.';

-- ============================================================================
-- MIGRATION NOTES
-- ============================================================================

-- This migration transitions from cookie-based tracking to privacy-first approach:
--
-- BEFORE:
-- - Third-party cookies (Google Analytics, Facebook Pixel)
-- - Persistent cookie IDs
-- - Cross-site tracking
-- - User behavior tracking across sites
--
-- AFTER:
-- - Session-based analytics (server-side only)
-- - No third-party tracking
-- - No persistent cookies for tracking
-- - Anonymous aggregated statistics only
--
-- Attribution still works via:
-- - QR codes with session tokens
-- - Referral links with affiliate codes
-- - First-party session IDs (temporary)
-- - Server-side event tracking
--
-- GDPR/CCPA Compliance:
-- - No consent banner needed (we don't track)
-- - Automatic data deletion after 90 days
-- - User data export available
-- - Right to deletion honored

-- ============================================================================
-- VERIFICATION
-- ============================================================================

-- Verify no cookie tracking columns remain
DO $$
DECLARE
  cookie_columns RECORD;
BEGIN
  FOR cookie_columns IN
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND column_name LIKE '%cookie%'
  LOOP
    RAISE NOTICE 'Found cookie-related column: %.%', cookie_columns.table_name, cookie_columns.column_name;
  END LOOP;
END $$;

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================

SELECT 'Migration 041: Remove Cookie Tracking (Privacy-First) - Complete' as status;
SELECT 'Transitioned to session-based analytics WITHOUT cookies' as note;
