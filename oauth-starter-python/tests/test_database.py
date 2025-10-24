"""Database tests - SQLite and Supabase connection validation"""

import pytest
import os
from datetime import datetime, timedelta
from oauth_starter.database import Database
from oauth_starter.models import User, Session, Subdomain, Activity


@pytest.fixture
def sqlite_db():
    """Create in-memory SQLite database for testing"""
    db = Database(database_url="sqlite:///:memory:", mode="sqlite")
    yield db


@pytest.fixture
def sample_user():
    """Create sample user for testing"""
    return User(
        user_id="user_test123",
        external_id="twitter:123456",
        provider="twitter",
        username="testuser",
        display_name="Test User",
        email="test@example.com",
        avatar_url="https://example.com/avatar.jpg",
        bio="Test bio with python and javascript",
        expertise=["python", "javascript"],
        vanity_subdomain="testuser",
        oauth_token="test_token",
        oauth_refresh="test_refresh",
        oauth_expires=datetime.utcnow() + timedelta(hours=1),
        created_at=datetime.utcnow(),
        last_activity=datetime.utcnow()
    )


def test_database_initialization_sqlite():
    """Test SQLite database initialization"""
    db = Database(database_url="sqlite:///:memory:", mode="sqlite")
    assert db.mode == "sqlite"
    assert db.database_url.startswith("sqlite")


def test_create_user(sqlite_db, sample_user):
    """Test creating a user"""
    created_user = sqlite_db.create_user(sample_user)

    assert created_user.user_id == sample_user.user_id
    assert created_user.username == "testuser"
    assert created_user.provider == "twitter"


def test_get_user(sqlite_db, sample_user):
    """Test retrieving a user by ID"""
    sqlite_db.create_user(sample_user)

    retrieved_user = sqlite_db.get_user(sample_user.user_id)
    assert retrieved_user is not None
    assert retrieved_user.username == "testuser"


def test_get_user_by_external_id(sqlite_db, sample_user):
    """Test retrieving a user by external ID"""
    sqlite_db.create_user(sample_user)

    retrieved_user = sqlite_db.get_user_by_external_id("twitter:123456")
    assert retrieved_user is not None
    assert retrieved_user.user_id == sample_user.user_id


def test_get_user_by_username(sqlite_db, sample_user):
    """Test retrieving a user by username"""
    sqlite_db.create_user(sample_user)

    retrieved_user = sqlite_db.get_user_by_username("testuser")
    assert retrieved_user is not None
    assert retrieved_user.external_id == "twitter:123456"


def test_update_user(sqlite_db, sample_user):
    """Test updating a user"""
    sqlite_db.create_user(sample_user)

    # Update user
    sample_user.display_name = "Updated Name"
    sample_user.expertise = ["python", "javascript", "rust"]
    sqlite_db.update_user(sample_user)

    # Verify update
    updated_user = sqlite_db.get_user(sample_user.user_id)
    assert updated_user.display_name == "Updated Name"
    assert "rust" in updated_user.expertise


def test_create_session(sqlite_db, sample_user):
    """Test creating a session"""
    sqlite_db.create_user(sample_user)

    session = Session(
        session_id="session_test123",
        user_id=sample_user.user_id,
        created_at=datetime.utcnow(),
        expires_at=datetime.utcnow() + timedelta(days=30)
    )

    created_session = sqlite_db.create_session(session)
    assert created_session.session_id == "session_test123"
    assert created_session.user_id == sample_user.user_id


def test_session_expiration(sqlite_db):
    """Test session expiration check"""
    session = Session(
        session_id="session_expired",
        user_id="user_test",
        created_at=datetime.utcnow() - timedelta(days=31),
        expires_at=datetime.utcnow() - timedelta(days=1)
    )

    assert session.is_expired() is True


def test_create_subdomain(sqlite_db, sample_user):
    """Test creating a subdomain"""
    sqlite_db.create_user(sample_user)

    subdomain = Subdomain(
        subdomain="testuser",
        parent_domain="soulfra.com",
        user_id=sample_user.user_id,
        status="active",
        created_at=datetime.utcnow(),
        last_verified=datetime.utcnow()
    )

    created_subdomain = sqlite_db.create_subdomain(subdomain)
    assert created_subdomain.subdomain == "testuser"
    assert created_subdomain.full_domain() == "testuser.soulfra.com"


def test_get_subdomain(sqlite_db, sample_user):
    """Test retrieving a subdomain"""
    sqlite_db.create_user(sample_user)

    subdomain = Subdomain(
        subdomain="testuser",
        parent_domain="soulfra.com",
        user_id=sample_user.user_id,
        status="active"
    )
    sqlite_db.create_subdomain(subdomain)

    retrieved = sqlite_db.get_subdomain("testuser", "soulfra.com")
    assert retrieved is not None
    assert retrieved.user_id == sample_user.user_id


def test_create_activity(sqlite_db, sample_user):
    """Test logging activity"""
    sqlite_db.create_user(sample_user)

    activity = Activity(
        user_id=sample_user.user_id,
        activity_type="login",
        domain="soulfra.com",
        points=1,
        timestamp=datetime.utcnow()
    )

    created_activity = sqlite_db.create_activity(activity)
    assert created_activity.user_id == sample_user.user_id
    assert created_activity.activity_type == "login"


def test_get_recent_activity(sqlite_db, sample_user):
    """Test retrieving recent activity"""
    sqlite_db.create_user(sample_user)

    # Create multiple activities
    for i in range(5):
        activity = Activity(
            user_id=sample_user.user_id,
            activity_type="post",
            domain="soulfra.com",
            points=1
        )
        sqlite_db.create_activity(activity)

    recent = sqlite_db.get_recent_activity(sample_user.user_id, days=30)
    assert len(recent) == 5


def test_leaderboard(sqlite_db):
    """Test leaderboard generation"""
    # Create multiple users with different activity levels
    for i in range(10):
        user = User(
            user_id=f"user_{i}",
            external_id=f"twitter:{i}",
            provider="twitter",
            username=f"user{i}",
            display_name=f"User {i}",
            vanity_subdomain=f"user{i}"
        )
        sqlite_db.create_user(user)

        # Create varying amounts of activity
        for j in range(i + 1):
            activity = Activity(
                user_id=user.user_id,
                activity_type="post",
                domain="soulfra.com",
                points=1
            )
            sqlite_db.create_activity(activity)

    leaderboard = sqlite_db.get_leaderboard("soulfra.com", days=30, limit=5)

    assert len(leaderboard) == 5
    assert leaderboard[0]["rank"] == 1
    assert leaderboard[0]["totalPoints"] == 10  # user_9 has 10 activities


def test_oauth_state_storage(sqlite_db):
    """Test OAuth state storage and retrieval"""
    state = "test_state_123"
    code_verifier = "test_verifier"
    provider = "twitter"

    sqlite_db.store_oauth_state(state, code_verifier, provider)

    retrieved = sqlite_db.get_oauth_state(state)
    assert retrieved is not None
    assert retrieved["code_verifier"] == code_verifier
    assert retrieved["provider"] == provider


def test_oauth_state_expiration(sqlite_db):
    """Test OAuth state expiration"""
    state = "test_state_expired"

    sqlite_db.store_oauth_state(state, "verifier", "twitter")

    # Immediately retrieve (should work)
    retrieved = sqlite_db.get_oauth_state(state)
    assert retrieved is not None

    # Delete
    sqlite_db.delete_oauth_state(state)

    # Try to retrieve again (should be None)
    retrieved = sqlite_db.get_oauth_state(state)
    assert retrieved is None


def test_cleanup_operations(sqlite_db, sample_user):
    """Test cleanup operations"""
    sqlite_db.create_user(sample_user)

    # Create expired session
    expired_session = Session(
        session_id="expired",
        user_id=sample_user.user_id,
        created_at=datetime.utcnow() - timedelta(days=31),
        expires_at=datetime.utcnow() - timedelta(days=1)
    )
    sqlite_db.create_session(expired_session)

    # Create old activity
    old_activity = Activity(
        user_id=sample_user.user_id,
        activity_type="old",
        domain="soulfra.com",
        points=1,
        timestamp=datetime.utcnow() - timedelta(days=31)
    )
    sqlite_db.create_activity(old_activity)

    # Run cleanup
    sqlite_db.cleanup_expired_sessions()
    sqlite_db.cleanup_old_activities(days=30)

    # Verify cleanup
    session = sqlite_db.get_session("expired")
    assert session is None
