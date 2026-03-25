/**
 * StudioLayout — Advanced 3-panel workspace replacing PipelineVisualizer.
 * Left: Creative control (Director/Bible). Center: Dailies feed. Right: Logs.
 */
import React, { useState, useCallback, useEffect } from 'react';
import { useProduction } from '../../context/ProductionContext';
import LeftSidebar from './LeftSidebar';
import RightSidebar from './RightSidebar';
import ShotCard from './ShotCard';
import { AssetItem } from '../../types';
import { runSingleAssetRegen } from '../../services/pipelineService';

interface StudioLayoutProps {
  onRegenerateShot: (index: number, feedback: string) => void;
  onExportCommercial?: () => void;
}

const StudioLayout: React.FC<StudioLayoutProps> = ({ onRegenerateShot, onExportCommercial }) => {
  const { state, dispatch } = useProduction();
  
  // Local state for prompt edits before they get locked into the next "Take"
  const [editedPrompts, setEditedPrompts] = useState<Record<number, string>>({});
  const [regeneratingAssetId, setRegeneratingAssetId] = useState<string | null>(null);

  // Sync editedPrompts with the initial plan when it loads
  useEffect(() => {
    if (state.artifacts.plan && Object.keys(editedPrompts).length === 0) {
      const initial: Record<number, string> = {};
      state.artifacts.plan.shots.forEach((shot, i) => {
        initial[i] = shot.prompt;
      });
      setEditedPrompts(initial);
    }
  }, [state.artifacts.plan]);

  const handlePromptChange = useCallback((index: number, newPrompt: string) => {
    setEditedPrompts(prev => ({ ...prev, [index]: newPrompt }));
  }, []);

  const handleRegenerateShot = useCallback((index: number, feedback: string) => {
    // We pass the customized prompt up to the parent App.tsx if we want it to use it.
    // However, App.tsx's handleRegenerateShot uses the original plan prompt.
    // To properly override, we need to update the plan in Context or pass it to App.
    // Since App.tsx reads from state.artifacts.plan, let's update that specific shot's prompt in the plan first:
    if (state.artifacts.plan) {
      const updatedPlan = { ...state.artifacts.plan };
      updatedPlan.shots[index].prompt = editedPrompts[index] || updatedPlan.shots[index].prompt;
      dispatch({ type: 'UPDATE_ARTIFACTS', payload: { plan: updatedPlan } });
    }
    
    // Now trigger the actual generation in App.tsx
    onRegenerateShot(index, feedback);
  }, [editedPrompts, state.artifacts.plan, dispatch, onRegenerateShot]);

  const handleAssetRegen = useCallback(async (asset: AssetItem, feedback: string) => {
    if (!state.artifacts.plan) return;

    setRegeneratingAssetId(asset.id);
    dispatch({ type: 'ADD_LOG', payload: { agent: 'Artist', phase: 'ASSET_GEN', message: `Regenerating ${asset.type} asset with feedback: "${feedback}"` } });
    
    try {
      const newAsset = await runSingleAssetRegen(asset, feedback, state.artifacts.plan);
      dispatch({ type: 'UPDATE_ASSET', payload: { id: asset.id, asset: newAsset } });
      dispatch({ type: 'ADD_LOG', payload: { agent: 'System', phase: 'ASSET_GEN', message: `Asset ${asset.type} updated successfully.` } });
    } catch (e: any) {
      console.error(e);
      dispatch({ type: 'ADD_LOG', payload: { agent: 'System', phase: 'ERROR', message: `Asset regen failed: ${e.message}` } });
    } finally {
      setRegeneratingAssetId(null);
    }
  }, [state.artifacts.plan, dispatch]);

  const shots = state.artifacts.plan?.shots || [];

  return (
    <div className="flex h-full w-full bg-[#12122A] overflow-hidden text-gray-200">
      
      {/* 1. Left Sidebar: Creator Tools */}
      <LeftSidebar
        editedPrompts={editedPrompts}
        onPromptChange={handlePromptChange}
        onAssetRegen={handleAssetRegen}
        regeneratingAssetId={regeneratingAssetId}
        onExport={onExportCommercial}
      />

      {/* 2. Center Feed: Dailies */}
      <div className="flex-grow flex flex-col h-full overflow-y-auto custom-scrollbar bg-black relative shadow-[inset_0_0_100px_rgba(0,0,0,0.8)]">
        <div className="max-w-4xl w-full mx-auto p-8 space-y-12">
          
          {state.phase === 'ERROR' && (
            <div className="bg-red-900/40 border border-red-500/50 rounded-xl p-6 text-red-200 shadow-2xl">
              <h3 className="text-xl font-bold mb-2">Pipeline Error</h3>
              <p>{state.error}</p>
            </div>
          )}

          {shots.map((shot, index) => (
            <ShotCard
              key={shot.id}
              index={index}
              shotPlan={shot}
              shotResult={state.artifacts.shots[index]}
              evalScore={state.artifacts.evalReport?.shotEvaluations[index]}
              isRegenerating={state.phase === 'DRAFTING' && !state.artifacts.shots[index]} // Very basic approximation, App.tsx handles precise loader but we show rolling if phase is DRAFTING and result is missing. Actually App.tsx handles regen per shot. Let's assume if it's missing or evaluating it is regening.
              editedPrompt={editedPrompts[index]}
              onPromptChange={handlePromptChange}
              onRegenerate={handleRegenerateShot}
            />
          ))}

          {shots.length === 0 && state.phase !== 'ERROR' && state.phase !== 'IDLE' && (
            <div className="flex flex-col items-center justify-center h-[60vh] text-gray-500">
              <div className="w-16 h-16 border-4 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin mb-6" />
              <h2 className="text-2xl font-bold tracking-widest uppercase mb-2" style={{ fontFamily: 'Poppins, sans-serif' }}>
                Director is storyboarding
              </h2>
              <p className="text-sm">Breaking down prompt into logical sequence...</p>
            </div>
          )}
        </div>
      </div>

      {/* 3. Right Sidebar: Logs */}
      <RightSidebar />

    </div>
  );
};

export default StudioLayout;
