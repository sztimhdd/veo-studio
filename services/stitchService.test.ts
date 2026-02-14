
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { VideoStitcher, generateCaptions } from './stitchService';
import { VideoArtifact, TransitionSpec, DirectorPlan } from '../types';

// Mock FFmpeg
const mockExec = vi.fn();
const mockWriteFile = vi.fn();
const mockReadFile = vi.fn();
const mockDeleteFile = vi.fn();

vi.mock('@ffmpeg/ffmpeg', () => ({
  FFmpeg: class {
    load = vi.fn();
    exec = mockExec;
    writeFile = mockWriteFile;
    readFile = mockReadFile;
    deleteFile = mockDeleteFile;
  }
}));

vi.mock('@ffmpeg/util', () => ({
  fetchFile: vi.fn(),
  toBlobURL: vi.fn(),
}));

describe('VideoStitcher', () => {
  let stitcher: VideoStitcher;

  beforeEach(() => {
    vi.clearAllMocks();
    stitcher = new VideoStitcher();
    
    // Mock video duration helper
    // We force a duration of 5s for all clips for predictable offset calculation
    vi.spyOn(stitcher as any, 'getVideoDuration').mockResolvedValue(5.0);
    
    mockReadFile.mockResolvedValue(new Uint8Array([1, 2, 3]));
  });

  it('should generate correct xfade filter for 2 videos', async () => {
    const videos: VideoArtifact[] = [
      { blob: new Blob([]), url: 'v1' },
      { blob: new Blob([]), url: 'v2' }
    ];
    
    const transitions: TransitionSpec[] = [
      { type: 'fade', duration: 1.0 }
    ];

    await stitcher.stitchWithTransitions(videos, transitions);

    expect(mockExec).toHaveBeenCalled();
    const args = mockExec.mock.calls[0][0] as string[];
    
    // Check filter complex
    const filterIndex = args.indexOf('-filter_complex');
    expect(filterIndex).toBeGreaterThan(-1);
    const filter = args[filterIndex + 1];

    // 5s clip 1, 1s fade. Offset should be 5 - 1 = 4s.
    // [0:v][1:v]xfade=transition=fade:duration=1:offset=4.000[v1]
    expect(filter).toContain('xfade=transition=fade:duration=1:offset=4.000');
    expect(filter).toContain('acrossfade=d=1');
  });

  it('should handle multiple transitions correctly', async () => {
    const videos: VideoArtifact[] = [
      { blob: new Blob([]), url: 'v1' }, // 5s
      { blob: new Blob([]), url: 'v2' }, // 5s
      { blob: new Blob([]), url: 'v3' }  // 5s
    ];
    
    const transitions: TransitionSpec[] = [
      { type: 'circleopen', duration: 0.5 },
      { type: 'wipedown', duration: 1.0 }
    ];

    await stitcher.stitchWithTransitions(videos, transitions);

    const args = mockExec.mock.calls[0][0] as string[];
    const filter = args[args.indexOf('-filter_complex') + 1];

    // Transition 1: Offset = 5 - 0.5 = 4.5s. Result length = 4.5 + 5 = 9.5s
    expect(filter).toContain('xfade=transition=circleopen:duration=0.5:offset=4.500');
    
    // Transition 2: Offset = 9.5 - 1.0 = 8.5s
    expect(filter).toContain('xfade=transition=wipedown:duration=1:offset=8.500');
  });

  it('should default to fade if transition spec is missing', async () => {
    const videos: VideoArtifact[] = [
      { blob: new Blob([]), url: 'v1' },
      { blob: new Blob([]), url: 'v2' }
    ];
    
    await stitcher.stitchWithTransitions(videos, [undefined] as any);

    const args = mockExec.mock.calls[0][0] as string[];
    const filter = args[args.indexOf('-filter_complex') + 1];

    expect(filter).toContain('xfade=transition=fade');
  });
});

describe('generateCaptions', () => {
  it('should generate valid SRT from DirectorPlan', () => {
    const plan: DirectorPlan = {
      subject_prompt: '',
      environment_prompt: '',
      visual_style: '',
      reasoning: '',
      scenes: [
        {
          id: '1', order: 1, duration_seconds: 4, master_prompt: '',
          segments: [
            { start_time: '00:00', end_time: '00:02', prompt: 'Hero says: Hello world!', camera_movement: '' },
            { start_time: '00:02', end_time: '00:04', prompt: 'Action shot.', camera_movement: '' }
          ]
        },
        {
          id: '2', order: 2, duration_seconds: 4, master_prompt: '',
          segments: [
            { start_time: '00:00', end_time: '00:04', prompt: 'Villain says: Goodbye!', camera_movement: '' }
          ]
        }
      ]
    };

    const srt = generateCaptions(plan);
    
    // Check structure
    expect(srt).toContain('1\n00:00:00,000 --> 00:00:02,000\nHello world!');
    // Scene 2 starts at 00:04 (cumulative)
    expect(srt).toContain('2\n00:00:04,000 --> 00:00:08,000\nGoodbye!');
  });

  it('should handle missing dialogue gracefully', () => {
    const plan: DirectorPlan = {
      subject_prompt: '',
      environment_prompt: '',
      visual_style: '',
      reasoning: '',
      scenes: [
        {
          id: '1', order: 1, duration_seconds: 3, master_prompt: '',
          segments: [
            { start_time: '00:00', end_time: '00:03', prompt: 'Silent staring.', camera_movement: '' }
          ]
        }
      ]
    };

    const srt = generateCaptions(plan);
    expect(srt).toBe('');
  });
});
