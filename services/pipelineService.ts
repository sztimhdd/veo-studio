
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { GoogleGenAI, Type, Schema, VideoGenerationReferenceImage, VideoGenerationReferenceType } from '@google/genai';
import { AssetItem, DirectorPlan, Resolution, VideoArtifact } from '../types';

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
  console.log('[Director] Planning shot...');
  
  const schema: Schema = {
    type: Type.OBJECT,
    properties: {
      subject_prompt: { type: Type.STRING, description: "Detailed visual description of the main character or subject" },
      environment_prompt: { type: Type.STRING, description: "Detailed visual description of the background and lighting" },
      action_prompt: { type: Type.STRING, description: "The specific movement, camera angle, and action occurring" },
      visual_style: { type: Type.STRING, description: "Cinematic style, film stock, lens type" },
      reasoning: { type: Type.STRING, description: "Brief explanation of creative choices" }
    },
    required: ["subject_prompt", "environment_prompt", "action_prompt", "visual_style", "reasoning"]
  };

  const response = await ai.models.generateContent({
    model: 'gemini-3-pro-preview',
    contents: `You are a visionary film director. Break down this user request into a precise production plan: "${userPrompt}"`,
    config: {
      responseMimeType: 'application/json',
      responseSchema: schema,
      systemInstruction: "You are an expert filmmaker. Create distinct, vivid prompts for the Art Department (Assets) and the Camera Department (Action). Ensure consistency in style."
    }
  });

  const text = response.text;
  if (!text) throw new Error("Director returned empty plan");
  
  return JSON.parse(text) as DirectorPlan;
};

/**
 * ARTIST AGENT (Gemini 2.5 Flash Image)
 * Generates the raw visual assets based on the Director's plan.
 */
export const runArtistAgent = async (plan: DirectorPlan): Promise<AssetItem[]> => {
  console.log('[Artist] Generating assets...');

  const generateAsset = async (prompt: string, type: 'character' | 'background'): Promise<AssetItem> => {
    // Generate the image
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: `Create a ${type} asset. Style: ${plan.visual_style}. Description: ${prompt}. High quality, detailed, production ready.`,
    });

    // Extract image data
    // Note: 2.5 Flash Image usually returns inlineData. 
    // We need to iterate parts to find it.
    let base64Data = '';
    const parts = response.candidates?.[0]?.content?.parts || [];
    for (const part of parts) {
      if (part.inlineData && part.inlineData.data) {
        base64Data = part.inlineData.data;
        break;
      }
    }

    if (!base64Data) throw new Error(`Artist failed to generate ${type} image`);

    // Convert to Blob for storage
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
      base64: base64Data
    };
  };

  // Run in parallel
  const [charAsset, bgAsset] = await Promise.all([
    generateAsset(plan.subject_prompt, 'character'),
    generateAsset(plan.environment_prompt, 'background')
  ]);

  return [charAsset, bgAsset];
};

/**
 * ENGINEER AGENT - PHASE 1: DRAFT (Veo 3.1 Fast)
 * Generates the initial motion draft using assets.
 */
export const runDraftingAgent = async (plan: DirectorPlan, assets: AssetItem[]): Promise<VideoArtifact> => {
  console.log('[Engineer] Drafting motion...');

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
    prompt: `${plan.action_prompt}. Style: ${plan.visual_style}`,
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
  if (!videoUri) throw new Error("Draft generation failed");

  // Fetch the actual video blob
  const res = await fetch(`${videoUri}&key=${process.env.API_KEY}`);
  const blob = await res.blob();

  return {
    url: URL.createObjectURL(blob),
    blob,
    uri: videoUri
  };
};

/**
 * ENGINEER AGENT - PHASE 2: REFINE (Gemini 3 Pro Vision)
 * Upscales a specific frame to be used as an anchor.
 */
export const runRefinerAgent = async (lowResBlob: Blob, plan: DirectorPlan): Promise<Blob> => {
  console.log('[Engineer] Refining anchor frame...');

  const lowResBase64 = await blobToBase64(lowResBlob);

  // Use Gemini 3 Pro to Hallucinate details (Upscale)
  const response = await ai.models.generateContent({
    model: 'gemini-3-pro-image-preview',
    contents: {
      parts: [
        {
          text: `A high-resolution, 4k, photorealistic movie still. 
                 Subject: ${plan.subject_prompt}. 
                 Environment: ${plan.environment_prompt}. 
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

  let operation = await ai.models.generateVideos({
    model: 'veo-3.1-generate-preview', // High quality model
    prompt: `${plan.action_prompt}. ${plan.visual_style}. High Fidelity.`,
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
