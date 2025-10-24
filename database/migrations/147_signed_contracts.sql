-- Migration 147: Signed Contracts & Document Verification
-- Stores cryptographic signatures (SHA-256) of all legal/system docs
-- Enables immutable verification via dpaste.com storage

-- Signed Documents Table
-- Tracks all signed docs with SHA-256 hashes and dpaste IDs
CREATE TABLE IF NOT EXISTS signed_docs (
  id SERIAL PRIMARY KEY,
  file_path TEXT NOT NULL,
  hash VARCHAR(64) NOT NULL,          -- SHA-256 hash (64 hex chars)
  dpaste_id VARCHAR(50),              -- dpaste.com paste ID
  signed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  metadata JSONB DEFAULT '{}',        -- Additional data (file size, last modified, etc.)
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  UNIQUE (file_path, hash)            -- Prevent duplicate signatures
);

CREATE INDEX idx_signed_docs_file_path ON signed_docs(file_path);
CREATE INDEX idx_signed_docs_hash ON signed_docs(hash);
CREATE INDEX idx_signed_docs_signed_at ON signed_docs(signed_at
);

-- Verification History Table
-- Logs all verification attempts (for audit trail)
CREATE TABLE IF NOT EXISTS doc_verifications (
  id SERIAL PRIMARY KEY,
  file_path TEXT NOT NULL,
  expected_hash VARCHAR(64) NOT NULL,
  current_hash VARCHAR(64) NOT NULL,
  verified BOOLEAN NOT NULL,          -- true = hashes match, false = tampered
  verified_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  verified_by VARCHAR(255),           -- User/system that verified
  metadata JSONB DEFAULT '{}'
);

CREATE INDEX idx_doc_verifications_file_path ON doc_verifications(file_path);
CREATE INDEX idx_doc_verifications_verified_at ON doc_verifications(verified_at);
CREATE INDEX idx_doc_verifications_verified ON doc_verifications(verified
);

-- Get Latest Signature for a File
-- Returns most recent signature for given file path
CREATE OR REPLACE FUNCTION get_latest_signature(
  p_file_path TEXT
)
RETURNS TABLE (
  file_path TEXT,
  hash VARCHAR(64),
  dpaste_id VARCHAR(50),
  dpaste_url TEXT,
  signed_at TIMESTAMP WITH TIME ZONE,
  days_since_signed INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    sd.file_path,
    sd.hash,
    sd.dpaste_id,
    CASE
      WHEN sd.dpaste_id IS NOT NULL THEN 'https://dpaste.com/' || sd.dpaste_id
      ELSE NULL
    END as dpaste_url,
    sd.signed_at,
    EXTRACT(DAY FROM NOW() - sd.signed_at)::INTEGER as days_since_signed
  FROM signed_docs sd
  WHERE sd.file_path = p_file_path
  ORDER BY sd.signed_at DESC
  LIMIT 1;
END;
$$ LANGUAGE plpgsql;

-- Verify Document Function
-- Checks if document hash matches latest signature
CREATE OR REPLACE FUNCTION verify_document(
  p_file_path TEXT,
  p_current_hash VARCHAR(64),
  p_verified_by VARCHAR(255) DEFAULT 'system'
)
RETURNS TABLE (
  verified BOOLEAN,
  expected_hash VARCHAR(64),
  current_hash VARCHAR(64),
  message TEXT
) AS $$
DECLARE
  v_latest_hash VARCHAR(64);
  v_verified BOOLEAN;
  v_message TEXT;
BEGIN
  -- Get latest signature
  SELECT hash INTO v_latest_hash
  FROM signed_docs
  WHERE file_path = p_file_path
  ORDER BY signed_at DESC
  LIMIT 1;

  -- Check if file has been signed
  IF v_latest_hash IS NULL THEN
    v_verified := FALSE;
    v_message := 'File has not been signed';
  ELSIF v_latest_hash = p_current_hash THEN
    v_verified := TRUE;
    v_message := 'Document verified - hash matches';
  ELSE
    v_verified := FALSE;
    v_message := 'Document tampered - hash mismatch';
  END IF;

  -- Log verification attempt
  INSERT INTO doc_verifications (
    file_path, expected_hash, current_hash, verified, verified_by
  ) VALUES (
    p_file_path, v_latest_hash, p_current_hash, v_verified, p_verified_by
  );

  -- Return result
  RETURN QUERY SELECT
    v_verified as verified,
    v_latest_hash as expected_hash,
    p_current_hash as current_hash,
    v_message as message;
END;
$$ LANGUAGE plpgsql;

-- Get Unsigned Documents View
-- Shows all legal/system docs that haven't been signed recently (>7 days)
CREATE OR REPLACE VIEW unsigned_docs AS
SELECT
  sd.file_path,
  sd.hash as last_signature,
  sd.signed_at as last_signed,
  EXTRACT(DAY FROM NOW() - sd.signed_at)::INTEGER as days_since_signed
FROM signed_docs sd
WHERE sd.signed_at < NOW() - '7 days'::INTERVAL
ORDER BY sd.signed_at ASC;

-- Verification Audit Trail View
-- Recent verification attempts for security monitoring
CREATE OR REPLACE VIEW verification_audit_trail AS
SELECT
  dv.file_path,
  dv.verified,
  dv.verified_at,
  dv.verified_by,
  CASE
    WHEN dv.verified THEN '✅ Verified'
    ELSE '❌ Tampered'
  END as status,
  dv.expected_hash,
  dv.current_hash
FROM doc_verifications dv
ORDER BY dv.verified_at DESC
LIMIT 100;

-- Get Tampered Documents Function
-- Returns list of docs that failed verification
CREATE OR REPLACE FUNCTION get_tampered_documents()
RETURNS TABLE (
  file_path TEXT,
  last_verification TIMESTAMP WITH TIME ZONE,
  expected_hash VARCHAR(64),
  current_hash VARCHAR(64),
  verified_by VARCHAR(255)
) AS $$
BEGIN
  RETURN QUERY
  SELECT DISTINCT ON (dv.file_path)
    dv.file_path,
    dv.verified_at as last_verification,
    dv.expected_hash,
    dv.current_hash,
    dv.verified_by
  FROM doc_verifications dv
  WHERE dv.verified = FALSE
  ORDER BY dv.file_path, dv.verified_at DESC;
END;
$$ LANGUAGE plpgsql;

-- Get Verification Statistics
-- Summary of document verification status
CREATE OR REPLACE VIEW verification_stats AS
SELECT
  COUNT(DISTINCT dv.file_path) as total_files_verified,
  COUNT(*) FILTER (WHERE dv.verified = TRUE) as successful_verifications,
  COUNT(*) FILTER (WHERE dv.verified = FALSE) as failed_verifications,
  ROUND(
    100.0 * COUNT(*) FILTER (WHERE dv.verified = TRUE) / NULLIF(COUNT(*), 0),
    2
  ) as success_rate_percent,
  MAX(dv.verified_at) as last_verification
FROM doc_verifications dv
WHERE dv.verified_at >= NOW() - '30 days'::INTERVAL;

COMMENT ON TABLE signed_docs IS 'Cryptographically signed documents with SHA-256 hashes and dpaste.com storage';
COMMENT ON TABLE doc_verifications IS 'Audit trail of all document verification attempts';
COMMENT ON VIEW unsigned_docs IS 'Documents that haven not been signed recently (>7 days)';
COMMENT ON VIEW verification_audit_trail IS 'Recent verification attempts for security monitoring';
COMMENT ON VIEW verification_stats IS 'Summary statistics for document verification';
