import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';
import { TransitionSpec, VideoArtifact } from '../types';

// Singleton FFmpeg instance (shared across VideoStitcher instances to avoid reloading)
let sharedFFmpeg: FFmpeg | null = null;

const loadSharedFFmpeg = async (): Promise<FFmpeg> => {
  if (sharedFFmpeg) return sharedFFmpeg;

  const instance = new FFmpeg();
  const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm';
  
  console.log('[StitchService] Loading FFmpeg...');
  await instance.load({
    coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
    wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
  });
  
  sharedFFmpeg = instance;
  return instance;
};

export class VideoStitcher {
  private ffmpeg: FFmpeg | null = null;

  constructor() {
    // We defer initialization to stitch()
  }

  private async getFFmpeg(): Promise<FFmpeg> {
    if (this.ffmpeg) return this.ffmpeg;
    this.ffmpeg = await loadSharedFFmpeg();
    return this.ffmpeg;
  }

  /**
   * Get video duration using a temporary HTMLVideoElement.
   */
  private getVideoDuration(blob: Blob): Promise<number> {
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
  }

  /**
   * Legacy simple stitch (concat only)
   */
  async stitch(videos: VideoArtifact[]): Promise<Blob> {
    return this.stitchWithTransitions(videos, []);
  }

  /**
   * Advanced stitch with transitions
   */
  async stitchWithTransitions(
    videos: VideoArtifact[], 
    transitions: (TransitionSpec | null | undefined)[]
  ): Promise<Blob> {
    console.log(`[StitchService] Stitching ${videos.length} videos...`);
    
    if (videos.length === 0) throw new Error("No videos to stitch");
    if (videos.length === 1) return videos[0].blob;

    const ffmpeg = await this.getFFmpeg();
    const inputFiles: string[] = [];
    const durations: number[] = [];

    // Cleanup helper
    const cleanup = async () => {
      for (const f of inputFiles) {
        try { await ffmpeg.deleteFile(f); } catch {}
      }
      try { await ffmpeg.deleteFile('output.mp4'); } catch {}
    };

    try {
      // 1. Load files and get durations
      for (let i = 0; i < videos.length; i++) {
        const fileName = `input${i}.mp4`;
        inputFiles.push(fileName);
        await ffmpeg.writeFile(fileName, await fetchFile(videos[i].blob));
        
        const duration = await this.getVideoDuration(videos[i].blob);
        durations.push(duration);
        console.log(`[StitchService] Loaded ${fileName} (${duration.toFixed(2)}s)`);
      }

      // 2. Build Filter Complex
      // We assume simple chaining: 0 -> 1 -> 2
      // transitions[i] connects video[i] and video[i+1]
      
      let filterComplex = '';
      let currentV = '[0:v]';
      let currentA = '[0:a]';
      let currentEnd = durations[0];

      // If transitions array is shorter than gaps, pad with null
      const gaps = videos.length - 1;
      
      for (let i = 0; i < gaps; i++) {
        const nextIdx = i + 1;
        const transition = transitions[i];
        
        // Default to a short fade (0.5s) if undefined, to handle the "cut" smoothly in xfade
        // Using 0.0s for xfade might be unstable, 0.1s is safe for a "cut" feel
        const type = transition?.type || 'fade';
        const duration = transition?.duration || 0.5; 
        
        // Offset logic:
        // Start of transition (in the accumulated stream) = currentEnd - transition_duration
        const offset = currentEnd - duration;
        
        // New end time = offset + duration_of_next_clip
        currentEnd = offset + durations[nextIdx];
        
        const nextV = `[v${nextIdx}]`;
        const nextA = `[a${nextIdx}]`;
        
        // Video: xfade
        filterComplex += `${currentV}[${nextIdx}:v]xfade=transition=${type}:duration=${duration}:offset=${offset.toFixed(3)}${nextV};`;
        
        // Audio: acrossfade
        filterComplex += `${currentA}[${nextIdx}:a]acrossfade=d=${duration}:c1=tri:c2=tri${nextA};`;
        
        currentV = nextV;
        currentA = nextA;
      }
      
      if (filterComplex.endsWith(';')) filterComplex = filterComplex.slice(0, -1);
      
      console.log(`[StitchService] Filter Complex: ${filterComplex}`);

      // 3. Execute
      const outputName = 'output.mp4';
      const inputArgs = inputFiles.flatMap(f => ['-i', f]);

      const args = [
        ...inputArgs,
        '-filter_complex', filterComplex,
        '-map', currentV,
        '-map', currentA,
        '-c:v', 'libx264',
        '-preset', 'ultrafast',
        '-c:a', 'aac',
        outputName
      ];
      
      console.log(`[StitchService] Running: ffmpeg ${args.join(' ')}`);
      await ffmpeg.exec(args);
      
      // 4. Read Output
      const data = await ffmpeg.readFile(outputName);
      const blob = new Blob([data], { type: 'video/mp4' });
      
      await cleanup();
      return blob;

    } catch (e) {
      console.error('[StitchService] Error:', e);
      await cleanup();
      throw e;
    }
  }
}

/**
 * Convenience helper for the UI
 */
export const stitchVideos = async (
  videos: VideoArtifact[], 
  transitions?: (TransitionSpec | null | undefined)[]
): Promise<{ url: string, extension: string, blob: Blob }> => {
  const stitcher = new VideoStitcher();
  // Ensure we have a valid array
  const trans = transitions || [];
  
  const blob = await stitcher.stitchWithTransitions(videos, trans);
  
  return {
    url: URL.createObjectURL(blob),
    extension: 'mp4',
    blob
  };
};
