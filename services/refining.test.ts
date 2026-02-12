import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { extractKeyframes, calculateConsistency } from './pipelineService';

// Mock imagehash-web
vi.mock('imagehash-web', () => {
  return {
    default: [
      vi.fn(), // ahash
      vi.fn(), // dhash
      vi.fn().mockReturnValue({ // phash returns a hash object
        hammingDistance: vi.fn().mockReturnValue(5) 
      }), 
      vi.fn(), // whash
      vi.fn(), // cropResistantHash
      { fromHexString: vi.fn() } // ImageHash
    ]
  };
});

describe('Phase 4: Refining', () => {
  const mockVideoBlob = new Blob(['video data'], { type: 'video/mp4' });
  
  beforeEach(() => {
    // Mock URL
    global.URL.createObjectURL = vi.fn(() => 'mock-url');
    global.URL.revokeObjectURL = vi.fn();
    
    // Mock Image
    global.Image = class {
      onload: () => void = () => {};
      set src(v: string) { setTimeout(() => this.onload(), 0); }
    } as any;

    // Mock HTMLVideoElement
    // We mock the prototype methods/getters that are used
    vi.spyOn(window.HTMLVideoElement.prototype, 'load').mockImplementation(() => {});
    vi.spyOn(window.HTMLVideoElement.prototype, 'play').mockImplementation(async () => {});
    vi.spyOn(window.HTMLVideoElement.prototype, 'pause').mockImplementation(() => {});
    
    // Mock createElement to return our controlled mocks
    const originalCreateElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tagName) => {
      if (tagName === 'video') {
        const video = originalCreateElement('video');
        // Manually trigger events for the promise flows
        setTimeout(() => {
          Object.defineProperty(video, 'duration', { value: 5.0, configurable: true });
          Object.defineProperty(video, 'videoWidth', { value: 1920, configurable: true });
          Object.defineProperty(video, 'videoHeight', { value: 1080, configurable: true });
          
          video.dispatchEvent(new Event('loadedmetadata'));
          
          // For onseeked, we assume play/currentTime logic is triggered
          // In real code, we wait for loadedmetadata then set currentTime
          // We can just auto-trigger seeked after a slight delay to simulate async seeking
          setTimeout(() => {
            video.dispatchEvent(new Event('seeked'));
          }, 10);
        }, 10);
        return video;
      }
      if (tagName === 'canvas') {
        const canvas = originalCreateElement('canvas');
        canvas.getContext = vi.fn().mockReturnValue({
          drawImage: vi.fn(),
        });
        canvas.toBlob = (cb) => cb(new Blob(['frame'], { type: 'image/jpeg' }));
        return canvas;
      }
      return originalCreateElement(tagName);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('extractKeyframes', () => {
    it('should extract 3 keyframes from video', async () => {
      const frames = await extractKeyframes(mockVideoBlob);
      // We expect 3 frames (Start, Mid, End)
      expect(frames).toHaveLength(3);
      // blobtobase64 mock behavior depends on FileReader which is basic in jsdom
      // but should work if blob is created correctly
    });
  });

  describe('calculateConsistency', () => {
    it('should return a score between 0 and 1', async () => {
      const score = await calculateConsistency('base64data', { base64: 'base64ref' } as any);
      // 1 - (5 / 64) = 0.921875
      expect(score).toBeCloseTo(0.92, 1);
    });

    it('should return 0 if reference has no base64', async () => {
      const score = await calculateConsistency('base64data', {} as any);
      expect(score).toBe(0);
    });
  });
});
