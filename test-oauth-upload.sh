#!/bin/bash
###############################################################################
# OAuth Screenshot Upload Test Script
# Tests the complete upload API with real screenshots
###############################################################################

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
API_URL="${API_URL:-http://localhost:3000}"
SCREENSHOTS_DIR="${SCREENSHOTS_DIR:-./oauth-screenshots/github-2025-10-20}"
PROVIDER="${PROVIDER:-github}"
APP_NAME="${APP_NAME:-Test OAuth App}"
FORMATS="${FORMATS:-[\"gif\",\"mp4\"]}" # Default to GIF and MP4 (skip narrated for speed)

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}OAuth Screenshot Upload Test${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Check if server is running
echo -e "${YELLOW}→ Checking if server is running...${NC}"
if ! curl -s "${API_URL}/api/oauth/health" > /dev/null; then
    echo -e "${RED}✗ Server not running at ${API_URL}${NC}"
    echo -e "${YELLOW}  Start the server with: npm start${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Server is running${NC}"
echo ""

# Check health endpoint
echo -e "${YELLOW}→ Checking system dependencies...${NC}"
HEALTH=$(curl -s "${API_URL}/api/oauth/health")
echo "$HEALTH" | jq '.'

if echo "$HEALTH" | jq -e '.dependencies.ffmpeg.available == false' > /dev/null; then
    echo -e "${RED}✗ ffmpeg not available - required for video export${NC}"
    exit 1
fi

if echo "$HEALTH" | jq -e '.dependencies.tesseract.available == false' > /dev/null; then
    echo -e "${RED}✗ tesseract not available - required for OCR${NC}"
    exit 1
fi

echo -e "${GREEN}✓ All dependencies available${NC}"
echo ""

# Check if screenshots exist
echo -e "${YELLOW}→ Looking for screenshots in ${SCREENSHOTS_DIR}...${NC}"
if [ ! -d "$SCREENSHOTS_DIR" ]; then
    echo -e "${RED}✗ Screenshot directory not found: ${SCREENSHOTS_DIR}${NC}"
    echo -e "${YELLOW}  Provide screenshots with: SCREENSHOTS_DIR=path/to/screenshots $0${NC}"
    exit 1
fi

SCREENSHOT_COUNT=$(find "$SCREENSHOTS_DIR" -maxdepth 1 -name "*.png" -o -name "*.jpg" | wc -l | tr -d ' ')
if [ "$SCREENSHOT_COUNT" -eq 0 ]; then
    echo -e "${RED}✗ No screenshots found in ${SCREENSHOTS_DIR}${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Found ${SCREENSHOT_COUNT} screenshots${NC}"
echo ""

# Build multipart form data
echo -e "${YELLOW}→ Uploading screenshots to ${API_URL}/api/oauth/upload-screenshots...${NC}"

CURL_CMD="curl -X POST \"${API_URL}/api/oauth/upload-screenshots\" \\"
CURL_CMD+="
  -F \"provider=${PROVIDER}\" \\"
CURL_CMD+="
  -F \"appName=${APP_NAME}\" \\"
CURL_CMD+="
  -F \"exportFormats=${FORMATS}\" \\"

# Add each screenshot as a file
for file in "$SCREENSHOTS_DIR"/*.png "$SCREENSHOTS_DIR"/*.jpg; do
    if [ -f "$file" ]; then
        CURL_CMD+="
  -F \"screenshots=@${file}\" \\"
    fi
done

# Remove trailing backslash
CURL_CMD="${CURL_CMD%\\}"

# Execute upload (with progress)
echo ""
RESPONSE=$(eval "$CURL_CMD")

echo ""
echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}Upload Response${NC}"
echo -e "${BLUE}========================================${NC}"
echo "$RESPONSE" | jq '.'

# Check if successful
if echo "$RESPONSE" | jq -e '.success == true' > /dev/null; then
    echo -e "${GREEN}✓ Upload successful!${NC}"

    # Extract upload ID
    UPLOAD_ID=$(echo "$RESPONSE" | jq -r '.uploadId')
    echo -e "${BLUE}Upload ID: ${UPLOAD_ID}${NC}"

    # Extract provider
    DETECTED_PROVIDER=$(echo "$RESPONSE" | jq -r '.provider')
    echo -e "${BLUE}Provider: ${DETECTED_PROVIDER}${NC}"

    # Extract credentials
    CLIENT_ID=$(echo "$RESPONSE" | jq -r '.credentials.clientId // "Not found"')
    CLIENT_SECRET=$(echo "$RESPONSE" | jq -r '.credentials.clientSecret // "Not found"')
    echo -e "${BLUE}Credentials:${NC}"
    echo -e "  Client ID: ${CLIENT_ID}"
    echo -e "  Client Secret: ${CLIENT_SECRET}"

    # List generated exports
    echo -e "${BLUE}Generated Exports:${NC}"
    echo "$RESPONSE" | jq -r '.exports | to_entries[] | "  \(.key): \(.value)"'

    # Verify files exist
    echo ""
    echo -e "${YELLOW}→ Verifying exported files...${NC}"

    for format in $(echo "$RESPONSE" | jq -r '.exports | keys[]'); do
        URL=$(echo "$RESPONSE" | jq -r ".exports.${format}")
        FULL_URL="${API_URL}${URL}"

        if curl -s --head "$FULL_URL" | head -n 1 | grep "200" > /dev/null; then
            SIZE=$(curl -sI "$FULL_URL" | grep -i "content-length" | awk '{print $2}' | tr -d '\r')
            SIZE_KB=$(echo "scale=2; $SIZE / 1024" | bc)
            echo -e "${GREEN}✓ ${format}: ${SIZE_KB} KB${NC}"
        else
            echo -e "${RED}✗ ${format}: File not accessible${NC}"
        fi
    done

    # Query job details
    echo ""
    echo -e "${YELLOW}→ Fetching job details from database...${NC}"
    JOB_DETAILS=$(curl -s "${API_URL}/api/oauth/jobs/${UPLOAD_ID}")
    echo "$JOB_DETAILS" | jq '.'

    # Show statistics
    echo ""
    echo -e "${YELLOW}→ System statistics:${NC}"
    STATS=$(curl -s "${API_URL}/api/oauth/stats")
    echo "$STATS" | jq '.'

    echo ""
    echo -e "${GREEN}========================================${NC}"
    echo -e "${GREEN}Test Passed!${NC}"
    echo -e "${GREEN}========================================${NC}"
    echo ""
    echo -e "View your exports:"
    for format in $(echo "$RESPONSE" | jq -r '.exports | keys[]'); do
        URL=$(echo "$RESPONSE" | jq -r ".exports.${format}")
        echo -e "  ${BLUE}${format}:${NC} ${API_URL}${URL}"
    done
    echo ""

else
    echo -e "${RED}✗ Upload failed${NC}"
    echo "$RESPONSE" | jq '.error, .message'
    exit 1
fi
