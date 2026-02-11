
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { GoogleGenAI, Type, Schema, VideoGenerationReferenceImage, VideoGenerationReferenceType } from '@google/genai';
import { AssetItem, DirectorPlan, ShotParams, Resolution, VideoArtifact } from '../types';


// Initialize AI (API key handled by env)
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

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

  const response = await ai.models.generateContent({
    model: 'gemini-3-pro-preview',
    contents: `You are a visionary film director and cinematographer. 
               Your task is to break down this narrative into a 3-shot "Dailies" sequence: "${userPrompt}".
               
               Guidelines:
               1. Character/Subject must be consistent across all shots.
               2. The Environment should remain stable but can be seen from different angles.
               3. Vary the camera angles (e.g., Wide, Medium, Close-up) to make the sequence dynamic.
               4. Each shot must be exactly 5 seconds.
               `,
    config: {
      responseMimeType: 'application/json',
      responseSchema: schema,
      systemInstruction: "You are an expert filmmaker. Create a JSON production plan. CRITICAL: 1. Ensure the 'subject_prompt' and 'environment_prompt' are DETAILED. 2. In each 'shot', describe the action clearly. 3. Ensure the sequence appears to be shot in the EXACT SAME location with the EXACT SAME characters."
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

  // Safety buffer for API quota
  console.log('[Artist] Cooling down for 10s before next asset...');
  await new Promise(resolve => setTimeout(resolve, 10000));

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
 */
export const runShotDraftingAgent = async (shot: ShotParams, plan: DirectorPlan, assets: AssetItem[]): Promise<VideoArtifact> => {
  console.log(`[Engineer] Drafting shot ${shot.order}...`);

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

  const finalPrompt = `Subject: ${plan.subject_prompt}. Environment: ${plan.environment_prompt}. Action: ${shot.prompt}. Camera: ${shot.camera_movement}. Style: ${plan.visual_style}`;
  console.log(`[Engineer] Shot ${shot.order} Prompt: ${finalPrompt}`);

// Retry loop for transient errors
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      if (attempt > 1) {
        const backoff = attempt * 20000;
        console.log(`[Engineer] Quota cooldown: waiting ${backoff / 1000}s before retry...`);
        await new Promise(resolve => setTimeout(resolve, backoff));
      }

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
    }
  }

  throw new Error(`Failed to generate shot ${shot.order} after 3 attempts. Last error: ${lastError?.message}`);
};

/**
 * PRODUCTION PIPELINE (Sequential)
 * Manages the sequential generation of the Dailies sequence.
 */
export const runProductionPipeline = async (plan: DirectorPlan, assets: AssetItem[]): Promise<VideoArtifact[]> => {
  console.log('[Production] Cooling down for 15s before starting cameras (Pre-Production)...');
  await new Promise(resolve => setTimeout(resolve, 15000));

  console.log('[Production] Starting SERIAL generation of 3 shots (to respect quota)...');

  const results: VideoArtifact[] = [];

  for (const shot of plan.shots) {
    // Run sequentially
    try {
      const result = await runShotDraftingAgent(shot, plan, assets);
      results.push(result);
    } catch (e) {
      console.error(`[Production] Shot ${shot.order} failed even after retries:`, e);
      // In production, we might want to return a placeholder or partial result, 
      // but for now let's rethrow so the UI shows the error.
      throw e;
    }

    // Safety buffer between shots
    if (shot.order < plan.shots.length) {
      console.log('[Production] Cooling down for 20s before next shot...');
      await new Promise(resolve => setTimeout(resolve, 20000));
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
