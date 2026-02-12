
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { GoogleGenAI, Type } from '@google/genai';
import { VideoArtifact, DirectorPlan, ShotEvaluation, EvalReport } from '../types';

// Initialize AI (API key handled by env)
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

// Quota tracking for Critic (Gemini 3 Pro - Text)
let lastCriticCallTime = 0;
const CRITIC_MIN_INTERVAL = 12000; // 12s to respect 5 RPM limit

async function waitForCriticQuota() {
  const now = Date.now();
  const elapsed = now - lastCriticCallTime;
  
  if (elapsed < CRITIC_MIN_INTERVAL) {
    const wait = CRITIC_MIN_INTERVAL - elapsed;
    console.log(`[Critic] Throttling: waiting ${Math.ceil(wait/1000)}s...`);
    await new Promise(resolve => setTimeout(resolve, wait));
  }
  
  lastCriticCallTime = Date.now();
}

/**
 * AI CRITIC AGENT - Phase 3: Continuity Supervision
 * Analyzes generated video shots for quality and consistency.
 */
export const runContinuitySupervisor = async (
  shots: VideoArtifact[],
  plan: DirectorPlan
): Promise<EvalReport> => {
  console.log('[Critic] Starting continuity supervision...');
  
  const shotEvaluations: ShotEvaluation[] = [];
  
  // Evaluate each shot individually
  for (let i = 0; i < shots.length; i++) {
    const shot = shots[i];
    const shotParams = plan.shots[i];
    
    console.log(`[Critic] Analyzing shot ${i + 1}...`);
    
    // Convert video blob to base64 for analysis
    const videoBase64 = await blobToBase64(shot.blob);
    
    await waitForCriticQuota();
    
    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: [
        {
          text: `You are a professional film critic and continuity supervisor. Analyze this video shot for quality and consistency.
          
          SHOT PARAMETERS:
          - Prompt: ${shotParams.prompt}
          - Camera: ${shotParams.camera_movement}
          - Subject: ${plan.subject_prompt}
          - Environment: ${plan.environment_prompt}
          - Style: ${plan.visual_style}
          
          Evaluate the video on these criteria (score 0-10):
          1. Temporal Consistency: Does the motion flow naturally? Any jitter or artifacts?
          2. Semantic Alignment: Does the video match the prompt description?
          3. Technical Quality: Lighting, focus, clarity, absence of distortions
          
          Identify any specific flaws with timestamps and types (artifact, drift, glitch, lighting, audio).
          Provide actionable recommendations for improvement.
          
          Return a JSON evaluation report.`
        },
        {
          inlineData: {
            mimeType: 'video/mp4',
            data: videoBase64
          }
        }
      ],
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            temporalConsistencyScore: { type: Type.NUMBER, description: "Score 0-10" },
            semanticAlignmentScore: { type: Type.NUMBER, description: "Score 0-10" },
            technicalQualityScore: { type: Type.NUMBER, description: "Score 0-10" },
            overallScore: { type: Type.NUMBER, description: "Weighted average" },
            flaws: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  timestamp: { type: Type.NUMBER },
                  type: { type: Type.STRING, enum: ["artifact", "drift", "glitch", "lighting", "audio"] },
                  description: { type: Type.STRING }
                }
              }
            },
            recommendations: { type: Type.ARRAY, items: { type: Type.STRING } },
            passed: { type: Type.BOOLEAN, description: "true if overallScore >= 8.5" }
          }
        }
      }
    });
    
    const text = response.text;
    if (!text) throw new Error("Critic returned empty evaluation");
    
    const evaluation: ShotEvaluation = JSON.parse(text);
    evaluation.variantId = shot.shotId || `shot-${i}`;
    
    shotEvaluations.push(evaluation);
    console.log(`[Critic] Shot ${i + 1} scored: ${evaluation.overallScore}/10 - ${evaluation.passed ? 'PASSED' : 'FAILED'}`);
  }
  
  // Calculate cross-shot consistency
  console.log('[Critic] Calculating cross-shot character fidelity...');
  const characterFidelity = await calculateCharacterFidelity(shots, plan);
  
  // Compile final report
  const report: EvalReport = {
    shotEvaluations,
    temporalConsistencyScore: average(shotEvaluations.map(e => e.temporalConsistencyScore)),
    semanticAlignment: average(shotEvaluations.map(e => e.semanticAlignmentScore)),
    characterFidelity,
    overallScore: average(shotEvaluations.map(e => e.overallScore)),
    passed: shotEvaluations.every(e => e.passed) && characterFidelity >= 8.0
  };
  
  console.log(`[Critic] Final Report: Overall ${report.overallScore}/10 - ${report.passed ? 'ALL SHOTS PASSED' : 'REVIEW REQUIRED'}`);
  
  return report;
};

/**
 * Calculate character consistency across multiple shots
 */
const calculateCharacterFidelity = async (
  shots: VideoArtifact[],
  plan: DirectorPlan
): Promise<number> => {
  // Extract middle frame from each shot for comparison
  const framePromises = shots.map(async (shot) => {
    const frameBlob = await extractMiddleFrame(shot.blob);
    return blobToBase64(frameBlob);
  });
  
  const frames = await Promise.all(framePromises);
  
  await waitForCriticQuota();
  
  const response = await ai.models.generateContent({
    model: 'gemini-3-pro-preview',
    contents: [
      {
        text: `Compare these ${frames.length} frames from different shots. Rate the character consistency 0-10.
        Does the same character appear in all frames with consistent appearance?
        Character description: ${plan.subject_prompt}
        
        Return JSON: { "consistencyScore": number, "issues": string[] }`
      },
      ...frames.map((frame, i) => ({
        inlineData: {
          mimeType: 'image/jpeg',
          data: frame
        }
      }))
    ],
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          consistencyScore: { type: Type.NUMBER },
          issues: { type: Type.ARRAY, items: { type: Type.STRING } }
        }
      }
    }
  });
  
  const text = response.text;
  if (!text) return 8.0; // Default if analysis fails
  
  const result = JSON.parse(text);
  return result.consistencyScore;
};

// Helper: Calculate average
const average = (numbers: number[]): number => {
  if (numbers.length === 0) return 0;
  return numbers.reduce((a, b) => a + b, 0) / numbers.length;
};

// Helper: Convert blob to base64
const blobToBase64 = (blob: Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64data = reader.result as string;
      const base64Content = base64data.split(',')[1];
      resolve(base64Content);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
};

// Helper: Extract middle frame from video blob
const extractMiddleFrame = async (videoBlob: Blob): Promise<Blob> => {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    const url = URL.createObjectURL(videoBlob);
    
    video.src = url;
    video.muted = true;
    video.playsInline = true;
    
    const cleanup = () => {
      URL.revokeObjectURL(url);
      video.remove();
    };
    
    video.onloadedmetadata = () => {
      // Seek to middle of video
      video.currentTime = video.duration / 2;
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
        }, 'image/jpeg', 0.9);
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
