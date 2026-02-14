# Development Roadmap: Veo Studio (Feb 2026)

Based on the architecture defined in `references/proposed_arch_feb11.mermaid`, here is the strategic roadmap for evolving the platform from its current state to the full **Cyclic Virtual Production** system.

---

## ✅ IMPLEMENTED FEATURES (Feb 2026)

### Phase 1: Foundation & Pre-Production (Director)
- [x] **Director Agent**: Generates structured JSON scripts (`DirectorPlan`) with scene breakdown, timestamps, and transitions.
- [x] **Dynamic Scene Planning**: Director outputs variable number of scenes (1-N) based on prompt complexity.

### Phase 2: Execution Cluster (Artist)
- [x] **Artist Agent**: Generates character and environment turnaround sheets using Gemini Vision.
- [x] **Asset Bible**: Stores generated assets with `source` tracking (`user` vs `ai`).

### Phase 3: Draft Generation
- [x] **Veo 3.1 Fast Integration**: Generates draft videos from prompts and references.
- [x] **Reference Management**: Supports `ASSET` (character) and `STYLE` (background) references.
- [x] **Safety & Robustness**:
    - Metadata stripping (Canvas redraw) to remove EXIF/triggers.
    - Prompt sanitization (brand name replacement).
    - Progressive fallback (Safety Filter → Drop User Images → Text-to-Video).
    - RAI Error Reporting (`includeRaiReason: true`).
    - Quota management (Token bucket with jitter).

### Phase 4: High-Res Refinement
- [x] **Keyframe Extraction**: Extracts Start/Mid/End frames from draft video.
- [x] **Dual-Frame Upscaling**: Upscales both first and last frame for smoother temporal boundaries.
- [x] **Mastering**: Generates 4K video using `image` (start) + `config.lastFrame` (end).
- [x] **Batch Refinement**: Added "Master All (4K)" button for sequential processing with throttling.
- [x] **Consistency Scoring**: Uses perceptual hashing (`imagehash-web`) to calculate similarity scores.

### UI/UX
- [x] **Test Sets**: Multiple test scenarios (Cat Food, Kyoto Dog, Bolivia Cat).
- [x] **Pipeline Visualizer**: Shows Dailies, allows regeneration and refinement per shot.
- [x] **Export/Stitching**: Basic video concatenation using FFmpeg.wasm.

---

## 🟠 Phase 3: Continuity Supervision (The "Critic" Upgrade)
**Status:** Partial (Human-in-the-loop). **Next: Automated Agent.**

- [ ] **Continuity Supervisor (Critic Agent)**
    - Build `runCriticAgent` (Gemini 3 Pro) to analyze drafts.
    - Output `Eval_Report`: Temporal consistency, semantic alignment, flaw detection.
- [ ] **Motion Lock System**
    - UI for "Motion Lock": User selects best `LockedSkeleton` from drafts.

---

## 🔴 Phase 5: Master Rendering & Delivery (The "Production" Upgrade)
**Status:** In Progress.

- [x] **Combiner Agent (Logic integrated in Mastering)**
    - Assembles `VeoPayload` (Upscaled Anchors + Prompt + Motion).
- [x] **Veo Rendering Integration**
    - Connected `VeoRender` (Veo 3.1) for final video synthesis.
- [ ] **Audio Generation**
    - (Optional) Add `ComposerAgent` for audio track generation.
- [ ] **Stitching & Delivery**
    - [x] Basic concatenation implemented.
    - [ ] **Director-Driven Transitions**: Enhance StitchService to use FFmpeg xfade based on `TransitionSpec` from Director.
    - [ ] **Deliver Module**: Format final output (Video + Captions + Report).

---

## 🔵 Phase 6: QA & Feedback Loops
**Status:** Not Started.

- [ ] **Final Inspector**
    - Implement `FinalInspector` for automated quality scoring.
- [ ] **Quality Gate Logic**
    - **Local Fix**: Route back to Refiner for specific frame issues.
    - **Global Fix**: Route back to Director for script changes.
- [ ] **Feedback Loop**: Connect Critic output back to Director for automated iteration.

---

## 📅 PRIORITIZED NEXT STEPS

### 1. Feature 1: Director-Driven Shot Transitions
**Status:** Research Complete. **Ready to Implement.**

- Update `types.ts` - Add `TransitionSpec` (done).
- Modify Director Agent - Output transition hints in Script_JSON.
- Enhance StitchService - Parse transitions and apply FFmpeg xfade with audio handling.

### 2. Feature 3: Per-Shot vs Sequence Upscaling Decision
**Status:** Research Needed.

- **Option A (Recommended)**: Per-Shot Upscaling (High Quality).
- **Option B**: Sequence Upscaling (Efficient Quota).

### 3. Feature 4: Stitching & Delivery (Refinement)
- Add FFmpeg xfade transitions.
- Add Captions generation (using Director's script).
- Add "Report" generation (consistency scores, artifacts used).

### 4. Backlog
- **Memory System (Phase 0)**: `GlobalKB`, `TaskContext`, `UserPref`.
- **Cost Estimator**: Token/API cost calculation.
- **Critic Agent**: Automated evaluation.
