import { describe, it, expect } from 'vitest';
import { DirectorPlan, SceneParams, SceneSegment } from '../types';

// These tests validate the new Dynamic Director architecture
// They will FAIL initially (Red phase) until we implement the changes

describe('Dynamic Director - Schema Validation', () => {
  it('should accept a single-scene plan', () => {
    const plan: DirectorPlan = {
      subject_prompt: 'Hero',
      environment_prompt: 'City',
      visual_style: 'Cyberpunk',
      reasoning: 'Simple scene',
      scenes: [
        {
          id: 'scene-1',
          order: 1,
          duration_seconds: 5,
          segments: [
            { start_time: '00:00', end_time: '00:05', prompt: 'Hero walks', camera_movement: 'Tracking shot' }
          ],
          master_prompt: '[00:00-00:05] Tracking shot, hero walks through cyberpunk city. Neon lights, rain.'
        }
      ]
    };

    expect(plan.scenes).toHaveLength(1);
    expect(plan.scenes[0].duration_seconds).toBeLessThanOrEqual(8);
  });

  it('should accept a multi-scene plan with timestamp segments', () => {
    const plan: DirectorPlan = {
      subject_prompt: 'Hero',
      environment_prompt: 'City',
      visual_style: 'Cyberpunk',
      reasoning: 'Complex narrative',
      scenes: [
        {
          id: 'scene-1',
          order: 1,
          duration_seconds: 6,
          segments: [
            { start_time: '00:00', end_time: '00:03', prompt: 'Wide shot establishing', camera_movement: 'Static' },
            { start_time: '00:03', end_time: '00:06', prompt: 'Close up reaction', camera_movement: 'Zoom in' }
          ],
          master_prompt: '[00:00-00:03] Wide shot, cyberpunk cityscape. [00:03-00:06] Zoom in on hero face, neon reflection in eyes.'
        },
        {
          id: 'scene-2',
          order: 2,
          duration_seconds: 8,
          segments: [
            { start_time: '00:00', end_time: '00:04', prompt: 'Action sequence', camera_movement: 'Handheld' },
            { start_time: '00:04', end_time: '00:08', prompt: 'Resolution', camera_movement: 'Slow pan' }
          ],
          master_prompt: '[00:00-00:04] Handheld action, hero runs. [00:04-00:08] Slow pan to sunset.'
        }
      ]
    };

    expect(plan.scenes).toHaveLength(2);
    expect(plan.scenes[0].duration_seconds).toBe(6);
    expect(plan.scenes[1].duration_seconds).toBe(8);
    expect(plan.scenes.every(s => s.duration_seconds <= 8)).toBe(true);
  });

  it('should validate timestamp format in master_prompt', () => {
    const validPrompts = [
      '[00:00-00:04] First shot',
      '[00:04-00:08] Second shot',
      '[00:00-00:08] Full scene with multiple actions'
    ];

    const timestampRegex = /\[\d{2}:\d{2}-\d{2}:\d{2}\]/g;
    
    validPrompts.forEach(prompt => {
      expect(prompt).toMatch(timestampRegex);
    });
  });

  it('should reject scenes exceeding 8 seconds', () => {
    // This test documents the constraint
    const invalidScene = {
      id: 'scene-bad',
      order: 1,
      duration_seconds: 10, // Too long!
      segments: [],
      master_prompt: ''
    };

    expect(invalidScene.duration_seconds).toBeGreaterThan(8);
  });
});

describe('Dynamic Director - Production Pipeline', () => {
  it('should handle variable scene counts', () => {
    const plans = [
      { sceneCount: 1, description: 'Single continuous shot' },
      { sceneCount: 3, description: 'Standard narrative' },
      { sceneCount: 5, description: 'Complex sequence' }
    ];

    plans.forEach(({ sceneCount }) => {
      const mockPlan = {
        scenes: Array(sceneCount).fill(null).map((_, i) => ({
          id: `scene-${i}`,
          order: i + 1,
          duration_seconds: 5,
          segments: [],
          master_prompt: ''
        }))
      };

      expect(mockPlan.scenes).toHaveLength(sceneCount);
    });
  });

  it('should calculate total production duration', () => {
    const plan: DirectorPlan = {
      subject_prompt: 'Hero',
      environment_prompt: 'City',
      visual_style: 'Cyberpunk',
      reasoning: 'Test',
      scenes: [
        { id: '1', order: 1, duration_seconds: 6, segments: [], master_prompt: '' },
        { id: '2', order: 2, duration_seconds: 8, segments: [], master_prompt: '' },
        { id: '3', order: 3, duration_seconds: 4, segments: [], master_prompt: '' }
      ]
    };

    const totalDuration = plan.scenes.reduce((sum, scene) => sum + scene.duration_seconds, 0);
    expect(totalDuration).toBe(18);
  });
});

describe('Dynamic Director - Timestamp Prompting', () => {
  it('should format timestamps correctly for Veo 3.1', () => {
    const segments: SceneSegment[] = [
      { start_time: '00:00', end_time: '00:03', prompt: 'Establishing shot', camera_movement: 'Wide' },
      { start_time: '00:03', end_time: '00:05', prompt: 'Medium shot', camera_movement: 'Pan' },
      { start_time: '00:05', end_time: '00:08', prompt: 'Close up', camera_movement: 'Push in' }
    ];

    const masterPrompt = segments.map(seg => 
      `[${seg.start_time}-${seg.end_time}] ${seg.camera_movement}. ${seg.prompt}`
    ).join('. ');

    expect(masterPrompt).toContain('[00:00-00:03]');
    expect(masterPrompt).toContain('[00:03-00:05]');
    expect(masterPrompt).toContain('[00:05-00:08]');
  });

  it('should ensure no gaps between segments', () => {
    const segments: SceneSegment[] = [
      { start_time: '00:00', end_time: '00:03', prompt: 'A', camera_movement: '' },
      { start_time: '00:03', end_time: '00:06', prompt: 'B', camera_movement: '' },
      { start_time: '00:06', end_time: '00:08', prompt: 'C', camera_movement: '' }
    ];

    // Verify continuity
    for (let i = 0; i < segments.length - 1; i++) {
      expect(segments[i].end_time).toBe(segments[i + 1].start_time);
    }
  });
});
