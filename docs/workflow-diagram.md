# Veo Studio Multi-Agent Pipeline Architecture

## Data Flow Diagram

```mermaid
graph TB
    subgraph Phase1[Phase 1: Planning]
        USER[User Prompt]
        Director[Director Agent<br/🧠 Gemini 3 Pro Preview]
        PLAN[Director Plan<br/>├─ subject_prompt: string<br/>├─ environment_prompt: string<br/>├─ visual_style: string<br/>├─ scenes: SceneParams[]<br/>└─ reasoning: string]
    end
    
    subgraph Phase2[Phase 2: Asset Generation]
        Artist[Artist Agent<br/>🎨 Gemini 3 Pro Image Preview]
        ASSETS[Production Bible Assets<br/>AssetItem[]<br/>├─ character: Blob + base64<br/>├─ background: Blob + base64<br/>└─ source: 'ai' | 'user']
    end
    
    subgraph Phase3[Phase 3: Draft Production]
        Production[Engineer Agent<br/>🎬 Veo 3.1 Fast - Shot by Shot<br/>Mocked in tests]
        SCENES[Scene Generation Agent<br/>🎬 Veo 3.1 Fast - with Timestamps<br/>Mocked in tests]
        SHOTS[Video Artifacts<br/>VideoArtifact[]<br/>├─ url: ObjectURL<br/>├─ blob: Blob<br/>├─ uri: Google Storage URL<br/>└─ shotId: scene-X]
    end
    
    subgraph Phase4[Phase 4: Refinement]
        DRAFT[Draft Video<br/>Single scene or stitched]
        EXTRACT[Keyframe Extraction<br/>├─ extractKeyframes()<br/>└─ 3 frames: Start, Mid, End]
        CONS[Consistency Check<br/>├─ calculateConsistency()<br/>├─ perceptual hashing (pHash)<br/>└─ score: 0-1]
        SELECT[Best Frame<br/>├─ highest consistency score<br/>└─ frame: base64 string]
        Refiner[Refiner Agent<br/>🔍 Gemini 3 Pro Vision - Upscale]
        UPSCALED[Upscaled Anchor Frame<br/>├─ 4K enhanced frame<br/>└─ Blob + base64]
    end
    
    subgraph Phase5[Phase 5: Mastering]
        Master[Mastering Agent<br/>⭐ Veo 3.1 High Quality<br/>Mocked in tests]
        FINAL[Final Master Video<br/>VideoArtifact<br/>├─ url: ObjectURL<br/>├─ blob: Blob (1080p)<br/>└─ uri: Google Storage URL]
        Stitcher[Video Stitching Service<br/>🧵 FFmpeg.wasm]
        STITCHED[Stitched Final Video<br/>Blob (.mp4)<br/>All scenes combined]
    end
    
    subgraph Feedback[Critic & Human Feedback]
        CRITIC[Critic Agent<br/>👁 Human-in-the-Loop]
        FEEDBACK[Feedback<br/>string<br/>Directs regeneration]
    end

    %% Manual Reference Assets
    USER_CHAR[User Character<br/>Blob | null]
    USER_ENV[User Environment<br/>Blob | null]

    %% Main Dataflow
    USER -->|"User Prompt: string"| Director
    Director -->|"DirectorPlan<br/>• subject_prompt<br/>• environment_prompt<br/>• visual_style<br/>• scenes[]<br/>• reasoning"| PLAN
    PLAN --> PLAN
    
    USER_CHAR -.->|"Character Reference<br/>Blob"| Artist
    USER_ENV -.->|"Environment Reference<br/>Blob"| Artist
    
    PLAN -->|"DirectorPlan<br/>• subject_prompt<br/>• environment_prompt<br/>• visual_style"| Artist
    Artist -->|"AssetItem[]<br/>• type: 'character'|'background'<br/>• blob: Blob<br/>• base64: string<br/>• source: 'ai'|'user'"| ASSETS
    
    PLAN -->|"DirectorPlan<br/>• scenes[] (1-N scenes)<br/>• duration_seconds: 1-8<br/>• master_prompt<br/>• segments[]"| Production
    ASSETS -->|"AssetItem[]<br/>• Character + Background<br/>• base64 data"| Production
    
    PLAN -->|"DirectorPlan<br/>• scenes[]"| SCENES
    ASSETS -->|"AssetItem[]<br/>• Character + Background<br/>• base64 data"| SCENES
    
    Production -->|"VideoArtifact[]<br/>• url, blob, uri<br/>• shotId: scene-1...N"| SHOTS
    SCENES -->|"VideoArtifact[]<br/>• url, blob, uri<br/>• shotId: scene-1...N"| SHOTS
    
    SHOTS -->|"Shot[0].blob" (draft video)| DRAFT
    
    DRAFT --> EXTRACT
    EXTRACT -->|"keyframes: string[]<br/>[Start, Mid, End] base64"| SELECT
    
    ASSETS -->|"character: AssetItem<br/>base64 for reference"| CONS
    SELECT -->|"frame: base64"| CONS
    
    CONS -->|"consistencyScore: 0-1<br/>+ bestFrameIndex"| SELECT
    SELECT -->|"selectedKeyframe: base64"| Refiner
    
    PLAN -->|"DirectorPlan<br/>• subject_prompt<br/>• environment_prompt"<br/>• shots[0].prompt| Refiner
    REFiner -->|"upscaled frame: Blob<br/>4K enhanced"| UPSCALED
    
    PLAN -->|"DirectorPlan<br/>• subject_prompt<br/>• environment_prompt"<br/>• shots[0].prompt| Master
    UPSCALED -->|"anchorFrame: Blob<br/>4K upsampled"| Master
    Master -->|"Final VideoArtifact<br/>1080p, high quality"| FINAL
    
    SHOTS -->|"VideoArtifact[]<br/>All scenes"| Stitcher
    Stitcher -->|"Stitched Video<br/>Blob (.mp4)<br/>All scenes combined"| STITCHED
    
    CRITIC -.->|"Feedback: string<br/>"Add more detail...""| PRODUCTION
    FEEDBACK -.->|"Feedback: string<br/>"Make darker..."| SCENES
    
    %% Styling
    classDef agent fill:#4a90e2,stroke:#357abd,stroke-width:2px
    classDef data fill:#10b981,stroke:#059669,stroke-width:2px
    classDef userData fill:#f59e0b,stroke:#d97706,stroke-width:2px
    classDef mocked fill:#95a5a6,stroke:#7f8c8d,stroke-width:2px,stroke-dasharray: 5,5
    
    style USER,USER_CHAR,USER_ENV userData
    style Director,Artist,Production,SCENES,Refiner,Master,Critic agent
    style PLAN,ASSETS,SHOTS,DRAFT,EXTRACT,CONS,SELECT,UPSCALED,FINAL,STITCHED data
    style Production mocked
```

## Agent Details

### 1. Director Agent (Planning)
- **Model**: `gemini-3-pro-preview` (Real API)
- **Input**: 
  - `userPrompt: string`
- **Output**:
  - `DirectorPlan` with:
    - `subject_prompt: string` - Character/subject bible
    - `environment_prompt: string` - Location/environment bible
    - `visual_style: string` - Cinematic style description
    - `scenes: SceneParams[]` - 1-N scenes, each 1-8 seconds
    - `reasoning: string` - Why this structure was chosen

### 2. Artist Agent (Asset Generation)
- **Model**: `gemini-3-pro-image-preview` (Real API)
- **Inputs**:
  - `plan: DirectorPlan` - From Director
  - `userCharacter?: Blob` - Optional reference photo
  - `userEnvironment?: Blob` - Optional reference photo
- **Outputs**:
  - `AssetItem[]` - 2 assets:
    - Character: `type='character'`, Blob, base64, source
    - Environment: `type='background'`, Blob, base64, source

### 3. Engineer/Production Agent (Draft)
- **Model**: `veo-3.1-fast-generate-preview` (Mocked in tests)
- **Inputs**:
  - `shot: ShotParams` - Per shot details
  - `plan: DirectorPlan` - Director's plan
  - `assets: AssetItem[]` - Character & background bibles
  - `feedback?: string` - Human critique
- **Outputs**:
  - `VideoArtifact[]` - Video files for each shot:
    - `url: string` - ObjectURL for display
    - `blob: Blob` - Actual video data
    - `uri: string` - Google Cloud Storage URL
    - `shotId: string` - Link back to shot params

### 4. Scene Generation Agent (Timestamp Shots)
- **Model**: `veo-3.1-fast-generate-preview` (Mocked in tests)
- **Inputs**:
  - `scene: SceneParams` - Scene with segments
  - `plan: DirectorPlan` - Director's plan
  - `assets: AssetItem[]` - Reference assets
  - `feedback?: string` - Human critique
- **Outputs**:
  - `VideoArtifact` - Video for entire scene (1-8s with internal cuts)
  - Uses timestamp prompting: `[00:00-00:04] Shot A. [00:04-00:08] Shot B.`

### 5. Refiner Agent (Phase 4)
- **Model**: `gemini-3-pro-image-preview` (Vision) (Real API)
- **Inputs**:
  - `lowResBlob: Blob` - Frame from draft video
  - `plan: DirectorPlan` - Context for enhancements
- **Outputs**:
  - `Blob` (image/png) - Upscaled 4K enhanced frame

### 6. Mastering Agent (Phase 5)
- **Model**: `veo-3.1-generate-preview` (Mocked in tests)
- **Inputs**:
  - `plan: DirectorPlan` - Director's plan
  - `anchorFrameBlob: Blob` - Upscaled reference frame
- **Outputs**:
  - `VideoArtifact` - Final high-quality video (1080p)

### 7. Video Stitcher Service
- **Implementation**: FFmpeg.wasm
- **Input**:
  - `videos: VideoArtifact[]` - All scene videos
- **Output**:
  - `Blob` (video/mp4) - Concatenated final video

### 8. Critic Agent (Human-in-the-Loop)
- **Model**: Hybrid AI + human review
- **Inputs**:
  - Generated assets/videos
  - User critique/feedback
- **Outputs**:
  - `feedback: string` - Specific directions for regeneration
  - Triggers: `runShotDraftingAgent(plan, assets, feedback)`

## Type Definitions

```typescript
// Director Output
interface DirectorPlan {
  subject_prompt: string;
  environment_prompt: string;
  visual_style: string;
  reasoning: string;
  scenes: SceneParams[];
  shots?: ShotParams[]; // Legacy
}

// Scene/Shot Structure
interface SceneParams {
  id: string;
  order: number;
  duration_seconds: number; // 1-8 seconds
  segments: SceneSegment[];
  master_prompt: string; // Timestamped: "[00:00-00:04] Shot A. [00:04-00:08] Shot B."
}

interface SceneSegment {
  start_time: string; // "00:00"
  end_time: string;   // "00:04"
  prompt: string;
  camera_movement: string;
  audio_cues?: string;
}

// Asset Output
interface AssetItem {
  id: string;
  type: 'character' | 'background';
  url: string; // ObjectURL for UI
  blob: Blob;  // For API calls
  base64?: string; // Cached base64
  source: 'user' | 'ai';
}

// Video Output
interface VideoArtifact {
  url: string;
  blob: Blob;
  uri?: string;
  shotId?: string;
  userFeedback?: string;
  version?: number;
  
  // Phase 4 Refinement data
  keyframes?: string[]; // Base64 frames from draft
  consistencyScore?: number; // 0-1
  selectedKeyframe?: string; // Best frame
}
```

## Quota Management

| API Type | Model | Min Interval | Quota |
|----------|-------|--------------|-------|
| TEXT_GEN | gemini-3-pro-preview | 12s | 5 RPM (safety) |
| IMAGE_GEN | gemini-3-pro-image-preview | 20s | 3 RPM (safety) |
| VIDEO_GEN | veo-3.1-fast-generate-preview | 30s | 2 RPM (safety) |
| VIDEO_HQ | veo-3.1-generate-preview | 30s | 2 RPM (safety) |
