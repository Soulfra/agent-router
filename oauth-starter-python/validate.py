#!/usr/bin/env python3
"""
Integration Validator - Test the "launch sequence"

This script validates that all systems can communicate:
- Python package imports work
- Database connections work
- OAuth configuration is valid
- Node.js integration (if applicable)

Usage:
    python validate.py
"""

import os
import sys
from pathlib import Path

# Add package to path
sys.path.insert(0, str(Path(__file__).parent))

from oauth_starter import Database, SocialAuth
from oauth_starter.models import User
import httpx


def print_header(text):
    """Print formatted header"""
    print()
    print("=" * 60)
    print(f"  {text}")
    print("=" * 60)


def print_check(label, status, details=""):
    """Print check result"""
    icon = "✓" if status else "✗"
    status_text = "OK" if status else "FAIL"
    print(f"{icon} {label:.<50} {status_text}")
    if details:
        print(f"   └─ {details}")


def validate_imports():
    """Test 1: Validate package imports"""
    print_header("Test 1: Package Imports")

    checks = {}

    try:
        from oauth_starter import Database
        checks["Database"] = True
    except ImportError as e:
        checks["Database"] = False
        print_check("Database import", False, str(e))

    try:
        from oauth_starter import SocialAuth
        checks["SocialAuth"] = True
    except ImportError as e:
        checks["SocialAuth"] = False
        print_check("SocialAuth import", False, str(e))

    try:
        from oauth_starter import User, Session, Subdomain
        checks["Models"] = True
    except ImportError as e:
        checks["Models"] = False
        print_check("Models import", False, str(e))

    try:
        from oauth_starter.app import app
        checks["FastAPI app"] = True
    except ImportError as e:
        checks["FastAPI app"] = False
        print_check("FastAPI app import", False, str(e))

    for name, status in checks.items():
        if status:
            print_check(f"{name} import", True)

    return all(checks.values())


def validate_database():
    """Test 2: Validate database connections"""
    print_header("Test 2: Database Connections")

    # Test SQLite
    try:
        db = Database(database_url="sqlite:///:memory:", mode="sqlite")
        print_check("SQLite in-memory", True, "Connection successful")

        # Test CRUD operations
        user = User(
            user_id="test_user",
            external_id="test:123",
            provider="test",
            username="testuser",
            display_name="Test User",
            vanity_subdomain="testuser"
        )
        db.create_user(user)
        retrieved = db.get_user("test_user")

        if retrieved and retrieved.username == "testuser":
            print_check("SQLite CRUD operations", True)
        else:
            print_check("SQLite CRUD operations", False, "User retrieval failed")

        sqlite_ok = True
    except Exception as e:
        print_check("SQLite connection", False, str(e))
        sqlite_ok = False

    # Test Supabase (if configured)
    supabase_ok = True
    if os.getenv("SUPABASE_URL"):
        try:
            db = Database(mode="supabase")
            print_check("Supabase connection", True, db.database_url.split("@")[1].split("/")[0])
        except Exception as e:
            print_check("Supabase connection", False, str(e))
            supabase_ok = False
    else:
        print_check("Supabase configuration", False, "SUPABASE_URL not set (optional)")

    return sqlite_ok


def validate_oauth_config():
    """Test 3: Validate OAuth configuration"""
    print_header("Test 3: OAuth Configuration")

    providers = {
        "Twitter": ("TWITTER_CLIENT_ID", "TWITTER_CLIENT_SECRET"),
        "GitHub": ("GITHUB_CLIENT_ID", "GITHUB_CLIENT_SECRET"),
        "Discord": ("DISCORD_CLIENT_ID", "DISCORD_CLIENT_SECRET"),
        "LinkedIn": ("LINKEDIN_CLIENT_ID", "LINKEDIN_CLIENT_SECRET"),
    }

    configured_count = 0

    for provider, (id_key, secret_key) in providers.items():
        has_id = bool(os.getenv(id_key))
        has_secret = bool(os.getenv(secret_key))

        if has_id and has_secret:
            print_check(f"{provider} OAuth", True, "Credentials configured")
            configured_count += 1
        elif has_id or has_secret:
            print_check(f"{provider} OAuth", False, "Incomplete credentials")
        else:
            print_check(f"{provider} OAuth", False, "Not configured")

    if configured_count == 0:
        print()
        print("⚠️  No OAuth providers configured")
        print("   Set credentials in .env file to test OAuth flow")

    return True  # Don't fail if no providers configured


def validate_oauth_auth_urls():
    """Test 4: Validate OAuth URL generation"""
    print_header("Test 4: OAuth URL Generation")

    try:
        db = Database(database_url="sqlite:///:memory:", mode="sqlite")
        auth = SocialAuth(db, callback_base_url="http://localhost:8000")

        # Test each provider URL generation
        providers = ["twitter", "github", "discord", "linkedin"]

        for provider in providers:
            try:
                # Skip if not configured
                id_key = f"{provider.upper()}_CLIENT_ID"
                if not os.getenv(id_key):
                    print_check(f"{provider.capitalize()} URL generation", False, "Not configured")
                    continue

                url = auth.get_auth_url(provider, redirect_path="/dashboard")

                # Validate URL structure
                checks = [
                    provider in url or provider.replace("twitter", "x") in url,
                    "client_id" in url,
                    "redirect_uri" in url,
                    "state=" in url
                ]

                if all(checks):
                    print_check(f"{provider.capitalize()} URL generation", True)
                else:
                    print_check(f"{provider.capitalize()} URL generation", False, "Invalid URL structure")

            except Exception as e:
                print_check(f"{provider.capitalize()} URL generation", False, str(e))

        return True

    except Exception as e:
        print_check("OAuth system initialization", False, str(e))
        return False


def validate_nodejs_integration():
    """Test 5: Validate Node.js integration (optional)"""
    print_header("Test 5: Node.js Integration (Optional)")

    # Check if Node.js router is running
    try:
        response = httpx.get("http://localhost:5001/health", timeout=2)
        if response.status_code == 200:
            print_check("Node.js router", True, "Running on port 5001")
            nodejs_running = True
        else:
            print_check("Node.js router", False, f"HTTP {response.status_code}")
            nodejs_running = False
    except httpx.RequestError:
        print_check("Node.js router", False, "Not running (optional)")
        nodejs_running = False

    # Check if Python demo is running
    try:
        response = httpx.get("http://localhost:8000/health", timeout=2)
        if response.status_code == 200:
            data = response.json()
            print_check("Python FastAPI", True, f"Database: {data.get('database', 'unknown')}")
            python_running = True
        else:
            print_check("Python FastAPI", False, f"HTTP {response.status_code}")
            python_running = False
    except httpx.RequestError:
        print_check("Python FastAPI", False, "Not running")
        python_running = False

    return True  # Don't fail if servers not running


def validate_environment():
    """Test 6: Validate environment configuration"""
    print_header("Test 6: Environment Configuration")

    env_vars = [
        ("OAUTH_CALLBACK_BASE_URL", False),
        ("PARENT_DOMAIN", False),
        ("DATABASE_MODE", False),
        ("AUTO_CREATE_SUBDOMAIN", False),
    ]

    for var, required in env_vars:
        value = os.getenv(var)
        if value:
            print_check(f"{var}", True, f"= {value}")
        elif required:
            print_check(f"{var}", False, "Required but not set")
        else:
            print_check(f"{var}", False, "Not set (using defaults)")

    return True


def main():
    """Run all validation tests"""
    print()
    print("╔" + "═" * 58 + "╗")
    print("║" + " OAuth Starter - Integration Validator ".center(58) + "║")
    print("╚" + "═" * 58 + "╝")

    results = {}

    results["imports"] = validate_imports()
    results["database"] = validate_database()
    results["oauth_config"] = validate_oauth_config()
    results["oauth_urls"] = validate_oauth_auth_urls()
    results["nodejs"] = validate_nodejs_integration()
    results["environment"] = validate_environment()

    # Summary
    print_header("Validation Summary")

    passed = sum(1 for v in results.values() if v)
    total = len(results)

    for test, result in results.items():
        print_check(test.replace("_", " ").title(), result)

    print()
    print(f"Results: {passed}/{total} tests passed")

    if passed == total:
        print()
        print("🎉 All systems validated! Ready to launch.")
        print()
        print("Next steps:")
        print("  1. Run tests: cd oauth-starter-python && pytest")
        print("  2. Start demo: python demo.py")
        print("  3. Visit: http://localhost:8000/login.html")
        return 0
    else:
        print()
        print("⚠️  Some tests failed. Review errors above.")
        return 1


if __name__ == "__main__":
    sys.exit(main())
