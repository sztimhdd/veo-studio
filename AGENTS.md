# AGENTS.md

This file provides context and guidelines for agentic coding agents working on the **Veo Studio** repository.

## 1. Project Overview

**Veo Studio** is a Virtual Production Platform using an agentic pipeline (Director, Artist, Production, Critic) to generate consistent video sequences.

- **Stack:** React 19, TypeScript, Vite, Tailwind CSS.
- **AI Integration:** `@google/genai` SDK.
- **Architecture:** Cyclic Multi-Agent DAG (Planning -> Execution -> Critique -> Refinement).
- **State Management:** React Context (`ProductionContext`) with `useReducer` for complex pipeline state transitions.

## 2. Directory Structure

The project follows a **flat directory structure** (no `src/` folder).

```
/
├── components/       # UI Components (PascalCase)
├── context/          # React Context providers (ProductionContext)
├── services/         # Business logic & API integrations
├── test_set/         # Static assets for manual testing
├── types.ts          # Central type definitions
├── App.tsx           # Main application component
├── index.tsx         # Entry point
├── vite.config.ts    # Vite configuration
└── package.json      # Dependencies and scripts
```

**CRITICAL:** Do not assume a `src/` directory exists. Always check file paths relative to the project root.

## 3. Build, Run, and Test Commands

### 3.1. Standard Commands

| Command | Description |
| :--- | :--- |
| `npm run dev` | Starts local dev server (Vite). Default port: 3000. |
| `npm run build` | Builds the production bundle to `dist/`. |
| `npm run preview` | Previews the production build locally. |

### 3.2. Testing & Verification

**Current Status:** Testing framework is set up with **Vitest** + **@testing-library/react**.

- **Automated Tests:**
    - Run all tests: `npm run test:run`
    - Run tests in watch mode: `npm run test:watch`
    - Run single test file: `npx vitest <filename>`

- **Test Structure:**
    - Test files: `*.test.ts` or `*.test.tsx` alongside source files
    - Setup file: `test/setup.ts` - Contains global mocks (Google GenAI, jsdom cleanup)
    - Mock location: `__mocks__/@google/genai.ts` - Manual mock for AI SDK

- **Current Test Coverage:**
    - `context/ProductionContext.test.tsx` - 19 tests covering all reducer actions and hook behavior
    - `services/pipelineService.test.ts` - 9 tests for `getRetryDelay` and `waitForQuota` utilities

- **Testing Best Practices:**
    - Export pure utility functions from services for unit testing (e.g., `export function getRetryDelay`)
    - Use `vi.mock()` in `test/setup.ts` for external dependencies
    - Use `vi.useFakeTimers()` for time-based tests
    - Mock `@google/genai` to avoid API costs during testing

- **Manual Verification (MANDATORY):**
    1.  Start the app: `npm run dev`.
    2.  Open `http://localhost:3000`.
    3.  Input: Copy content from `test_set/test_prompt1.txt`.
    4.  Action: Click "Start Director" and verify pipeline progression.
    5.  Check: Monitor browser console for errors (quota, React warnings).

### 3.3. Linting & Formatting

- **Linting:** Standard ESLint expected. No explicit config file present, so follow best practices for React Hooks/TypeScript.
- **Formatting:** 2 spaces indentation. Semicolons required.
- **Verification:** Run `npx tsc --noEmit` to check for type errors before completing tasks.

## 4. Code Style & Conventions

### 4.1. Imports and Aliases

- **Absolute Imports:** Use `@/` alias resolving to project root.
    - **Good:** `import { PipelineService } from '@/services/pipelineService';`
    - **Bad:** `import { PipelineService } from '../../services/pipelineService';`
- **Order:**
    1.  React / External libraries
    2.  Internal Components (`@/components/...`)
    3.  Services / Context (`@/services/...`, `@/context/...`)
    4.  Types (`@/types.ts`)
    5.  Styles / Assets

### 4.2. Component Structure

- **Functional Components:** `React.FC<Props>`.
- **Props:** Define interfaces, e.g., `[ComponentName]Props`.
- **Hooks:** Extract complex logic (>30 lines) into custom hooks.
- **Return:** Valid JSX or `null`. **New components go in `components/`. Do not inline.**

### 4.3. Naming Conventions

- **Files:** `PascalCase.tsx` (Components), `camelCase.ts` (Services/Utils).
- **Variables/Functions:** `camelCase`.
- **Types/Interfaces:** `PascalCase`.
- **Constants:** `UPPER_SNAKE_CASE`.

### 4.4. State Management

- **Global:** `ProductionContext` for pipeline state.
- **Local:** `useState` for UI.
- **Immutability:** Always copy state (`...prev`).

### 4.5. Error Handling

- **Services:** `try/catch` in all async methods.
- **UI:** Surface errors via `ProductionContext` `error` state.
- **Logging:** Console logs with prefixes (e.g., `[PipelineService] Error...`).

## 5. Architecture & Logic

### 5.1. Sequential Pipeline (Quota Safety)

Strict API quotas (`429 Resource Exhausted`) require careful handling.

- **Rule 1:** Video/image gen must pass through `enforceQuotaSafety()` in `pipelineService.ts`.
- **Rule 2:** **Exponential Backoff with Jitter** mandatory. (Max delay 60s, 5 retries).
- **Rule 3:** NEVER run video requests in parallel. Serialize execution.

### 5.2. Multi-Agent DAG

1.  **Director:** Planning (JSON Script).
2.  **Artist:** Asset generation (Images).
3.  **Production:** Video synthesis (Veo).
4.  **Critic:** Review & Loop back.

Update `types.ts` when modifying pipeline data structures.

## 6. Agent Workflow Guidelines

### 6.1. Codebase Analysis (Phase 1)
- **Explore:** Use `grep` or `explore` agent to understand existing patterns before coding.
- **Librarian:** Use `librarian` agent for external library docs (e.g., `@google/genai`).
- **Assess:** Check `types.ts` for central definitions.

### 6.2. Task Management (Todo)
- **Mandatory:** Use `todowrite` for any task > 1 step.
- **Update:** Keep todos updated as you progress.
- **Complete:** Mark done only after verification.

### 6.3. Verification (Phase 3)
- **Run Build:** `npm run build` must pass.
- **Type Check:** `npx tsc --noEmit` must be clean.
- **Manual Test:** Verify with `test_set/` assets.

## 7. Critical Rules

- **Security:** **NEVER** commit API keys (`.env` only).
- **Type Safety:** **NEVER** use `as any`, `@ts-ignore`. Fix types properly.
- **Performance:** Revoke `ObjectURLs` on unmount.
- **Dependencies:**
    - Production is `node:20-alpine`.
    - Avoid native binary deps (e.g., `@ast-grep/cli`) unless Alpine-compatible.
- **Git:**
    - Atomic commits with descriptive messages (e.g., "fix(pipeline): handle 429").
    - Do not commit large binaries.
