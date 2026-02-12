import { afterEach, vi, beforeAll } from 'vitest';
import { cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

// Mock Google GenAI SDK globally before each test
vi.mock('@google/genai', async () => {
  const mockInstance = {
    models: {
      generateContent: vi.fn().mockResolvedValue({
        text: () => JSON.stringify({
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
        done: false,
        name: 'operations/123'
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

  // Return a class constructor
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
    Schema: {}
  };
});

// Runs a cleanup after each test case (e.g. clearing jsdom)
afterEach(() => {
  cleanup();
});
