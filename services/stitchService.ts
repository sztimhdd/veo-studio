/**
 * Lightweight Video Stitching Service
 * Uses HTML5 Canvas + MediaRecorder to perform client-side video composition.
 * No external heavy dependencies like FFmpeg requiring SharedArrayBuffer.
 */

import { VideoArtifact } from '../types';

interface StitchingOptions {
    width?: number;
    height?: number;
    fps?: number;
    transitionDuration?: number; // Duration of cross-dissolve in ms
}

export class VideoStitcher {
    private canvas: HTMLCanvasElement;
    private ctx: CanvasRenderingContext2D;
    private mediaRecorder: MediaRecorder | null = null;
    private chunks: Blob[] = [];
    private options: Required<StitchingOptions>;

    constructor(options: StitchingOptions = {}) {
        this.options = {
            width: options.width || 1280,
            height: options.height || 720,
            fps: options.fps || 30,
            transitionDuration: options.transitionDuration || 1000,
        };

        this.canvas = document.createElement('canvas');
        this.canvas.width = this.options.width;
        this.canvas.height = this.options.height;
        const ctx = this.canvas.getContext('2d');
        if (!ctx) throw new Error('Could not get 2D context');
        this.ctx = ctx;
    }

    async stitch(videos: VideoArtifact[]): Promise<Blob> {
        if (videos.length === 0) throw new Error('No videos to stitch');

        const stream = this.canvas.captureStream(this.options.fps);
        // Detect supported MIME type
        const mimeType = MediaRecorder.isTypeSupported('video/mp4')
            ? 'video/mp4'
            : 'video/webm;codecs=vp9';

        // Use slightly higher bitrate for better quality
        this.mediaRecorder = new MediaRecorder(stream, {
            mimeType,
            videoBitsPerSecond: 5000000 // 5 Mbps
        });

        this.chunks = [];
        this.mediaRecorder.ondataavailable = (e) => {
            if (e.data.size > 0) this.chunks.push(e.data);
        };
        this.mediaRecorder.start();

        // Play sequences with transition overlap
        for (let i = 0; i < videos.length; i++) {
            const isLast = i === videos.length - 1;
            await this.playVideoSegment(videos[i], videos[i + 1], isLast);
        }

        this.mediaRecorder.stop();

        return new Promise((resolve) => {
            this.mediaRecorder!.onstop = () => {
                const finalBlob = new Blob(this.chunks, { type: mimeType });
                resolve(finalBlob);
            };
        });
    }

    private async playVideoSegment(current: VideoArtifact, next: VideoArtifact | undefined, isLast: boolean): Promise<void> {
        const videoEl = document.createElement('video');
        videoEl.src = current.url;
        videoEl.muted = true;
        videoEl.playsInline = true;

        // Determine overlapping/transition logic
        // For simplicity in V1: Just hard cut or simple generic play.
        // To do true cross-dissolve, we'd need TWO video elements playing simultaneously.
        // Let's implement sequential play first to prove the pipeline, then add transition.

        await videoEl.play();

        return new Promise((resolve) => {
            const draw = () => {
                if (videoEl.paused || videoEl.ended) return;

                this.ctx.drawImage(videoEl, 0, 0, this.canvas.width, this.canvas.height);

                if (!videoEl.ended) {
                    requestAnimationFrame(draw);
                }
            };

            videoEl.onended = () => {
                resolve();
            };

            draw();
        });
    }
}

export const stitchVideos = async (artifacts: VideoArtifact[]): Promise<{ url: string, extension: string }> => {
    const stitcher = new VideoStitcher();
    const blob = await stitcher.stitch(artifacts);
    // Determine extension based on the actual blob type
    const extension = blob.type.includes('mp4') ? 'mp4' : 'webm';
    return {
        url: URL.createObjectURL(blob),
        extension
    };
};
