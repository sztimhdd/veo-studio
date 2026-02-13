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
     - **Future Enhancement: Dual-Frame Upscaling Mastering** (must-have)
         - Upscale BOTH first frame and last frame (instead of single best frame)
         - Send both upscaled frames to Veo 3.1 in FRAMES_TO_VIDEO mode (startFrame + lastFrame)
         - This provides better temporal boundaries and smoothing for high-res video generation

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

## 🔵 Phase 5: Transition System & High-Res Production (CRITICAL NEXT STEPS)
**Goal:** Implement Director-controlled shot transitions and enhanced mastering for professional video quality.

### Feature 1: Director-Driven Shot Transitions
**Status:** Research Complete, Ready to Implement

**Problem Statement:**
- Current system uses simple concatenation (no transitions)
- User request: Director should decide transition FX between shots with audio consistency (fade-in/fade-out, crossfade)

**Design Requirements:**
1. Director Agent outputs transition choices per shot boundary in Script_JSON
2. StitchService processes shots using chosen transitions
3. Transitions maintain audio continuity (crossfade, ducking)

**Research Findings (Feb 2026):**

| Library | Stars | Capabilities | Pros | Cons |
|---------|-------|--------------|------|------|
| **FFmpeg native xfade** | - | 50+ transition types, automatic audio crossfade | No dependency, handles audio natively, production-ready | Command-line complexity |
| **scriptituk/xfade-easing** | 107 | CSS easing (ease-in/out, cubic-bezier) + GLSL transitions | Enhanced easing curves, elegant transitions | Node.js wrapper required |
| **FFCreatorLite** | 309 | 30+ transitions, simple API | Lightweight, easy integration, good docs | Less flexibility than raw FFmpeg |

**Recommended Implementation Approach:**
```
1. Update Script_JSON output to include transition spec:
   {
     "shots": [
       { "id": "shot1", "timestamp": "00:00-00:04", "transition": null },
       { "id": "shot2", "timestamp": "00:04-00:08", "transition": { "type": "xfade", "duration": 0.5, "easing": "ease-in-out" } }
     ]
   }

2. StitchService reads transition array and applies per-boundary:
   - For each shot boundary: apply ffmpeg -vf "xfade=transition=<type>:duration=<duration>:offset=<offset>"
   - Audio is automatically crossfaded by xfade filter
   - Specific easing (if using xfade-easing lib) applied via GLSL parameters

3. Audio consistency handled automatically:
   - FFmpeg xfade performs audio crossfade (volume ramps)
   - If audio ducking needed: add sidechain compression
```

**Implementation Tasks:**
- [ ] Extend `types.ts` - Add `TransitionSpec` type with fields: type, duration, easing
- [ ] Modify Director Agent - Output transition hints in Script_JSON (default: "fade" for smooth continuity)
- [ ] Enhance StitchService - Parse transitions and apply ffmpeg xfade with audio handling
- [ ] Add transition tests in `services/stitchService.test.ts`

**File Changes Required:**
- `types.ts` - Add TransitionSpec interface
- `services/pipelineService.ts` - Director planning logic (include transition inference)
- `services/stitchService.ts` - Process transitions with FFmpeg

---

### Feature 2: Dual-Frame Upscaling for Mastering
**Status:** ✅ Complete (Feb 2026)

**Problem Statement:**
- Current implementation upscales only single best frame from Phase 4
- Veo 3.1 FRAMES_TO_VIDEO mode accepts startFrame AND lastFrame for better temporal boundaries
- Single-frame mastering produces less smooth high-res output

**Design Requirements:**
1. Phase 4 identifies TWO best frames: first anchor and last anchor
2. Both frames upscaled to 4K using Gemini Vision
3. Both upscaled frames sent to Veo 3.1 in FRAMES_TO_VIDEO mode
4. Resulting video has smoother temporal boundaries

**Implementation Details:**
- Logic updated in `runRefinementPhase` to extract and upscale both start (0.1s) and end (duration-0.2s) frames.
- `runMasteringAgent` now accepts `startAnchor` and `endAnchor`.
- Veo API call updated to use `image` (start) and `config.lastFrame` (end).
- Verified with `bolivia-adventure.spec.ts`.

**File Changes Required:**
- `services/pipelineService.ts` - masterVideo() function
- `context/ProductionContext.tsx` - Update state tracking (two anchors instead of one)

---

### Feature 3: First-Final Frame High-Res Shot Generation
**Status:** Research Needed

**Problem Statement:**
- Each individual shot in sequence should have high-res consistency
- Current approach: Generate all shots at low-res, then upscale final stitched video
- Alternative: Upscale each shot individually using frame pairs, then stitch

**Design Requirements (To Be Determined):**
1. Per-shot high-res generation using first/last frame pairs
2. Consistent quality across shot sequence
3. Balance quality vs. API quota (Veo calls)

**Open Questions:**
- Should high-res be applied per-shot (before stitching) or per-sequence (after stitching)?
- Veo API quota impact: 1FRAMES_TO_VIDEO call = 30s interval, multi-shot = multiple calls → quota exhaustion risk
- Decision matrix needed: N shots × 30s vs. 1 sequence × 30s + simple upscaling

**Research Needed:**
- [ ] Evaluate Veo 3.1 API quota constraints for per-shot FRAMES_TO_VIDEO calls
- [ ] Test per-shot dual-frame quality vs. stitched single-frame quality
- [ ] Design quota-aware scheduling (batch shots with intervals)
- [ ] Explore alternative: Stitch low-res → Single dual-frame upscale of full sequence

**Decision Required Before Implementation:**
```
Option A: Per-Shot Upscaling (High Quality, High Quota)
  - Each shot: dual-frame Veo FRAMES_TO_VIDEO (30s interval)
  - N shots = N × 30s quota
  - Stitch already-high-res shots = minimal quality loss
  - Risk: Quota exhaustion for long sequences (10+ shots)

Option B: Sequence Upscaling (Good Quality, Efficient Quota)
  - Generate all shots at standard res → Stitch sequence
  - Select keyframes from stitched sequence → Dual-frame upscale once
  - 1 × 30s quota regardless of shot count
  - Trade-off: Less per-shot fidelity, faster pipeline

RECOMMENDATION: Start with Option B (Sequence Upscaling)
- Matches current architecture (stitchService already exists)
- Quota-efficient (critical for production)
- Good enough quality for most use cases
- Option A can be added later as "Premium Mode" with quota warnings
```

**Implementation Tasks (If Option A selected):**
- [ ] Modify Phase 4 - Generate per-shot keyframe pairs (first/last per shot)
- [ ] Per-shot dual-frame Veo calls with quota-aware scheduling
- [ ] Stitch high-res shots (already implemented in Feature 1)
- [ ] Add quota management for multi-shot Veo calls

---

## 📅 Immediate Next Steps (PRIORITIZED)
1.  **[HIGH PRIORITY] Implement Feature 1: Transition System**
    - Update Script_JSON → Add transition specs
    - Implement Director transition inference
    - Enhance StitchService with FFmpeg xfade
    - Estimated effort: 4-6 hours
2.  **[HIGH PRIORITY] Implement Feature 2: Dual-Frame Upscaling**
    - Update masterVideo() for dual-anchor selection
    - Parallel upscaling with Promise.all
    - Veo API dual-reference integration
    - Estimated effort: 2-3 hours
3.  **[MEDIUM PRIORITY] Decision on Feature 3: Per-Shot vs Sequence Upscaling**
    - Quota analysis and testing
    - Architecture decision recorded
    - Implementation based on decision
    - Estimated effort: TBD after decision
4.  **[BACKLOG] Refactor `types.ts`**: Update data structures to support all new features (transition specs, dual anchors).
5.  **[BACKLOG] Implement Phase 0/1**: Focus on the `Director` and `Memory` systems to ensure solid planning foundations.
