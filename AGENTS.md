# AGENTS.md

This file provides context and guidelines for agentic coding agents working on the **Veo Studio** repository.

## 1. Project Overview
**Veo Studio** is a Virtual Production Platform using an agentic pipeline (Director, Artist, Production, Critic) to generate consistent video sequences.

- **Stack:** React 19, TypeScript, Vite, Tailwind CSS.
- **AI Integration:** `@google/genai` SDK.
- **Architecture:** Cyclic Multi-Agent DAG (Planning -> Execution -> Critique -> Refinement).

## 2. Build & Run Commands

| Command | Description |
| :--- | :--- |
| `npm run dev` | Starts local dev server (Vite). Default port: 3000. |
| `npm run build` | Builds the production bundle to `dist/`. |
| `npm run preview` | Previews the production build locally. |

**Critical Build Note:** 
The production environment uses `node:20-alpine`. 
- **DO NOT** add dependencies that rely on pre-built native binaries (e.g., `@ast-grep/cli`) unless you verify Alpine compatibility (musl vs glibc).
- If a build fails with "postinstall" errors, check for binary dependency issues.

## 3. Code Style & Conventions

### 3.1. Formatting & Architecture
- **Indentation:** 2 spaces.
- **Components:** PascalCase. Functional components with `React.FC`.
- **Types First:** Update `types.ts` before implementing new agent logic.
- **State:** Use `ProductionContext` for pipeline state and `useReducer` for complex transitions.

### 3.2. Sequential Pipeline (Quota Safety)
The API has strict quotas (`429 Resource Exhausted`). 
- **RULE:** All video/image generation MUST pass through `enforceQuotaSafety()`.
- **RULE:** Use **Exponential Backoff with Jitter** for retries.
    - Delay = `1000ms * 2^attempt` +/- 20% jitter.
    - Max delay capped at 60s.
- **RULE:** Maximum 5 retry attempts per shot.

## 4. Logical Structure
- `src/services/pipelineService.ts`: The core orchestrator (Director, Artist, Engineer).
- `src/services/criticService.ts`: AI Critic Agent (Phase 3 - Continuity Supervision).
- `src/types.ts`: Central source of truth for all interfaces.
- `src/context/ProductionContext.tsx`: Global state for the DAG phases.
- `src/components/PipelineVisualizer.tsx`: UI for human critique and motion lock.

## 4.1. The 6-Phase Architecture

### Phase 0: Intent & Memory
- **IntentParser**: Analyzes user requirements
- **Memory System**: Global KB, Task Context, User Preferences

### Phase 1: Structured Pre-Production
- **Director Agent**: Generates script JSON and shot tables
- **Cost Estimator**: Budget transparency (future)

### Phase 2: Execution Cluster
- **Artist Agent**: Generates turnaround sheets (Nano Banana Pro)
- **Engineer Agent**: Generates video drafts (Veo 3.1)
- **QuotaManager**: Enforces RPM limits per model type

### Phase 3: Continuity Supervision ⚡ NEW
- **AI Critic Agent** (`runContinuitySupervisor`):
  - Evaluates each shot for temporal consistency, semantic alignment, technical quality
  - Calculates cross-shot character fidelity
  - Generates `EvalReport` with scores (0-10) and flaw detection
  - **Threshold**: Overall score >= 8.5 for auto-approval
- **Motion Lock**: User or AI can lock the "skeleton" (base motion)
- **Human Critic**: Users can add feedback and trigger regeneration

### Phase 4: High-Res Refinement
- **Keyframe Extraction**: Intelligent frame selection
- **Consistency Checker**: Similarity validation

### Phase 5: Master Rendering
- **Combiner Agent**: Assembles final Veo 3.1 payload
- **Quality Gate**: Final approval before delivery

### Phase 6: QA & Feedback Loops
- **Final Inspector**: Automated QA scoring
- **Local Fix**: Redraw specific frames
- **Global Fix**: Re-scripting via feedback to Director

## 5. Development Workflow
1.  **Analyze:** Read `TDD.md` and `PRD.md` to understand the 6-phase pipeline.
2.  **Plan:** Propose changes. Update `types.ts` if adding new metadata/artifacts.
3.  **Implement:** Adhere to sequential execution patterns.
4.  **Verify:** Manually verify via the UI. Check browser console for quota errors.
5.  **Documentation:** Update `TDD.md` if architectural changes are made.

## 6. Critical Rules
- **NEVER** commit API keys.
- **NEVER** run video requests in parallel.
- **ALWAYS** Copy state in reducers (immutability).
- **ALWAYS** revoke ObjectURLs on unmount to prevent leaks.
