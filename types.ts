
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import {Video} from '@google/genai';

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

export interface DirectorPlan {
  subject_prompt: string;
  environment_prompt: string;
  action_prompt: string;
  visual_style: string;
  reasoning: string;
}

export interface AssetItem {
  id: string;
  type: 'character' | 'background';
  url: string; // ObjectURL for UI
  blob: Blob;  // For API
  base64?: string; // Cache
}

export interface VideoArtifact {
  url: string;
  blob: Blob;
  uri?: string; // The Google API URI
}

export interface ProductionArtifacts {
  plan: DirectorPlan | null;
  assets: AssetItem[];
  draftVideo: VideoArtifact | null;
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
