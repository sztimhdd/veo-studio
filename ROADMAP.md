# Development Roadmap: Veo Studio (Feb 2026)

Based on the architecture defined in `references/proposed_arch_feb11.mermaid`, here is the strategic roadmap for evolving the platform from its current state to the full **Cyclic Virtual Production** system.

## 🟢 Phase 1: Foundation & Pre-Production (The "Director" Upgrade)
**Goal:** Establish the strict planning and budgeting layer before any generation occurs.

- [ ] **Memory System Implementation (Phase 0)**
    - Build `GlobalKB` (Cinematic Rules), `TaskContext` (Character Bank), and `UserPref` stores.
    - Connect `IntentParser` to read/write User Preferences.
- [ ] **Enhanced Director Agent (Phase 1)**
    - Upgrade `DirectorPlanner` to output structured `Script_JSON`, `Initial_Prompt_Templates`, and `Material_Requirements`.
- [ ] **Cost Estimation & Arbitration**
    - Implement `CostEstimator` logic (Token/API cost calculation).
    - Add `UserConfirm` UI gate to block execution until budget is approved.

## 🟡 Phase 2: Execution Cluster (The "Artist" Upgrade)
**Goal:** Parallelize asset generation and prompt optimization for maximum quality.

- [ ] **Material Generator (Artist)**
    - Implement `MaterialGen` to produce `Asset_Pack_V1` (Turnaround sheets, reference images).
- [ ] **Prompt Engineering Agent**
    - Create `PromptEngineer` (Claude 3.7) to refine templates into `Optimized_Prompts` with negative prompting and seed control.
- [ ] **Draft Generation (Seedance)**
    - Integrate `SeedanceBatch` to generate 4-6 low-res `Draft_Videos` for rapid iteration.

## 🟠 Phase 3: High-Res Refinement & Continuity (The "Refining" Upgrade)
**Goal:** Implement the "Human-in-the-Loop" selection and automated consistency checks.

- [ ] **Continuity Supervisor**
    - Build `ContinuitySupervisor` (Critic) to generate `Eval_Report` (Temporal consistency, semantic alignment).
- [ ] **Motion Lock System**
    - Add UI for "Motion Lock": User selects the best `LockedSkeleton` from drafts.
- [ ] **High-Res Refinement (Phase 4)**
    - Implement `ExtractKeyframes` (Start/Mid/End) and `ConsistencyChecker` (Perceptual Hashing) to identify best anchor frames.
    - Build `NanoRedraw` for 4K upscaling of best keyframes using Gemini Vision.
    - Integrate `imagehash-web` for automated frame vs. asset similarity scoring.

## 🔴 Phase 4: Master Rendering & Delivery (The "Production" Upgrade)
**Goal:** Final assembly, rendering, and quality assurance.

- [ ] **Combiner Agent (Phase 5)**
    - Implement `Combiner` to assemble `VeoPayload` (Upscaled Anchor + Original Prompt + Motion Guidance).
- [ ] **Veo Rendering Integration**
    - Connect `VeoRender` (Veo 3.1) for final video synthesis using upscaled references.
    - (Optional) Add `ComposerAgent` for audio track generation.
- [ ] **Stitching & Delivery**
    - Implement `StitchService` using `ffmpeg.wasm` for high-quality client-side concatenation.
    - Add `Deliver` module for formatting final output (Video + Captions + Report).
- [ ] **QA & Feedback Loops (Phase 6)**
    - Implement `FinalInspector` for final quality scoring.
    - Build `QualityGate` logic:
        - **Local Fix:** Route back to `NanoRedraw` for specific frame issues.
        - **Global Fix:** Route back to `DirectorPlanner` for script changes.

## 📅 Immediate Next Steps
1.  **Refactor `types.ts`**: Update data structures to support `Script_JSON`, `Asset_Pack_V1`, and `Eval_Report`.
2.  **Implement Phase 0/1**: Focus on the `Director` and `Memory` systems to ensure solid planning foundations.
