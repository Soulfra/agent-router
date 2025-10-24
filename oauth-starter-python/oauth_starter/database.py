"""Database abstraction - supports SQLite (standalone) and Supabase (integrated)"""

import os
from typing import Optional, List
from datetime import datetime, timedelta
from sqlalchemy import create_engine, and_
from sqlalchemy.orm import sessionmaker, Session as SQLSession
from sqlalchemy.pool import StaticPool

from .models import Base, User, Session, Subdomain, Activity, OAuthState


class Database:
    """Database wrapper - supports SQLite and Supabase PostgreSQL"""

    def __init__(self, database_url: Optional[str] = None, mode: str = "auto"):
        """Initialize database connection

        Args:
            database_url: Database URL (SQLite or PostgreSQL)
                - SQLite: sqlite:///./oauth.db
                - Supabase: postgresql://user:pass@host/db
            mode: Database mode
                - "auto": Use Supabase if SUPABASE_URL set, else SQLite
                - "sqlite": Force SQLite
                - "supabase": Force Supabase
        """
        self.mode = mode

        # Determine database URL
        if database_url:
            self.database_url = database_url
        elif mode == "supabase" or (mode == "auto" and os.getenv("SUPABASE_URL")):
            # Supabase mode
            supabase_url = os.getenv("SUPABASE_URL")
            supabase_key = os.getenv("SUPABASE_SERVICE_KEY")

            if not supabase_url:
                raise ValueError("SUPABASE_URL environment variable required for Supabase mode")

            # Extract PostgreSQL connection from Supabase URL
            # Format: https://xxx.supabase.co → postgresql://postgres:pass@db.xxx.supabase.co:5432/postgres
            project_ref = supabase_url.replace("https://", "").replace(".supabase.co", "")
            db_password = os.getenv("SUPABASE_DB_PASSWORD", supabase_key)

            self.database_url = f"postgresql://postgres:{db_password}@db.{project_ref}.supabase.co:5432/postgres"
            self.mode = "supabase"
        else:
            # SQLite mode (standalone)
            sqlite_path = os.getenv("SQLITE_PATH", "./oauth.db")
            self.database_url = f"sqlite:///{sqlite_path}"
            self.mode = "sqlite"

        # Create engine
        if self.mode == "sqlite":
            # SQLite with in-memory support
            self.engine = create_engine(
                self.database_url,
                connect_args={"check_same_thread": False},
                poolclass=StaticPool
            )
        else:
            # PostgreSQL/Supabase
            self.engine = create_engine(
                self.database_url,
                pool_size=5,
                max_overflow=10
            )

        # Create session factory
        self.SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=self.engine)

        # Create tables
        Base.metadata.create_all(bind=self.engine)

    def get_session(self) -> SQLSession:
        """Get database session"""
        return self.SessionLocal()

    # User operations

    def create_user(self, user: User) -> User:
        """Create new user"""
        with self.get_session() as session:
            session.add(user)
            session.commit()
            session.refresh(user)
            return user

    def get_user(self, user_id: str) -> Optional[User]:
        """Get user by ID"""
        with self.get_session() as session:
            return session.query(User).filter(User.user_id == user_id).first()

    def get_user_by_external_id(self, external_id: str) -> Optional[User]:
        """Get user by external ID (provider:id)"""
        with self.get_session() as session:
            return session.query(User).filter(User.external_id == external_id).first()

    def get_user_by_username(self, username: str) -> Optional[User]:
        """Get user by username"""
        with self.get_session() as session:
            return session.query(User).filter(User.username == username).first()

    def update_user(self, user: User) -> User:
        """Update user"""
        with self.get_session() as session:
            session.merge(user)
            session.commit()
            return user

    # Session operations

    def create_session(self, session_obj: Session) -> Session:
        """Create new session"""
        with self.get_session() as db_session:
            db_session.add(session_obj)
            db_session.commit()
            db_session.refresh(session_obj)
            return session_obj

    def get_session(self, session_id: str) -> Optional[Session]:
        """Get session by ID"""
        with self.get_session() as db_session:
            return db_session.query(Session).filter(Session.session_id == session_id).first()

    def delete_session(self, session_id: str):
        """Delete session"""
        with self.get_session() as db_session:
            db_session.query(Session).filter(Session.session_id == session_id).delete()
            db_session.commit()

    def cleanup_expired_sessions(self):
        """Delete expired sessions"""
        with self.get_session() as db_session:
            db_session.query(Session).filter(Session.expires_at < datetime.utcnow()).delete()
            db_session.commit()

    # Subdomain operations

    def create_subdomain(self, subdomain: Subdomain) -> Subdomain:
        """Create new subdomain"""
        with self.get_session() as session:
            session.add(subdomain)
            session.commit()
            session.refresh(subdomain)
            return subdomain

    def get_subdomain(self, subdomain: str, parent_domain: str) -> Optional[Subdomain]:
        """Get subdomain by name and parent"""
        with self.get_session() as session:
            return session.query(Subdomain).filter(
                and_(
                    Subdomain.subdomain == subdomain,
                    Subdomain.parent_domain == parent_domain
                )
            ).first()

    def get_subdomains_by_user(self, user_id: str) -> List[Subdomain]:
        """Get all subdomains for user"""
        with self.get_session() as session:
            return session.query(Subdomain).filter(Subdomain.user_id == user_id).all()

    # Activity operations

    def create_activity(self, activity: Activity) -> Activity:
        """Log activity"""
        with self.get_session() as session:
            session.add(activity)
            session.commit()
            session.refresh(activity)
            return activity

    def get_recent_activity(self, user_id: str, days: int = 30) -> List[Activity]:
        """Get recent activity for user"""
        cutoff = datetime.utcnow() - timedelta(days=days)
        with self.get_session() as session:
            return session.query(Activity).filter(
                and_(
                    Activity.user_id == user_id,
                    Activity.timestamp >= cutoff
                )
            ).order_by(Activity.timestamp.desc()).all()

    def get_leaderboard(self, domain: str, days: int = 30, limit: int = 1000) -> List[dict]:
        """Get activity leaderboard for domain"""
        cutoff = datetime.utcnow() - timedelta(days=days)

        with self.get_session() as session:
            # Group by user_id and sum points
            from sqlalchemy import func

            results = session.query(
                Activity.user_id,
                func.sum(Activity.points).label('total_points'),
                func.count(Activity.id).label('activity_count')
            ).filter(
                and_(
                    Activity.domain == domain,
                    Activity.timestamp >= cutoff
                )
            ).group_by(Activity.user_id).order_by(
                func.sum(Activity.points).desc()
            ).limit(limit).all()

            return [
                {
                    "userId": r.user_id,
                    "totalPoints": r.total_points,
                    "activityCount": r.activity_count,
                    "rank": idx + 1
                }
                for idx, r in enumerate(results)
            ]

    def cleanup_old_activities(self, days: int = 30):
        """Delete activities older than N days"""
        cutoff = datetime.utcnow() - timedelta(days=days)
        with self.get_session() as session:
            session.query(Activity).filter(Activity.timestamp < cutoff).delete()
            session.commit()

    # OAuth state operations

    def store_oauth_state(self, state: str, code_verifier: str, provider: str):
        """Store OAuth state for PKCE"""
        oauth_state = OAuthState(
            state=state,
            code_verifier=code_verifier,
            provider=provider,
            created_at=datetime.utcnow(),
            expires_at=datetime.utcnow() + timedelta(minutes=10)
        )

        with self.get_session() as session:
            session.add(oauth_state)
            session.commit()

    def get_oauth_state(self, state: str) -> Optional[dict]:
        """Get OAuth state"""
        with self.get_session() as session:
            oauth_state = session.query(OAuthState).filter(OAuthState.state == state).first()

            if not oauth_state or oauth_state.is_expired():
                return None

            return {
                "code_verifier": oauth_state.code_verifier,
                "provider": oauth_state.provider
            }

    def delete_oauth_state(self, state: str):
        """Delete OAuth state"""
        with self.get_session() as session:
            session.query(OAuthState).filter(OAuthState.state == state).delete()
            session.commit()

    def cleanup_expired_oauth_states(self):
        """Delete expired OAuth states"""
        with self.get_session() as session:
            session.query(OAuthState).filter(OAuthState.expires_at < datetime.utcnow()).delete()
            session.commit()
