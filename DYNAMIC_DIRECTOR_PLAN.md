# Implementation Plan: Dynamic Director (Flexible Scene Structure)

## Overview
Migrate from fixed 3-shot structure to Director-driven dynamic scenes with timestamp prompting.

## New Data Model

### 1. SceneParams (Replaces ShotParams)
```typescript
interface SceneParams {
  id: string;
  order: number;
  duration_seconds: number; // 1-8 seconds
  segments: SceneSegment[];
  master_prompt: string; // Combined timestamped prompt for Veo
}

interface SceneSegment {
  start_time: string; // "00:00"
  end_time: string;   // "00:04"
  prompt: string;
  camera_movement: string;
  audio_cues?: string;
}
```

### 2. Updated DirectorPlan
```typescript
interface DirectorPlan {
  subject_prompt: string;
  environment_prompt: string;
  visual_style: string;
  reasoning: string;
  scenes: SceneParams[]; // Variable length, not fixed 3
}
```

## Implementation Steps

### Step 1: Update types.ts
- Add `SceneParams` interface
- Add `SceneSegment` interface
- Update `DirectorPlan` to use `scenes` array
- Keep `ShotParams` for backward compatibility during migration

### Step 2: Update Director Agent Prompt
- Instruct Director to analyze user prompt complexity
- Output variable scene count (1-N based on narrative needs)
- Each scene max 8 seconds
- Use timestamp format: `[MM:SS-MM:SS] prompt here`
- Combine segments into single `master_prompt` per scene

### Step 3: Update Production Pipeline
- Change iteration from `plan.shots` to `plan.scenes`
- Pass `master_prompt` to Veo instead of individual shot prompts
- Update logging to reference "Scene X" instead of "Shot X"

### Step 4: Update UI Components
- PipelineVisualizer: Show scenes instead of shots
- Display scene duration and segment breakdown
- Timeline visualization for each scene's internal cuts

## Test Strategy

### Test 1: Schema Validation
Verify new interfaces accept correct data shapes.

### Test 2: Director Prompt Generation
Mock API call and verify Director outputs correct JSON with scenes array.

### Test 3: Timestamp Format Validation
Verify master_prompt contains valid `[MM:SS-MM:SS]` patterns.

### Test 4: Production Pipeline Variable Scenes
Test pipeline handles 1 scene vs 3 scenes correctly.

### Test 5: Duration Constraint
Verify Director respects 8-second max per scene.

## Migration Path
1. Add new types (backward compatible)
2. Update Director prompt
3. Update production loop
4. Update UI
5. Deprecate old ShotParams (optional)

## Files to Modify
- types.ts
- services/pipelineService.ts (runDirectorAgent, runProductionPipeline)
- components/PipelineVisualizer.tsx
- context/ProductionContext.tsx (logging)
