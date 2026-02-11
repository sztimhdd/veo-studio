# Product Requirements Document (PRD): Veo Studio "Dailies" Platform

## 1. Executive Summary
**Veo Studio** is an agentic orchestration platform that solves the "Consistency and Quality Problem" in AI Video production. 
Moving beyond simple generation, it acts as an **End-to-End Virtual Production Studio**. It manages a persistent state (Memory), enforces cinematic standards via a Multi-Agent pipeline, and delivers consistent, high-fidelity 5-second shots ready for professional assembly.

## 2. Problem Statement
*   **Temporal & Semantic Drift:** AI models struggle to maintain character and environment details across multiple shots.
*   **The Black Box Problem:** Lack of visibility into costs and creative decisions before generation begins.
*   **Quality Variance:** Hallucinations and motion artifacts often ruin a generation, requiring expensive retries.

## 3. The Solution: "Cyclic Virtual Production"
We implement a 6-phase DAG (Directed Acyclic Graph) architecture that integrates planning, execution, and critique.

### 3.1. The Agentic Workflow
1.  **Phase 0: Intent & Memory:** Analyzes user requirements and brand guidelines. Maintains long-term memory (User Prefs, Character Banks).
2.  **Phase 1: Structured Pre-Production:** 
    *   **Director Agent:** Generates structured JSON scripts and shot tables.
    *   **Cost Estimator:** Provides budget transparency and "Early Exit" arbitration before costly rendering.
3.  **Phase 2: Execution Cluster:** 
    *   **Material Generator:** Creates character turnaround and environment reference sheets.
    *   **Prompt Engineer:** Optimizes prompts for semantic alignment.
    *   **Draft Generator:** Produces low-resolution 4-6 variants for review.
4.  **Phase 3: Continuity Supervision:** 
    *   **Critic Agent:** Scores drafts for temporal consistency and semantic alignment.
    *   **Motion Lock:** User or agent selection of the "Locked Skeleton" (the base motion).
5.  **Phase 4: High-Res Refinement:** 
    *   Intelligent keyframe extraction followed by High-Res Redrawing (4K) to anchor visual quality.
    *   **Feature Consistency Checker:** Prevents style drift using similarity mapping.
6.  **Phase 5: Master Rendering:** Uses Veo 3.1 with multi-modal conditions (locked motion + high-res anchors + optimized prompts).
7.  **Phase 6: QA & Feedback Loops:** 
    *   Final quality gate with automated "Local Fix" (redraw specified frames) or "Global Fix" (re-scripting) capabilities.

## 4. Key Features
*   **Dailies Engine:** Automated generation of consistent multi-shot sequences.
*   **Production Bible:** Persistent character and setting references.
*   **Agentic Quality Gates:** Automated critique and scoring system.
*   **Memory System:** Brand and user-specific preference storage.
*   **Cost-Aware Pipeline:** Budgeting and arbitration before execution.

## 5. Non-Functional Requirements
*   **Consistency:** Character/Environment delta < 10% across shots (measured by Consistency Checker).
*   **Performance:** Sequential execution with optimized cooldowns to respect API quotas.
*   **Extensibility:** Modular "Tool Server" architecture for plugging in new AI models.

## 6. Success Metrics
*   **Pass Rate:** Percentage of generations passing the Phase 6 Quality Gate on the first try.
*   **Consistency Score:** Average score from the Continuity Supervisor.
*   **Cost Efficiency:** Reduction in manual retries due to early-stage critiques.
