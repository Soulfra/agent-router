-- Dependency Vendoring & URL Tracking System
-- Prevents left-pad style incidents by mirroring critical packages
-- Tracks all URLs and provides dependency intelligence

-- Vendored Packages Registry
-- Stores information about packages mirrored to MinIO
CREATE TABLE IF NOT EXISTS vendored_packages (
    id SERIAL PRIMARY KEY,
    package_name VARCHAR(255) NOT NULL,
    package_version VARCHAR(100) NOT NULL,
    package_type VARCHAR(50) DEFAULT 'npm', -- npm, github, pypi, etc.
    registry_url TEXT,

    -- MinIO storage
    minio_bucket VARCHAR(255),
    minio_object_path TEXT NOT NULL,
    object_size BIGINT,
    checksum_sha256 VARCHAR(64),
    checksum_md5 VARCHAR(32),

    -- Package metadata
    description TEXT,
    author VARCHAR(255),
    license VARCHAR(100),
    homepage TEXT,
    repository_url TEXT,

    -- Dependencies
    dependencies JSONB, -- Direct dependencies with versions
    dev_dependencies JSONB,
    peer_dependencies JSONB,

    -- Statistics
    download_count BIGINT DEFAULT 0,
    dependent_count INTEGER DEFAULT 0, -- How many packages depend on this

    -- Risk assessment
    risk_score INTEGER DEFAULT 0, -- 0-100, higher = riskier (left-pad = high risk)
    is_critical BOOLEAN DEFAULT FALSE, -- Marked as critical to system
    is_tiny BOOLEAN DEFAULT FALSE, -- Small package with many dependents (left-pad style)

    -- Status
    vendor_status VARCHAR(50) DEFAULT 'pending', -- pending, mirrored, failed
    last_verified_at TIMESTAMP,
    vendor_reason TEXT, -- Why was this package vendored

    -- Timestamps
    mirrored_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    accessed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    UNIQUE(package_name, package_version, package_type)
);

CREATE INDEX idx_vendored_packages_name ON vendored_packages(package_name);
CREATE INDEX idx_vendored_packages_status ON vendored_packages(vendor_status);
CREATE INDEX idx_vendored_packages_critical ON vendored_packages(is_critical);
CREATE INDEX idx_vendored_packages_risk ON vendored_packages(risk_score DESC);


-- Package Dependencies Graph
-- Creates a graph of how packages depend on each other
CREATE TABLE IF NOT EXISTS package_dependencies (
    id SERIAL PRIMARY KEY,
    parent_package_id INTEGER REFERENCES vendored_packages(id) ON DELETE CASCADE,
    child_package_name VARCHAR(255) NOT NULL,
    child_package_version VARCHAR(100),
    dependency_type VARCHAR(50) DEFAULT 'runtime', -- runtime, dev, peer, optional

    -- Graph metrics
    depth_level INTEGER DEFAULT 0, -- How deep in the tree (0 = direct dependency)
    is_circular BOOLEAN DEFAULT FALSE,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_package_dependencies_parent ON package_dependencies(parent_package_id);
CREATE INDEX idx_package_dependencies_child ON package_dependencies(child_package_name);
CREATE INDEX idx_package_dependencies_depth ON package_dependencies(depth_level);


-- URL Index
-- Tracks every URL the system fetches with metadata
CREATE TABLE IF NOT EXISTS url_index (
    id SERIAL PRIMARY KEY,
    url TEXT NOT NULL UNIQUE,
    url_hash VARCHAR(64) NOT NULL UNIQUE, -- SHA256 of URL for fast lookup

    -- Classification
    url_type VARCHAR(50), -- npm_registry, github_api, cdn, documentation, scrape
    domain VARCHAR(255),
    path TEXT,

    -- Content metadata
    content_type VARCHAR(100),
    content_size BIGINT,
    content_hash VARCHAR(64), -- SHA256 of content

    -- Status
    last_status_code INTEGER,
    last_fetch_success BOOLEAN,
    last_error TEXT,

    -- Tracking
    fetch_count INTEGER DEFAULT 0,
    first_fetched_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_fetched_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    -- Annotations
    comments TEXT, -- User annotations about this URL
    tags TEXT[], -- Tags for categorization
    is_critical BOOLEAN DEFAULT FALSE,
    is_external_dependency BOOLEAN DEFAULT TRUE,

    -- Relations
    related_package_id INTEGER REFERENCES vendored_packages(id) ON DELETE SET NULL,

    -- Cache info
    cached_in_minio BOOLEAN DEFAULT FALSE,
    minio_cache_path TEXT,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_url_index_hash ON url_index(url_hash);
CREATE INDEX idx_url_index_domain ON url_index(domain);
CREATE INDEX idx_url_index_type ON url_index(url_type);
CREATE INDEX idx_url_index_critical ON url_index(is_critical);
CREATE INDEX idx_url_index_fetch_count ON url_index(fetch_count DESC);


-- Package Usage Log
-- Tracks when and how packages are accessed
CREATE TABLE IF NOT EXISTS package_usage_log (
    id SERIAL PRIMARY KEY,
    package_id INTEGER REFERENCES vendored_packages(id) ON DELETE CASCADE,

    -- Usage context
    used_by VARCHAR(255), -- Which part of system used it (e.g., 'api-generator', 'test-system')
    usage_type VARCHAR(50), -- install, import, require, analysis

    -- Request info
    requested_version VARCHAR(100),
    resolved_version VARCHAR(100),

    -- Performance
    fetch_time_ms INTEGER,
    from_cache BOOLEAN DEFAULT FALSE,
    from_vendor BOOLEAN DEFAULT FALSE, -- If true, served from our mirror

    -- Context
    user_id VARCHAR(255),
    session_id VARCHAR(255),

    used_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_package_usage_log_package ON package_usage_log(package_id);
CREATE INDEX idx_package_usage_log_used_by ON package_usage_log(used_by);
CREATE INDEX idx_package_usage_log_date ON package_usage_log(used_at DESC);


-- Funding Registry
-- Tracks package funding/sponsorship information
CREATE TABLE IF NOT EXISTS funding_registry (
    id SERIAL PRIMARY KEY,
    package_id INTEGER REFERENCES vendored_packages(id) ON DELETE CASCADE,

    -- Funding source
    funding_type VARCHAR(50), -- github_sponsors, opencollective, patreon, buymeacoffee, custom
    funding_url TEXT NOT NULL,

    -- Maintainer info
    maintainer_name VARCHAR(255),
    maintainer_github VARCHAR(255),

    -- Our tracking
    we_fund BOOLEAN DEFAULT FALSE,
    funding_amount DECIMAL(10,2),
    funding_frequency VARCHAR(50), -- monthly, yearly, one-time

    -- Status
    is_active BOOLEAN DEFAULT TRUE,
    verified_at TIMESTAMP,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    UNIQUE(package_id, funding_url)
);

CREATE INDEX idx_funding_registry_package ON funding_registry(package_id);
CREATE INDEX idx_funding_registry_we_fund ON funding_registry(we_fund);


-- Package Intelligence Scores
-- Stores calculated intelligence metrics for packages
CREATE TABLE IF NOT EXISTS package_intelligence (
    id SERIAL PRIMARY KEY,
    package_id INTEGER REFERENCES vendored_packages(id) ON DELETE CASCADE UNIQUE,

    -- Code metrics
    lines_of_code INTEGER,
    file_count INTEGER,
    function_count INTEGER,
    class_count INTEGER,
    complexity_score INTEGER, -- Cyclomatic complexity

    -- Quality metrics
    has_tests BOOLEAN DEFAULT FALSE,
    test_coverage DECIMAL(5,2), -- Percentage
    has_typescript BOOLEAN DEFAULT FALSE,
    has_documentation BOOLEAN DEFAULT FALSE,
    has_changelog BOOLEAN DEFAULT FALSE,

    -- Activity metrics
    github_stars INTEGER,
    github_forks INTEGER,
    github_issues_open INTEGER,
    last_commit_at TIMESTAMP,
    commit_frequency DECIMAL(10,2), -- Commits per month
    contributor_count INTEGER,

    -- Security
    known_vulnerabilities INTEGER DEFAULT 0,
    last_security_audit TIMESTAMP,
    security_score INTEGER, -- 0-100

    -- Overall intelligence score
    intelligence_score INTEGER DEFAULT 0, -- 0-100, composite score

    -- Left-pad risk factors
    is_trivial BOOLEAN DEFAULT FALSE, -- Trivially simple code
    dependency_spread INTEGER DEFAULT 0, -- How many packages depend on this
    leftpad_risk_score INTEGER DEFAULT 0, -- 0-100, risk of being next left-pad

    calculated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_package_intelligence_score ON package_intelligence(intelligence_score DESC);
CREATE INDEX idx_package_intelligence_leftpad ON package_intelligence(leftpad_risk_score DESC);
CREATE INDEX idx_package_intelligence_security ON package_intelligence(security_score DESC);


-- Dependency Graph Snapshots
-- Periodic snapshots of the entire dependency graph
CREATE TABLE IF NOT EXISTS dependency_snapshots (
    id SERIAL PRIMARY KEY,
    snapshot_name VARCHAR(255),

    -- Graph data
    total_packages INTEGER,
    total_dependencies INTEGER,
    max_depth INTEGER,
    circular_dependencies INTEGER,

    -- Risk assessment
    high_risk_packages INTEGER,
    leftpad_style_packages INTEGER, -- Small packages with many dependents
    unfunded_critical_packages INTEGER,

    -- Graph export
    graph_json JSONB, -- Full dependency graph as JSON
    graph_mermaid TEXT, -- Mermaid diagram
    graph_dot TEXT, -- GraphViz DOT format

    -- Storage
    minio_snapshot_path TEXT, -- Path to full snapshot in MinIO

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_dependency_snapshots_date ON dependency_snapshots(created_at DESC);


-- URL Fetch Queue
-- Queue for background URL fetching and analysis
CREATE TABLE IF NOT EXISTS url_fetch_queue (
    id SERIAL PRIMARY KEY,
    url TEXT NOT NULL,
    url_hash VARCHAR(64),

    -- Queue metadata
    priority INTEGER DEFAULT 0, -- Higher = more important
    fetch_type VARCHAR(50), -- mirror, analyze, scrape, verify

    -- Status
    status VARCHAR(50) DEFAULT 'pending', -- pending, processing, completed, failed
    attempts INTEGER DEFAULT 0,
    max_attempts INTEGER DEFAULT 3,
    last_error TEXT,

    -- Timestamps
    queued_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    started_at TIMESTAMP,
    completed_at TIMESTAMP,

    -- Relations
    related_package_id INTEGER REFERENCES vendored_packages(id) ON DELETE CASCADE,
    requested_by VARCHAR(255)
);

CREATE INDEX idx_url_fetch_queue_status ON url_fetch_queue(status);
CREATE INDEX idx_url_fetch_queue_priority ON url_fetch_queue(priority DESC);


-- Helper Functions

-- Function to generate URL hash
CREATE OR REPLACE FUNCTION generate_url_hash(url_text TEXT)
RETURNS VARCHAR(64) AS $$
BEGIN
    RETURN encode(digest(url_text, 'sha256'), 'hex');
END;
$$ LANGUAGE plpgsql IMMUTABLE;


-- Function to calculate left-pad risk score
CREATE OR REPLACE FUNCTION calculate_leftpad_risk(
    p_lines_of_code INTEGER,
    p_dependent_count INTEGER,
    p_complexity_score INTEGER
)
RETURNS INTEGER AS $$
DECLARE
    risk_score INTEGER := 0;
BEGIN
    -- High risk if: small codebase + many dependents + low complexity

    -- Small codebase factor (0-40 points)
    IF p_lines_of_code < 50 THEN
        risk_score := risk_score + 40;
    ELSIF p_lines_of_code < 200 THEN
        risk_score := risk_score + 25;
    ELSIF p_lines_of_code < 500 THEN
        risk_score := risk_score + 10;
    END IF;

    -- Many dependents factor (0-40 points)
    IF p_dependent_count > 1000 THEN
        risk_score := risk_score + 40;
    ELSIF p_dependent_count > 100 THEN
        risk_score := risk_score + 25;
    ELSIF p_dependent_count > 10 THEN
        risk_score := risk_score + 10;
    END IF;

    -- Low complexity factor (0-20 points)
    IF p_complexity_score < 10 THEN
        risk_score := risk_score + 20;
    ELSIF p_complexity_score < 50 THEN
        risk_score := risk_score + 10;
    END IF;

    RETURN LEAST(risk_score, 100);
END;
$$ LANGUAGE plpgsql;


-- Function to track URL fetch
CREATE OR REPLACE FUNCTION track_url_fetch(
    p_url TEXT,
    p_url_type VARCHAR(50),
    p_status_code INTEGER,
    p_success BOOLEAN
)
RETURNS INTEGER AS $$
DECLARE
    v_url_id INTEGER;
    v_url_hash VARCHAR(64);
BEGIN
    v_url_hash := generate_url_hash(p_url);

    INSERT INTO url_index (url, url_hash, url_type, last_status_code, last_fetch_success, fetch_count, last_fetched_at)
    VALUES (p_url, v_url_hash, p_url_type, p_status_code, p_success, 1, CURRENT_TIMESTAMP)
    ON CONFLICT (url_hash) DO UPDATE SET
        fetch_count = url_index.fetch_count + 1,
        last_status_code = p_status_code,
        last_fetch_success = p_success,
        last_fetched_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
    RETURNING id INTO v_url_id;

    RETURN v_url_id;
END;
$$ LANGUAGE plpgsql;


-- Function to queue package vendoring
CREATE OR REPLACE FUNCTION queue_package_vendor(
    p_package_name VARCHAR(255),
    p_package_version VARCHAR(100),
    p_package_type VARCHAR(50),
    p_priority INTEGER DEFAULT 0,
    p_reason TEXT DEFAULT NULL
)
RETURNS INTEGER AS $$
DECLARE
    v_package_id INTEGER;
BEGIN
    -- Check if already vendored
    SELECT id INTO v_package_id
    FROM vendored_packages
    WHERE package_name = p_package_name
      AND package_version = p_package_version
      AND package_type = p_package_type;

    IF v_package_id IS NOT NULL THEN
        -- Already vendored, just update accessed_at
        UPDATE vendored_packages
        SET accessed_at = CURRENT_TIMESTAMP
        WHERE id = v_package_id;

        RETURN v_package_id;
    END IF;

    -- Create pending vendor entry
    INSERT INTO vendored_packages (
        package_name,
        package_version,
        package_type,
        vendor_status,
        vendor_reason,
        minio_object_path
    ) VALUES (
        p_package_name,
        p_package_version,
        p_package_type,
        'pending',
        p_reason,
        FORMAT('packages/%s/%s/%s-%s.tar.gz', p_package_type, p_package_name, p_package_name, p_package_version)
    ) RETURNING id INTO v_package_id;

    RETURN v_package_id;
END;
$$ LANGUAGE plpgsql;


-- Comments
COMMENT ON TABLE vendored_packages IS 'Registry of packages mirrored to MinIO to prevent left-pad incidents';
COMMENT ON TABLE package_dependencies IS 'Dependency graph showing how packages relate to each other';
COMMENT ON TABLE url_index IS 'Index of all URLs fetched by the system with metadata and annotations';
COMMENT ON TABLE package_usage_log IS 'Log of when and how packages are accessed';
COMMENT ON TABLE funding_registry IS 'Tracking of package funding and sponsorship information';
COMMENT ON TABLE package_intelligence IS 'Intelligence metrics and risk scores for packages';
COMMENT ON TABLE dependency_snapshots IS 'Periodic snapshots of the entire dependency graph';
COMMENT ON TABLE url_fetch_queue IS 'Queue for background URL fetching and analysis';
