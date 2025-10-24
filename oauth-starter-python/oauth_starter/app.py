"""FastAPI application with OAuth routes"""

import os
from typing import Optional
from fastapi import FastAPI, Request, Response, Cookie, HTTPException, Depends
from fastapi.responses import RedirectResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from .auth import SocialAuth
from .database import Database
from .models import User, Activity


# Pydantic models for requests/responses
class UserResponse(BaseModel):
    userId: str
    provider: str
    username: str
    displayName: str
    email: Optional[str]
    avatarUrl: Optional[str]
    bio: Optional[str]
    expertise: list
    vanitySubdomain: Optional[str]
    createdAt: str
    lastActivity: str


class ActivityRequest(BaseModel):
    activityType: str
    domain: str
    points: int = 1
    metadata: Optional[dict] = None


# Initialize app
app = FastAPI(
    title="OAuth Starter",
    description="Multi-provider OAuth with auto-subdomain creation",
    version="0.1.0"
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("CORS_ORIGINS", "*").split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"]
)

# Initialize database and auth
db = Database()
social_auth = SocialAuth(db)


# Dependency: Get current user from session cookie
async def get_current_user(session_id: Optional[str] = Cookie(None)) -> Optional[User]:
    """Get current user from session cookie"""
    if not session_id:
        return None
    return social_auth.get_user_from_session(session_id)


# Routes

@app.get("/")
async def root():
    """Root endpoint"""
    return {
        "name": "OAuth Starter",
        "version": "0.1.0",
        "providers": ["twitter", "github", "discord", "linkedin"],
        "docs": "/docs"
    }


@app.get("/health")
async def health():
    """Health check"""
    return {
        "status": "healthy",
        "database": db.mode
    }


@app.get("/auth/{provider}")
async def auth_provider(provider: str, redirect: str = "/"):
    """Initiate OAuth flow for provider

    Args:
        provider: OAuth provider (twitter, github, discord, linkedin)
        redirect: Path to redirect after OAuth (default: /)
    """
    try:
        auth_url = social_auth.get_auth_url(provider, redirect)
        return RedirectResponse(url=auth_url)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.get("/auth/callback/{provider}")
async def auth_callback(
    provider: str,
    code: str,
    state: str,
    response: Response
):
    """Handle OAuth callback

    Args:
        provider: OAuth provider
        code: Authorization code from provider
        state: State parameter (contains redirect path)
    """
    try:
        # Handle OAuth callback
        user, session = await social_auth.handle_callback(provider, code, state)

        # Set session cookie (HTTP-only, secure in production)
        response.set_cookie(
            key="session_id",
            value=session.session_id,
            httponly=True,
            secure=os.getenv("ENV") == "production",
            samesite="lax",
            max_age=30 * 24 * 60 * 60  # 30 days
        )

        # Auto-create subdomain if configured
        parent_domain = os.getenv("PARENT_DOMAIN", "soulfra.com")
        if user.vanity_subdomain and os.getenv("AUTO_CREATE_SUBDOMAIN") == "true":
            from .models import Subdomain
            from datetime import datetime

            existing = db.get_subdomain(user.vanity_subdomain, parent_domain)
            if not existing:
                subdomain = Subdomain(
                    subdomain=user.vanity_subdomain,
                    parent_domain=parent_domain,
                    user_id=user.user_id,
                    status="active",
                    created_at=datetime.utcnow(),
                    last_verified=datetime.utcnow()
                )
                db.create_subdomain(subdomain)

        # Log activity
        activity = Activity(
            user_id=user.user_id,
            activity_type="login",
            domain=parent_domain,
            points=1
        )
        db.create_activity(activity)

        # Extract redirect path from state
        redirect_path = state.split(":", 1)[1] if ":" in state else "/"

        # Redirect to user's subdomain or specified path
        if user.vanity_subdomain and os.getenv("REDIRECT_TO_SUBDOMAIN") == "true":
            redirect_url = f"https://{user.vanity_subdomain}.{parent_domain}{redirect_path}"
        else:
            redirect_url = redirect_path

        return RedirectResponse(url=redirect_url)

    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"OAuth error: {str(e)}")


@app.get("/auth/me", response_model=UserResponse)
async def get_me(user: Optional[User] = Depends(get_current_user)):
    """Get current user from session"""
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")

    return UserResponse(**user.to_dict())


@app.post("/auth/logout")
async def logout(
    response: Response,
    session_id: Optional[str] = Cookie(None)
):
    """Logout current user"""
    if session_id:
        db.delete_session(session_id)

    response.delete_cookie("session_id")
    return {"success": True}


@app.get("/users/{username}", response_model=UserResponse)
async def get_user_by_username(username: str):
    """Get user by username"""
    user = db.get_user_by_username(username)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    return UserResponse(**user.to_dict())


@app.post("/activity")
async def log_activity(
    activity_req: ActivityRequest,
    user: Optional[User] = Depends(get_current_user)
):
    """Log user activity"""
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")

    activity = Activity(
        user_id=user.user_id,
        activity_type=activity_req.activityType,
        domain=activity_req.domain,
        points=activity_req.points,
        metadata=activity_req.metadata
    )

    db.create_activity(activity)

    return {
        "success": True,
        "activity": activity.to_dict()
    }


@app.get("/activity/leaderboard/{domain}")
async def get_leaderboard(domain: str, days: int = 30, limit: int = 1000):
    """Get activity leaderboard for domain

    Top 1000 users get immunity from 30-day expiration
    """
    leaderboard = db.get_leaderboard(domain, days, limit)

    return {
        "domain": domain,
        "days": days,
        "leaderboard": leaderboard,
        "immunityThreshold": min(limit, len(leaderboard))
    }


@app.get("/activity/me")
async def get_my_activity(
    user: Optional[User] = Depends(get_current_user),
    days: int = 30
):
    """Get current user's activity"""
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")

    activities = db.get_recent_activity(user.user_id, days)

    return {
        "userId": user.user_id,
        "days": days,
        "totalActivities": len(activities),
        "activities": [a.to_dict() for a in activities]
    }


# Admin endpoints (require admin key)

def verify_admin(admin_key: Optional[str] = Cookie(None)):
    """Verify admin key"""
    expected_key = os.getenv("ADMIN_KEY")
    if not expected_key or admin_key != expected_key:
        raise HTTPException(status_code=403, detail="Admin access required")


@app.post("/admin/cleanup")
async def admin_cleanup(admin: None = Depends(verify_admin)):
    """Cleanup expired sessions and old activities"""
    db.cleanup_expired_sessions()
    db.cleanup_expired_oauth_states()
    db.cleanup_old_activities(30)

    return {"success": True, "message": "Cleanup completed"}


# Cal orchestrator integration (optional)

@app.get("/cal/status")
async def cal_status():
    """Status endpoint for Cal orchestrator

    Cal can check if this service is healthy and what it provides
    """
    return {
        "service": "oauth-starter",
        "version": "0.1.0",
        "mode": db.mode,
        "features": [
            "twitter-oauth",
            "github-oauth",
            "discord-oauth",
            "linkedin-oauth",
            "subdomain-creation",
            "activity-tracking",
            "leaderboard"
        ],
        "endpoints": {
            "auth": "/auth/{provider}",
            "me": "/auth/me",
            "activity": "/activity",
            "leaderboard": "/activity/leaderboard/{domain}"
        }
    }


@app.post("/cal/integrate")
async def cal_integrate(request: Request):
    """Cal orchestrator integration endpoint

    Cal can send requests here to coordinate with other services
    """
    data = await request.json()

    # Example: Cal wants to create a user across all services
    if data.get("action") == "create_user":
        user_id = data.get("userId")
        # Coordinate with other services via Cal
        return {
            "success": True,
            "service": "oauth-starter",
            "userId": user_id
        }

    return {"success": False, "error": "Unknown action"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
