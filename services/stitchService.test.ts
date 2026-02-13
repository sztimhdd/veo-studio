import { describe, it, expect } from 'vitest';
import { VideoStitcher, stitchVideos } from './stitchService';
import { VideoArtifact } from '../types';

// Note: The FFmpeg mocks are set up in test/setup.ts

describe('VideoStitcher', () => {
  describe('constructor', () => {
    it('should initialize without errors', () => {
      const stitcher = new VideoStitcher();
      expect(stitcher).toBeDefined();
    });
  });

  describe('stitch', () => {
    const mockVideos: VideoArtifact[] = [
      { url: 'url1', blob: new Blob(['video1'], { type: 'video/mp4' }), uri: 'uri1' },
      { url: 'url2', blob: new Blob(['video2'], { type: 'video/mp4' }), uri: 'uri2' },
      { url: 'url3', blob: new Blob(['video3'], { type: 'video/mp4' }), uri: 'uri3' },
    ];

    it('should throw error when videos array is empty', async () => {
      const stitcher = new VideoStitcher();
      await expect(stitcher.stitch([])).rejects.toThrow('No videos to stitch');
    });

    it('should return single video blob when only one video is provided', async () => {
      const stitcher = new VideoStitcher();
      const singleVideo = [mockVideos[0]];
      const result = await stitcher.stitch(singleVideo);

      expect(result).toBeInstanceOf(Blob);
      expect(result.type).toBe('video/mp4');
    });
  });
});

describe('stitchVideos', () => {
  it('should return valid result structure', async () => {
    const mockVideos: VideoArtifact[] = [
      { url: 'url1', blob: new Blob(['video1'], { type: 'video/mp4' }), uri: 'uri1' },
    ];

    const result = await stitchVideos(mockVideos);

    expect(result).toHaveProperty('url');
    expect(result).toHaveProperty('extension');
    expect(result.extension).toBe('mp4');
  });

  it('should support transition parameter', async () => {
    const mockVideos: VideoArtifact[] = [
      { url: 'url1', blob: new Blob(['video1'], { type: 'video/mp4' }), uri: 'uri1' },
    ];

    const transitions = [{ type: 'fade', duration: 0.5 }];
    const result = await stitchVideos(mockVideos, transitions);

    expect(result).toHaveProperty('url');
    expect(result).toHaveProperty('extension');
  });
});

// Note: Transition tests require real video metadata parsing (video element creation)
// which is beyond the scope of unit tests. These are tested via integration/manual verification.

describe.skip('VideoStitcher with Transitions (Integration)', () => {
  it('should handle transition parameters', async () => {
    const stitcher = new VideoStitcher();
    const mockVideos: VideoArtifact[] = [
      { url: 'url1', blob: new Blob(['video1'], { type: 'video/mp4' }), uri: 'uri1' },
      { url: 'url2', blob: new Blob(['video2'], { type: 'video/mp4' }), uri: 'uri2' },
    ];
    const transitions = [{ type: 'fade', duration: 0.5 }];

    const result = await stitcher.stitchWithTransitions(mockVideos, transitions);
    expect(result).toBeInstanceOf(Blob);
    expect(result.type).toBe('video/mp4');
  });

  it('should handle multiple transitions', async () => {
    const stitcher = new VideoStitcher();
    const mockVideos: VideoArtifact[] = [
      { url: 'url1', blob: new Blob(['v1'], { type: 'video/mp4' }), uri: 'uri1' },
      { url: 'url2', blob: new Blob(['v2'], { type: 'video/mp4' }), uri: 'uri2' },
      { url: 'url3', blob: new Blob(['v3'], { type: 'video/mp4' }), uri: 'uri3' },
    ];
    const transitions = [
      { type: 'fade', duration: 0.5 },
      { type: 'fadeblack', duration: 1.0 }
    ];

    const result = await stitcher.stitchWithTransitions(mockVideos, transitions);
    expect(result).toBeInstanceOf(Blob);
  });
});
