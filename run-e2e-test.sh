#!/bin/bash
# ==============================================================================
# Veo Studio E2E Production Test Script
# ==============================================================================
# This script runs a full end-to-end test of the Veo Studio pipeline using
# REAL Google AI APIs (Gemini + Veo 3.1).
#
# PREREQUISITES:
# 1. Set VITE_GEMINI_API_KEY in your environment
# 2. Ensure local dev server is running (npm run dev)
# 3. Install Playwright browsers: npx playwright install chromium
#
# USAGE:
#   ./run-e2e-test.sh
#
# EXPECTED DURATION: 15-20 minutes
# ==============================================================================

set -e

# --- Configuration ---
export USE_REAL_API=true
TEST_PROJECT="chromium"
TEST_FILE="tests/e2e/delivery-and-transitions.spec.ts"
TIMEOUT_MS=1200000  # 20 minutes

# --- Pre-flight Checks ---
echo "🚀 Starting Veo Studio E2E Test..."

if [ -z "$VITE_GEMINI_API_KEY" ]; then
    echo "❌ ERROR: VITE_GEMINI_API_KEY is not set."
    echo "Please run: export VITE_GEMINI_API_KEY='your-key-here'"
    exit 1
fi

# Check if dev server is running
if ! curl -s http://localhost:3000 > /dev/null 2>&1; then
    echo "❌ ERROR: Dev server not running at http://localhost:3000"
    echo "Please run 'npm run dev' in a separate terminal."
    exit 1
fi

echo "✅ Environment checks passed."
echo "🔑 API Key: ${VITE_GEMINI_API_KEY:0:5}...${VITE_GEMINI_API_KEY: -5}"
echo "🌐 Server: http://localhost:3000"
echo ""

# --- Run Test ---
echo "🎬 Executing Playwright E2E Test (Timeout: $((TIMEOUT_MS/1000/60)) minutes)..."
echo "================================================================================"

npx playwright test "$TEST_FILE" \
    --project="$TEST_PROJECT" \
    --timeout="$TIMEOUT_MS" \
    --reporter=list

EXIT_CODE=$?

# --- Report ---
echo ""
echo "================================================================================"
if [ $EXIT_CODE -eq 0 ]; then
    echo "✅ E2E TEST PASSED - Application is ready for production deployment."
else
    echo "❌ E2E TEST FAILED - Check logs above for details."
    echo "   Common failures:"
    echo "   - API Quota Exhausted (429)"
    echo "   - Safety Filter Triggered (Third-party content)"
    echo "   - Network Timeout"
fi
echo "================================================================================"

exit $EXIT_CODE
