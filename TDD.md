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

**Current Status:** Testing framework is fully operational with **Vitest** + **@testing-library/react**.

- **Framework:** Vitest (native Vite integration, fast execution)
- **UI Testing:** @testing-library/react + @testing-library/jest-dom
- **Environment:** jsdom for browser simulation

**Test Commands:**
```bash
npm run test        # Run tests in watch mode
npm run test:run    # Run tests once (CI mode)
npx vitest <file>   # Run single test file
```

**Current Test Coverage:**
*   **ProductionContext (19 tests):** Full reducer coverage including all actions (START_PIPELINE, SET_PHASE, UPDATE_ARTIFACTS, UPDATE_SHOT, ADD_LOG, SET_ERROR, RESET)
*   **PipelineService (9 tests):** Quota management utilities (getRetryDelay, waitForQuota) with timer mocking

**Testing Architecture:**
*   **Setup:** `test/setup.ts` - Global mocks for Google GenAI SDK, automatic cleanup
*   **Mocks:** `__mocks__/@google/genai.ts` - Manual mock to prevent API costs
*   **Pattern:** Pure utility functions exported for unit testing; external dependencies mocked via `vi.mock()`

**Best Practices:**
*   Export pure utility functions from services for unit testing
*   Use `vi.useFakeTimers()` for time-based tests
*   Mock `@google/genai` to avoid API costs during testing
*   Test files: `*.test.ts` or `*.test.tsx` alongside source files

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
