/**
 * Agent Integration Tests with Real Gemini API
 *
 * Run with: VITEST_USE_REAL_API=true npm test:integration
 *
 * These tests use REAL Gemini API calls for:
 * - Director Agent (gemini-3-pro-preview - text generation)
 * - Artist Agent (gemini-3-pro-image-preview - image generation)
 * - Refiner Agent (gemini-3-pro-image-preview - image upscaling)
 *
 * Veo video generation is MOCKED to avoid consuming that quota.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import {
  runDirectorAgent,
  runArtistAgent,
  runRefinerAgent,
} from './pipelineService';
import { DirectorPlan, AssetItem } from '../types';

console.log('[Test Config] VITEST_USE_REAL_API:', process.env.VITEST_USE_REAL_API);
console.log('[Test Config] API_KEY:', process.env.API_KEY ? 'Set' : 'Not set');

// Verify this is running in integration mode
if (process.env.VITEST_USE_REAL_API !== 'true') {
  describe.skip('Agent Integration - Real Gemini API', () => {
    it.skip('skipping integration tests (set VITEST_USE_REAL_API=true to run)', () => {});
  });
} else {
  describe('Agent Integration - Real Gemini API', () => {
    beforeAll(() => {
      const apiKey = process.env.API_KEY || process.env.GEMINI_API_KEY || '';
      if (!apiKey) {
        console.warn('⚠️  No API_KEY found - integration tests will fail');
      }
    });

    describe('Director Agent (Real Gemini 3 Pro)', () => {
      it('should generate a structured plan from a real API call', async () => {
        const result: DirectorPlan = await runDirectorAgent(
          'Create a 15-second cyberpunk video featuring a character walking through a rainy neon-lit city at night'
        );

        expect(result).toBeDefined();
        expect(result.subject_prompt).toBeDefined();
        expect(result.environment_prompt).toBeDefined();
        expect(result.visual_style).toBeDefined();
        expect(result.reasoning).toBeDefined();
        expect(result.scenes).toBeInstanceOf(Array);
        expect(result.scenes.length).toBeGreaterThan(0);

        // Verify scene structure
        const firstScene = result.scenes[0];
        expect(firstScene.duration_seconds).toBeGreaterThan(0);
        expect(firstScene.duration_seconds).toBeLessThanOrEqual(8);
        expect(firstScene.master_prompt).toBeDefined();
        expect(firstScene.master_prompt).toMatch(/\[\d{2}:\d{2}-\d{2}:\d{2}\]/); // Timestamp format

        console.log(`✅ Director generated ${result.scenes.length} scenes`);
      }, 60000);

      it('should handle complex narrative requirements', async () => {
        const result = await runDirectorAgent(
          'An astronaut discovers an alien artifact on Mars and finds it contains a message from a lost civilization'
        );

        expect(result).toBeDefined();
        expect(result.scenes.length).toBeGreaterThanOrEqual(1);
        expect(result.subject_prompt).toBeDefined();
      }, 60000);

      it('should respect 8-second scene limit', async () => {
        const result = await runDirectorAgent(
          'A sunset over the ocean with waves crashing on the beach'
        );

        result.scenes.forEach(scene => {
          expect(scene.duration_seconds).toBeLessThanOrEqual(8);
        });
      }, 60000);
    });

    describe('Artist Agent (Real Gemini 3 Pro Image Preview)', () => {
      const directorPlan: DirectorPlan = {
        subject_prompt: 'A futuristic robot with glowing blue eyes',
        environment_prompt: 'A high-tech laboratory with holographic displays',
        visual_style: 'Cyberpunk, volumetric lighting',
        reasoning: 'Test plan',
        scenes: []
      };

      it('should generate character and environment assets', async () => {
        const assets: AssetItem[] = await runArtistAgent(directorPlan);

        expect(assets).toHaveLength(2);

        const charAsset = assets.find(a => a.type === 'character');
        const bgAsset = assets.find(a => a.type === 'background');

        expect(charAsset).toBeDefined();
        expect(bgAsset).toBeDefined();
        expect(charAsset?.blob).toBeInstanceOf(Blob);
        expect(charAsset?.source).toBe('ai');
        expect(bgAsset?.blob).toBeInstanceOf(Blob);
        expect(bgAsset?.source).toBe('ai');

        console.log('✅ Artist generated character and environment assets');
      }, 120000);

      it('should use user-provided character reference', async () => {
        const userImage = new Blob(['test'], { type: 'image/jpeg' });
        const assets = await runArtistAgent(directorPlan, userImage);
        const charAsset = assets.find(a => a.type === 'character');
        expect(charAsset?.source).toBe('user');
      }, 120000);

      it('should use user-provided environment reference', async () => {
        const userImage = new Blob(['test'], { type: 'image/jpeg' });
        const assets = await runArtistAgent(directorPlan, undefined, userImage);
        const bgAsset = assets.find(a => a.type === 'background');
        expect(bgAsset?.source).toBe('user');
      }, 120000);
    });

    describe('Refiner Agent (Real Gemini 3 Pro Vision)', () => {
      it('should upscale a low-res frame', async () => {
        const directorPlan: DirectorPlan = {
          subject_prompt: 'A character',
          environment_prompt: 'A location',
          visual_style: 'Cinematic',
          reasoning: 'Test',
          scenes: [],
          shots: [{
            id: '1',
            order: 1,
            prompt: 'Action',
            camera_movement: 'Pan',
            duration_seconds: 8
          }]
        };

        const lowResFrame = new Blob(['low res'], { type: 'image/jpeg' });
        const result = await runRefinerAgent(lowResFrame, directorPlan);

        expect(result).toBeInstanceOf(Blob);
        expect(result.type).toBe('image/png');
        console.log('✅ Refiner upscaled frame');
      }, 120000);
    });

    describe('Combined Pipeline Integration', () => {
      it('should execute Director -> Artist flow', async () => {
        const plan = await runDirectorAgent(
          'A medieval knight exploring a mystical forest with glowing mushrooms'
        );

        expect(plan.scenes.length).toBeGreaterThan(0);
        console.log(`✅ Director generated ${plan.scenes.length} scenes`);

        const assets = await runArtistAgent(plan);
        expect(assets).toHaveLength(2);
        console.log('✅ Artist generated assets');
      }, 180000);
    });
  });
}
