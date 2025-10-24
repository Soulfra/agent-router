"""Multi-provider OAuth implementation (Twitter, GitHub, Discord, LinkedIn)"""

import os
import secrets
import hashlib
import base64
from typing import Dict, Optional, Tuple
from datetime import datetime, timedelta
import httpx
from urllib.parse import urlencode

from .models import User, Session
from .database import Database


class SocialAuth:
    """Multi-provider OAuth with expertise extraction and subdomain creation"""

    PROVIDERS = {
        "twitter": {
            "auth_url": "https://twitter.com/i/oauth2/authorize",
            "token_url": "https://api.twitter.com/2/oauth2/token",
            "user_info_url": "https://api.twitter.com/2/users/me",
            "scope": "tweet.read users.read follows.read",
            "fields": "id,username,name,description,public_metrics,profile_image_url"
        },
        "github": {
            "auth_url": "https://github.com/login/oauth/authorize",
            "token_url": "https://github.com/login/oauth/access_token",
            "user_info_url": "https://api.github.com/user",
            "repos_url": "https://api.github.com/user/repos",
            "scope": "read:user user:email"
        },
        "discord": {
            "auth_url": "https://discord.com/api/oauth2/authorize",
            "token_url": "https://discord.com/api/oauth2/token",
            "user_info_url": "https://discord.com/api/users/@me",
            "scope": "identify email guilds"
        },
        "linkedin": {
            "auth_url": "https://www.linkedin.com/oauth/v2/authorization",
            "token_url": "https://www.linkedin.com/oauth/v2/accessToken",
            "user_info_url": "https://api.linkedin.com/v2/me",
            "scope": "r_liteprofile r_emailaddress"
        }
    }

    def __init__(self, db: Database, callback_base_url: Optional[str] = None):
        """Initialize OAuth handler

        Args:
            db: Database instance (SQLite or Supabase)
            callback_base_url: Base URL for OAuth callbacks (e.g., https://yourapp.com)
        """
        self.db = db
        self.callback_base_url = callback_base_url or os.getenv(
            "OAUTH_CALLBACK_BASE_URL",
            "http://localhost:8000"
        )

        # Load credentials from environment
        self.credentials = {
            "twitter": {
                "client_id": os.getenv("TWITTER_CLIENT_ID"),
                "client_secret": os.getenv("TWITTER_CLIENT_SECRET")
            },
            "github": {
                "client_id": os.getenv("GITHUB_CLIENT_ID"),
                "client_secret": os.getenv("GITHUB_CLIENT_SECRET")
            },
            "discord": {
                "client_id": os.getenv("DISCORD_CLIENT_ID"),
                "client_secret": os.getenv("DISCORD_CLIENT_SECRET")
            },
            "linkedin": {
                "client_id": os.getenv("LINKEDIN_CLIENT_ID"),
                "client_secret": os.getenv("LINKEDIN_CLIENT_SECRET")
            }
        }

    def get_auth_url(self, provider: str, redirect_path: str = "/") -> str:
        """Generate OAuth authorization URL with PKCE

        Args:
            provider: OAuth provider (twitter, github, discord, linkedin)
            redirect_path: Path to redirect after OAuth (stored in state)

        Returns:
            Authorization URL for user to visit
        """
        if provider not in self.PROVIDERS:
            raise ValueError(f"Unknown provider: {provider}")

        config = self.PROVIDERS[provider]
        creds = self.credentials[provider]

        if not creds["client_id"]:
            raise ValueError(f"Missing {provider.upper()}_CLIENT_ID in environment")

        # Generate PKCE challenge
        code_verifier = self._generate_code_verifier()
        code_challenge = self._generate_code_challenge(code_verifier)

        # Generate state with redirect path
        state = self._generate_state(redirect_path)

        # Store PKCE verifier and state
        self.db.store_oauth_state(state, code_verifier, provider)

        # Build authorization URL
        params = {
            "client_id": creds["client_id"],
            "redirect_uri": f"{self.callback_base_url}/auth/callback/{provider}",
            "response_type": "code",
            "scope": config["scope"],
            "state": state,
            "code_challenge": code_challenge,
            "code_challenge_method": "S256"
        }

        return f"{config['auth_url']}?{urlencode(params)}"

    async def handle_callback(
        self,
        provider: str,
        code: str,
        state: str
    ) -> Tuple[User, Session]:
        """Handle OAuth callback and create/update user

        Args:
            provider: OAuth provider
            code: Authorization code from OAuth provider
            state: State parameter (contains redirect path)

        Returns:
            Tuple of (User, Session)
        """
        # Verify state and get PKCE verifier
        oauth_state = self.db.get_oauth_state(state)
        if not oauth_state:
            raise ValueError("Invalid or expired OAuth state")

        code_verifier = oauth_state["code_verifier"]
        stored_provider = oauth_state["provider"]

        if provider != stored_provider:
            raise ValueError(f"Provider mismatch: {provider} != {stored_provider}")

        # Exchange code for token
        token_data = await self._exchange_code_for_token(provider, code, code_verifier)

        # Get user info from provider
        user_info = await self._get_user_info(provider, token_data["access_token"])

        # Create or update user
        user = await self._create_or_update_user(provider, user_info, token_data)

        # Create session
        session = self._create_session(user.user_id)

        # Clean up OAuth state
        self.db.delete_oauth_state(state)

        return user, session

    async def _exchange_code_for_token(
        self,
        provider: str,
        code: str,
        code_verifier: str
    ) -> Dict:
        """Exchange authorization code for access token"""
        config = self.PROVIDERS[provider]
        creds = self.credentials[provider]

        data = {
            "client_id": creds["client_id"],
            "client_secret": creds["client_secret"],
            "code": code,
            "grant_type": "authorization_code",
            "redirect_uri": f"{self.callback_base_url}/auth/callback/{provider}",
            "code_verifier": code_verifier
        }

        async with httpx.AsyncClient() as client:
            response = await client.post(
                config["token_url"],
                data=data,
                headers={"Accept": "application/json"}
            )
            response.raise_for_status()
            return response.json()

    async def _get_user_info(self, provider: str, access_token: str) -> Dict:
        """Get user information from OAuth provider"""
        config = self.PROVIDERS[provider]

        async with httpx.AsyncClient() as client:
            # Get basic user info
            response = await client.get(
                config["user_info_url"],
                headers={
                    "Authorization": f"Bearer {access_token}",
                    "Accept": "application/json"
                },
                params={"user.fields": config.get("fields")} if provider == "twitter" else None
            )
            response.raise_for_status()
            user_data = response.json()

            # Twitter wraps data in "data" field
            if provider == "twitter" and "data" in user_data:
                user_data = user_data["data"]

            # For GitHub, fetch repos for expertise extraction
            if provider == "github":
                repos_response = await client.get(
                    config["repos_url"],
                    headers={
                        "Authorization": f"Bearer {access_token}",
                        "Accept": "application/json"
                    },
                    params={"sort": "updated", "per_page": 10}
                )
                if repos_response.status_code == 200:
                    user_data["repos"] = repos_response.json()

            return user_data

    async def _create_or_update_user(
        self,
        provider: str,
        user_info: Dict,
        token_data: Dict
    ) -> User:
        """Create or update user from OAuth data"""
        # Normalize user data across providers
        normalized = self._normalize_user_data(provider, user_info)

        # Check if user exists
        external_id = f"{provider}:{normalized['id']}"
        user = self.db.get_user_by_external_id(external_id)

        if user:
            # Update existing user
            user.display_name = normalized["display_name"]
            user.avatar_url = normalized["avatar_url"]
            user.bio = normalized["bio"]
            user.expertise = self._extract_expertise(normalized["bio"], provider, user_info)
            user.oauth_token = token_data["access_token"]
            user.oauth_refresh = token_data.get("refresh_token")
            user.oauth_expires = datetime.utcnow() + timedelta(seconds=token_data.get("expires_in", 3600))
            user.last_activity = datetime.utcnow()

            self.db.update_user(user)
        else:
            # Create new user
            user = User(
                user_id=self._generate_user_id(),
                external_id=external_id,
                provider=provider,
                username=normalized["username"],
                display_name=normalized["display_name"],
                email=normalized.get("email"),
                avatar_url=normalized["avatar_url"],
                bio=normalized["bio"],
                expertise=self._extract_expertise(normalized["bio"], provider, user_info),
                vanity_subdomain=normalized["username"],
                oauth_token=token_data["access_token"],
                oauth_refresh=token_data.get("refresh_token"),
                oauth_expires=datetime.utcnow() + timedelta(seconds=token_data.get("expires_in", 3600)),
                created_at=datetime.utcnow(),
                last_activity=datetime.utcnow()
            )

            self.db.create_user(user)

        return user

    def _normalize_user_data(self, provider: str, user_info: Dict) -> Dict:
        """Normalize user data across different OAuth providers"""
        if provider == "twitter":
            return {
                "id": user_info["id"],
                "username": user_info["username"],
                "display_name": user_info["name"],
                "avatar_url": user_info.get("profile_image_url", "").replace("_normal", "_400x400"),
                "bio": user_info.get("description", ""),
                "email": None  # Twitter OAuth 2.0 doesn't provide email
            }
        elif provider == "github":
            return {
                "id": str(user_info["id"]),
                "username": user_info["login"],
                "display_name": user_info.get("name") or user_info["login"],
                "avatar_url": user_info["avatar_url"],
                "bio": user_info.get("bio", ""),
                "email": user_info.get("email")
            }
        elif provider == "discord":
            return {
                "id": user_info["id"],
                "username": user_info["username"],
                "display_name": user_info.get("global_name") or user_info["username"],
                "avatar_url": f"https://cdn.discordapp.com/avatars/{user_info['id']}/{user_info['avatar']}.png",
                "bio": "",
                "email": user_info.get("email")
            }
        elif provider == "linkedin":
            return {
                "id": user_info["id"],
                "username": user_info.get("vanityName", user_info["id"]),
                "display_name": f"{user_info.get('localizedFirstName', '')} {user_info.get('localizedLastName', '')}".strip(),
                "avatar_url": "",  # Requires additional API call
                "bio": "",
                "email": None  # Requires additional API call
            }
        else:
            raise ValueError(f"Unknown provider: {provider}")

    def _extract_expertise(self, bio: str, provider: str, user_info: Dict) -> list:
        """Extract expertise tags from bio and repos"""
        keywords = [
            "javascript", "typescript", "python", "rust", "go", "java", "c++",
            "react", "vue", "angular", "node", "django", "flask", "fastapi",
            "design", "ui/ux", "figma", "marketing", "seo", "content",
            "crypto", "web3", "blockchain", "defi", "nft",
            "ai", "ml", "machine learning", "llm", "gpt",
            "devops", "docker", "kubernetes", "aws", "gcp"
        ]

        expertise = set()
        bio_lower = bio.lower()

        # Extract from bio
        for keyword in keywords:
            if keyword in bio_lower:
                expertise.add(keyword)

        # Extract from GitHub repos
        if provider == "github" and "repos" in user_info:
            for repo in user_info["repos"][:10]:
                if repo.get("language"):
                    expertise.add(repo["language"].lower())

                # Check repo description
                desc = (repo.get("description") or "").lower()
                for keyword in keywords:
                    if keyword in desc:
                        expertise.add(keyword)

        return sorted(list(expertise))

    def _create_session(self, user_id: str) -> Session:
        """Create a new session for user"""
        session = Session(
            session_id=self._generate_session_id(),
            user_id=user_id,
            expires_at=datetime.utcnow() + timedelta(days=30)
        )

        self.db.create_session(session)
        return session

    def get_user_from_session(self, session_id: str) -> Optional[User]:
        """Get user from session ID"""
        session = self.db.get_session(session_id)
        if not session or session.expires_at < datetime.utcnow():
            return None

        return self.db.get_user(session.user_id)

    def _generate_code_verifier(self) -> str:
        """Generate PKCE code verifier"""
        return base64.urlsafe_b64encode(secrets.token_bytes(32)).decode('utf-8').rstrip('=')

    def _generate_code_challenge(self, verifier: str) -> str:
        """Generate PKCE code challenge from verifier"""
        digest = hashlib.sha256(verifier.encode('utf-8')).digest()
        return base64.urlsafe_b64encode(digest).decode('utf-8').rstrip('=')

    def _generate_state(self, redirect_path: str) -> str:
        """Generate OAuth state parameter"""
        random = secrets.token_urlsafe(16)
        return f"{random}:{redirect_path}"

    def _generate_user_id(self) -> str:
        """Generate unique user ID"""
        return f"user_{secrets.token_urlsafe(16)}"

    def _generate_session_id(self) -> str:
        """Generate unique session ID"""
        return secrets.token_urlsafe(32)
