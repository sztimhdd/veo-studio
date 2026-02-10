# Product Requirements Document (PRD): Veo Studio "Dailies" MVP

## 1. Executive Summary
**Veo Studio** is an agentic orchestration tool that solves the "Consistency Problem" in AI Video.
Instead of generating a single hallucinated video, it acts as a **Virtual Production Crew**. It establishes a visual "Bible" (Characters/Settings) and generates a batch of consistent, 5-second clips ("Rushes") that a human editor can later assemble.

## 2. Problem Statement
*   **The Drift:** In standard GenAI, Shot 1 looks different from Shot 2. Characters change clothes, lighting shifts.
*   **The Wait:** Generating shots sequentially is too slow for creative iteration.
*   **The Control Gap:** Users often have specific reference images (e.g., a specific product or character design) but current tools force them to rely on text-only prompts that hallucinate new designs.

## 3. The Solution: "The Dailies Engine"
We do not build an editor. We build a **Generator** that respects a shared visual state.

### 3.1. The Agentic Workflow
1.  **Phase 1: Input & Scripting (Hybrid)**
    *   **User Input:** Story Prompt (Text) + **Optional Reference Uploads** (Character Sheet / Environment Photo).
    *   **Director Agent:** Breaks the story into 3 distinct "Shots" with specific camera directions.
2.  **Phase 2: The Art Dept (The Bible)**
    *   **Logic:** The system constructs the "Production Bible."
        *   *If User Uploaded:* The system adopts the user's image as the canonical reference.
        *   *If Missing:* The **Artist Agent** generates the missing asset based on the script.
    *   *Result:* A complete set of assets (Character + BG) ready for production.
3.  **Phase 3: Production (Parallel Generation)**
    *   The system fires 3 concurrent requests to Veo 3.1 Fast.
    *   **Crucial:** All 3 requests use the **Same** Reference Images (User-provided or AI-generated) from Phase 2.
    *   **Constraint:** This ensures Short A and Short B feature the exact same subject.
4.  **Phase 4: Review (The Film Strip)**
    *   UI displays the shots side-by-side.
    *   User can review "The Dailies" to see if the sequence works.

## 4. Key Features
*   **Studio Mode Toggle:** Switch between "Classic" (Single Shot) and "Agentic" (Multi-Shot).
*   **Asset Uploader:** Drag-and-drop slots for "Cast" and "Location" in the Studio Input form.
*   **The Film Strip UI:** A horizontal gallery of the generated shorts.

## 5. Non-Functional Requirements
*   **Speed:** Parallel generation is mandatory.
*   **Reliability:** Use `veo-3.1-fast` for the MVP.
*   **Transition Strategy:** Achieve flow through *Prompt Engineering* (matching camera vectors), not Image Processing.

## 6. Metrics
*   **Consistency Score:** Subjective validation that the character in Shot 1 is recognizable in Shot 3.
*   **Throughput:** Successful generation of 3 concurrent videos without rate-limiting errors.
