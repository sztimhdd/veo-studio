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
- **RULE:** Maintain a mandatory **30s gap** between any multimodal calls.
- **RULE:** Use progressive backoff for retries: 5 attempts with (attempt * 60s) wait times.

## 4. Logical Structure
- `src/services/pipelineService.ts`: The core orchestrator.
- `src/types.ts`: Central source of truth for all interfaces.
- `src/context/ProductionContext.tsx`: Global state for the DAG phases.

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
