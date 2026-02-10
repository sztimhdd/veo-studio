# Technical Design Document (TDD): Veo Studio "Dailies" Architecture

## 1. System Architecture
The application uses a **Fan-Out / Fan-In** pattern with a **Hybrid Asset Pipeline**.
1.  **Composite Input:** User Prompt + Optional Blobs (Character/BG).
2.  **Sequential Prep:** Plan -> Asset Filling (Artist Agent only runs for missing slots).
3.  **Parallel Execution:** 3x Veo Generation Requests.
4.  **Unified View:** Results aggregated into a specific "Scene" object.

## 2. Data Models

### 2.1. The Bible (Shared State)
To ensure consistency, we generate the assets *once* (or use user uploads) and hold them in memory.

```typescript
interface ProductionBible {
  character: AssetItem; // Blob + base64 (User Upload OR AI Gen)
  environment: AssetItem; // Blob + base64 (User Upload OR AI Gen)
  style: string; // Text description
}
```

### 2.2. The Shot List
```typescript
interface ShotParams {
  id: string;
  order: number;
  prompt: string;
  camera_movement: string;
  duration_seconds: number;
}
```

## 3. Service Layer Logic (`pipelineService.ts`)

### 3.1. The Director Agent
*   **Model:** `gemini-3-pro-preview`
*   **Output:** JSON Array of `ShotParams`.
*   **System Instruction:** "You are a cinematographer. Split this narrative into 3 distinct shots. Ensure camera angles varies (Wide, Medium, Close). output JSON."

### 3.2. The Artist Agent (The Gap Filler)
*   **Input:** `DirectorPlan` + `UserUploads`
*   **Logic:**
    *   `if (user.characterImage)` -> Use it.
    *   `else` -> Call Gemini 2.5 Flash Image to generate Character.
    *   `if (user.bgImage)` -> Use it.
    *   `else` -> Call Gemini 2.5 Flash Image to generate Background.
*   **Output:** Complete `ProductionBible`.

### 3.3. The Production Agent (Parallelizer)
*   **Input:** `ShotParams[]` + `ProductionBible`
*   **Logic:**
    *   Map over `ShotParams`.
    *   For each shot, construct a `generateVideos` request.
    *   **Inject References:** strictly pass `bible.character` as `referenceType: ASSET`.
    *   **Inject References:** pass `bible.environment` as `referenceType: STYLE` (or `ASSET` if static).
    *   **Inject Prompt:** Combine `shot.prompt` + `bible.style` + `shot.camera_movement`.
    *   `Promise.all()` the requests.

## 4. Frontend Implementation

### 4.1. Input Form
*   Add File Inputs for "Character Ref" and "Environment Ref" in the Studio Mode UI.

### 4.2. `PipelineVisualizer` Update
*   Needs to support a list of videos ("Film Strip").
*   Asset view should distinguish between "User Provided" vs "AI Generated".

### 4.3. State Management (`ProductionContext`)
*   Update `ProductionArtifacts` to hold `shots: VideoArtifact[]`.

## 5. Deployment Constraints
*   **API Costs:** Generating 3 videos costs 3x.
*   **Browser Memory:** Storing user uploads + generated blobs is fine. Revoke ObjectURLs on unmount.
