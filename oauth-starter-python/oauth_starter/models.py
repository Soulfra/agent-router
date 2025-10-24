"""SQLAlchemy models for OAuth system"""

from datetime import datetime
from typing import Optional, List
from sqlalchemy import Column, String, DateTime, Integer, JSON, Boolean, Text
from sqlalchemy.ext.declarative import declarative_base

Base = declarative_base()


class User(Base):
    """User model - stores OAuth user data"""

    __tablename__ = "users"

    user_id = Column(String, primary_key=True)
    external_id = Column(String, unique=True, nullable=False, index=True)  # provider:id
    provider = Column(String, nullable=False)  # twitter, github, discord, linkedin
    username = Column(String, nullable=False, index=True)
    display_name = Column(String, nullable=False)
    email = Column(String, nullable=True)
    avatar_url = Column(String, nullable=True)
    bio = Column(Text, nullable=True)
    expertise = Column(JSON, nullable=True)  # ["python", "react", "ai"]
    vanity_subdomain = Column(String, unique=True, nullable=True, index=True)
    oauth_token = Column(String, nullable=True)
    oauth_refresh = Column(String, nullable=True)
    oauth_expires = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    last_activity = Column(DateTime, default=datetime.utcnow, nullable=False)

    def __repr__(self):
        return f"<User {self.username} ({self.provider})>"

    def to_dict(self):
        """Convert to dictionary for API responses"""
        return {
            "userId": self.user_id,
            "provider": self.provider,
            "username": self.username,
            "displayName": self.display_name,
            "email": self.email,
            "avatarUrl": self.avatar_url,
            "bio": self.bio,
            "expertise": self.expertise or [],
            "vanitySubdomain": self.vanity_subdomain,
            "createdAt": self.created_at.isoformat() if self.created_at else None,
            "lastActivity": self.last_activity.isoformat() if self.last_activity else None
        }


class Session(Base):
    """Session model - stores user sessions"""

    __tablename__ = "sessions"

    session_id = Column(String, primary_key=True)
    user_id = Column(String, nullable=False, index=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    expires_at = Column(DateTime, nullable=False)

    def __repr__(self):
        return f"<Session {self.session_id[:8]}... for {self.user_id}>"

    def is_expired(self) -> bool:
        """Check if session is expired"""
        return datetime.utcnow() > self.expires_at


class Subdomain(Base):
    """Subdomain model - stores registered subdomains"""

    __tablename__ = "subdomains"

    subdomain = Column(String, primary_key=True)
    parent_domain = Column(String, nullable=False)
    user_id = Column(String, nullable=False, index=True)
    status = Column(String, default="active", nullable=False)  # active, suspended, deleted
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    last_verified = Column(DateTime, default=datetime.utcnow, nullable=False)

    def __repr__(self):
        return f"<Subdomain {self.subdomain}.{self.parent_domain}>"

    def full_domain(self) -> str:
        """Get full domain (subdomain.parent)"""
        return f"{self.subdomain}.{self.parent_domain}"

    def to_dict(self):
        """Convert to dictionary for API responses"""
        return {
            "subdomain": self.subdomain,
            "parentDomain": self.parent_domain,
            "fullDomain": self.full_domain(),
            "userId": self.user_id,
            "status": self.status,
            "createdAt": self.created_at.isoformat() if self.created_at else None,
            "lastVerified": self.last_verified.isoformat() if self.last_verified else None
        }


class Activity(Base):
    """Activity model - tracks user activity for 30-day validation"""

    __tablename__ = "activities"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(String, nullable=False, index=True)
    activity_type = Column(String, nullable=False)  # login, post, comment, vote
    domain = Column(String, nullable=False, index=True)
    points = Column(Integer, default=1, nullable=False)
    timestamp = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)
    metadata = Column(JSON, nullable=True)

    def __repr__(self):
        return f"<Activity {self.activity_type} by {self.user_id} at {self.timestamp}>"

    def to_dict(self):
        """Convert to dictionary for API responses"""
        return {
            "id": self.id,
            "userId": self.user_id,
            "activityType": self.activity_type,
            "domain": self.domain,
            "points": self.points,
            "timestamp": self.timestamp.isoformat() if self.timestamp else None,
            "metadata": self.metadata
        }


class OAuthState(Base):
    """OAuth state - stores PKCE verifiers and state for OAuth flow"""

    __tablename__ = "oauth_states"

    state = Column(String, primary_key=True)
    code_verifier = Column(String, nullable=False)
    provider = Column(String, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    expires_at = Column(DateTime, nullable=False)

    def __repr__(self):
        return f"<OAuthState {self.state[:8]}... for {self.provider}>"

    def is_expired(self) -> bool:
        """Check if state is expired"""
        return datetime.utcnow() > self.expires_at
