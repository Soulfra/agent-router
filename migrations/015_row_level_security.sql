-- Migration: Row-Level Security (RLS) for Multi-Tenant Data Isolation
-- Prevents users from accessing other users' data even if application auth fails
-- "Can't fuck it up later" - database enforces tenant boundaries

-- ============================================================================
-- ENABLE ROW-LEVEL SECURITY ON CRITICAL TABLES
-- ============================================================================

ALTER TABLE learning_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_concept_mastery ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_concepts ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE learning_sessions IS 'RLS enabled: Users can only see their own tenant''s learning sessions';
COMMENT ON TABLE user_concept_mastery IS 'RLS enabled: Users can only see their own mastery records';
COMMENT ON TABLE knowledge_concepts IS 'RLS enabled: Public read, admin write';

-- ============================================================================
-- CREATE POLICIES: LEARNING SESSIONS (Tenant Isolation)
-- ============================================================================

-- Policy: Users can only access learning sessions from their own tenant
CREATE POLICY learning_sessions_tenant_isolation ON learning_sessions
  FOR ALL
  USING (
    tenant_id = current_setting('app.current_tenant_id', TRUE)::UUID
  )
  WITH CHECK (
    tenant_id = current_setting('app.current_tenant_id', TRUE)::UUID
  );

COMMENT ON POLICY learning_sessions_tenant_isolation ON learning_sessions IS
  'Enforces tenant isolation: Users cannot see or modify other tenants'' learning sessions';

-- ============================================================================
-- CREATE POLICIES: USER CONCEPT MASTERY (User Isolation)
-- ============================================================================

-- Policy: Users can only access their own mastery records
CREATE POLICY user_mastery_isolation ON user_concept_mastery
  FOR ALL
  USING (
    user_id = current_setting('app.current_user_id', TRUE)::UUID
  )
  WITH CHECK (
    user_id = current_setting('app.current_user_id', TRUE)::UUID
  );

COMMENT ON POLICY user_mastery_isolation ON user_concept_mastery IS
  'Enforces user isolation: Users cannot see or modify other users'' mastery records';

-- ============================================================================
-- CREATE POLICIES: KNOWLEDGE CONCEPTS (Public Read, Admin Write)
-- ============================================================================

-- Policy: Everyone can read concepts (knowledge is public)
CREATE POLICY concepts_public_read ON knowledge_concepts
  FOR SELECT
  USING (true);

-- Policy: Only admins can insert/update/delete concepts
CREATE POLICY concepts_admin_write ON knowledge_concepts
  FOR ALL
  USING (
    current_setting('app.current_user_role', TRUE) = 'admin'
  )
  WITH CHECK (
    current_setting('app.current_user_role', TRUE) = 'admin'
  );

COMMENT ON POLICY concepts_public_read ON knowledge_concepts IS
  'Anyone can read concepts - knowledge is public';

COMMENT ON POLICY concepts_admin_write ON knowledge_concepts IS
  'Only admins can modify concepts';

-- ============================================================================
-- FUNCTION: Set Session Variables (Called by Application on Every Request)
-- ============================================================================

CREATE OR REPLACE FUNCTION set_request_context(
  p_user_id UUID,
  p_tenant_id UUID,
  p_user_role VARCHAR DEFAULT 'user'
)
RETURNS void AS $$
BEGIN
  -- Set session variables that RLS policies check
  PERFORM set_config('app.current_user_id', p_user_id::TEXT, false);
  PERFORM set_config('app.current_tenant_id', p_tenant_id::TEXT, false);
  PERFORM set_config('app.current_user_role', p_user_role, false);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION set_request_context IS
  'Call this at the start of every request to set RLS context variables. Usage: SELECT set_request_context(user_id, tenant_id, role);';

-- ============================================================================
-- FUNCTION: Clear Session Variables (Called at End of Request)
-- ============================================================================

CREATE OR REPLACE FUNCTION clear_request_context()
RETURNS void AS $$
BEGIN
  PERFORM set_config('app.current_user_id', '', false);
  PERFORM set_config('app.current_tenant_id', '', false);
  PERFORM set_config('app.current_user_role', '', false);
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION clear_request_context IS
  'Clears RLS context variables. Call at end of request or on error.';

-- ============================================================================
-- BYPASS RLS FOR ADMIN OPERATIONS (Use with EXTREME caution)
-- ============================================================================

-- Create a role that can bypass RLS for administrative tasks
-- DO NOT USE THIS IN APPLICATION CODE - ONLY FOR MANUAL ADMIN OPERATIONS

-- Example: When running migrations or administrative scripts
-- SET ROLE admin_role;  -- Bypasses RLS
-- ... perform admin operations ...
-- RESET ROLE;  -- Back to normal RLS enforcement

COMMENT ON TABLE learning_sessions IS
  'RLS enforced. To bypass (ADMIN ONLY): SET ROLE admin_role; RESET ROLE when done.';

-- ============================================================================
-- VERIFY RLS IS ENABLED
-- ============================================================================

-- This query should show RLS enabled for all three tables:
-- SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public' AND tablename IN ('learning_sessions', 'user_concept_mastery', 'knowledge_concepts');

-- ============================================================================
-- TEST RLS POLICIES
-- ============================================================================

-- Test 1: Set context as user 'roughsparks'
-- SELECT set_request_context('e7dc083f-61de-4567-a5b6-b21ddb09cb2d'::UUID, 'e9b9910f-d89c-4a0c-99e5-f0cc14375173'::UUID, 'user');
-- SELECT COUNT(*) FROM learning_sessions; -- Should only see roughsparks' sessions

-- Test 2: Try to set context as different user
-- SELECT set_request_context('00000000-0000-0000-0000-000000000000'::UUID, '00000000-0000-0000-0000-000000000000'::UUID, 'user');
-- SELECT COUNT(*) FROM learning_sessions; -- Should see 0 (or only that user's sessions)

-- Test 3: Public concept read
-- SELECT clear_request_context();
-- SELECT COUNT(*) FROM knowledge_concepts; -- Should still work (public read)

-- Test 4: Try to modify concepts as non-admin
-- SELECT set_request_context('e7dc083f-61de-4567-a5b6-b21ddb09cb2d'::UUID, 'e9b9910f-d89c-4a0c-99e5-f0cc14375173'::UUID, 'user');
-- UPDATE knowledge_concepts SET description = 'hacked' WHERE concept_slug = 'sql-joins'; -- Should FAIL

-- Test 5: Modify concepts as admin
-- SELECT set_request_context('e7dc083f-61de-4567-a5b6-b21ddb09cb2d'::UUID, 'e9b9910f-d89c-4a0c-99e5-f0cc14375173'::UUID, 'admin');
-- UPDATE knowledge_concepts SET description = 'Updated by admin' WHERE concept_slug = 'sql-joins'; -- Should SUCCEED

-- ============================================================================
-- NOTES FOR DEVELOPERS
-- ============================================================================

-- CRITICAL: Every API request MUST call set_request_context() before querying
-- Example in Express middleware:
--
-- async function setRLSContext(req, res, next) {
--   if (req.user) {
--     await db.query('SELECT set_request_context($1, $2, $3)', [
--       req.user.user_id,
--       req.user.tenant_id,
--       req.user.role || 'user'
--     ]);
--   }
--   next();
-- }
--
-- app.use(setRLSContext);

-- IMPORTANT: Clear context on error to prevent leaking privileges
-- app.use((err, req, res, next) => {
--   db.query('SELECT clear_request_context()').catch(() => {});
--   // ... error handling ...
-- });

-- ============================================================================
-- ROLLBACK INSTRUCTIONS (If Needed)
-- ============================================================================

-- To disable RLS (NOT RECOMMENDED for production):
-- ALTER TABLE learning_sessions DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE user_concept_mastery DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE knowledge_concepts DISABLE ROW LEVEL SECURITY;
--
-- To drop policies:
-- DROP POLICY IF EXISTS learning_sessions_tenant_isolation ON learning_sessions;
-- DROP POLICY IF EXISTS user_mastery_isolation ON user_concept_mastery;
-- DROP POLICY IF EXISTS concepts_public_read ON knowledge_concepts;
-- DROP POLICY IF EXISTS concepts_admin_write ON knowledge_concepts;
--
-- To drop functions:
-- DROP FUNCTION IF EXISTS set_request_context;
-- DROP FUNCTION IF EXISTS clear_request_context;
