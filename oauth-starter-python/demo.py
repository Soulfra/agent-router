#!/usr/bin/env python3
"""
OAuth Starter Demo - Standalone FastAPI OAuth Demo

This script runs a standalone OAuth demo to test the Python package.
No integration with Node.js required.

Usage:
    python demo.py

Then visit: http://localhost:8000/login.html
"""

import os
import sys
from pathlib import Path

# Add package to path for development
sys.path.insert(0, str(Path(__file__).parent))

from oauth_starter.app import app
from oauth_starter.database import Database
from fastapi.responses import HTMLResponse
import uvicorn


# Add demo login page
@app.get("/login.html", response_class=HTMLResponse)
async def demo_login():
    """Demo login page"""
    return """
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>OAuth Starter Demo</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
        }

        .container {
            background: rgba(255, 255, 255, 0.1);
            backdrop-filter: blur(10px);
            border-radius: 20px;
            padding: 40px;
            max-width: 400px;
            width: 90%;
            box-shadow: 0 8px 32px 0 rgba(31, 38, 135, 0.37);
        }

        h1 {
            font-size: 32px;
            margin-bottom: 10px;
            text-align: center;
        }

        .subtitle {
            text-align: center;
            opacity: 0.9;
            margin-bottom: 30px;
            font-size: 14px;
        }

        .oauth-buttons {
            display: flex;
            flex-direction: column;
            gap: 12px;
        }

        .oauth-button {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 12px;
            padding: 14px 24px;
            border-radius: 10px;
            text-decoration: none;
            color: white;
            font-weight: 500;
            transition: all 0.3s ease;
            border: 1px solid rgba(255, 255, 255, 0.2);
        }

        .oauth-button:hover {
            transform: translateY(-2px);
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
            border-color: rgba(255, 255, 255, 0.4);
        }

        .twitter-button { background: #1DA1F2; }
        .github-button { background: #333; }
        .discord-button { background: #5865F2; }
        .linkedin-button { background: #0077B5; }

        .oauth-button svg {
            width: 20px;
            height: 20px;
        }

        .demo-note {
            margin-top: 20px;
            padding: 15px;
            background: rgba(255, 255, 255, 0.1);
            border-radius: 10px;
            font-size: 13px;
            line-height: 1.6;
        }

        .demo-note strong {
            display: block;
            margin-bottom: 8px;
        }

        .demo-note code {
            background: rgba(0, 0, 0, 0.2);
            padding: 2px 6px;
            border-radius: 4px;
            font-size: 12px;
        }

        .status {
            margin-top: 20px;
            padding: 12px;
            background: rgba(0, 0, 0, 0.2);
            border-radius: 8px;
            font-size: 12px;
            font-family: 'Courier New', monospace;
        }

        .status-item {
            display: flex;
            justify-content: space-between;
            margin: 4px 0;
        }

        .status-ok { color: #4ade80; }
        .status-error { color: #f87171; }
    </style>
</head>
<body>
    <div class="container">
        <h1>OAuth Starter Demo</h1>
        <p class="subtitle">Multi-provider OAuth with auto-subdomain creation</p>

        <div class="oauth-buttons">
            <a href="/auth/twitter" class="oauth-button twitter-button">
                <svg viewBox="0 0 24 24" fill="currentColor">
                    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                </svg>
                Sign in with X
            </a>

            <a href="/auth/github" class="oauth-button github-button">
                <svg viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/>
                </svg>
                Sign in with GitHub
            </a>

            <a href="/auth/discord" class="oauth-button discord-button">
                <svg viewBox="0 0 24 24" fill="currentColor">
                    <path d="M20.317 4.37a19.791 19.791 0 00-4.885-1.515.074.074 0 00-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 00-5.487 0 12.64 12.64 0 00-.617-1.25.077.077 0 00-.079-.037A19.736 19.736 0 003.677 4.37a.07.07 0 00-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 00.031.057 19.9 19.9 0 005.993 3.03.078.078 0 00.084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 00-.041-.106 13.107 13.107 0 01-1.872-.892.077.077 0 01-.008-.128 10.2 10.2 0 00.372-.292.074.074 0 01.077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 01.078.01c.12.098.246.198.373.292a.077.077 0 01-.006.127 12.299 12.299 0 01-1.873.892.077.077 0 00-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 00.084.028 19.839 19.839 0 006.002-3.03.077.077 0 00.032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 00-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
                </svg>
                Sign in with Discord
            </a>

            <a href="/auth/linkedin" class="oauth-button linkedin-button">
                <svg viewBox="0 0 24 24" fill="currentColor">
                    <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
                </svg>
                Sign in with LinkedIn
            </a>
        </div>

        <div class="demo-note">
            <strong>Demo Mode 🧪</strong>
            This is a standalone OAuth demo running on Python FastAPI.
            <br><br>
            To test: Set OAuth credentials in <code>.env</code> file.
        </div>

        <div class="status">
            <div class="status-item">
                <span>Database:</span>
                <span class="status-ok">SQLite ✓</span>
            </div>
            <div class="status-item">
                <span>Server:</span>
                <span class="status-ok">FastAPI ✓</span>
            </div>
            <div class="status-item">
                <span>Port:</span>
                <span class="status-ok">8000 ✓</span>
            </div>
        </div>
    </div>

    <script>
        // Check if user is already logged in
        fetch('/auth/me', { credentials: 'include' })
            .then(res => res.json())
            .then(data => {
                if (data.userId) {
                    document.querySelector('.subtitle').textContent =
                        `Logged in as @${data.username}`;
                }
            })
            .catch(() => {});
    </script>
</body>
</html>
"""


@app.get("/dashboard", response_class=HTMLResponse)
async def demo_dashboard():
    """Demo dashboard after login"""
    return """
<!DOCTYPE html>
<html>
<head>
    <title>Dashboard - OAuth Starter</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 40px;
        }
        .container {
            max-width: 800px;
            margin: 0 auto;
            background: rgba(255, 255, 255, 0.1);
            backdrop-filter: blur(10px);
            border-radius: 20px;
            padding: 40px;
        }
        h1 { margin-bottom: 20px; }
        .user-info {
            display: grid;
            grid-template-columns: auto 1fr;
            gap: 12px;
            background: rgba(0, 0, 0, 0.2);
            padding: 20px;
            border-radius: 10px;
            margin-bottom: 20px;
        }
        .label { font-weight: bold; }
        button {
            background: rgba(255, 255, 255, 0.2);
            border: 1px solid rgba(255, 255, 255, 0.3);
            color: white;
            padding: 12px 24px;
            border-radius: 8px;
            cursor: pointer;
            font-size: 14px;
        }
        button:hover {
            background: rgba(255, 255, 255, 0.3);
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>OAuth Demo Dashboard</h1>
        <div class="user-info" id="user-info">
            Loading...
        </div>
        <button onclick="logout()">Logout</button>
    </div>

    <script>
        fetch('/auth/me', { credentials: 'include' })
            .then(res => res.json())
            .then(data => {
                document.getElementById('user-info').innerHTML = `
                    <span class="label">Username:</span><span>@${data.username}</span>
                    <span class="label">Provider:</span><span>${data.provider}</span>
                    <span class="label">Display Name:</span><span>${data.displayName}</span>
                    <span class="label">Subdomain:</span><span>${data.vanitySubdomain}.soulfra.com</span>
                    <span class="label">Expertise:</span><span>${data.expertise.join(', ') || 'None detected'}</span>
                `;
            })
            .catch(() => {
                window.location.href = '/login.html';
            });

        function logout() {
            fetch('/auth/logout', { method: 'POST', credentials: 'include' })
                .then(() => window.location.href = '/login.html');
        }
    </script>
</body>
</html>
"""


if __name__ == "__main__":
    print("=" * 60)
    print("OAuth Starter Demo - Standalone Python OAuth System")
    print("=" * 60)
    print()
    print("Starting FastAPI server on http://localhost:8000")
    print()
    print("Pages:")
    print("  Login:      http://localhost:8000/login.html")
    print("  Dashboard:  http://localhost:8000/dashboard")
    print("  API Docs:   http://localhost:8000/docs")
    print()
    print("Database: SQLite (in-memory)")
    print()
    print("To stop: Ctrl+C")
    print("=" * 60)
    print()

    # Check for OAuth credentials
    providers = []
    if os.getenv("TWITTER_CLIENT_ID"):
        providers.append("Twitter")
    if os.getenv("GITHUB_CLIENT_ID"):
        providers.append("GitHub")
    if os.getenv("DISCORD_CLIENT_ID"):
        providers.append("Discord")
    if os.getenv("LINKEDIN_CLIENT_ID"):
        providers.append("LinkedIn")

    if providers:
        print(f"OAuth providers configured: {', '.join(providers)}")
    else:
        print("⚠️  No OAuth providers configured in .env")
        print("   Set TWITTER_CLIENT_ID, GITHUB_CLIENT_ID, etc.")

    print()

    uvicorn.run(app, host="0.0.0.0", port=8000)
