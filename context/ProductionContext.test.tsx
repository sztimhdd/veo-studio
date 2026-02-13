import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { ProductionProvider, useProduction, reducer } from './ProductionContext';
import { ProductionState, PipelinePhase, LogEntry } from '../types';

describe('ProductionContext Reducer', () => {
  const initialState: ProductionState = {
    phase: 'IDLE',
    artifacts: {
      plan: null,
      assets: [],
      shots: [],
      draftVideo: null,
      anchorFrames: null,
      finalVideo: null
    },
    logs: [],
    error: null
  };

  describe('START_PIPELINE', () => {
    it('should reset state to initial and set phase to PLANNING', () => {
      const modifiedState: ProductionState = {
        ...initialState,
        phase: 'COMPLETE',
        logs: [{ agent: 'System', message: 'test', timestamp: 123, phase: 'COMPLETE' }],
        error: 'some error'
      };

      const result = reducer(modifiedState, { type: 'START_PIPELINE' });

      expect(result.phase).toBe('PLANNING');
      expect(result.logs).toHaveLength(0);
      expect(result.error).toBeNull();
      expect(result.artifacts.plan).toBeNull();
    });
  });

  describe('SET_PHASE', () => {
    it('should update phase correctly', () => {
      const phases: PipelinePhase[] = ['IDLE', 'PLANNING', 'ASSET_GEN', 'DRAFTING', 'REFINING', 'RENDERING', 'COMPLETE', 'ERROR'];
      
      phases.forEach(phase => {
        const result = reducer(initialState, { type: 'SET_PHASE', payload: phase });
        expect(result.phase).toBe(phase);
      });
    });
  });

  describe('UPDATE_ARTIFACTS', () => {
    it('should update plan correctly', () => {
      const mockPlan = {
        subject_prompt: 'Hero',
        environment_prompt: 'City',
        visual_style: 'Cyberpunk',
        scenes: [],
        shots: [],
        reasoning: 'Test reasoning'
      };

      const result = reducer(initialState, { 
        type: 'UPDATE_ARTIFACTS', 
        payload: { plan: mockPlan } 
      });

      expect(result.artifacts.plan).toEqual(mockPlan);
      expect(result.artifacts.assets).toEqual([]); // unchanged
    });

    it('should update assets correctly', () => {
      const mockAssets = [
        { id: '1', type: 'character' as const, url: 'url1', blob: new Blob(), source: 'ai' as const },
        { id: '2', type: 'background' as const, url: 'url2', blob: new Blob(), source: 'user' as const }
      ];

      const result = reducer(initialState, {
        type: 'UPDATE_ARTIFACTS',
        payload: { assets: mockAssets }
      });

      expect(result.artifacts.assets).toHaveLength(2);
      expect(result.artifacts.assets[0].id).toBe('1');
    });

    it('should update shots correctly', () => {
      const mockShots = [
        { url: 'video1.mp4', blob: new Blob(), uri: 'uri1', shotId: 'shot1' }
      ];

      const result = reducer(initialState, {
        type: 'UPDATE_ARTIFACTS',
        payload: { shots: mockShots }
      });

      expect(result.artifacts.shots).toHaveLength(1);
      expect(result.artifacts.shots[0].shotId).toBe('shot1');
    });

    it('should merge multiple artifact updates', () => {
      const result = reducer(initialState, {
        type: 'UPDATE_ARTIFACTS',
        payload: { 
          draftVideo: { url: 'draft.mp4', blob: new Blob(), uri: 'draft-uri' },
          finalVideo: { url: 'final.mp4', blob: new Blob(), uri: 'final-uri' }
        }
      });

      expect(result.artifacts.draftVideo).toBeDefined();
      expect(result.artifacts.finalVideo).toBeDefined();
    });
  });

  describe('UPDATE_SHOT', () => {
    it('should update shot at specific index', () => {
      const stateWithShots: ProductionState = {
        ...initialState,
        artifacts: {
          ...initialState.artifacts,
          shots: [
            { url: 'shot1.mp4', blob: new Blob(), uri: 'uri1', shotId: '1' },
            { url: 'shot2.mp4', blob: new Blob(), uri: 'uri2', shotId: '2' }
          ]
        }
      };

      const updatedShot = { url: 'updated.mp4', blob: new Blob(), uri: 'uri-updated', shotId: '2-updated' };
      
      const result = reducer(stateWithShots, {
        type: 'UPDATE_SHOT',
        payload: { index: 1, shot: updatedShot }
      });

      expect(result.artifacts.shots[1].shotId).toBe('2-updated');
      expect(result.artifacts.shots[0].shotId).toBe('1'); // unchanged
    });

    it('should add shot at new index', () => {
      const result = reducer(initialState, {
        type: 'UPDATE_SHOT',
        payload: { 
          index: 0, 
          shot: { url: 'new.mp4', blob: new Blob(), uri: 'uri-new', shotId: 'new' }
        }
      });

      expect(result.artifacts.shots).toHaveLength(1);
      expect(result.artifacts.shots[0].shotId).toBe('new');
    });
  });

  describe('ADD_LOG', () => {
    it('should add log entry with timestamp', () => {
      const mockDate = 1234567890;
      vi.spyOn(Date, 'now').mockReturnValue(mockDate);

      const result = reducer(initialState, {
        type: 'ADD_LOG',
        payload: { agent: 'Director', message: 'Planning started', phase: 'PLANNING' }
      });

      expect(result.logs).toHaveLength(1);
      expect(result.logs[0]).toEqual({
        agent: 'Director',
        message: 'Planning started',
        phase: 'PLANNING',
        timestamp: mockDate
      });

      vi.restoreAllMocks();
    });

    it('should append multiple logs', () => {
      let state = reducer(initialState, {
        type: 'ADD_LOG',
        payload: { agent: 'Director', message: 'First', phase: 'PLANNING' }
      });

      state = reducer(state, {
        type: 'ADD_LOG',
        payload: { agent: 'Artist', message: 'Second', phase: 'ASSET_GEN' }
      });

      expect(state.logs).toHaveLength(2);
      expect(state.logs[0].agent).toBe('Director');
      expect(state.logs[1].agent).toBe('Artist');
    });
  });

  describe('SET_ERROR', () => {
    it('should set error and change phase to ERROR', () => {
      const result = reducer(initialState, {
        type: 'SET_ERROR',
        payload: 'Something went wrong'
      });

      expect(result.error).toBe('Something went wrong');
      expect(result.phase).toBe('ERROR');
    });

    it('should preserve existing artifacts when error occurs', () => {
      const stateWithArtifacts: ProductionState = {
        ...initialState,
        artifacts: {
          ...initialState.artifacts,
          plan: { subject_prompt: 'Test', environment_prompt: 'Test', visual_style: 'Test', scenes: [], shots: [], reasoning: 'Test' }
        }
      };

      const result = reducer(stateWithArtifacts, {
        type: 'SET_ERROR',
        payload: 'Error occurred'
      });

      expect(result.artifacts.plan).toBeDefined();
      expect(result.error).toBe('Error occurred');
    });
  });

  describe('RESET', () => {
    it('should reset to initial state', () => {
      const modifiedState: ProductionState = {
        phase: 'COMPLETE',
        artifacts: {
          plan: { subject_prompt: 'Test', environment_prompt: 'Test', visual_style: 'Test', scenes: [], shots: [], reasoning: 'Test' },
          assets: [{ id: '1', type: 'character', url: 'url', blob: new Blob(), source: 'ai' }],
          shots: [{ url: 'video.mp4', blob: new Blob(), uri: 'uri' }],
          draftVideo: { url: 'draft.mp4', blob: new Blob(), uri: 'uri' },
          anchorFrames: { 
            start: { original: 'start.png', upscaled: 'start-up.png', blob: new Blob() },
            end: { original: 'end.png', upscaled: 'end-up.png', blob: new Blob() }
          },
          finalVideo: { url: 'final.mp4', blob: new Blob(), uri: 'uri' }
        },
        logs: [{ agent: 'System', message: 'Test', timestamp: 123, phase: 'COMPLETE' }],
        error: 'Some error'
      };

      const result = reducer(modifiedState, { type: 'RESET' });

      expect(result).toEqual(initialState);
    });
  });

  describe('Unknown action', () => {
    it('should return current state for unknown actions', () => {
      const result = reducer(initialState, { type: 'UNKNOWN_ACTION' } as any);
      expect(result).toEqual(initialState);
    });
  });
});

describe('ProductionContext Hook', () => {
  it('provides initial state', () => {
    const { result } = renderHook(() => useProduction(), {
      wrapper: ProductionProvider
    });

    expect(result.current.state.phase).toBe('IDLE');
    expect(result.current.state.artifacts.assets).toHaveLength(0);
    expect(typeof result.current.dispatch).toBe('function');
  });

  it('handles START_PIPELINE action through hook', () => {
    const { result } = renderHook(() => useProduction(), {
      wrapper: ProductionProvider
    });

    act(() => {
      result.current.dispatch({ type: 'START_PIPELINE' });
    });

    expect(result.current.state.phase).toBe('PLANNING');
  });

  it('handles UPDATE_ARTIFACTS action through hook', () => {
    const { result } = renderHook(() => useProduction(), {
      wrapper: ProductionProvider
    });

    const mockPlan = {
      subject_prompt: 'Hero',
      environment_prompt: 'City',
      visual_style: 'Cyberpunk',
      shots: [],
      reasoning: 'Test'
    };

    act(() => {
      result.current.dispatch({ 
        type: 'UPDATE_ARTIFACTS', 
        payload: { plan: mockPlan } 
      });
    });

    expect(result.current.state.artifacts.plan).toEqual(mockPlan);
  });

  it('handles SET_ERROR action through hook', () => {
    const { result } = renderHook(() => useProduction(), {
      wrapper: ProductionProvider
    });

    act(() => {
      result.current.dispatch({ 
        type: 'SET_ERROR', 
        payload: 'Test error' 
      });
    });

    expect(result.current.state.error).toBe('Test error');
    expect(result.current.state.phase).toBe('ERROR');
  });

  it('handles ADD_LOG action through hook', () => {
    const { result } = renderHook(() => useProduction(), {
      wrapper: ProductionProvider
    });

    act(() => {
      result.current.dispatch({ 
        type: 'ADD_LOG', 
        payload: { agent: 'System', message: 'Test message', phase: 'PLANNING' } 
      });
    });

    expect(result.current.state.logs).toHaveLength(1);
    expect(result.current.state.logs[0].agent).toBe('System');
  });
});
