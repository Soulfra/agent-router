#!/bin/bash
# Test Annotation Pipeline
#
# End-to-end test of screenshot → annotation → video/GIF pipeline
# This is your "sandbox" to test without hitting ENOENT errors
#
# Usage:
#   ./scripts/test-annotation-pipeline.sh
#   # Or test specific format:
#   ./scripts/test-annotation-pipeline.sh gif
#   ./scripts/test-annotation-pipeline.sh video
#   ./scripts/test-annotation-pipeline.sh annotate

set -e  # Exit on error

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
SCREENSHOTS_DIR="oauth-screenshots/github-2025-10-20"
BASE_SCREENSHOT="$SCREENSHOTS_DIR/base-screenshot.png"
OUTPUT_DIR="test-output"
ANNOTATED_OUTPUT="$OUTPUT_DIR/test-annotated.png"
GIF_OUTPUT="$OUTPUT_DIR/test-tutorial.gif"
VIDEO_OUTPUT="$OUTPUT_DIR/test-tutorial.mp4"

# Create output directory
mkdir -p "$OUTPUT_DIR"

echo -e "${GREEN}=== Screenshot Annotation Pipeline Test ===${NC}\n"

# Check if base screenshot exists
if [ ! -f "$BASE_SCREENSHOT" ]; then
  echo -e "${RED}✗ Base screenshot not found: $BASE_SCREENSHOT${NC}"
  echo -e "${YELLOW}  Run: node lib/capture-oauth-docs.js github${NC}"
  exit 1
fi

echo -e "${GREEN}✓ Base screenshot found: $BASE_SCREENSHOT${NC}"

# Test 1: Screenshot Annotation
if [ "$1" = "" ] || [ "$1" = "annotate" ]; then
  echo -e "\n${YELLOW}[1/3] Testing screenshot annotator...${NC}"

  node lib/screenshot-annotator.js "$BASE_SCREENSHOT" "$ANNOTATED_OUTPUT"

  if [ -f "$ANNOTATED_OUTPUT" ]; then
    SIZE=$(du -h "$ANNOTATED_OUTPUT" | cut -f1)
    echo -e "${GREEN}✓ Annotated screenshot created: $ANNOTATED_OUTPUT ($SIZE)${NC}"

    # Open for visual inspection (macOS)
    if command -v open &> /dev/null; then
      open "$ANNOTATED_OUTPUT"
    fi
  else
    echo -e "${RED}✗ Failed to create annotated screenshot${NC}"
    exit 1
  fi
fi

# Test 2: GIF Generation
if [ "$1" = "" ] || [ "$1" = "gif" ]; then
  echo -e "\n${YELLOW}[2/3] Testing GIF generation...${NC}"

  # Create a simple test to generate GIF from existing annotated screenshot
  node -e "
const DocVideoRecorder = require('./lib/doc-video-recorder');
const recorder = new DocVideoRecorder({ outputDir: '$OUTPUT_DIR' });

// Simulate screenshots array
recorder.screenshots = [
  { path: '$ANNOTATED_OUTPUT', frameNumber: 0, timestamp: 0 },
  { path: '$ANNOTATED_OUTPUT', frameNumber: 1, timestamp: 2000 },
  { path: '$ANNOTATED_OUTPUT', frameNumber: 2, timestamp: 4000 }
];

recorder.convertToGIF('$GIF_OUTPUT')
  .then(result => {
    console.log('GIF created successfully!');
    process.exit(0);
  })
  .catch(error => {
    console.error('GIF creation failed:', error.message);
    process.exit(1);
  });
"

  if [ -f "$GIF_OUTPUT" ]; then
    SIZE=$(du -h "$GIF_OUTPUT" | cut -f1)
    echo -e "${GREEN}✓ GIF created: $GIF_OUTPUT ($SIZE)${NC}"

    if command -v open &> /dev/null; then
      open "$GIF_OUTPUT"
    fi
  else
    echo -e "${RED}✗ Failed to create GIF${NC}"
    exit 1
  fi
fi

# Test 3: Video Generation
if [ "$1" = "" ] || [ "$1" = "video" ]; then
  echo -e "\n${YELLOW}[3/3] Testing video generation...${NC}"

  node -e "
const DocVideoRecorder = require('./lib/doc-video-recorder');
const recorder = new DocVideoRecorder({ outputDir: '$OUTPUT_DIR' });

recorder.screenshots = [
  { path: '$ANNOTATED_OUTPUT', frameNumber: 0, timestamp: 0 },
  { path: '$ANNOTATED_OUTPUT', frameNumber: 1, timestamp: 2000 },
  { path: '$ANNOTATED_OUTPUT', frameNumber: 2, timestamp: 4000 }
];

recorder.convertToVideo('$VIDEO_OUTPUT')
  .then(result => {
    console.log('Video created successfully!');
    process.exit(0);
  })
  .catch(error => {
    console.error('Video creation failed:', error.message);
    process.exit(1);
  });
"

  if [ -f "$VIDEO_OUTPUT" ]; then
    SIZE=$(du -h "$VIDEO_OUTPUT" | cut -f1)
    echo -e "${GREEN}✓ Video created: $VIDEO_OUTPUT ($SIZE)${NC}"

    if command -v open &> /dev/null; then
      open "$VIDEO_OUTPUT"
    fi
  else
    echo -e "${RED}✗ Failed to create video${NC}"
    exit 1
  fi
fi

echo -e "\n${GREEN}=== All tests passed! ===${NC}\n"
echo -e "${YELLOW}Outputs:${NC}"
echo -e "  Annotated: $ANNOTATED_OUTPUT"
echo -e "  GIF:       $GIF_OUTPUT"
echo -e "  Video:     $VIDEO_OUTPUT"
echo -e "\n${YELLOW}Cleanup:${NC}"
echo -e "  rm -rf $OUTPUT_DIR"
