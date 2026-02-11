# AGENTS.md

This file provides context and guidelines for agentic coding agents working on the **Veo Studio** repository.

## 1. Project Overview
**Veo Studio** is a React-based application for generating videos using Google's Generative AI (Gemini/Veo) models. It features a "Classic" mode for single video generation and a "Studio" mode (Dailies Engine) that uses an agentic pipeline (Director, Artist, Production) to generate consistent shots.

- **Stack:** React 19, TypeScript, Vite, Tailwind CSS.
- **AI Integration:** `@google/genai` SDK.
- **State Management:** React Context (`ProductionContext`) + `useReducer`.
- **Environment:** Designed to run in Project IDX (Google) but works locally with API keys.

## 2. Build & Run Commands

| Command | Description |
| :--- | :--- |
| `npm run dev` | Starts the local development server (Vite). Default port: 3000. |
| `npm run build` | Builds the production bundle to `dist/`. |
| `npm run preview` | Previews the production build locally. |

**Note on Testing:**
There are currently **no automated test scripts** (e.g., Jest/Vitest) configured in `package.json`.
- Agents should rely on manual verification via the UI.
- When adding new logic, consider adding unit tests if a testing framework is introduced.
- **Verification Strategy:**
    1.  Start the app (`npm run dev`).
    2.  Check for console errors.
    3.  Verify the "Classic" and "Studio" modes switch correctly.
    4.  Test video generation flow (mocked or real if API key available).

## 3. Code Style & Conventions

### 3.1. Formatting & Naming
- **Indentation:** 2 spaces.
- **Components:** PascalCase (e.g., `ApiKeyDialog.tsx`). Functional components with `React.FC`.
- **Functions/Variables:** camelCase (e.g., `handleGenerate`, `startPipeline`).
- **Types/Interfaces:** PascalCase (e.g., `AppState`, `GenerateVideoParams`). Defined in `types.ts`.
- **Constants:** UPPER_SNAKE_CASE for global constants.
- **File Names:** Match the primary export (e.g., `PipelineVisualizer.tsx`).

### 3.2. File Structure & Responsibilities
- `src/components/`: UI components (presentational & container).
    - `icons.tsx`: Centralized icon exports (using `lucide-react`).
- `src/context/`: React Context definitions.
    - `ProductionContext.tsx`: Manages the complex state of the "Studio" pipeline (shots, assets, logs).
- `src/services/`: Business logic and API integration.
    - `geminiService.ts`: Low-level wrapper for `@google/genai`.
    - `pipelineService.ts`: Orchestrator for the agentic workflow (Director -> Artist -> Production).
- `src/types.ts`: **Central Source of Truth** for all TypeScript interfaces and enums.
- `src/App.tsx`: Main application entry point, routing, and high-level layout.

### 3.3. Imports
- Use absolute imports with the `@/` alias where possible (configured in `vite.config.ts`).
- **Order:**
  1.  External libraries (React, @google/genai).
  2.  Internal components.
  3.  Internal services/context.
  4.  Internal types.

### 3.4. State Management
- **Local State:** Use `useState` for simple component-level state (forms, toggles).
- **Global State:** Use `ProductionContext` (`useProduction` hook) for the Studio pipeline.
- **Reducers:** Action types should be uppercase strings (e.g., `START_PIPELINE`, `ADD_LOG`, `UPDATE_ARTIFACTS`).
- **Immutability:** Always copy state objects/arrays when updating in reducers.

### 3.5. UI/Styling
- **Tailwind CSS:** Use utility classes for all styling. Avoid custom CSS files unless necessary (`index.css` for globals).
- **Icons:** Use `lucide-react`.
- **Responsiveness:** Ensure layouts work on different screen sizes (mobile/desktop).
- **Animations:** Use standard CSS transitions or Tailwind animation utilities (`animate-pulse`, `animate-in`).

## 4. Architecture & Logic

### 4.1. Agentic Pipeline (Studio Mode)
Refer to `TDD.md` for detailed architectural design.
- **Director Agent:** Breaks prompt into shots (returns JSON plan).
- **Artist Agent:** Generates/retrieves assets (Bible) - Character & Environment.
- **Production Agent:** Generates videos sequentially using the Bible assets.
- **Services:** `pipelineService.ts` orchestrates these agents.

### 4.2. Error Handling
- Use `try...catch` blocks for async operations (API calls).
- Dispatch `SET_ERROR` actions in Context to display user-friendly error messages.
- Log raw errors to console for debugging with context (e.g., `console.error("Pipeline failed:", e)`).

### 4.3. API Integration
- **Client:** `@google/genai` is the primary SDK.
- **Keys:** API keys are handled via `window.aistudio` (Project IDX integration) or environment variables (`VITE_GEMINI_API_KEY`).
- **Note on Types:** `window.aistudio` is injected by the IDX environment. If you see TS errors about `aistudio` missing on `window`, you may need to add a declaration to `src/vite-env.d.ts`.

## 5. Git & Version Control
- **Commit Messages:**
    - `feat:` for new features.
    - `fix:` for bug fixes.
    - `docs:` for documentation updates.
    - `style:` for formatting/linting changes.
    - `refactor:` for code restructuring without behavior change.
- **Branching:** Create feature branches for significant changes.

## 6. Development Workflow
1.  **Analyze:** Understand the task and existing code. Read `TDD.md` if working on the pipeline.
2.  **Plan:** Propose changes. Check `types.ts` to see if data models need updating.
3.  **Implement:** specific changes adhering to the style guide.
    - **Types First:** Update `types.ts` before implementing logic.
4.  **Verify:** Since there are no auto-tests, manually verify (if possible) or describe how to verify the changes.
5.  **Documentation:** Update `TDD.md` if architectural changes are made.

## 7. Critical Rules
- **NEVER** commit API keys or secrets.
- **ALWAYS** check for existing types in `types.ts` before creating new ones. Avoid duplication.
- **ALWAYS** update `TDD.md` if architectural changes are made.
- **DO NOT** remove existing functionality unless explicitly asked.
