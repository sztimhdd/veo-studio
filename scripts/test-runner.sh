#!/bin/bash

# scripts/test-runner.sh
# Runs Playwright tests and reports results.

echo "🚀 Starting Playwright E2E tests..."

# Run Playwright tests
npx playwright test

# Capture the exit code
EXIT_CODE=$?

if [ $EXIT_CODE -eq 0 ]; then
  echo "✅ Playwright tests passed successfully!"
else
  echo "❌ Playwright tests failed with exit code $EXIT_CODE."
fi

# Exit with the same code as Playwright
exit $EXIT_CODE
