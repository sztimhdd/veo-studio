# Technical Design Document (TDD): Cyclic Agentic Pipeline

## 1. System Architecture
The platform implements a **Multimodal DAG (Directed Acyclic Graph)** with feedback loops. It shifts from simple generation to a **Plan-Execute-Critique** cycle.

### 1.1. High-Level Flow (The 6 Phases)
1.  **Phase 0 (Memory):** Uses a RAG-based Memory System.
    *   **Global KB:** Cinematic grammar, lighting laws.
    *   **Task Context:** Current character bank and shot history.
2.  **Phase 1 (Planning):** **Director Agent** (Gemini 3 Pro) outputs a `Script_JSON`.
    *   **CostEstimator:** Calculates token/API cost and triggers a "User Approval" gate.
3.  **Phase 2 (Execution):** 
    *   **Artist (MaterialGen):** Generates Turnaround Sheets (Composite Images).
    *   **Drafting (Seedance/Veo Fast):** Generates batch variants of low-res clips.
4.  **Phase 3 (Critique):** **Supervisor Agent** (Gemini Pro Vision) evaluates variants against the Bible.
    *   **MotionLock:** Selection of the seed/latent space for the final render.
5.  **Phase 4 (Refinement):** 
    *   **Keyframe Extraction:** Logic based on motion peak detection.
    *   **NanoRedraw:** High-fidelity 4K upscaling of anchor frames.
6.  **Phase 5 (Mastering):** **Combiner Agent** assembles Veo 3.1 payloads (Anchor frames + Locked Motion + Style Latents).

## 2. Data Models & Memory System

### 2.1. Layered Memory (`MemorySystem`)
```typescript
interface MemorySystem {
  global_kb: string[];      // Cinematic rules
  task_context: {
    character_bank: AssetItem[];
    shot_history: VideoArtifact[];
  };
  user_preferences: {
    style_presets: string[];
    feedback_history: string[];
  };
}
```

### 2.2. Evaluation Schema (`EvalReport`)
```typescript
interface EvalReport {
  variant_scores: Record<string, number>;
  temporal_consistency_score: number;
  semantic_alignment: number;
  flaws: Array<{ timestamp: number; type: 'artifact' | 'drift' | 'glitch' }>;
}
```

## 3. Agent Responsibilities

### 3.1. Planner (IntentParser & Director)
*   **Model:** Gemini 3 Pro.
*   **Task:** Intent decomposition and structured script generation.

### 3.2. Executor Cluster (Artist & Engineer)
*   **Artist:** turnaround sheet generation using image-to-image extrapolation.
*   **PromptEngineer:** Automated prompt expansion and negative prompt generation.
*   **Renderer:** Sequential API orchestrator with quota-aware backoff.

### 3.3. Critic (Supervisor & QA)
*   **Model:** Gemini 3 Pro Vision / Video-Bench.
*   **Task:** Frame-by-frame analysis and quality gate enforcement.

## 4. Engineering Constraints & Stability

### 4.1. Quota Management & Error Handling
*   **Sequential Pipeline (QuotaGuard):** Implements **Exponential Backoff with Jitter** to handle `429 Resource Exhausted` errors gracefully.
    *   **Retry Strategy:** 5 attempts with increasing delays (1s, 2s, 4s, 8s...) capped at 60s.
    *   **Jitter:** +/- 20% random variance prevents "thundering herd" retry storms.
*   **State Persistence:** Use of `ProductionContext` to hold the "Bible" and "Film Strip" across the DAG phases.
*   **Cleanup:** Automated revocation of ObjectURLs to prevent memory leaks during long-running refinement loops.

### 4.2. Testing Framework

**Current Status:** Testing framework is fully operational with **Vitest** + **@testing-library/react** + **Playwright**.

- **Framework:** Vitest (native Vite integration, fast execution)
- **UI Testing:** @testing-library/react + @testing-library/jest-dom
- **Environment:** jsdom for browser simulation
- **E2E Testing:** Playwright (Real Browser, Real APIs)

**Test Commands:**
```bash
# Unit Tests
npm run test        # Run tests in watch mode
npm run test:run    # Run tests once (CI mode)
npx vitest <file>   # Run single test file

# E2E Tests (Real APIs)
./run-e2e-test.sh  # Run full production pipeline test
```

---

### 4.3. E2E Testing (Production Validation)

The project includes a **repeatable End-to-End (E2E) testing suite** that validates the complete production pipeline using **REAL Google AI APIs** (Gemini 3 Pro + Veo 3.1).

#### Purpose
E2E tests validate that the system works in a production-like environment, catching issues that unit tests miss:
- Real API latency and rate limiting
- Browser rendering of video elements
- FFmpeg stitching in the browser
- File download triggers

#### Prerequisites
1.  **API Key**: Set `VITE_GEMINI_API_KEY` in your environment.
2.  **Dev Server**: Ensure the app is running (`npm run dev`).
3.  **Playwright**: Install browsers (`npx playwright install chromium`).

#### Running E2E Tests

**Option 1: Shell Script (Recommended)**
```bash
./run-e2e-test.sh
```
This script automatically checks prerequisites and runs the test with a 20-minute timeout.

**Option 2: Manual**
```bash
export VITE_GEMINI_API_KEY="your-key-here"
export USE_REAL_API=true
npx playwright test tests/e2e/delivery-and-transitions.spec.ts \
    --project=chromium \
    --timeout=1200000
```

#### What the E2E Test Validates

The test runs through **4 Phases**:

| Phase | Component | Validation Point |
|-------|-----------|-----------------|
| **1. Pre-Production** | Director + Artist | "Production bible complete" log |
| **2. Drafting** | Veo 3.1 Fast | "Dailies are ready for review" visible |
| **3. Mastering** | Dual-Frame + Veo HQ | "4K MASTERED" badge on all shots |
| **4. Delivery** | FFmpeg + Captions | `.mp4` and `.srt` files downloaded |

#### Expected Duration
- **Total:** 12-20 minutes (depending on API quota and complexity)
- **Timeout:** Set to 20 minutes (1200000ms) to accommodate 4K video generation.

#### Troubleshooting E2E Failures
*   **Timeout:** Increase `--timeout` if API is slow.
*   **API Errors:** Check logs for `429` (quota) or `raiMediaFilteredReasons` (safety filter).
*   **Network:** Ensure localhost:3000 is accessible.

#### Test Artifacts
- **Location:** `tests/e2e/delivery-and-transitions.spec.ts`
- **Documentation:** `tests/E2E_README.md`

#### Best Practices for E2E Testing
*   **Always use REAL APIs** for E2E. Mocks hide real-world issues.
*   **Log extensively**: The test captures all browser console output.
*   **Isolate tests**: Each test should be independent (setup its own state).
*   **Handle latency**: Use Playwright's `waitFor` logic, not fixed sleeps.

## 5. Infrastructure & Deployment (CI/CD)

The project leverages a fully automated CI/CD pipeline using **GitHub Actions** and **Google Cloud Run**.

### 5.1. Hosting Strategy
*   **Platform:** GCP Cloud Run (Serverless Container).
*   **Region:** `us-central1`.
*   **Service Specs:**
    *   **CPU:** 1 vCPU.
    *   **Memory:** 256Mi (optimized for static asset serving).
    *   **Scaling:** 0 (min) to 3 (max) instances.
    *   **Access:** Public (`--allow-unauthenticated`).

### 5.2. CI/CD Pipeline
Defined in `.github/workflows/deploy.yml`:
1.  **Trigger:** Push to `main` branch or manual `workflow_dispatch`.
2.  **Auth:** Workload Identity Federation (via `GCP_SA_KEY` secret).
3.  **Build:**
    *   Uses **Docker** multi-stage build.
    *   Injects `GEMINI_API_KEY` as a build argument (`ARG`).
4.  **Registry:** Pushes image to Google Artifact Registry (`us-central1-docker.pkg.dev/...`).
5.  **Deploy:** Updates the Cloud Run service with the new image tag (commit SHA).

### 5.3. Container Architecture
*   **Base Image:** `node:20-alpine` (Build stage) -> `nginx:alpine` (Runtime stage).
*   **Serving:** Nginx serves the React SPA static build (`dist/`).
*   **Routing:** SPA-aware routing (`try_files $uri /index.html`) handled in `nginx.conf`.
*   **Caching:** Aggressive caching (1 year) for hashed assets (`js`, `css`, `images`).

## 6. Future Implementation: MCP Tool Servers
The architecture is designed to move toward an **MCP (Model Context Protocol)** Tool Server model, where agents can dynamically call specialized tools for scene cutting, audio synthesis, and compliance checking.
