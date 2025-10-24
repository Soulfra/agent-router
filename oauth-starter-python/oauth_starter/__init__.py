"""OAuth Starter - Multi-provider OAuth with auto-subdomain creation

Standalone OR integrate with Cal orchestrator.
"""

__version__ = "0.1.0"

from .auth import SocialAuth
from .models import User, Session, Subdomain
from .database import Database

__all__ = ["SocialAuth", "User", "Session", "Subdomain", "Database"]
