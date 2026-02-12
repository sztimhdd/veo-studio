
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import React, { createContext, useContext, useReducer, ReactNode } from 'react';
import { LogEntry, ProductionArtifacts, ProductionState, PipelinePhase, VideoArtifact, ShotEvaluation } from '../types';

// Initial State
const initialState: ProductionState = {
  phase: 'IDLE',
  artifacts: {
    plan: null,
    assets: [],
    shots: [],
    draftVideo: null,
    anchorFrame: null,
    finalVideo: null,
    evalReport: null,
    motionLocked: false
  },

  logs: [],
  error: null
};

// Actions
type Action =
  | { type: 'START_PIPELINE' }
  | { type: 'SET_PHASE', payload: PipelinePhase }
  | { type: 'UPDATE_ARTIFACTS', payload: Partial<ProductionArtifacts> }
  | { type: 'UPDATE_SHOT', payload: { index: number, shot: VideoArtifact } }
  | { type: 'SET_MOTION_LOCK', payload: boolean }
  | { type: 'SET_EVALUATION', payload: { index: number, evaluation: ShotEvaluation } }
  | { type: 'ADD_LOG', payload: Omit<LogEntry, 'timestamp'> }
  | { type: 'SET_ERROR', payload: string }
  | { type: 'RESET' };

// Reducer
const reducer = (state: ProductionState, action: Action): ProductionState => {
  switch (action.type) {
    case 'START_PIPELINE':
      return { ...initialState, phase: 'PLANNING' };
    case 'SET_PHASE':
      return { ...state, phase: action.payload };
    case 'UPDATE_ARTIFACTS':
      return {
        ...state,
        artifacts: { ...state.artifacts, ...action.payload }
      };
    case 'UPDATE_SHOT':
      const newShots = [...state.artifacts.shots];
      newShots[action.payload.index] = action.payload.shot;
      return {
        ...state,
        artifacts: {
          ...state.artifacts,
          shots: newShots
        }
      };
    case 'SET_MOTION_LOCK':
      return {
        ...state,
        artifacts: {
          ...state.artifacts,
          motionLocked: action.payload
        }
      };
    case 'SET_EVALUATION':
      const evaluatedShots = [...state.artifacts.shots];
      evaluatedShots[action.payload.index] = {
        ...evaluatedShots[action.payload.index],
        evaluation: action.payload.evaluation
      };
      return {
        ...state,
        artifacts: {
          ...state.artifacts,
          shots: evaluatedShots
        }
      };
    case 'ADD_LOG':
      return {
        ...state,
        logs: [...state.logs, { ...action.payload, timestamp: Date.now() }]
      };
    case 'SET_ERROR':
      return { ...state, phase: 'ERROR', error: action.payload };
    case 'RESET':
      return initialState;
    default:
      return state;
  }
};

// Context
const ProductionContext = createContext<{
  state: ProductionState;
  dispatch: React.Dispatch<Action>;
}>({ state: initialState, dispatch: () => null });

// Provider
export const ProductionProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [state, dispatch] = useReducer(reducer, initialState);

  return (
    <ProductionContext.Provider value={{ state, dispatch }}>
      {children}
    </ProductionContext.Provider>
  );
};

// Hook
export const useProduction = () => useContext(ProductionContext);
