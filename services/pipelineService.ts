
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { GoogleGenAI, Type, Schema, VideoGenerationReferenceImage, VideoGenerationReferenceType } from '@google/genai';
import { AssetItem, DirectorPlan, ShotParams, Resolution, VideoArtifact } from '../types';


// Initialize AI (API key handled by env)
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

// --- QUOTA MANAGEMENT ---
// Implements Token Bucket / Leaky Bucket style rate limiting based on User's verified Quotas.

const QUOTAS = {
  VIDEO_GEN: {
    // Veo 3 Fast: 3 RPM. We use 2 RPM (30s) for safety.
    minInterval: 30000, 
    lastCall: 0
  },
  IMAGE_GEN: {
    // Nano Banana Pro: 4 RPM. We use 3 RPM (20s) for safety.
    minInterval: 20000,
    lastCall: 0
  },
  TEXT_GEN: {
    // Gemini 3 Pro: 7 RPM. We use 5 RPM (12s) for safety.
    minInterval: 12000,
    lastCall: 0
  }
};

export async function waitForQuota(type: keyof typeof QUOTAS) {
  const quota = QUOTAS[type];
  const now = Date.now();
  const timeSinceLast = now - quota.lastCall;
  
  if (timeSinceLast < quota.minInterval) {
    const wait = quota.minInterval - timeSinceLast;
    console.log(`[QuotaManager] Throttling ${type}: waiting ${Math.ceil(wait/1000)}s...`);
    await new Promise(resolve => setTimeout(resolve, wait));
  }
  
  quota.lastCall = Date.now();
}

// Calculate delay: 1000ms * 2^attempt +/- 20% jitter, capped at 60s
export function getRetryDelay(attempt: number): number {
  const baseDelay = 1000 * Math.pow(2, attempt);
  const jitter = baseDelay * 0.2 * (Math.random() * 2 - 1); // +/- 20% random jitter
  return Math.min(Math.max(baseDelay + jitter, 500), 60000); // Clamp between 0.5s and 60s
}

import imagehash from 'imagehash-web';

// Destructure functions from the default export array
// [ahash, dhash, phash, whash, cropResistantHash, ImageHash]
const [ahash, dhash, phash, whash, cropResistantHash, ImageHash] = imagehash as any;

// --- UTILITIES ---

const blobToBase64 = (blob: Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64data = reader.result as string;
      // Remove data url prefix (e.g. "data:image/jpeg;base64,")
      const base64Content = base64data.split(',')[1];
      resolve(base64Content);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
};

// Helper: get video duration
export const getVideoDuration = async (blob: Blob): Promise<number> => {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.onloadedmetadata = () => {
      URL.revokeObjectURL(video.src);
      resolve(video.duration);
    };
    video.onerror = () => reject(new Error("Failed to load video metadata"));
    video.src = URL.createObjectURL(blob);
  });
};

/**
 * Extracts 3 keyframes (Start, Mid, End) from a video blob.
 */
export const extractKeyframes = async (videoBlob: Blob): Promise<string[]> => {
  try {
    const duration = await getVideoDuration(videoBlob);
    // Avoid exact 0 or end to prevent black frames
    const times = [0.1, duration / 2, Math.max(0.1, duration - 0.2)]; 
    
    // Extract in parallel
    const blobs = await Promise.all(times.map(t => extractFrameFromBlob(videoBlob, t)));
    return Promise.all(blobs.map(blobToBase64));
  } catch (e) {
    console.error("Keyframe extraction failed:", e);
    return [];
  }
};

/**
 * Calculates consistency score (0-1) between a frame and a reference asset using perceptual hashing.
 */
export const calculateConsistency = async (frameBase64: string, referenceAsset: AssetItem): Promise<number> => {
  if (!referenceAsset.base64) return 0;
  
  try {
    // Convert base64 to ImageBitmap or HTMLImageElement for imagehash-web
    const frameImg = new Image();
    frameImg.src = `data:image/jpeg;base64,${frameBase64}`;
    await new Promise(r => { frameImg.onload = r; });

    const refImg = new Image();
    refImg.src = `data:image/jpeg;base64,${referenceAsset.base64}`;
    await new Promise(r => { refImg.onload = r; });

    // Calculate pHash (8 bits)
    const frameHash = await phash(frameImg, 8);
    const refHash = await phash(refImg, 8);
    
    // Calculate Hamming Distance using the ImageHash object's method
    // Note: The library returns an ImageHash object which has a .hammingDistance() method
    const distance = frameHash.hammingDistance(refHash);
    
    // Normalize: max distance for 64-bit hash (8*8) is 64
    return 1 - (distance / 64);
  } catch (e) {
    console.error("Hash calculation failed:", e);
    return 0; 
  }
};

export const runRefinementPhase = async (
  draftVideo: VideoArtifact,
  plan: DirectorPlan,
  assets: AssetItem[]
): Promise<VideoArtifact> => {
  console.log('[Refining] Starting analysis...');
  
  // 1. Extract Keyframes
  const keyframes = await extractKeyframes(draftVideo.blob);
  if (keyframes.length === 0) throw new Error("Failed to extract keyframes");
  
  // 2. Consistency Check (Score against Character Bible)
  const characterAsset = assets.find(a => a.type === 'character') || assets[0];
  const scores = await Promise.all(keyframes.map(k => 
    calculateConsistency(k, characterAsset)
  ));
  
  console.log('[Refining] Consistency Scores:', scores);
  
  // 3. Select Best Frame
  const bestIndex = scores.indexOf(Math.max(...scores));
  const bestKeyframeBase64 = keyframes[bestIndex];
  const bestScore = scores[bestIndex];
  
  console.log(`[Refining] Selected frame ${bestIndex} with score ${bestScore.toFixed(2)}`);
  
  const bestFrameBlob = base64ToBlob(bestKeyframeBase64, 'image/jpeg');
  
  // 4. Upscale (Gemini Vision)
  const upscaledBlob = await runRefinerAgent(bestFrameBlob, plan);
  const upscaledBase64 = await blobToBase64(upscaledBlob);
  
  // 5. Master Render (Veo)
  const finalVideo = await runMasteringAgent(plan, upscaledBlob);
  
  return {
    ...finalVideo,
    keyframes,
    consistencyScore: bestScore,
    selectedKeyframe: upscaledBase64 // Store the upscaled version as the reference
  };
};

/**
 * Extracts a frame from a video Blob at a specific timestamp.
 */
export const extractFrameFromBlob = async (videoBlob: Blob, timeOffset: number = 0): Promise<Blob> => {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    const url = URL.createObjectURL(videoBlob);

    video.src = url;
    video.muted = true;
    video.playsInline = true;
    video.crossOrigin = 'anonymous'; // Important if blob is from external, though here it's local

    const cleanup = () => {
      URL.revokeObjectURL(url);
      video.remove();
    };

    video.onloadedmetadata = () => {
      video.currentTime = timeOffset;
    };

    video.onseeked = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Could not get 2D context');

        ctx.drawImage(video, 0, 0);

        canvas.toBlob((blob) => {
          cleanup();
          if (blob) resolve(blob);
          else reject(new Error('Canvas to Blob failed'));
        }, 'image/jpeg', 0.95);
      } catch (e) {
        cleanup();
        reject(e);
      }
    };

    video.onerror = (e) => {
      cleanup();
      reject(new Error(`Video load error: ${e}`));
    };
  });
};

// --- AGENTS ---

/**
 * DIRECTOR AGENT (Gemini 3 Pro)
 * Deconstructs the user prompt into a production plan.
 */
export const runDirectorAgent = async (userPrompt: string): Promise<DirectorPlan> => {
  console.log('[Director] Planning production...');

  const schema: Schema = {
    type: Type.OBJECT,
    properties: {
      subject_prompt: { type: Type.STRING, description: "Detailed visual description of the main character or subject. This will be used as a reference." },
      environment_prompt: { type: Type.STRING, description: "Detailed visual description of the background and atmosphere." },
      visual_style: { type: Type.STRING, description: "Cinematic style, lighting, and camera lens details (e.g., 'shot on 35mm film, volumetric lighting')." },
      shots: {
        type: Type.ARRAY,
        description: "A sequence of 3 distinct shots that tell the story.",
        items: {
          type: Type.OBJECT,
          properties: {
            id: { type: Type.STRING },
            order: { type: Type.NUMBER },
            prompt: { type: Type.STRING, description: "Action occurring in this specific shot." },
            camera_movement: { type: Type.STRING, description: "Specific camera instructions (e.g., 'Slow zoom in', 'Pan left to right', 'Low angle static')." },
            duration_seconds: { type: Type.NUMBER, description: "Each shot must be 5 seconds." }

          },
          required: ["id", "order", "prompt", "camera_movement", "duration_seconds"]
        }
      },
      reasoning: { type: Type.STRING, description: "Brief explanation of the shot sequence and creative flow." }
    },
    required: ["subject_prompt", "environment_prompt", "visual_style", "shots", "reasoning"]
  };

    await waitForQuota('TEXT_GEN'); // Director uses Gemini 3 Pro (Text)
    const response = await ai.models.generateContent({
    model: 'gemini-3-pro-preview',
    contents: `You are an expert Film Director and Cinematographer.
               Your task is to break down this user narrative into a 3-shot "Dailies" sequence for Veo 3.1 video generation.
               User Prompt: "${userPrompt}"
               
               *** CRITICAL: VEO 3.1 PROMPTING STANDARDS ***
               You must generate HIGH-FIDELITY prompts using the specific 5-PART FORMULA:
               [1. Cinematography] + [2. Subject] + [3. Action] + [4. Context] + [5. Style & Ambiance]

               GUIDELINES:
               1. **Cinematography:** Specify Shot Type (Wide, Medium, Close-up), Camera Angle (Eye-level, Low-angle, High-angle, Bird's-eye, Dutch angle), and Movement (Pan, Tilt, Dolly, Truck, Crane, Handheld, Arc, Static). Use "Lens Effects" if needed (Shallow depth of field, Rack focus, Fisheye).
               2. **Subject Consistency:** Use the EXACT SAME detailed physical description for the main character in EVERY shot to prevent identity drift.
               3. **Audio:** Veo 3.1 generates audio. Include specific audio cues (Dialogue, SFX, Ambient) in the prompt.
                  - Dialogue Format: "Character says: Dialogue" (Use COLON, not quotes, to prevent subtitles).
                  - SFX Format: "SFX: thunder cracks."
               4. **Lighting & Style:** Define the lighting (e.g., "Cinematic lighting, volumetric fog, teal and orange palette").
               5. **Structure:** The environment must remain consistent (same location) but viewed from different angles.
               6. **Duration:** Each shot is exactly 5 seconds. Focus on ONE main action per shot.
               7. **Negative Prompts:** Implicitly avoid text/watermarks. Append "(no subtitles)" to end of prompt.
               `,
    config: {
      responseMimeType: 'application/json',
      responseSchema: schema,
      systemInstruction: `You are a Meta-Prompting Engine for Google Veo 3.1.
      
      Your goal is to output a JSON production plan where EACH 'prompt' field is a standalone, professional-grade video prompt following this formula:
      "[Camera Movement], [Shot Type]. [Subject Description]. [Action]. [Environment/Context]. [Lighting/Style]. [Audio Cues]. (no subtitles)"

      EXAMPLE PROMPT OUTPUT:
      "Low angle, slow dolly in. A weathered cyber-samurai with neon blue dreadlocks stands stoically. He slowly unsheathes a glowing katana. A grimy neon-lit alleyway in Neo-Tokyo. High contrast cyberpunk aesthetic. SFX: Rain hitting pavement. The samurai says: Honor is earned. (no subtitles)"

      CRITICAL:
      - The 'subject_prompt' field must be a reusable Character Bible entry.
      - The 'environment_prompt' field must be a reusable Location Bible entry.
      - In the 'shots' array, every 'prompt' MUST include the full subject description again.
      - **Dialogue Rule:** Use "Subject says: Words". DO NOT use quotation marks for dialogue.
      - **Action Rule:** Use a SINGLE, CONCRETE verb for the main action (e.g., "jumps", "runs"). Avoid sequential tasks.
      `
    }
  });

  const text = response.text;
  if (!text) throw new Error("Director returned empty plan");

  return JSON.parse(text) as DirectorPlan;
};


/**
 * ARTIST AGENT (Nano Banana Pro 3 — gemini-3-pro-image-preview)
 * Generates professional turnaround sheets for character & environment.
 * 
 * Character Sheet: 3 views (Front, 3/4 Side, Back) in a single composite image.
 * Environment Sheet: 3 angles (Wide establishing, Medium, Detail) in a single composite.
 * 
 * If user provides a reference photo, the model extrapolates from it.
 * If no upload, the model generates from the Director's text description.
 */

// Helper: extract base64 image from a Gemini response
const extractImageFromResponse = (response: any): string => {
  const parts = response.candidates?.[0]?.content?.parts || [];
  for (const part of parts) {
    if (part.inlineData && part.inlineData.data) {
      return part.inlineData.data;
    }
  }
  return '';
};

// Helper: convert base64 to Blob
const base64ToBlob = (base64: string, mimeType = 'image/png'): Blob => {
  const byteCharacters = atob(base64);
  const byteNumbers = new Array(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i);
  }
  return new Blob([new Uint8Array(byteNumbers)], { type: mimeType });
};

export const runArtistAgent = async (plan: DirectorPlan, userCharacter?: Blob, userEnvironment?: Blob): Promise<AssetItem[]> => {
  console.log('[Artist] Generating production bible with turnaround sheets...');

  const ARTIST_MODEL = 'gemini-3-pro-image-preview';
  const assets: AssetItem[] = [];

  // ─── CHARACTER TURNAROUND SHEET ───
  console.log('[Artist] Creating character turnaround sheet...');

  const charTurnaroundPrompt = `Professional character turnaround reference sheet for film production.
Create a SINGLE IMAGE containing exactly 3 side-by-side panels on a plain neutral grey background:
- LEFT panel: FRONT view of the character
- CENTER panel: 3/4 SIDE view of the character (turned slightly right)
- RIGHT panel: BACK view of the character

Character description: ${plan.subject_prompt}

CRITICAL RULES:
1. The character MUST be IDENTICAL across all 3 panels — same proportions, colors, markings, outfit, features.
2. Each panel should show a neutral standing/sitting pose appropriate to the character.
3. Clean, evenly lit, studio photography style. No dramatic shadows.
4. The 3 panels must be clearly separated and well-composed.
5. Style reference: ${plan.visual_style}`;

  let charResponse;
  if (userCharacter) {
    // Image-edit mode: extrapolate turnaround from user's reference photo
    const userCharBase64 = await blobToBase64(userCharacter);
    console.log('[Artist] User provided character reference — extrapolating 3-view sheet...');
    
    await waitForQuota('IMAGE_GEN');
    charResponse = await ai.models.generateContent({
      model: ARTIST_MODEL,
      contents: [
        { text: `Using this reference photo of the character, ${charTurnaroundPrompt}` },
        { inlineData: { mimeType: 'image/jpeg', data: userCharBase64 } }
      ],
      config: {
        responseModalities: ['TEXT', 'IMAGE'],
      }
    });
  } else {
    // Text-to-image mode: generate from Director's description
    console.log('[Artist] No user reference — generating character from description...');
    
    await waitForQuota('IMAGE_GEN');
    charResponse = await ai.models.generateContent({
      model: ARTIST_MODEL,
      contents: charTurnaroundPrompt,
      config: {
        responseModalities: ['TEXT', 'IMAGE'],
      }
    });
  }

  const charBase64 = extractImageFromResponse(charResponse);
  if (!charBase64) throw new Error('Artist failed to generate character turnaround sheet');

  const charBlob = base64ToBlob(charBase64);
  assets.push({
    id: crypto.randomUUID(),
    type: 'character',
    url: URL.createObjectURL(charBlob),
    blob: charBlob,
    base64: charBase64,
    source: userCharacter ? 'user' : 'ai'
  });
  console.log('[Artist] ✅ Character turnaround sheet ready.');

  // Safety buffer for API quota - redundantly handled by QuotaGuard but kept for clarity
  console.log('[Artist] Preparing next asset...');

  // ─── ENVIRONMENT REFERENCE SHEET ───
  console.log('[Artist] Creating environment reference sheet...');

  const envTurnaroundPrompt = `Professional location reference sheet for film production.
Create a SINGLE IMAGE containing exactly 3 side-by-side panels:
- LEFT panel: WIDE establishing shot of the location (full environment visible)
- CENTER panel: MEDIUM ground-level view (showing key features at eye level)
- RIGHT panel: DETAIL close-up (texture, materials, atmosphere details)

Location description: ${plan.environment_prompt}

CRITICAL RULES:
1. The location MUST be the SAME place across all 3 panels — same time of day, same weather, same lighting.
2. Each panel shows a different focal length/distance but the SAME environment.
3. Consistent color palette and atmosphere throughout.
4. Style reference: ${plan.visual_style}`;

  let envResponse;
  if (userEnvironment) {
    const userEnvBase64 = await blobToBase64(userEnvironment);
    console.log('[Artist] User provided environment reference — extrapolating reference sheet...');
    
    await waitForQuota('IMAGE_GEN');
    envResponse = await ai.models.generateContent({
      model: ARTIST_MODEL,
      contents: [
        { text: `Using this reference photo of the location, ${envTurnaroundPrompt}` },
        { inlineData: { mimeType: 'image/jpeg', data: userEnvBase64 } }
      ],
      config: {
        responseModalities: ['TEXT', 'IMAGE'],
      }
    });
  } else {
    console.log('[Artist] No user reference — generating environment from description...');
    
    await waitForQuota('IMAGE_GEN');
    envResponse = await ai.models.generateContent({
      model: ARTIST_MODEL,
      contents: envTurnaroundPrompt,
      config: {
        responseModalities: ['TEXT', 'IMAGE'],
      }
    });
  }

  const envBase64 = extractImageFromResponse(envResponse);
  if (!envBase64) throw new Error('Artist failed to generate environment reference sheet');

  const envBlob = base64ToBlob(envBase64);
  assets.push({
    id: crypto.randomUUID(),
    type: 'background',
    url: URL.createObjectURL(envBlob),
    blob: envBlob,
    base64: envBase64,
    source: userEnvironment ? 'user' : 'ai'
  });
  console.log('[Artist] ✅ Environment reference sheet ready.');

  console.log(`[Artist] Production bible complete: ${assets.length} turnaround sheets.`);
  return assets;
};

/**
 * ENGINEER AGENT - PHASE 1: DRAFT (Veo 3.1 Fast)
 * Generates the motion for a SPECIFIC SHOT using the shared assets.
 * Now accepts optional human feedback to guide regeneration.
 */
export const runShotDraftingAgent = async (
  shot: ShotParams, 
  plan: DirectorPlan, 
  assets: AssetItem[], 
  feedback?: string
): Promise<VideoArtifact> => {
  console.log(`[Engineer] Drafting shot ${shot.order}...${feedback ? ' (with feedback)' : ''}`);

  const references: VideoGenerationReferenceImage[] = [];

  for (const asset of assets) {
    if (!asset.base64) {
      asset.base64 = await blobToBase64(asset.blob);
    }
    references.push({
      image: {
        imageBytes: asset.base64,
        mimeType: 'image/png'
      },
      // Use ASSET for character to keep consistency, STYLE for BG to allow camera movement
      referenceType: asset.type === 'character'
        ? VideoGenerationReferenceType.ASSET
        : VideoGenerationReferenceType.STYLE
    });
  }

  let finalPrompt = `${shot.prompt}. Camera: ${shot.camera_movement}.`;
  
  // If the Director agent followed instructions, shot.prompt already contains subject/env details.
  // But to be safe and enforce the 5-part formula, we can reconstruct it if needed.
  // Ideally, the Director output is already perfect. 
  // Let's prepend the "style" from the plan just in case it wasn't fully captured, 
  // but avoid duplication if the prompt is already long.
  
  if (!finalPrompt.includes(plan.visual_style)) {
    finalPrompt += ` Style: ${plan.visual_style}.`;
  }

  // Append Negative Prompt Guardrails (implicitly or explicitly if supported)
  // For Veo 3.1, a strong positive prompt is best, but we can add exclusions if the model supports it.
  // Currently, we append it to the positive prompt with "Avoid:" or just describe high quality.
  // The guide suggests using "negative terms" in a separate field if possible, or ensuring the positive prompt is specific enough.
  // We'll append a standard quality assurance suffix.
  finalPrompt += " High quality, 4k, photorealistic, clear focus. (no subtitles)";

  if (feedback) {
    finalPrompt = `CRITICAL DIRECTOR NOTE: ${feedback}. ${finalPrompt}`;
  }
  
  console.log(`[Engineer] Shot ${shot.order} Prompt: ${finalPrompt}`);

// Retry loop for transient errors
  let lastError;
  const maxAttempts = 5;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      if (attempt > 1) {
        const delay = getRetryDelay(attempt);
        console.log(`[Engineer] Retry ${attempt}/${maxAttempts}: waiting ${Math.ceil(delay/1000)}s (with jitter)...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }

      await waitForQuota('VIDEO_GEN');
      
      let operation = await ai.models.generateVideos({
        model: 'veo-3.1-fast-generate-preview',
        prompt: finalPrompt,
        config: {
          numberOfVideos: 1,
          resolution: '720p',
          aspectRatio: '16:9',
          referenceImages: references
        }
      });

      // Poll for completion
      while (!operation.done) {
        await new Promise(resolve => setTimeout(resolve, 5000));
        operation = await ai.operations.getVideosOperation({ operation });
      }

      // Check for API-level errors in the operation object
      if (operation.error) {
        console.error(`[Engineer] Operation failed for shot ${shot.order}:`, operation.error);
        throw new Error(`API Error: ${operation.error.message || 'Unknown API error'}`);
      }

      const videoUri = operation.response?.generatedVideos?.[0]?.video?.uri;
      if (!videoUri) {
        console.error(`[Engineer] No video URI for shot ${shot.order}. Full op:`, JSON.stringify(operation, null, 2));
        throw new Error(`Generation completed but returned no video. Check safety filters or quota.`);
      }

      const res = await fetch(`${videoUri}&key=${process.env.API_KEY}`);
      if (!res.ok) throw new Error(`Failed to fetch video blob: ${res.statusText}`);
      const blob = await res.blob();

      return {
        url: URL.createObjectURL(blob),
        blob,
        uri: videoUri,
        shotId: shot.id
      };

    } catch (e: any) {
      console.warn(`[Engineer] Attempt ${attempt} failed for shot ${shot.order}:`, e);
      lastError = e;
      // If we hit a 429, we explicitly wait even longer in the next iteration's start
    }
  }

  throw new Error(`Failed to generate shot ${shot.order} after ${maxAttempts} attempts. The API quota limit has been reached.`);
};

/**
 * PRODUCTION PIPELINE (Sequential)
 * Manages the sequential generation of the Dailies sequence.
 */
export const runProductionPipeline = async (plan: DirectorPlan, assets: AssetItem[]): Promise<VideoArtifact[]> => {
  console.log('[Production] Initializing serial generation with QuotaGuard active...');

  const results: VideoArtifact[] = [];

  for (const shot of plan.shots) {
    // Run sequentially
    try {
      const result = await runShotDraftingAgent(shot, plan, assets);
      results.push(result);
    } catch (e) {
      console.error(`[Production] Shot ${shot.order} failed even after retries:`, e);
      throw e;
    }
  }

  return results;
};


/**
 * ENGINEER AGENT - PHASE 2: REFINE (Gemini 3 Pro Vision)
 * Upscales a specific frame to be used as an anchor.
 */
export const runRefinerAgent = async (lowResBlob: Blob, plan: DirectorPlan): Promise<Blob> => {
  console.log('[Engineer] Refining anchor frame...');

  const lowResBase64 = await blobToBase64(lowResBlob);
  const actionPrompt = plan.shots?.[0]?.prompt || "Action occurring in the scene";

  // Use Gemini 3 Pro to Hallucinate details (Upscale)
  const response = await ai.models.generateContent({
    model: 'gemini-3-pro-image-preview',
    contents: {
      parts: [
        {
          text: `A high-resolution, 4k, photorealistic movie still. 
                 Subject: ${plan.subject_prompt}. 
                 Environment: ${plan.environment_prompt}. 
                 Action: ${actionPrompt}.
                 Style: ${plan.visual_style}.
                 Strictly maintain the composition and pose of the reference image, but enhance textures, lighting, and details.`
        },

        {
          inlineData: {
            mimeType: 'image/jpeg',
            data: lowResBase64
          }
        }
      ]
    },
    config: {
      // We let the model decide parameters for optimal image gen
    }
  });

  // Extract the high-res image
  let highResBase64 = '';
  // Check candidates for image
  for (const part of response.candidates?.[0]?.content?.parts || []) {
    if (part.inlineData) {
      highResBase64 = part.inlineData.data;
      break;
    }
  }

  if (!highResBase64) throw new Error("Refiner failed to generate high-res frame");

  const byteCharacters = atob(highResBase64);
  const byteNumbers = new Array(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i);
  }
  const byteArray = new Uint8Array(byteNumbers);

  return new Blob([byteArray], { type: 'image/png' });
};

/**
 * ENGINEER AGENT - PHASE 3: MASTER (Veo 3.1)
 * Renders final video using the Anchor Frame.
 */
export const runMasteringAgent = async (plan: DirectorPlan, anchorFrameBlob: Blob): Promise<VideoArtifact> => {
  console.log('[Engineer] Rendering final master...');

  const anchorBase64 = await blobToBase64(anchorFrameBlob);
  const actionPrompt = plan.shots?.[0]?.prompt || "Action occurring in the scene";

  let operation = await ai.models.generateVideos({
    model: 'veo-3.1-generate-preview', // High quality model
    prompt: `${actionPrompt}. ${plan.visual_style}. High Fidelity.`,

    config: {
      numberOfVideos: 1,
      resolution: '1080p',
      aspectRatio: '16:9',
      referenceImages: [
        {
          image: {
            imageBytes: anchorBase64,
            mimeType: 'image/png'
          },
          // Using ASSET here locks the visual fidelity strongly to our upscaled frame
          referenceType: VideoGenerationReferenceType.ASSET
        }
      ]
    }
  });

  while (!operation.done) {
    await new Promise(resolve => setTimeout(resolve, 8000)); // Slower polling for HQ
    operation = await ai.operations.getVideosOperation({ operation });
  }

  const videoUri = operation.response?.generatedVideos?.[0]?.video?.uri;
  if (!videoUri) throw new Error("Master generation failed");

  const res = await fetch(`${videoUri}&key=${process.env.API_KEY}`);
  const blob = await res.blob();

  return {
    url: URL.createObjectURL(blob),
    blob,
    uri: videoUri
  };
};
