
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import React, { useEffect, useState } from 'react';
import ApiKeyDialog from './components/ApiKeyDialog';
import { SparklesIcon, ArrowLeftIcon } from './components/icons';
import PipelineVisualizer from './components/PipelineVisualizer';
import { ProductionProvider, useProduction } from './context/ProductionContext';
import { ImageUpload } from './components/ImageUpload';
import {
  runArtistAgent,
  runDirectorAgent,
  runProductionPipeline,
  runRefinementPhase,
  runSceneGenerationAgent
} from './services/pipelineService';
import {
  ImageFile,
} from './types';

const TEST_SCENARIOS = [
  {
    id: 'cat-food',
    label: '🐱 Cat Food',
    promptFile: '/test/test_prompt1.txt',
    charFile: '/test/Belle.png',
    envFile: '/test/env.jpg'
  },
  {
    id: 'kyoto-dog',
    label: '🐕 Kyoto Dog',
    promptFile: '/test/test_prompt2.txt',
    charFile: '/test/Rover.png',
    envFile: '/test/kyoto-japan-26.jpg'
  },
  {
    id: 'bolivia-cat',
    label: '🇧🇴 Bolivia Cat',
    promptFile: '/test/test_prompt3.txt',
    charFile: '/test/Belle.png',
    envFile: '/test/bolivia-coast.jpg'
  }
];

// Wrapper component to access context
const StudioContent: React.FC<{
  prompt: string;
  setPrompt: (p: string) => void;
  isStarted: boolean;
  setIsStarted: (b: boolean) => void;
}> = ({ prompt, setPrompt, isStarted, setIsStarted }) => {
  const { state, dispatch } = useProduction();
  const [userCharacter, setUserCharacter] = useState<ImageFile | null>(null);
  const [userEnvironment, setUserEnvironment] = useState<ImageFile | null>(null);
  const [isLoadingTest, setIsLoadingTest] = useState(false);

  const fileToImageFile = (file: File): Promise<ImageFile> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = (reader.result as string).split(',')[1];
        if (base64) resolve({ file, base64 });
        else reject(new Error('Failed to read file'));
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const loadTestScenario = async (scenario: typeof TEST_SCENARIOS[0]) => {
    setIsLoadingTest(true);
    try {
      const [promptRes, charRes, envRes] = await Promise.all([
        fetch(scenario.promptFile),
        fetch(scenario.charFile),
        fetch(scenario.envFile)
      ]);

      if (!promptRes.ok || !charRes.ok || !envRes.ok) {
        throw new Error(`Failed to load assets for ${scenario.label}`);
      }

      // Check for HTML response (SPA fallback 404)
      const promptContentType = promptRes.headers.get('content-type');
      if (promptContentType && promptContentType.includes('text/html')) {
        throw new Error(`Asset not found (server returned HTML for ${scenario.promptFile})`);
      }

      const promptText = await promptRes.text();
      
      // Secondary check: if the text looks like HTML doctype
      if (promptText.trim().toLowerCase().startsWith('<!doctype html') || promptText.trim().toLowerCase().startsWith('<html')) {
        throw new Error(`Asset not found (content is HTML for ${scenario.promptFile})`);
      }

      const charBlob = await charRes.blob();
      const envBlob = await envRes.blob();

      // Get filenames from paths
      const charName = scenario.charFile.split('/').pop() || 'char.png';
      const envName = scenario.envFile.split('/').pop() || 'env.jpg';

      const charFile = new File([charBlob], charName, { type: charBlob.type });
      const envFile = new File([envBlob], envName, { type: envBlob.type });

      setUserCharacter(await fileToImageFile(charFile));
      setUserEnvironment(await fileToImageFile(envFile));
      setPrompt(promptText.trim());
    } catch (e) {
      console.error("Test load failed:", e);
      alert(`Failed to load test set: ${scenario.label}`);
    } finally {
      setIsLoadingTest(false);
    }
  };

  const startPipeline = async () => {
    if (!prompt.trim()) return;
    setIsStarted(true);
    dispatch({ type: 'START_PIPELINE' });
    dispatch({ type: 'ADD_LOG', payload: { agent: 'System', message: 'Initializing Dailies Engine...', phase: 'PLANNING' } });

    try {
      // 1. DIRECTOR
      dispatch({ type: 'ADD_LOG', payload: { agent: 'Director', message: 'Breaking script into 3 distinct shots...', phase: 'PLANNING' } });
      const plan = await runDirectorAgent(
        prompt,
        userCharacter?.file as Blob,
        userEnvironment?.file as Blob
      );
      dispatch({ type: 'UPDATE_ARTIFACTS', payload: { plan } });
      dispatch({ type: 'ADD_LOG', payload: { agent: 'Director', message: 'Shot list approved. Handoff to Art Dept.', phase: 'PLANNING' } });

      // 2. ARTIST (Production Bible)
      dispatch({ type: 'SET_PHASE', payload: 'ASSET_GEN' });
      dispatch({ type: 'ADD_LOG', payload: { agent: 'Artist', message: 'Preparing asset bible (Character + Location)...', phase: 'ASSET_GEN' } });

      const assets = await runArtistAgent(
        plan,
        userCharacter?.file as Blob, // Type cast for simplicity in MVP
        userEnvironment?.file as Blob
      );

      dispatch({ type: 'UPDATE_ARTIFACTS', payload: { assets } });
      dispatch({ type: 'ADD_LOG', payload: { agent: 'Artist', message: `Bible locked. Assets: ${assets.length}. Source: ${assets.map(a => a.source).join(', ')}`, phase: 'ASSET_GEN' } });

      // 3. PRODUCTION (Sequential Shooting)
      dispatch({ type: 'SET_PHASE', payload: 'DRAFTING' });
      dispatch({ type: 'ADD_LOG', payload: { agent: 'Engineer', message: 'Pre-production cooldown (15s)...', phase: 'DRAFTING' } });
      
      const shots = await runProductionPipeline(plan, assets);

      dispatch({ type: 'UPDATE_ARTIFACTS', payload: { shots } });
      dispatch({ type: 'SET_PHASE', payload: 'COMPLETE' });
      dispatch({ type: 'ADD_LOG', payload: { agent: 'System', message: 'Dailies are ready for review.', phase: 'COMPLETE' } });

    } catch (e: any) {
      console.error(e);
      dispatch({ type: 'SET_ERROR', payload: e.message || "Unknown Pipeline Error" });
      dispatch({ type: 'ADD_LOG', payload: { agent: 'System', message: `CRITICAL FAILURE: ${e.message}`, phase: 'ERROR' } });
    }
  };

  const handleRegenerateScene = async (index: number, feedback: string) => {
    if (!state.artifacts.plan || !state.artifacts.assets) return;
    
    const sceneParams = state.artifacts.plan.scenes[index];
    const currentScene = state.artifacts.shots[index];
    const nextVersion = (currentScene?.version || 1) + 1;

    dispatch({ type: 'ADD_LOG', payload: { agent: 'Engineer', message: `Regenerating Scene ${index + 1} (Take ${nextVersion})...`, phase: 'DRAFTING' } });
    
    try {
      const newScene = await runSceneGenerationAgent(
        sceneParams, 
        state.artifacts.plan, 
        state.artifacts.assets, 
        feedback
      );

      dispatch({ 
        type: 'UPDATE_SHOT', 
        payload: { 
          index, 
          shot: { ...newScene, userFeedback: feedback, version: nextVersion } 
        } 
      });
      
      dispatch({ type: 'ADD_LOG', payload: { agent: 'System', message: `Scene ${index + 1} Take ${nextVersion} ready.`, phase: 'COMPLETE' } });
    } catch (e: any) {
      console.error(e);
      dispatch({ type: 'ADD_LOG', payload: { agent: 'System', message: `Regeneration failed: ${e.message}`, phase: 'ERROR' } });
    }
  };

  const handleRefineShot = async (index: number) => {
    if (!state.artifacts.plan || !state.artifacts.assets || !state.artifacts.shots[index]) return;
    
    dispatch({ 
      type: 'START_REFINEMENT', 
      payload: { video: state.artifacts.shots[index] } 
    });
    
    try {
      const refinedShot = await runRefinementPhase(
        state.artifacts.shots[index],
        state.artifacts.plan,
        state.artifacts.assets
      );
      
      dispatch({ 
        type: 'UPDATE_SHOT', 
        payload: { 
          index, 
          shot: refinedShot
        } 
      });
      
      dispatch({ type: 'ADD_LOG', payload: { agent: 'System', message: `Refinement complete: Consistency Score ${((refinedShot.consistencyScore || 0) * 100).toFixed(1)}%`, phase: 'COMPLETE' } });
      dispatch({ type: 'SET_PHASE', payload: 'COMPLETE' });
      
    } catch (e: any) {
      console.error(e);
      dispatch({ type: 'ADD_LOG', payload: { agent: 'System', message: `Refinement failed: ${e.message}`, phase: 'ERROR' } });
      dispatch({ type: 'SET_ERROR', payload: e.message });
    }
  };

  const handleRefineAll = async () => {
    if (!state.artifacts.plan || !state.artifacts.assets || !state.artifacts.shots) return;
    
    const totalShots = state.artifacts.shots.length;
    dispatch({ type: 'ADD_LOG', payload: { agent: 'System', message: `Starting batch refinement for ${totalShots} shots...`, phase: 'REFINING' } });
    
    for (let i = 0; i < totalShots; i++) {
      // Skip if already refined
      if (state.artifacts.shots[i]?.selectedKeyframe) {
        dispatch({ type: 'ADD_LOG', payload: { agent: 'System', message: `Scene ${i + 1}: Already mastered, skipping.`, phase: 'REFINING' } });
        continue;
      }
      
      dispatch({ type: 'ADD_LOG', payload: { agent: 'System', message: `Mastering Scene ${i + 1}/${totalShots} (4K)...`, phase: 'REFINING' } });
      
      try {
        dispatch({ 
          type: 'START_REFINEMENT', 
          payload: { video: state.artifacts.shots[i] } 
        });
        
        const refinedShot = await runRefinementPhase(
          state.artifacts.shots[i],
          state.artifacts.plan,
          state.artifacts.assets
        );
        
        dispatch({ 
          type: 'UPDATE_SHOT', 
          payload: { 
            index: i, 
            shot: refinedShot
          } 
        });
        
        dispatch({ type: 'ADD_LOG', payload: { agent: 'System', message: `Scene ${i + 1} mastered. Score: ${((refinedShot.consistencyScore || 0) * 100).toFixed(1)}%`, phase: 'COMPLETE' } });
        
      } catch (e: any) {
        console.error(e);
        dispatch({ type: 'ADD_LOG', payload: { agent: 'System', message: `Scene ${i + 1} failed: ${e.message}`, phase: 'ERROR' } });
      }
      
      // Throttle between shots to respect quota limits
      if (i < totalShots - 1) {
        dispatch({ type: 'ADD_LOG', payload: { agent: 'System', message: `Cooldown before next shot (10s)...`, phase: 'REFINING' } });
        await new Promise(resolve => setTimeout(resolve, 10000));
      }
    }
    
    dispatch({ type: 'SET_PHASE', payload: 'COMPLETE' });
    dispatch({ type: 'ADD_LOG', payload: { agent: 'System', message: `Batch mastering complete! All scenes ready for export.`, phase: 'COMPLETE' } });
  };

  return (
    <div className="flex flex-col h-full w-full max-w-7xl mx-auto px-4 py-6">
      {!isStarted ? (
        <div className="flex flex-col items-center justify-center min-h-[80vh] max-w-3xl mx-auto text-center animate-in fade-in duration-500">
          <h2 className="text-5xl font-black mb-2 tracking-tighter">
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 via-purple-400 to-indigo-400 animate-gradient-x">
              Veo Dailies
            </span>
          </h2>
          <p className="text-gray-400 mb-10 text-lg font-light">
            The Consistency Engine. One prompt, three matching shots.
          </p>

          {/* Asset Inputs */}
          <div className="flex gap-6 mb-10 w-full justify-center">
            <div className="flex flex-col gap-2 items-center">
              <span className="text-xs font-bold uppercase tracking-widest text-gray-500">Cast (Optional)</span>
              <ImageUpload
                label="Character Ref"
                image={userCharacter}
                onSelect={setUserCharacter}
                onRemove={() => setUserCharacter(null)}
                className="w-32 h-32 border-gray-700 bg-gray-800/50"
              />
            </div>
            <div className="flex flex-col gap-2 items-center">
              <span className="text-xs font-bold uppercase tracking-widest text-gray-500">Set (Optional)</span>
              <ImageUpload
                label="Location Ref"
                image={userEnvironment}
                onSelect={setUserEnvironment}
                onRemove={() => setUserEnvironment(null)}
                className="w-32 h-32 border-gray-700 bg-gray-800/50"
              />
            </div>
          </div>

          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Describe the scene... E.g. A cyberpunk samurai meditating in a neon garden, rain falling..."
            className="w-full bg-gray-900/50 border border-gray-700 rounded-2xl p-6 text-white text-lg placeholder-gray-600 focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 outline-none min-h-[140px] mb-8 shadow-inner transition-all"
          />

          <div className="flex gap-4 items-center flex-wrap justify-center">
            <div className="flex gap-2">
              {TEST_SCENARIOS.map((scenario) => (
                <button
                  key={scenario.id}
                  onClick={() => loadTestScenario(scenario)}
                  disabled={isLoadingTest}
                  className="px-4 py-2 rounded-full text-indigo-400 border border-indigo-500/30 hover:bg-indigo-500/10 transition-all font-medium text-xs whitespace-nowrap disabled:opacity-50">
                  {isLoadingTest ? 'Loading...' : scenario.label}
                </button>
              ))}
            </div>
            <div className="w-px h-8 bg-gray-800 mx-2 hidden md:block"></div>
            <button
              onClick={startPipeline}
              disabled={!prompt.trim()}
              className="px-10 py-4 bg-white text-black hover:bg-indigo-50 font-bold rounded-full shadow-[0_0_20px_rgba(255,255,255,0.3)] hover:shadow-[0_0_30px_rgba(255,255,255,0.5)] transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none flex items-center gap-2">
              <SparklesIcon className="w-5 h-5" />
              Generate Dailies
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col h-full">
          <div className="flex justify-between items-center mb-6 pl-2">
            <button onClick={() => { setIsStarted(false); dispatch({ type: 'RESET' }); }} className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-gray-500 hover:text-white transition-colors">
              <ArrowLeftIcon className="w-4 h-4" /> Reset Studio
            </button>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
              <span className="text-xs text-green-500 font-mono">LIVE SESSION</span>
            </div>
          </div>
          <PipelineVisualizer 
            onRegenerate={handleRegenerateScene} 
            onRefine={handleRefineShot}
            onRefineAll={handleRefineAll}
          />
        </div>
      )}
    </div>
  );
}

const App: React.FC = () => {
  const [studioPrompt, setStudioPrompt] = useState("");
  const [isPipelineStarted, setIsPipelineStarted] = useState(false);
  const [showApiKeyDialog, setShowApiKeyDialog] = useState(false);

  useEffect(() => {
    const checkApiKey = async () => {
      // Check if running in AI Studio
      if (window.aistudio) {
        try {
          if (!(await window.aistudio.hasSelectedApiKey())) {
            setShowApiKeyDialog(true);
          }
        } catch (error) {
          console.warn('aistudio.hasSelectedApiKey check failed', error);
          setShowApiKeyDialog(true);
        }
      } else {
        // Local development: check if API key is set in environment
        const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
        if (!apiKey) {
          console.warn('No API key found in environment. Set VITE_GEMINI_API_KEY or GEMINI_API_KEY in .env file.');
          setShowApiKeyDialog(true); // Show dialog for informational purposes
        } else {
          console.log('Using API key from environment for local development');
        }
      }
    };
    checkApiKey();
  }, []);

  const handleApiKeyDialogContinue = async () => {
    setShowApiKeyDialog(false);
    if (window.aistudio) await window.aistudio.openSelectKey();
  };

  return (
    <ProductionProvider>
      <div className="h-screen bg-black text-gray-200 flex flex-col font-sans overflow-hidden">
        {showApiKeyDialog && <ApiKeyDialog onContinue={handleApiKeyDialogContinue} />}

        <header className="py-4 px-8 border-b border-gray-800 bg-gray-900/50 flex justify-between items-center z-10">
          <h1 className="text-2xl font-semibold tracking-wide bg-gradient-to-r from-indigo-400 via-purple-500 to-pink-500 bg-clip-text text-transparent">
            Veo Studio
          </h1>
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-indigo-400 bg-indigo-400/10 px-3 py-1 rounded-full border border-indigo-400/20">
              Dailies Engine <span className="ml-1 bg-emerald-500 text-black text-[9px] px-1 rounded font-bold">BETA</span>
            </span>
          </div>
        </header>

        <main className="flex-grow w-full h-full overflow-hidden relative">
          <StudioContent
            prompt={studioPrompt}
            setPrompt={setStudioPrompt}
            isStarted={isPipelineStarted}
            setIsStarted={setIsPipelineStarted}
          />
        </main>
      </div>
    </ProductionProvider>
  );
};

export default App;
