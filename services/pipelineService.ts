/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { Type, Schema, VideoGenerationReferenceImage, VideoGenerationReferenceType } from '@google/genai';
import { aiService } from './aiService';
import { AssetItem, DirectorPlan, SceneParams, ShotParams, VideoArtifact } from '../types';

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
// Safely handle imagehash-web imports which can be flaky in ESM/Vite
const getHashes = () => {
  const lib = imagehash as any;
  if (Array.isArray(lib)) return lib;
  if (lib?.default && Array.isArray(lib.default)) return lib.default;
  
  // Fallback to window globals if the module system failed us (common in some WSL/Vite setups)
  if (typeof window !== 'undefined' && (window as any).ahash) {
    return [
      (window as any).ahash,
      (window as any).dhash,
      (window as any).phash,
      (window as any).whash,
      (window as any).cropResistantHash,
      (window as any).ImageHash
    ];
  }
  
  // Last resort: mock-like empty functions to prevent top-level crash
  const noop = () => ({ hammingDistance: () => 0 });
  return [noop, noop, noop, noop, noop, { fromHexString: () => null }];
};

const [ahash, dhash, phash, whash, cropResistantHash, ImageHash] = getHashes();

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
  console.log('[Refining] Starting analysis (Dual-Frame)...');
  
  // 1. Extract Keyframes
  const keyframes = await extractKeyframes(draftVideo.blob);
  if (keyframes.length < 3) throw new Error("Failed to extract keyframes (need at least 3 for start/end selection)");
  
  // 2. Select Start and End frames
  // keyframes[0] is start (0.1s), keyframes[2] is end (duration-0.2s)
  const startFrameBase64 = keyframes[0];
  const endFrameBase64 = keyframes[2]; 
  
  const startFrameBlob = base64ToBlob(startFrameBase64, 'image/jpeg');
  const endFrameBlob = base64ToBlob(endFrameBase64, 'image/jpeg');
  
  // Determine prompt for this shot
  const scene = plan.scenes?.find(s => s.id === draftVideo.shotId);
  const shot = plan.shots?.find(s => s.id === draftVideo.shotId);
  const prompt = scene?.master_prompt || shot?.prompt || plan.shots?.[0]?.prompt || "Action occurring in the scene";

  // 3. Upscale BOTH (Gemini Vision) in Parallel
  console.log('[Refining] Upscaling start and end frames...');
  const [startUpscaledBlob, endUpscaledBlob] = await Promise.all([
    runRefinerAgent(startFrameBlob, plan, prompt),
    runRefinerAgent(endFrameBlob, plan, prompt)
  ]);
  
  const startUpscaledBase64 = await blobToBase64(startUpscaledBlob);
  const endUpscaledBase64 = await blobToBase64(endUpscaledBlob);
  
  // 4. Master Render (Veo) - Dual Frame
  const finalVideo = await runMasteringAgent(plan, startUpscaledBlob, endUpscaledBlob, prompt);
  
  return {
    ...finalVideo,
    keyframes,
    // Store dual anchors
    anchorFrames: {
      start: {
        original: startFrameBase64,
        upscaled: startUpscaledBase64
      },
      end: {
        original: endFrameBase64,
        upscaled: endUpscaledBase64
      }
    }
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

/**
 * Strips EXIF/Metadata from an image by redrawing it to a Canvas.
 */
export const stripImageMetadata = async (blob: Blob): Promise<Blob> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(blob);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Could not get canvas context'));
        return;
      }
      ctx.drawImage(img, 0, 0);
      canvas.toBlob((newBlob) => {
        if (newBlob) resolve(newBlob);
        else reject(new Error('Canvas toBlob failed'));
      }, 'image/jpeg', 0.9);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image for metadata stripping'));
    };
    img.src = url;
  });
};

/**
 * Sanitizes a prompt by replacing restricted brand/IP terms with generic alternatives.
 */
export const sanitizePrompt = (prompt: string): string => {
  const replacements: Record<string, string> = {
    'Nike': 'Athletic',
    'Lego': 'Plastic bricks',
    'Cyberpunk': 'Neon-lit futuristic',
    'Superhero': 'Heroic figure',
    'Disney': 'Animated cinematic',
    'Pixar': '3D animated',
    'Marvel': 'Heroic comic book',
    'Star Wars': 'Space opera',
    'Harry Potter': 'Wizarding fantasy',
    'Coca-Cola': 'Soda',
    'Apple': 'Tech brand',
    'iPhone': 'Smartphone'
  };

  let sanitized = prompt;
  for (const [restricted, replacement] of Object.entries(replacements)) {
    const regex = new RegExp(`\\b${restricted}\\b`, 'gi');
    sanitized = sanitized.replace(regex, replacement);
  }
  
  return sanitized;
};

// --- AGENTS ---

/**
 * DIRECTOR AGENT (Gemini 3 Pro)
 * Deconstructs the user prompt into a production plan.
 * Now optionally takes character/environment images to ensure visual consistency.
 */
export const runDirectorAgent = async (
  userPrompt: string, 
  characterImage?: Blob, 
  environmentImage?: Blob
): Promise<DirectorPlan> => {
  console.log('[Director] Planning production...');

  let visualContext = "";
  
  // If images are provided, we first get a visual description to anchor the plan
  if (characterImage || environmentImage) {
    console.log('[Director] Analyzing visual context from provided images...');
    const parts: any[] = [{ text: "Describe the subject and environment in these images for a video production plan. Focus on visual details that must remain consistent." }];
    
    if (characterImage) {
      parts.push({
        inlineData: {
          mimeType: 'image/png',
          data: await blobToBase64(characterImage)
        }
      });
    }
    
    if (environmentImage) {
      parts.push({
        inlineData: {
          mimeType: 'image/png',
          data: await blobToBase64(environmentImage)
        }
      });
    }

    try {
      const visualAnalysis = await aiService.client.models.generateContent({
        model: 'gemini-3-pro-image-preview',
        contents: { parts }
      });
      visualContext = visualAnalysis.candidates?.[0]?.content?.parts?.[0]?.text || "";
      console.log('[Director] Visual analysis complete.');
    } catch (e) {
      console.warn('[Director] Visual analysis failed, falling back to text only:', e);
    }
  }

  const schema: Schema = {
    type: Type.OBJECT,
    properties: {
      subject_prompt: { type: Type.STRING, description: "Detailed visual description of the main character or subject. This will be used as a reference." },
      environment_prompt: { type: Type.STRING, description: "Detailed visual description of the background and atmosphere." },
      visual_style: { type: Type.STRING, description: "Cinematic style, lighting, and camera lens details (e.g., 'shot on 35mm film, volumetric lighting')." },
      scenes: {
        type: Type.ARRAY,
        description: "Variable number of scenes (1-N) that tell the story. Each scene is max 8 seconds and can contain multiple timestamped segments.",
        items: {
          type: Type.OBJECT,
          properties: {
            id: { type: Type.STRING },
            order: { type: Type.NUMBER },
            duration_seconds: { type: Type.NUMBER, description: "Total duration of this scene (1-8 seconds). YOU decide based on narrative pacing." },
            segments: {
              type: Type.ARRAY,
              description: "Internal cuts within this scene using timestamp format [MM:SS-MM:SS]",
              items: {
                type: Type.OBJECT,
                properties: {
                  start_time: { type: Type.STRING, description: "Start timestamp (e.g., '00:00')" },
                  end_time: { type: Type.STRING, description: "End timestamp (e.g., '00:04')" },
                  prompt: { type: Type.STRING, description: "What happens in this segment" },
                  camera_movement: { type: Type.STRING, description: "Camera instruction for this segment" }
                },
                required: ["start_time", "end_time", "prompt", "camera_movement"]
              }
            },
            master_prompt: { type: Type.STRING, description: "Combined prompt with timestamps for Veo 3.1. Format: [00:00-00:04] Shot description. [00:04-00:08] Next shot description." },
            transition: {
              type: Type.OBJECT,
              description: "Transition effect to next shot (null for last scene). Use ONLY if this is NOT the last scene.",
              properties: {
                type: { type: Type.STRING, description: "FFmpeg xfade type. Choose from: 'fade', 'fadeblack', 'dissolve', 'pixelize', 'wipeh', 'wiped'. Default: 'fade'." },
                duration: { type: Type.NUMBER, description: "Transition duration in seconds (0.2-1.5 recommended). Shorter = punchy, Longer = smooth." }
              },
              required: ["type", "duration"]
            }
          },
          required: ["id", "order", "duration_seconds", "segments", "master_prompt"]
        }
      },
      reasoning: { type: Type.STRING, description: "Brief explanation of why you chose this scene structure, pacing, and shot count to best serve the user's requirements." }
    },
    required: ["subject_prompt", "environment_prompt", "visual_style", "scenes", "reasoning"]
  };

    await waitForQuota('TEXT_GEN'); // Director uses Gemini 3 Pro (Text)
    const response = await aiService.client.models.generateContent({
    model: 'gemini-3-pro-preview',
    contents: `You are an expert Film Director and Cinematographer with complete creative control.
               Analyze the user's requirements and break down the narrative into a DYNAMIC scene structure for Veo 3.1 video generation.
               
               User Prompt: "${userPrompt}"
               ${visualContext ? `Visual Context from uploaded images: "${visualContext}"` : ""}
               
               *** CRITICAL: DYNAMIC DIRECTOR MODE ***
               You have full authority to decide:
               - How many scenes (1 to N) based on narrative complexity
               - Duration of each scene (1-8 seconds, YOU decide what serves the story best)
               - Internal cuts within each scene using timestamp format
               - Pacing: rapid cuts for action, long takes for drama

               VEO 3.1 CAPABILITIES:
               - Max 8 seconds per generation (scene)
               - Timestamp prompting: [MM:SS-MM:SS] format for internal cuts
               - Native audio generation (dialogue, SFX, music)

               GUIDELINES:
               1. **Scene Planning:** Break complex narratives into multiple scenes. Each scene = one API call.
                  - Simple/commercial: 1-2 scenes
                  - Narrative/dialogue: 2-4 scenes
                  - Complex/action: 4+ scenes as needed
               
               2. **Timestamp Format:** Use [00:00-00:XX] format for internal segments:
                  Example: "[00:00-00:02] Wide establishing shot. [00:02-00:05] Medium shot reaction. [00:05-00:08] Close up emotional climax."
               
               3. **Pacing Control:** YOU decide the rhythm:
                  - Fast-paced action: Short scenes (3-4s) with quick cuts
                  - Emotional drama: Longer scenes (6-8s) with slow transitions
                  - Dialogue scenes: Match cuts to conversation beats
               
               4. **Cinematography:** Specify Shot Type, Camera Angle, Movement, Lens Effects in each segment.
               
               5. **Subject Consistency:** Use EXACT SAME character description across all segments.
               
               6. **Audio Direction:** Include Dialogue, SFX, Ambient cues in prompts.
                  - Dialogue: "Character says: Dialogue text" (use COLON, not quotes)
                  - SFX: "SFX: description"
               
               7. **Duration Flexibility:** Each scene is 1-8 seconds. Choose what serves the narrative:
                  - Punchy commercial: 3-4 seconds
                  - Cinematic moment: 6-8 seconds
               
                8. **Segment Continuity:** Ensure timestamps flow continuously [00:00-00:03] -> [00:03-00:06] -> [00:06-00:08]
               
               9. **Safety & IP:** DO NOT use brand names (Nike, Apple), specific IP (Disney, Marvel, Star Wars), or artist names. Use generic descriptive terms instead.
               `,
    config: {

      responseMimeType: 'application/json',
      responseSchema: schema,
      systemInstruction: `You are a Meta-Prompting Engine for Google Veo 3.1 - DYNAMIC DIRECTOR MODE.
      
      Your goal is to analyze user requirements and output a JSON production plan with FLEXIBLE scene structure.
      
      SCHEMA STRUCTURE:
      {
        "subject_prompt": "Character bible entry",
        "environment_prompt": "Location bible entry", 
        "visual_style": "Cinematic style description",
        "scenes": [
          {
            "id": "scene-1",
            "order": 1,
            "duration_seconds": 6,
            "segments": [
              {"start_time": "00:00", "end_time": "00:03", "prompt": "Wide shot establishing", "camera_movement": "Static wide"},
              {"start_time": "00:03", "end_time": "00:06", "prompt": "Hero reaction close up", "camera_movement": "Push in"}
            ],
             "master_prompt": "[00:00-00:03] Static wide shot, cyberpunk city street at night, neon signs reflecting on wet pavement. [00:03-00:06] Push in close up on hero's face, neon reflection in eyes, determined expression. SFX: Distant thunder, rain ambience.",
             "transition": {"type": "fade", "duration": 0.5}
           },
           {
             "id": "scene-2",
             "order": 2,
             "duration_seconds": 4,
             "segments": [
               {"start_time": "00:00", "end_time": "00:04", "prompt": "Close up emotional climax", "camera_movement": "Slow zoom out"}
             ],
             "master_prompt": "[00:00-00:04] Hero smiles as camera slowly zooms out, revealing triumphant pose under neon lights. SFX: triumphant orchestral swell. (no subtitles)"
             // NOTE: No "transition" field for last scene
           }
         ],
        "reasoning": "Why this structure serves the narrative"
      }

      DYNAMIC DECISION FRAMEWORK:
      1. Analyze narrative complexity
         - Simple product shot → 1 scene, 3-4 seconds
         - Character introduction → 1 scene, 5-6 seconds  
         - Dialogue exchange → 2 scenes (reverse angles)
         - Action sequence → 3-4 scenes, varied pacing
         - Complex story → 4+ scenes as needed

      2. Determine scene duration (1-8 seconds)
         - Commercial/urgent: 3-4 seconds
         - Cinematic/atmospheric: 6-8 seconds
         - Match duration to emotional beat

      3. Plan internal cuts using timestamps
         - Ensure continuous flow: [00:00-00:02] → [00:02-00:05] → [00:05-00:08]
         - Vary shot sizes: Wide → Medium → Close up
         - Match camera movement to action

      MASTER_PROMPT FORMAT:
      Combine all segments into a single string with timestamps:
      "[MM:SS-MM:SS] Cinematography. Subject. Action. Context. Style. Audio. (no subtitles)"

      CRITICAL RULES:
       - 'subject_prompt' and 'environment_prompt' must be reusable bible entries
       - Each segment's prompt MUST include full subject description
       - Timestamps must be continuous (no gaps)
       - Total duration per scene: 1-8 seconds (YOU decide)
       - Dialogue format: "Character says: Words" (use COLON, no quotes)
       - Include audio cues in every segment description
       - Append "(no subtitles)" to end of master_prompt
       - TRANSITION RULES:
         * Add "transition" field ONLY for scenes that are NOT the last one
         * Last scene: never include "transition" field
         * Choose transition type based on pacing:
           - Quick cuts/Action: 'fade' duration 0.3-0.5
           - Emotional/Drama: 'fadeblack' duration 0.8-1.5
           - Standard continuity: 'fade' duration 0.5 (default)
          * Available types: 'fade', 'fadeblack', 'dissolve', 'pixelize', 'wipeh', 'wiped'
       
       10. **IP Neutrality:** Ensure 'visual_style' and all prompts are free of brand names or specific studio styles (e.g., no "Disney-style", "Pixar-style", or "Lego-style"). Use descriptive lighting and texture terms instead.
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
    charResponse = await aiService.client.models.generateContent({
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
    charResponse = await aiService.client.models.generateContent({
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

  // Also include original user reference for maximum fidelity in video gen
  if (userCharacter) {
    assets.push({
      id: `orig-char-${crypto.randomUUID()}`,
      type: 'character',
      url: URL.createObjectURL(userCharacter),
      blob: userCharacter,
      source: 'user'
    });
  }

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
    envResponse = await aiService.client.models.generateContent({
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
    envResponse = await aiService.client.models.generateContent({
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

  // Also include original user reference for maximum fidelity in video gen
  if (userEnvironment) {
    assets.push({
      id: `orig-env-${crypto.randomUUID()}`,
      type: 'background',
      url: URL.createObjectURL(userEnvironment),
      blob: userEnvironment,
      source: 'user'
    });
  }

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
  
  // Enforce Veo 3.1 limit: Max 3 reference images
  const finalReferences = references.length > 0 ? references.slice(0, 3) : undefined;
  if (references.length > 3) {
    console.log(`[Engineer] Shot ${shot.order}: ⚠️ TRUNCATING ${references.length} references to 3 to meet API limits. (Fix Applied)`);
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

      // STRATEGY: Progressive safety fallbacks
      let currentReferences: VideoGenerationReferenceImage[] | undefined = finalReferences;
      let currentPrompt = finalPrompt;
      const isSafetyError = lastError?.message?.includes('Safety Filter') || lastError?.message?.includes('guardrails') || lastError?.message?.includes('RAI');
      
      if (attempt === 2 && isSafetyError) {
        console.warn(`[Engineer] Retry ${attempt}: ⚠️ Safety Filter triggered. Stripping metadata from references.`);
        if (finalReferences) {
          currentReferences = await Promise.all(finalReferences.map(async (ref) => ({
            ...ref,
            image: {
              ...ref.image,
              imageBytes: await blobToBase64(await stripImageMetadata(base64ToBlob(ref.image.imageBytes as string)))
            }
          })));
        }
      } else if (attempt === 3 && isSafetyError) {
        console.warn(`[Engineer] Retry ${attempt}: ⚠️ Persistent Safety Filter. Sanitizing prompt.`);
        currentPrompt = sanitizePrompt(finalPrompt);
      } else if (attempt === 4 && isSafetyError) {
        console.warn(`[Engineer] Retry ${attempt}: ⚠️ Dropping user references, keeping AI assets.`);
        const aiRefs = references.filter(r => {
          // Find the asset in the original assets list to check source
          const asset = assets.find(a => a.base64 === (r.image.imageBytes as string));
          return asset?.source === 'ai';
        });
        currentReferences = aiRefs.length > 0 ? aiRefs : undefined;
      } else if (attempt >= 5) {
        console.warn(`[Engineer] Retry ${attempt}: ⚠️ Dropping ALL references to recover.`);
        currentReferences = undefined;
      }

      // Veo 3.1 Fast Reference Image mode requires > 1 image. 
      // If we have exactly 1, duplicate it as STYLE to satisfy the constraint.
      if (currentReferences && currentReferences.length === 1) {
        console.log(`[Engineer] Shot ${shot.order}: Duplicating single reference to satisfy API constraint (>1).`);
        currentReferences = [
          currentReferences[0],
          { ...currentReferences[0], referenceType: VideoGenerationReferenceType.STYLE }
        ];
      }

      await waitForQuota('VIDEO_GEN');
      
      let operation = await aiService.client.models.generateVideos({
        model: 'veo-3.1-fast-generate-preview',
        prompt: currentPrompt,
        config: {
          numberOfVideos: 1,
          resolution: '720p',
          aspectRatio: '16:9',
          ...(currentReferences ? { referenceImages: currentReferences } : {}),
          includeRaiReason: true
        } as any
      });

      // Poll for completion
      while (!operation.done) {
        await new Promise(resolve => setTimeout(resolve, 5000));
        operation = await aiService.client.operations.getVideosOperation({ operation });
      }

      // Check for RAI/Safety filtering in response
      if (operation.response?.raiMediaFilteredReasons?.length > 0) {
          const reason = operation.response.raiMediaFilteredReasons.join(', ');
          console.warn(`[Engineer] Shot ${shot.order}: Content filtered: ${reason}`);
          throw new Error(`Safety Filter: ${reason}`);
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

      const res = await fetch(`${videoUri}&key=${import.meta.env.VITE_GEMINI_API_KEY}`);
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
 * SCENE GENERATION AGENT
 * Generates a complete scene using timestamp prompting (1 API call, multiple internal cuts)
 */
export const runSceneGenerationAgent = async (
  scene: SceneParams,
  plan: DirectorPlan,
  assets: AssetItem[],
  feedback?: string
): Promise<VideoArtifact> => {
  console.log(`[Engineer] Generating Scene ${scene.order} (${scene.duration_seconds}s)...${feedback ? ' (with feedback)' : ''}`);

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
      referenceType: asset.type === 'character'
        ? VideoGenerationReferenceType.ASSET
        : VideoGenerationReferenceType.STYLE
    });
  }

  let finalPrompt = scene.master_prompt;
  
  if (feedback) {
    finalPrompt = `CRITICAL DIRECTOR NOTE: ${feedback}. ${finalPrompt}`;
  }
  
  // Enforce Veo 3.1 limit: Max 3 reference images
  const finalReferences = references.length > 0 ? references.slice(0, 3) : undefined;
  if (references.length > 3) {
    console.log(`[Engineer] Scene ${scene.order}: ⚠️ TRUNCATING ${references.length} references to 3 to meet API limits. (Fix Applied)`);
  }

  console.log(`[Engineer] Scene ${scene.order} Master Prompt: ${finalPrompt.substring(0, 100)}...`);

  // Retry loop for transient errors and safety fallbacks
  let lastError;
  const maxAttempts = 5;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      if (attempt > 1) {
        const delay = getRetryDelay(attempt);
        console.log(`[Engineer] Retry ${attempt}/${maxAttempts}: waiting ${Math.ceil(delay/1000)}s (with jitter)...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }

      // STRATEGY: Progressive safety fallbacks
      let currentReferences: VideoGenerationReferenceImage[] | undefined = finalReferences;
      let currentPrompt = finalPrompt;
      const isSafetyError = lastError?.message?.includes('Safety Filter') || lastError?.message?.includes('guardrails') || lastError?.message?.includes('RAI');
      
      if (attempt === 2 && isSafetyError) {
        console.warn(`[Engineer] Retry ${attempt}: ⚠️ Safety Filter triggered. Stripping metadata from references.`);
        if (finalReferences) {
          currentReferences = await Promise.all(finalReferences.map(async (ref) => ({
            ...ref,
            image: {
              ...ref.image,
              imageBytes: await blobToBase64(await stripImageMetadata(base64ToBlob(ref.image.imageBytes as string)))
            }
          })));
        }
      } else if (attempt === 3 && isSafetyError) {
        console.warn(`[Engineer] Retry ${attempt}: ⚠️ Persistent Safety Filter. Sanitizing prompt.`);
        currentPrompt = sanitizePrompt(finalPrompt);
      } else if (attempt === 4 && isSafetyError) {
        console.warn(`[Engineer] Retry ${attempt}: ⚠️ Dropping user references, keeping AI assets.`);
        const aiRefs = references.filter(r => {
          const asset = assets.find(a => a.base64 === (r.image.imageBytes as string));
          return asset?.source === 'ai';
        });
        currentReferences = aiRefs.length > 0 ? aiRefs : undefined;
      } else if (attempt >= 5) {
        console.warn(`[Engineer] Retry ${attempt}: ⚠️ Dropping ALL references to recover.`);
        currentReferences = undefined;
      }

      // Veo 3.1 Fast Reference Image mode requires > 1 image. 
      // If we have exactly 1, duplicate it as STYLE to satisfy the constraint.
      if (currentReferences && currentReferences.length === 1) {
        console.log(`[Engineer] Scene ${scene.order}: Duplicating single reference to satisfy API constraint (>1).`);
        currentReferences = [
          currentReferences[0],
          { ...currentReferences[0], referenceType: VideoGenerationReferenceType.STYLE }
        ];
      }

      await waitForQuota('VIDEO_GEN');
      
      let operation = await aiService.client.models.generateVideos({
        model: 'veo-3.1-fast-generate-preview',
        prompt: currentPrompt,
        config: {
          numberOfVideos: 1,
          resolution: '720p',
          aspectRatio: '16:9',
          ...(currentReferences ? { referenceImages: currentReferences } : {}),
          includeRaiReason: true
        } as any
      });

      // Poll for completion
      while (!operation.done) {
        await new Promise(resolve => setTimeout(resolve, 5000));
        operation = await aiService.client.operations.getVideosOperation({ operation });
      }

      // Check for RAI/Safety filtering in response
      if (operation.response?.raiMediaFilteredReasons?.length > 0) {
          const reason = operation.response.raiMediaFilteredReasons.join(', ');
          console.warn(`[Engineer] Scene ${scene.order}: Content filtered: ${reason}`);
          // Throw specific error to trigger safety fallback logic in next loop
          throw new Error(`Safety Filter: ${reason}`);
      }

      if (operation.error) {
        console.error(`[Engineer] Operation failed for scene ${scene.order}:`, operation.error);
        throw new Error(`API Error: ${operation.error.message || 'Unknown API error'}`);
      }

      const videoUri = operation.response?.generatedVideos?.[0]?.video?.uri;
      if (!videoUri) {
        // Double check for hidden safety reasons in the full object
        console.error(`[Engineer] No video URI for scene ${scene.order}. Full Response:`, JSON.stringify(operation, null, 2));
        throw new Error(`Generation completed but returned no video. Likely Safety Filter or Model Refusal.`);
      }

      const res = await fetch(`${videoUri}&key=${import.meta.env.VITE_GEMINI_API_KEY}`);
      if (!res.ok) throw new Error(`Failed to fetch video blob: ${res.statusText}`);
      const blob = await res.blob();

      return {
        url: URL.createObjectURL(blob),
        blob,
        uri: videoUri,
        shotId: scene.id // Using shotId field for backward compatibility
      };

    } catch (e: any) {
      console.warn(`[Engineer] Attempt ${attempt} failed for scene ${scene.order}:`, e);
      lastError = e;
    }
  }

  throw new Error(`Failed to generate scene ${scene.order} after ${maxAttempts} attempts.`);
};

/**
 * PRODUCTION PIPELINE (Sequential)
 * Manages the sequential generation of scenes.
 */
export const runProductionPipeline = async (plan: DirectorPlan, assets: AssetItem[]): Promise<VideoArtifact[]> => {
  console.log(`[Production] Initializing serial generation with ${plan.scenes.length} scenes...`);

  const results: VideoArtifact[] = [];

  for (const scene of plan.scenes) {
    try {
      const result = await runSceneGenerationAgent(scene, plan, assets);
      results.push(result);
    } catch (e) {
      console.error(`[Production] Scene ${scene.order} failed:`, e);
      throw e;
    }
  }

  return results;
};


/**
 * ENGINEER AGENT - PHASE 2: REFINE (Gemini 3 Pro Vision)
 * Upscales a specific frame to be used as an anchor.
 */
export const runRefinerAgent = async (lowResBlob: Blob, plan: DirectorPlan, specificPrompt?: string): Promise<Blob> => {
  console.log('[Engineer] Refining anchor frame...');

  const lowResBase64 = await blobToBase64(lowResBlob);
  const actionPrompt = specificPrompt || plan.shots?.[0]?.prompt || "Action occurring in the scene";

  // Use Gemini 3 Pro to Hallucinate details (Upscale)
  const response = await aiService.client.models.generateContent({
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
export const runMasteringAgent = async (plan: DirectorPlan, startAnchor: Blob, endAnchor: Blob, specificPrompt?: string): Promise<VideoArtifact> => {
  console.log('[Engineer] Rendering final master (Dual-Frame)...');

  const startBase64 = await blobToBase64(startAnchor);
  const endBase64 = await blobToBase64(endAnchor);
  const actionPrompt = specificPrompt || plan.shots?.[0]?.prompt || "Action occurring in the scene";

  // Use Veo 3.1 with Image-to-Video (Start + End frames)
  let operation = await aiService.client.models.generateVideos({
    model: 'veo-3.1-generate-preview', // High quality model
    prompt: `${actionPrompt}. ${plan.visual_style}. High Fidelity.`,
    
    // Start Frame
    image: {
      imageBytes: startBase64,
      mimeType: 'image/png'
    },

    config: {
      numberOfVideos: 1,
      resolution: '1080p',
      aspectRatio: '16:9',
      
      // End Frame
      lastFrame: {
        imageBytes: endBase64,
        mimeType: 'image/png'
      }
      // Note: referenceImages (Asset/Style) are mutually exclusive with image/lastFrame
    }
  });

  while (!operation.done) {
    await new Promise(resolve => setTimeout(resolve, 8000)); // Slower polling for HQ
    operation = await aiService.client.operations.getVideosOperation({ operation });
  }

  const videoUri = operation.response?.generatedVideos?.[0]?.video?.uri;
  if (!videoUri) throw new Error("Master generation failed");

  const res = await fetch(`${videoUri}&key=${import.meta.env.VITE_GEMINI_API_KEY}`);
  const blob = await res.blob();

  return {
    url: URL.createObjectURL(blob),
    blob,
    uri: videoUri
  };
};
