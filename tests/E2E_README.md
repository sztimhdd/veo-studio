# Veo Studio E2E Testing Guide

## Overview
This document describes the **Repeatable End-to-End (E2E) Testing Process** for Veo Studio. The test validates the complete production pipeline using **REAL Google AI APIs** (Gemini 3 Pro + Veo 3.1).

---

## Quick Start

### Prerequisites
1.  **API Key**: Set `VITE_GEMINI_API_KEY` in your environment.
2.  **Dev Server**: Ensure the app is running (`npm run dev`).
3.  **Playwright**: Install browsers (`npx playwright install chromium`).

### Run the Test
```bash
# Method 1: Using the shell script (Recommended)
./run-e2e-test.sh

# Method 2: Manual
export VITE_GEMINI_API_KEY="your-key"
export USE_REAL_API=true
npx playwright test tests/e2e/delivery-and-transitions.spec.ts --project=chromium --timeout=1200000
```

---

## What the Test Validates

The E2E test runs through **4 Phases** of the production pipeline:

### Phase 1: Pre-Production (Director + Artist)
- **Director**: Generates `Script_JSON` from prompt + images.
- **Artist**: Creates Character and Environment turnaround sheets.
- **Validation**: Log shows "Production bible complete".

### Phase 2: Drafting (Veo 3.1 Fast)
- **Engineer**: Generates low-res drafts (4-6 variants).
- **Validation**: Video elements appear in the UI.

### Phase 3: Mastering (Veo 3.1 HQ + Dual-Frame)
- **Refiner**: Extracts start/end keyframes.
- **Mastering**: Generates 4K video using dual-frame anchoring.
- **Validation**: "4K MASTERED" badge appears on all shots.

### Phase 4: Delivery (FFmpeg Stitching)
- **Stitching**: Concatenates shots with transitions.
- **Captions**: Generates SRT subtitles from script.
- **Export**: Downloads `.mp4` and `.srt` files.

---

## Expected Results (Pass Criteria)

| Phase | Success Indicator | Time |
|-------|-------------------|------|
| 1. Pre-Production | "Production bible complete" in logs | ~30s |
| 2. Drafting | "Dailies are ready for review" visible | ~3-5 min |
| 3. Mastering | "Batch mastering complete!" visible | ~8-10 min |
| 4. Delivery | `.mp4` and `.srt` files downloaded | ~1 min |

**Total Expected Duration:** 12-20 minutes.

---

## Troubleshooting

### Test Times Out
- **Cause**: Mastering 4K video takes 2-4 minutes per shot.
- **Fix**: Increase Playwright timeout (`--timeout=1200000`).

### "API Key Not Found"
- **Cause**: Environment variable not set.
- **Fix**: `export VITE_GEMINI_API_KEY='your-key'`

### "Dailies Ready" Never Appears
- **Cause**: Likely Safety Filter (Third-party content).
- **Fix**: Check browser logs for `raiMediaFilteredReasons`. The system should auto-retry with fallback strategies.

### "4K MASTERED" Badge Missing
- **Cause**: Mastering failed or timed out.
- **Fix**: Check logs for "Refining anchor frame..." errors.

---

## Test Artifacts

When the test runs, Playwright captures:
- **Screenshots**: On failure (in `test-results/`)
- **Videos**: Browser recording (in `test-results/`)
- **Console Logs**: Printed to stdout

---

## CI Integration

To run in CI (GitHub Actions):
```yaml
- name: Run E2E Tests
  run: |
    export VITE_GEMINI_API_KEY=${{ secrets.GEMINI_API_KEY }}
    ./run-e2e-test.sh
```
