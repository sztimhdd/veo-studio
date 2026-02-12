import { vi } from 'vitest';

export const GoogleGenAI = vi.fn().mockImplementation(() => ({
  models: {
    generateContent: vi.fn().mockResolvedValue({
      response: {
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
      }
    }),
    generateVideos: vi.fn().mockResolvedValue({
      done: false, // Simulating long running op
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
}));

export const SchemaType = {
  STRING: 'STRING',
  NUMBER: 'NUMBER',
  INTEGER: 'INTEGER',
  BOOLEAN: 'BOOLEAN',
  ARRAY: 'ARRAY',
  OBJECT: 'OBJECT'
};

export const Type = SchemaType;
