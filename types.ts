
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { Video } from '@google/genai';

export enum AppState {
  IDLE,
  LOADING,
  SUCCESS,
  ERROR,
}

export enum VeoModel {
  VEO_FAST = 'veo-3.1-fast-generate-preview',
  VEO = 'veo-3.1-generate-preview',
}

export enum AspectRatio {
  LANDSCAPE = '16:9',
  PORTRAIT = '9:16',
}

export enum Resolution {
  P720 = '720p',
  P1080 = '1080p',
  P4K = '4k',
}

export enum GenerationMode {
  TEXT_TO_VIDEO = 'Text to Video',
  FRAMES_TO_VIDEO = 'Frames to Video',
  REFERENCES_TO_VIDEO = 'References to Video',
  EXTEND_VIDEO = 'Extend Video',
}

export interface ImageFile {
  file: File;
  base64: string;
}

export interface VideoFile {
  file: File;
  base64: string;
}

export interface GenerateVideoParams {
  prompt: string;
  model: VeoModel;
  aspectRatio: AspectRatio;
  resolution: Resolution;
  mode: GenerationMode;
  startFrame?: ImageFile | null;
  endFrame?: ImageFile | null;
  referenceImages?: ImageFile[];
  styleImage?: ImageFile | null;
  inputVideo?: VideoFile | null;
  inputVideoObject?: Video | null;
  isLooping?: boolean;
}

// --- AGENTIC PIPELINE TYPES ---

export type PipelinePhase =
  | 'IDLE'
  | 'PLANNING'      // Director Agent
  | 'ASSET_GEN'     // Material Agent
  | 'DRAFTING'      // Veo Fast
  | 'REFINING'      // Frame Extraction + Gemini Pro Vision Upscale
  | 'RENDERING'     // Veo High Quality
  | 'COMPLETE'
  | 'ERROR';

// --- DYNAMIC DIRECTOR TYPES (New) ---

export interface SceneSegment {
  start_time: string; // "00:00"
  end_time: string;   // "00:04"
  prompt: string;
  camera_movement: string;
  audio_cues?: string;
}

export interface SceneParams {
  id: string;
  order: number;
  duration_seconds: number; // 1-8 seconds max
  segments: SceneSegment[];
  master_prompt: string; // Combined timestamped prompt for Veo
}

// Legacy: Keep for backward compatibility during migration
export interface ShotParams {
  id: string;
  order: number;
  prompt: string;
  camera_movement: string;
  duration_seconds: number;
}

export interface DirectorPlan {
  subject_prompt: string;
  environment_prompt: string;
  visual_style: string;
  reasoning: string;
  scenes: SceneParams[]; // New: Variable scene structure
  shots?: ShotParams[];  // Legacy: Optional for backward compatibility
}

export interface AssetItem {
  id: string;
  type: 'character' | 'background';
  url: string; // ObjectURL for UI
  blob: Blob;  // For API
  base64?: string; // Cache
  source: 'user' | 'ai'; // Added to track source as per TDD
}

export interface VideoArtifact {
  url: string;
  blob: Blob;
  uri?: string; // The Google API URI
  shotId?: string; // Link back to the shot params
  userFeedback?: string; // Human critique
  version?: number; // Take 1, 2, 3...
  
  // New fields for Phase 4 (Refining)
  keyframes?: string[]; // Base64 strings of extracted frames
  consistencyScore?: number; // 0-1 score
  selectedKeyframe?: string; // Base64 of the best frame
}

export interface ProductionArtifacts {
  plan: DirectorPlan | null;
  assets: AssetItem[]; // The "Bible"
  shots: VideoArtifact[]; // The "Dailies" (Film Strip)
  draftVideo: VideoArtifact | null; // Keep for backward compatibility/Single-shot mode
  anchorFrame: {
    original: string; // ObjectURL of the low-res frame
    upscaled: string; // ObjectURL of the high-res frame
    blob: Blob;       // The high-res blob
  } | null;
  finalVideo: VideoArtifact | null;
}


export interface LogEntry {
  timestamp: number;
  phase: PipelinePhase;
  message: string;
  agent: 'Director' | 'Artist' | 'Engineer' | 'System';
}

export interface ProductionState {
  phase: PipelinePhase;
  artifacts: ProductionArtifacts;
  logs: LogEntry[];
  error: string | null;
}
