"""OAuth authentication tests"""

import pytest
from unittest.mock import Mock, patch, AsyncMock
from oauth_starter.auth import SocialAuth
from oauth_starter.database import Database
from oauth_starter.models import User


@pytest.fixture
def sqlite_db():
    """Create in-memory SQLite database"""
    return Database(database_url="sqlite:///:memory:", mode="sqlite")


@pytest.fixture
def auth(sqlite_db):
    """Create SocialAuth instance"""
    return SocialAuth(sqlite_db, callback_base_url="http://localhost:8000")


def test_auth_initialization(auth):
    """Test SocialAuth initialization"""
    assert auth.callback_base_url == "http://localhost:8000"
    assert "twitter" in auth.PROVIDERS
    assert "github" in auth.PROVIDERS
    assert "discord" in auth.PROVIDERS
    assert "linkedin" in auth.PROVIDERS


def test_get_auth_url_twitter(auth):
    """Test generating Twitter OAuth URL"""
    url = auth.get_auth_url("twitter", redirect_path="/dashboard")

    assert url.startswith("https://twitter.com/i/oauth2/authorize")
    assert "client_id" in url
    assert "redirect_uri" in url
    assert "response_type=code" in url
    assert "scope=" in url
    assert "state=" in url
    assert "code_challenge=" in url
    assert "code_challenge_method=S256" in url


def test_get_auth_url_github(auth):
    """Test generating GitHub OAuth URL"""
    url = auth.get_auth_url("github")

    assert url.startswith("https://github.com/login/oauth/authorize")
    assert "redirect_uri" in url
    assert "scope=" in url


def test_get_auth_url_discord(auth):
    """Test generating Discord OAuth URL"""
    url = auth.get_auth_url("discord")

    assert url.startswith("https://discord.com/api/oauth2/authorize")


def test_get_auth_url_linkedin(auth):
    """Test generating LinkedIn OAuth URL"""
    url = auth.get_auth_url("linkedin")

    assert url.startswith("https://www.linkedin.com/oauth/v2/authorization")


def test_get_auth_url_invalid_provider(auth):
    """Test error on invalid provider"""
    with pytest.raises(ValueError, match="Unknown provider"):
        auth.get_auth_url("invalid_provider")


def test_normalize_user_data_twitter(auth):
    """Test normalizing Twitter user data"""
    twitter_data = {
        "id": "123456",
        "username": "testuser",
        "name": "Test User",
        "description": "I love python and javascript",
        "profile_image_url": "https://pbs.twimg.com/profile_images/test_normal.jpg"
    }

    normalized = auth._normalize_user_data("twitter", twitter_data)

    assert normalized["id"] == "123456"
    assert normalized["username"] == "testuser"
    assert normalized["display_name"] == "Test User"
    assert normalized["bio"] == "I love python and javascript"
    assert "_400x400" in normalized["avatar_url"]  # Should upgrade image size


def test_normalize_user_data_github(auth):
    """Test normalizing GitHub user data"""
    github_data = {
        "id": 78910,
        "login": "testuser",
        "name": "Test User",
        "bio": "Full-stack developer",
        "avatar_url": "https://github.com/avatar.jpg",
        "email": "test@example.com"
    }

    normalized = auth._normalize_user_data("github", github_data)

    assert normalized["id"] == "78910"
    assert normalized["username"] == "testuser"
    assert normalized["email"] == "test@example.com"


def test_normalize_user_data_discord(auth):
    """Test normalizing Discord user data"""
    discord_data = {
        "id": "111222333",
        "username": "testuser",
        "global_name": "Test User",
        "avatar": "abc123",
        "email": "test@example.com"
    }

    normalized = auth._normalize_user_data("discord", discord_data)

    assert normalized["id"] == "111222333"
    assert normalized["username"] == "testuser"
    assert normalized["display_name"] == "Test User"
    assert "cdn.discordapp.com" in normalized["avatar_url"]


def test_extract_expertise_from_bio(auth):
    """Test expertise extraction from bio"""
    bio = "I'm a python developer who loves javascript, react, and ai. Also into web3 and crypto."
    user_info = {}

    expertise = auth._extract_expertise(bio, "twitter", user_info)

    assert "python" in expertise
    assert "javascript" in expertise
    assert "react" in expertise
    assert "ai" in expertise
    assert "web3" in expertise
    assert "crypto" in expertise


def test_extract_expertise_from_github_repos(auth):
    """Test expertise extraction from GitHub repos"""
    bio = "Developer"
    user_info = {
        "repos": [
            {"language": "Python", "description": "FastAPI web app"},
            {"language": "JavaScript", "description": "React dashboard with typescript"},
            {"language": "Rust", "description": "CLI tool"},
        ]
    }

    expertise = auth._extract_expertise(bio, "github", user_info)

    assert "python" in expertise
    assert "javascript" in expertise
    assert "rust" in expertise
    assert "typescript" in expertise  # From description
    assert "react" in expertise  # From description


def test_generate_code_verifier(auth):
    """Test PKCE code verifier generation"""
    verifier = auth._generate_code_verifier()

    assert isinstance(verifier, str)
    assert len(verifier) > 0
    # Base64 URL-safe characters only
    assert all(c.isalnum() or c in "-_" for c in verifier)


def test_generate_code_challenge(auth):
    """Test PKCE code challenge generation"""
    verifier = "test_verifier_12345"
    challenge = auth._generate_code_challenge(verifier)

    assert isinstance(challenge, str)
    assert len(challenge) > 0
    assert all(c.isalnum() or c in "-_" for c in challenge)


def test_generate_state(auth):
    """Test OAuth state generation"""
    state = auth._generate_state("/dashboard")

    assert isinstance(state, str)
    assert ":" in state
    assert state.endswith(":/dashboard")


def test_generate_user_id(auth):
    """Test user ID generation"""
    user_id = auth._generate_user_id()

    assert user_id.startswith("user_")
    assert len(user_id) > 5


def test_generate_session_id(auth):
    """Test session ID generation"""
    session_id = auth._generate_session_id()

    assert isinstance(session_id, str)
    assert len(session_id) > 10


@pytest.mark.asyncio
async def test_handle_callback_creates_new_user(auth):
    """Test OAuth callback creates new user"""
    # Store OAuth state
    state = "test_state:/dashboard"
    code_verifier = "test_verifier"
    auth.db.store_oauth_state(state, code_verifier, "github")

    # Mock HTTP responses
    with patch("httpx.AsyncClient") as mock_client:
        mock_instance = mock_client.return_value.__aenter__.return_value

        # Mock token exchange
        mock_instance.post = AsyncMock(return_value=Mock(
            status_code=200,
            raise_for_status=lambda: None,
            json=lambda: {
                "access_token": "test_token",
                "refresh_token": "test_refresh",
                "expires_in": 3600
            }
        ))

        # Mock user info
        mock_instance.get = AsyncMock(return_value=Mock(
            status_code=200,
            raise_for_status=lambda: None,
            json=lambda: {
                "id": 123456,
                "login": "testuser",
                "name": "Test User",
                "bio": "Python developer",
                "avatar_url": "https://github.com/avatar.jpg",
                "email": "test@example.com"
            }
        ))

        user, session = await auth.handle_callback("github", "auth_code", state)

        assert user is not None
        assert user.username == "testuser"
        assert user.provider == "github"
        assert user.external_id == "github:123456"
        assert session is not None
        assert session.user_id == user.user_id


@pytest.mark.asyncio
async def test_handle_callback_updates_existing_user(auth, sqlite_db):
    """Test OAuth callback updates existing user"""
    # Create existing user
    existing_user = User(
        user_id="user_existing",
        external_id="github:123456",
        provider="github",
        username="testuser",
        display_name="Old Name",
        vanity_subdomain="testuser"
    )
    sqlite_db.create_user(existing_user)

    # Store OAuth state
    state = "test_state:/dashboard"
    code_verifier = "test_verifier"
    auth.db.store_oauth_state(state, code_verifier, "github")

    # Mock HTTP responses
    with patch("httpx.AsyncClient") as mock_client:
        mock_instance = mock_client.return_value.__aenter__.return_value

        mock_instance.post = AsyncMock(return_value=Mock(
            status_code=200,
            raise_for_status=lambda: None,
            json=lambda: {
                "access_token": "new_token",
                "expires_in": 3600
            }
        ))

        mock_instance.get = AsyncMock(return_value=Mock(
            status_code=200,
            raise_for_status=lambda: None,
            json=lambda: {
                "id": 123456,
                "login": "testuser",
                "name": "Updated Name",
                "bio": "Updated bio",
                "avatar_url": "https://github.com/avatar.jpg"
            }
        ))

        user, session = await auth.handle_callback("github", "auth_code", state)

        assert user.user_id == "user_existing"  # Same user
        assert user.display_name == "Updated Name"  # Updated


def test_get_user_from_session(auth, sqlite_db):
    """Test retrieving user from session"""
    # Create user
    user = User(
        user_id="user_test",
        external_id="twitter:123",
        provider="twitter",
        username="testuser",
        display_name="Test",
        vanity_subdomain="testuser"
    )
    sqlite_db.create_user(user)

    # Create session
    session = auth._create_session(user.user_id)

    # Retrieve user from session
    retrieved_user = auth.get_user_from_session(session.session_id)

    assert retrieved_user is not None
    assert retrieved_user.user_id == user.user_id


def test_get_user_from_expired_session(auth, sqlite_db):
    """Test expired session returns None"""
    from datetime import datetime, timedelta
    from oauth_starter.models import Session

    # Create user
    user = User(
        user_id="user_test",
        external_id="twitter:123",
        provider="twitter",
        username="testuser",
        display_name="Test",
        vanity_subdomain="testuser"
    )
    sqlite_db.create_user(user)

    # Create expired session
    expired_session = Session(
        session_id="expired",
        user_id=user.user_id,
        created_at=datetime.utcnow() - timedelta(days=31),
        expires_at=datetime.utcnow() - timedelta(days=1)
    )
    sqlite_db.create_session(expired_session)

    # Try to get user (should be None)
    retrieved_user = auth.get_user_from_session("expired")
    assert retrieved_user is None
