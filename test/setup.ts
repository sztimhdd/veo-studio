// Set API key BEFORE any imports (pipelineService.ts creates client at module load)
process.env.API_KEY = process.env.API_KEY || process.env.GEMINI_API_KEY || 'AIzaSyC3IPqm7PAiRnl_j20pX2RZhBTgdSPzoLk';
process.env.GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'AIzaSyC3IPqm7PAiRnl_j20pX2RZhBTgdSPzoLk';

import { afterEach, vi, beforeAll } from 'vitest';
import { cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

// ===== COMMON MOCKS (always applied) =====

// Mock FFmpeg
const mockFFmpegInstance = {
  load: vi.fn().mockResolvedValue(undefined),
  writeFile: vi.fn().mockResolvedValue(undefined),
  readFile: vi.fn().mockResolvedValue(new Uint8Array([0, 1, 2, 3])),
  exec: vi.fn().mockResolvedValue(undefined),
  deleteFile: vi.fn().mockResolvedValue(undefined),
};

class MockFFmpeg {
  constructor() {
    return mockFFmpegInstance;
  }
}

vi.mock('@ffmpeg/ffmpeg', () => ({
  FFmpeg: MockFFmpeg,
}));

vi.mock('@ffmpeg/util', () => ({
  fetchFile: vi.fn().mockResolvedValue(new ArrayBuffer(4)),
  toBlobURL: vi.fn().mockResolvedValue('mock-blob-url'),
}));

vi.mock('imagehash-web', () => ({
  default: [
    vi.fn(),
    vi.fn(),
    vi.fn().mockReturnValue({ hammingDistance: vi.fn().mockReturnValue(5) }),
    vi.fn(),
    vi.fn(),
    { fromHexString: vi.fn() }
  ]
}));

global.URL.createObjectURL = vi.fn(() => 'mock-object-url');
global.URL.revokeObjectURL = vi.fn();

// ===== GOOGLE GENAI MOCKING =====

const USE_REAL_API = process.env.VITEST_USE_REAL_API === 'true';

if (!USE_REAL_API) {
  // Full mock for unit tests
  vi.mock('@google/genai', async () => {
    const mockInstance = {
      models: {
        generateContent: vi.fn().mockResolvedValue({
          text: JSON.stringify({
            shots: [],
            subject_prompt: "mock subject",
            environment_prompt: "mock env",
            visual_style: "mock style",
            reasoning: "mock reasoning"
          }),
          candidates: [{
            content: {
              parts: [{ inlineData: { data: "base64mock" } }]
            }
          }]
        }),
        generateVideos: vi.fn().mockResolvedValue({
          done: true,
          response: {
            generatedVideos: [{ video: { uri: "http://mock-video.com/video.mp4" } }]
          }
        })
      },
      operations: {
        getVideosOperation: vi.fn().mockResolvedValue({
          done: true,
          response: {
            generatedVideos: [{ video: { uri: "http://mock-video.com/video.mp4" } }]
          }
        })
      }
    };

    class MockGoogleGenAI {
      constructor() {
        return mockInstance;
      }
    }

    return {
      GoogleGenAI: MockGoogleGenAI,
      Type: {
        STRING: 'STRING',
        NUMBER: 'NUMBER',
        INTEGER: 'INTEGER',
        BOOLEAN: 'BOOLEAN',
        ARRAY: 'ARRAY',
        OBJECT: 'OBJECT'
      },
      Schema: {},
      VideoGenerationReferenceType: {
        ASSET: 'ASSET',
        STYLE: 'STYLE'
      }
    };
  });
} else {
  // Integration mode: mock ONLY video generation
  vi.mock('@google/genai', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@google/genai')>();
    const GoogleGenAI = actual.GoogleGenAI;

    const mockVideoResponse = {
      done: true,
      response: {
        generatedVideos: [{ video: { uri: 'https://mock-video.com/video.mp4' } }]
      }
    };

    class HybridGoogleGenAI {
      _realAI: any;

      constructor(config: any) {
        this._realAI = new (GoogleGenAI as any)(config);
      }

      get models() {
        return new Proxy(this._realAI.models, {
          get(target: any, prop: string) {
            if (prop === 'generateVideos') {
              return vi.fn().mockResolvedValue(mockVideoResponse);
            }
            return target[prop];
          }
        });
      }

      get operations() {
        return {
          getVideosOperation: vi.fn().mockResolvedValue(mockVideoResponse)
        };
      }
    }

    return {
      ...actual,
      GoogleGenAI: HybridGoogleGenAI,
    };
  });
}

// API key is set at the top of this file (before imports) to ensure it's available
// when pipelineService.ts creates the GoogleGenAI client at module load time

// Runs a cleanup after each test case
afterEach(() => {
  cleanup();
});
