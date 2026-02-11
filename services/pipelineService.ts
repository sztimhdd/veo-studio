
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
      systemInstruction: "You are an expert filmmaker at a top studio. You produce high-end, cinematic production plans in JSON format."
    }
  });

  const text = response.text;
  if (!text) throw new Error("Director returned empty plan");

  return JSON.parse(text) as DirectorPlan;
};


/**
 * ARTIST AGENT (Gemini 2.5 Flash Image)
 * Generates the raw visual assets based on the Director's plan, or uses user-provided ones.
 */
export const runArtistAgent = async (plan: DirectorPlan, userCharacter?: Blob, userEnvironment?: Blob): Promise<AssetItem[]> => {
  console.log('[Artist] Preparing assets...');

  const assets: AssetItem[] = [];

  // Helper to generate missing assets
  const generateAsset = async (prompt: string, type: 'character' | 'background'): Promise<AssetItem> => {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: `Create a ${type} asset. Style: ${plan.visual_style}. Description: ${prompt}. High quality, detailed, production ready.`,
    });

    let base64Data = '';
    const parts = response.candidates?.[0]?.content?.parts || [];
    for (const part of parts) {
      if (part.inlineData && part.inlineData.data) {
        base64Data = part.inlineData.data;
        break;
      }
    }

    if (!base64Data) throw new Error(`Artist failed to generate ${type} image`);

    const byteCharacters = atob(base64Data);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    const blob = new Blob([byteArray], { type: 'image/png' });

    return {
      id: crypto.randomUUID(),
      type,
      url: URL.createObjectURL(blob),
      blob,
      base64: base64Data,
      source: 'ai'
    };
  };

  // Process Character
  if (userCharacter) {
    assets.push({
      id: crypto.randomUUID(),
      type: 'character',
      url: URL.createObjectURL(userCharacter),
      blob: userCharacter,
      source: 'user'
    });
  } else {
    assets.push(await generateAsset(plan.subject_prompt, 'character'));
  }

  // Process Environment
  if (userEnvironment) {
    assets.push({
      id: crypto.randomUUID(),
      type: 'background',
      url: URL.createObjectURL(userEnvironment),
      blob: userEnvironment,
      source: 'user'
    });
  } else {
    assets.push(await generateAsset(plan.environment_prompt, 'background'));
  }

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

  let operation = await ai.models.generateVideos({
    model: 'veo-3.1-fast-generate-preview',
    prompt: `${shot.prompt}. ${shot.camera_movement}. Style: ${plan.visual_style}`,
    config: {
      numberOfVideos: 1,
      resolution: '720p',
      aspectRatio: '16:9',
      referenceImages: references
    }
  });

  while (!operation.done) {
    await new Promise(resolve => setTimeout(resolve, 5000));
    operation = await ai.operations.getVideosOperation({ operation });
  }

  const videoUri = operation.response?.generatedVideos?.[0]?.video?.uri;
  if (!videoUri) throw new Error(`Draft generation failed for shot ${shot.order}`);

  const res = await fetch(`${videoUri}&key=${process.env.API_KEY}`);
  const blob = await res.blob();

  return {
    url: URL.createObjectURL(blob),
    blob,
    uri: videoUri,
    shotId: shot.id
  };
};

/**
 * PRODUCTION PIPELINE (Parallelization)
 * Manages the parallel generation of the Dailies sequence.
 */
export const runProductionPipeline = async (plan: DirectorPlan, assets: AssetItem[]): Promise<VideoArtifact[]> => {
  console.log('[Production] Starting parallel generation of 3 shots...');

  // Fire all 3 shots in parallel
  const shotPromises = plan.shots.map(shot => runShotDraftingAgent(shot, plan, assets));

  return Promise.all(shotPromises);
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
