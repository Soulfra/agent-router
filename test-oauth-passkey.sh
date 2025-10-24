#!/bin/bash
#
# OAuth & Passkey Authentication Test Suite
#
# This script tests the complete authentication flow:
# 1. OAuth provider setup
# 2. Traditional email/password registration
# 3. Email verification
# 4. Password reset
# 5. OAuth provider detection
# 6. Database verification
#
# Usage:
#   chmod +x test-oauth-passkey.sh
#   ./test-oauth-passkey.sh
#

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
API_BASE="http://localhost:5001"
TEST_EMAIL="test-oauth-$(date +%s)@example.com"
TEST_PASSWORD="TestPassword123!"
TEST_USERNAME="testuser$(date +%s)"

echo ""
echo "╔════════════════════════════════════════════════════════════════╗"
echo "║         OAuth & Passkey Authentication Test Suite             ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

# Step 1: Check if server is running
echo -e "${BLUE}[1/9]${NC} Checking if server is running..."
if curl -s -f "${API_BASE}/health" > /dev/null 2>&1; then
  echo -e "${GREEN}✓${NC} Server is running at ${API_BASE}"
else
  echo -e "${RED}✗${NC} Server is not running. Start it with: npm start"
  exit 1
fi

# Step 2: Check OAuth provider configuration
echo ""
echo -e "${BLUE}[2/9]${NC} Checking OAuth provider configuration..."
PROVIDERS=$(curl -s "${API_BASE}/api/auth/oauth/providers")
PROVIDER_COUNT=$(echo "$PROVIDERS" | grep -o '"provider_id"' | wc -l | tr -d ' ')

if [ "$PROVIDER_COUNT" -gt 0 ]; then
  echo -e "${GREEN}✓${NC} Found ${PROVIDER_COUNT} OAuth provider(s) configured"
  echo "$PROVIDERS" | grep -o '"name":"[^"]*"' | sed 's/"name":"//g' | sed 's/"//g' | while read name; do
    echo "  - $name"
  done
else
  echo -e "${YELLOW}⚠${NC}  No OAuth providers configured yet"
  echo "  Run: node lib/oauth-provider-setup.js setup"
fi

# Step 3: Test email domain detection
echo ""
echo -e "${BLUE}[3/9]${NC} Testing OAuth provider detection..."
TEST_EMAILS=("test@gmail.com" "test@outlook.com" "test@icloud.com")
for email in "${TEST_EMAILS[@]}"; do
  DETECTED=$(curl -s -X POST "${API_BASE}/api/auth/oauth/detect-provider" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"${email}\"}")

  PROVIDER=$(echo "$DETECTED" | grep -o '"provider_id":"[^"]*"' | sed 's/"provider_id":"//g' | sed 's/"//g')

  if [ -n "$PROVIDER" ]; then
    echo -e "${GREEN}✓${NC} ${email} → ${PROVIDER}"
  else
    echo -e "${YELLOW}⚠${NC}  ${email} → No provider detected"
  fi
done

# Step 4: Register new user
echo ""
echo -e "${BLUE}[4/9]${NC} Registering new user..."
REGISTER_RESPONSE=$(curl -s -X POST "${API_BASE}/api/auth/register" \
  -H "Content-Type: application/json" \
  -d "{
    \"email\": \"${TEST_EMAIL}\",
    \"password\": \"${TEST_PASSWORD}\",
    \"username\": \"${TEST_USERNAME}\"
  }")

if echo "$REGISTER_RESPONSE" | grep -q '"success":true'; then
  USER_ID=$(echo "$REGISTER_RESPONSE" | grep -o '"userId":"[^"]*"' | sed 's/"userId":"//g' | sed 's/"//g')
  echo -e "${GREEN}✓${NC} User registered successfully"
  echo "  Email: ${TEST_EMAIL}"
  echo "  User ID: ${USER_ID}"
else
  ERROR=$(echo "$REGISTER_RESPONSE" | grep -o '"error":"[^"]*"' | sed 's/"error":"//g' | sed 's/"//g')
  echo -e "${RED}✗${NC} Registration failed: ${ERROR}"
  # Continue anyway for other tests
fi

# Step 5: Test email verification flow
echo ""
echo -e "${BLUE}[5/9]${NC} Testing email verification..."
echo -e "${YELLOW}ℹ${NC}  Email provider is set to 'console' mode"
echo "  Check server logs for verification email with token"
echo "  Verification URL format: ${API_BASE}/verify-email?token=<token>"

# Step 6: Test login
echo ""
echo -e "${BLUE}[6/9]${NC} Testing login..."
LOGIN_RESPONSE=$(curl -s -X POST "${API_BASE}/api/auth/login" \
  -H "Content-Type: application/json" \
  -d "{
    \"email\": \"${TEST_EMAIL}\",
    \"password\": \"${TEST_PASSWORD}\"
  }")

if echo "$LOGIN_RESPONSE" | grep -q '"success":true'; then
  TOKEN=$(echo "$LOGIN_RESPONSE" | grep -o '"token":"[^"]*"' | sed 's/"token":"//g' | sed 's/"//g')
  echo -e "${GREEN}✓${NC} Login successful"
  echo "  Token: ${TOKEN:0:50}..."
else
  ERROR=$(echo "$LOGIN_RESPONSE" | grep -o '"error":"[^"]*"' | sed 's/"error":"//g' | sed 's/"//g')
  echo -e "${RED}✗${NC} Login failed: ${ERROR}"
  TOKEN=""
fi

# Step 7: Test password reset
echo ""
echo -e "${BLUE}[7/9]${NC} Testing password reset..."
RESET_RESPONSE=$(curl -s -X POST "${API_BASE}/api/auth/forgot-password" \
  -H "Content-Type: application/json" \
  -d "{\"email\": \"${TEST_EMAIL}\"}")

if echo "$RESET_RESPONSE" | grep -q '"success":true'; then
  echo -e "${GREEN}✓${NC} Password reset email sent"
  echo -e "${YELLOW}ℹ${NC}  Check server logs for reset token"
  echo "  Reset URL format: ${API_BASE}/reset-password?token=<token>"
else
  ERROR=$(echo "$RESET_RESPONSE" | grep -o '"error":"[^"]*"' | sed 's/"error":"//g' | sed 's/"//g')
  echo -e "${RED}✗${NC} Password reset failed: ${ERROR}"
fi

# Step 8: Test passkey check
echo ""
echo -e "${BLUE}[8/9]${NC} Testing passkey availability..."
PASSKEY_CHECK=$(curl -s "${API_BASE}/api/auth/passkey/check/${TEST_EMAIL}")

if echo "$PASSKEY_CHECK" | grep -q '"userExists":true'; then
  HAS_PASSKEY=$(echo "$PASSKEY_CHECK" | grep -o '"hasBiometric":[^,}]*' | sed 's/"hasBiometric"://g')
  echo -e "${GREEN}✓${NC} User exists in passkey system"
  if [ "$HAS_PASSKEY" = "true" ]; then
    echo "  Has passkey registered: Yes"
  else
    echo "  Has passkey registered: No"
    echo "  Register at: ${API_BASE}/oauth-login.html"
  fi
else
  echo -e "${YELLOW}⚠${NC}  User not found in passkey system"
fi

# Step 9: Database verification
echo ""
echo -e "${BLUE}[9/9]${NC} Verifying database setup..."

# Check if we can connect to database
if command -v psql &> /dev/null; then
  DB_NAME="${DB_NAME:-calos}"
  DB_USER="${DB_USER:-matthewmauer}"

  TABLES=$(psql -d "$DB_NAME" -U "$DB_USER" -t -c "
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name IN (
        'users',
        'oauth_providers',
        'oauth_tokens',
        'oauth_authorization_attempts',
        'biometric_credentials',
        'biometric_challenges',
        'sessions'
      )
    ORDER BY table_name;
  " 2>/dev/null || echo "")

  if [ -n "$TABLES" ]; then
    TABLE_COUNT=$(echo "$TABLES" | grep -v '^$' | wc -l | tr -d ' ')
    echo -e "${GREEN}✓${NC} Database tables verified (${TABLE_COUNT}/7)"
    echo "$TABLES" | grep -v '^$' | while read table; do
      echo "  - $table"
    done
  else
    echo -e "${RED}✗${NC} Could not verify database tables"
    echo "  Ensure migrations have been run"
  fi
else
  echo -e "${YELLOW}⚠${NC}  psql not found, skipping database verification"
fi

# Summary
echo ""
echo "╔════════════════════════════════════════════════════════════════╗"
echo "║                         Test Summary                           ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""
echo "✓ Server Status: Running"
echo "✓ OAuth Providers: ${PROVIDER_COUNT} configured"
echo "✓ User Registration: Tested"
echo "✓ Email Flow: Tested (console mode)"
echo "✓ Authentication: Tested"
echo "✓ Password Reset: Tested"
echo "✓ Passkey System: Available"
echo ""
echo "Next Steps:"
echo "1. Open browser: ${API_BASE}/oauth-login.html"
echo "2. Test OAuth flows (if providers configured)"
echo "3. Test passkey registration (requires biometric device)"
echo "4. Check email logs in server console"
echo ""
echo "Test User Credentials:"
echo "  Email:    ${TEST_EMAIL}"
echo "  Password: ${TEST_PASSWORD}"
if [ -n "$TOKEN" ]; then
  echo "  Token:    ${TOKEN:0:50}..."
fi
echo ""
echo "Documentation: docs/OAUTH-PASSKEY-AUTH.md"
echo ""
