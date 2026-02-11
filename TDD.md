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
*   **Sequential Pipeline:** Mandatory inter-shot cooldowns (20s) and pre-production buffers (15s) to mitigate `429 Resource Exhausted` errors.
*   **State Persistence:** Use of `ProductionContext` to hold the "Bible" and "Film Strip" across the DAG phases.
*   **Cleanup:** Automated revocation of ObjectURLs to prevent memory leaks during long-running refinement loops.

## 5. Future Implementation: MCP Tool Servers
The architecture is designed to move toward an **MCP (Model Context Protocol)** Tool Server model, where agents can dynamically call specialized tools for scene cutting, audio synthesis, and compliance checking.
