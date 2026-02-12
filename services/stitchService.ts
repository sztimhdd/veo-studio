import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';
import { VideoArtifact } from '../types';

/**
 * Professional Video Stitching Service
 * Uses FFmpeg.wasm for lossless stream concatenation.
 */
export class VideoStitcher {
    private ffmpeg: FFmpeg;
    private loaded = false;

    constructor() {
        this.ffmpeg = new FFmpeg();
    }

    private async load() {
        if (this.loaded) return;

        const baseURL = 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/esm';
        await this.ffmpeg.load({
            coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
            wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
        });
        
        this.loaded = true;
    }

    async stitch(videos: VideoArtifact[]): Promise<Blob> {
        if (videos.length === 0) throw new Error('No videos to stitch');
        if (videos.length === 1) return videos[0].blob;

        await this.load();

        const inputNames: string[] = [];
        
        // 1. Write files to FFmpeg FS
        for (let i = 0; i < videos.length; i++) {
            const name = `input${i}.mp4`;
            await this.ffmpeg.writeFile(name, await fetchFile(videos[i].blob));
            inputNames.push(name);
        }

        // 2. Create file list for concat demuxer
        const fileListContent = inputNames.map(name => `file '${name}'`).join('\n');
        await this.ffmpeg.writeFile('filelist.txt', fileListContent);

        // 3. Execute concatenation
        // We use '-c copy' to avoid re-encoding since Veo outputs are consistent
        // If they vary in resolution/codec, we might need a filter complex instead.
        await this.ffmpeg.exec([
            '-f', 'concat',
            '-safe', '0',
            '-i', 'filelist.txt',
            '-c', 'copy',
            'output.mp4'
        ]);

        // 4. Read result
        const data = await this.ffmpeg.readFile('output.mp4');
        
        // Cleanup
        for (const name of inputNames) {
            await this.ffmpeg.deleteFile(name);
        }
        await this.ffmpeg.deleteFile('filelist.txt');
        await this.ffmpeg.deleteFile('output.mp4');

        return new Blob([(data as Uint8Array).buffer], { type: 'video/mp4' });
    }
}

export const stitchVideos = async (artifacts: VideoArtifact[]): Promise<{ url: string, extension: string }> => {
    const stitcher = new VideoStitcher();
    const blob = await stitcher.stitch(artifacts);
    return {
        url: URL.createObjectURL(blob),
        extension: 'mp4'
    };
};
