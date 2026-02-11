
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { Video } from '@google/genai';
import React, { useCallback, useEffect, useState } from 'react';
import ApiKeyDialog from './components/ApiKeyDialog';
import { CurvedArrowDownIcon, SparklesIcon, ArrowLeftIcon } from './components/icons';
import LoadingIndicator from './components/LoadingIndicator';
import PromptForm from './components/PromptForm';
import VideoResult from './components/VideoResult';
import PipelineVisualizer from './components/PipelineVisualizer';
import { ProductionProvider, useProduction } from './context/ProductionContext';
import { ImageUpload } from './components/ImageUpload';
import { generateVideo } from './services/geminiService';
import {
  extractFrameFromBlob,
  runArtistAgent,
  runDirectorAgent,
  runProductionPipeline,
  runRefinerAgent,
  runShotDraftingAgent
} from './services/pipelineService';
import {
  AppState,
  AspectRatio,
  GenerateVideoParams,
  GenerationMode,
  ImageFile,
  Resolution,
  VideoFile,
} from './types';

// Wrapper component to access context
const StudioContent: React.FC<{
  onExit: () => void;
  prompt: string;
  setPrompt: (p: string) => void;
  isStarted: boolean;
  setIsStarted: (b: boolean) => void;
}> = ({ onExit, prompt, setPrompt, isStarted, setIsStarted }) => {
  const { state, dispatch } = useProduction();
  const [userCharacter, setUserCharacter] = useState<ImageFile | null>(null);
  const [userEnvironment, setUserEnvironment] = useState<ImageFile | null>(null);

  const startPipeline = async () => {
    if (!prompt.trim()) return;
    setIsStarted(true);
    dispatch({ type: 'START_PIPELINE' });
    dispatch({ type: 'ADD_LOG', payload: { agent: 'System', message: 'Initializing Dailies Engine...', phase: 'PLANNING' } });

    try {
      // 1. DIRECTOR
      dispatch({ type: 'ADD_LOG', payload: { agent: 'Director', message: 'Breaking script into 3 distinct shots...', phase: 'PLANNING' } });
      const plan = await runDirectorAgent(prompt);
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

  const handleRegenerateShot = async (index: number, feedback: string) => {
    if (!state.artifacts.plan || !state.artifacts.assets) return;
    
    const shotParams = state.artifacts.plan.shots[index];
    const currentShot = state.artifacts.shots[index];
    const nextVersion = (currentShot?.version || 1) + 1;

    dispatch({ type: 'ADD_LOG', payload: { agent: 'Engineer', message: `Regenerating SC01_SH0${index + 1} (Take ${nextVersion})...`, phase: 'DRAFTING' } });
    
    // We don't set the whole phase to DRAFTING to avoid UI disruption, 
    // but the specific shot card will show loading based on a local state we'll add to Visualizer.
    
    try {
      const newShot = await runShotDraftingAgent(
        shotParams, 
        state.artifacts.plan, 
        state.artifacts.assets, 
        feedback
      );

      dispatch({ 
        type: 'UPDATE_SHOT', 
        payload: { 
          index, 
          shot: { ...newShot, userFeedback: feedback, version: nextVersion } 
        } 
      });
      
      dispatch({ type: 'ADD_LOG', payload: { agent: 'System', message: `Shot ${index + 1} Take ${nextVersion} ready.`, phase: 'COMPLETE' } });
    } catch (e: any) {
      console.error(e);
      dispatch({ type: 'ADD_LOG', payload: { agent: 'System', message: `Regeneration failed: ${e.message}`, phase: 'ERROR' } });
    }
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

          <div className="flex gap-4 items-center">
            <button onClick={onExit} className="px-6 py-3 rounded-full text-gray-500 hover:text-white hover:bg-white/10 transition-all font-medium text-sm">
              Exit Studio
            </button>
            <button
              onClick={async () => {
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

                try {
                  const belleRes = await fetch('/test/Belle.png');
                  const envRes = await fetch('/test/env.jpg');

                  if (!belleRes.ok || !envRes.ok) throw new Error('Test assets not found in /public/test/');

                  const belleBlob = await belleRes.blob();
                  const envBlob = await envRes.blob();

                  const belleFile = new File([belleBlob], 'Belle.png', { type: 'image/png' });
                  const envFile = new File([envBlob], 'env.jpg', { type: 'image/jpeg' });

                  setUserCharacter(await fileToImageFile(belleFile));
                  setUserEnvironment(await fileToImageFile(envFile));
                  setPrompt("Create a 10-second cat food commercial. The main character is a fluffy white cat named Belle. Start with Belle looking hungry and meowing at an empty bowl. She discovers a can of premium cat food opening, with steam rising and chunks of meat visible. Belle eats happily, purring and licking her lips. End with text overlay: 'Belle loves [Brand] Cat Food – Nutritious and Delicious!' Upbeat music, vibrant colors, smooth animation.");
                } catch (e) {
                  console.error("Failed to load test set:", e);
                  alert("Failed to load test set. Make sure /public/test/Belle.png and env.jpg exist.");
                }
              }}
              className="px-6 py-3 rounded-full text-indigo-400 border border-indigo-500/30 hover:bg-indigo-500/10 transition-all font-medium text-sm">
              Test Set
            </button>
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
          <PipelineVisualizer onRegenerate={handleRegenerateShot} />
        </div>
      )}
    </div>
  );
}

const App: React.FC = () => {
  const [appState, setAppState] = useState<AppState>(AppState.IDLE);
  const [isStudioMode, setIsStudioMode] = useState(false);
  const [studioPrompt, setStudioPrompt] = useState("");
  const [isPipelineStarted, setIsPipelineStarted] = useState(false);

  // --- CLASSIC MODE STATE ---
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [lastConfig, setLastConfig] = useState<GenerateVideoParams | null>(null);
  const [lastVideoObject, setLastVideoObject] = useState<Video | null>(null);
  const [lastVideoBlob, setLastVideoBlob] = useState<Blob | null>(null);
  const [showApiKeyDialog, setShowApiKeyDialog] = useState(false);
  const [initialFormValues, setInitialFormValues] = useState<GenerateVideoParams | null>(null);

  useEffect(() => {
    const checkApiKey = async () => {
      if (window.aistudio) {
        try {
          if (!(await window.aistudio.hasSelectedApiKey())) {
            setShowApiKeyDialog(true);
          }
        } catch (error) {
          console.warn('aistudio.hasSelectedApiKey check failed', error);
          setShowApiKeyDialog(true);
        }
      }
    };
    checkApiKey();
  }, []);

  const handleGenerate = useCallback(async (params: GenerateVideoParams) => {
    if (window.aistudio) {
      try {
        if (!(await window.aistudio.hasSelectedApiKey())) {
          setShowApiKeyDialog(true);
          return;
        }
      } catch (error) {
        setShowApiKeyDialog(true);
        return;
      }
    }

    setAppState(AppState.LOADING);
    setErrorMessage(null);
    setLastConfig(params);
    setInitialFormValues(null);

    try {
      const { objectUrl, blob, video } = await generateVideo(params);
      setVideoUrl(objectUrl);
      setLastVideoBlob(blob);
      setLastVideoObject(video);
      setAppState(AppState.SUCCESS);
    } catch (error: any) {
      console.error('Video generation failed:', error);
      const msg = error.message || 'Unknown error';
      if (msg.includes('Requested entity was not found') || msg.includes('403')) {
        setShowApiKeyDialog(true);
      }
      setErrorMessage(msg);
      setAppState(AppState.ERROR);
    }
  }, []);

  const handleRetry = useCallback(() => {
    if (lastConfig) handleGenerate(lastConfig);
  }, [lastConfig, handleGenerate]);

  const handleApiKeyDialogContinue = async () => {
    setShowApiKeyDialog(false);
    if (window.aistudio) await window.aistudio.openSelectKey();
  };

  const handleNewVideo = useCallback(() => {
    setAppState(AppState.IDLE);
    setVideoUrl(null);
    setErrorMessage(null);
    setLastConfig(null);
    setLastVideoObject(null);
    setLastVideoBlob(null);
    setInitialFormValues(null);
  }, []);

  const handleExtend = useCallback(async () => {
    if (lastConfig && lastVideoBlob && lastVideoObject) {
      const file = new File([lastVideoBlob], 'last_video.mp4', { type: lastVideoBlob.type });
      const videoFile: VideoFile = { file, base64: '' };
      setInitialFormValues({
        ...lastConfig,
        mode: GenerationMode.EXTEND_VIDEO,
        prompt: '',
        inputVideo: videoFile,
        inputVideoObject: lastVideoObject,
        resolution: Resolution.P720,
        startFrame: null,
        endFrame: null,
        referenceImages: [],
        styleImage: null,
        isLooping: false
      });
      setAppState(AppState.IDLE);
      setVideoUrl(null);
      setErrorMessage(null);
    }
  }, [lastConfig, lastVideoBlob, lastVideoObject]);

  const canExtend = lastConfig?.resolution === Resolution.P720;

  return (
    <ProductionProvider>
      <div className="h-screen bg-black text-gray-200 flex flex-col font-sans overflow-hidden">
        {showApiKeyDialog && <ApiKeyDialog onContinue={handleApiKeyDialogContinue} />}

        <header className="py-4 px-8 border-b border-gray-800 bg-gray-900/50 flex justify-between items-center z-10">
          <h1 className="text-2xl font-semibold tracking-wide bg-gradient-to-r from-indigo-400 via-purple-500 to-pink-500 bg-clip-text text-transparent">
            Veo Studio
          </h1>
          <div className="flex bg-gray-800 rounded-full p-1 border border-gray-700">
            <button
              onClick={() => setIsStudioMode(false)}
              className={`px-4 py-1.5 rounded-full text-xs font-medium transition-all ${!isStudioMode ? 'bg-indigo-600 text-white shadow' : 'text-gray-400 hover:text-white'}`}>
              Classic
            </button>
            <button
              onClick={() => setIsStudioMode(true)}
              className={`px-4 py-1.5 rounded-full text-xs font-medium transition-all flex items-center gap-1 ${isStudioMode ? 'bg-indigo-600 text-white shadow' : 'text-gray-400 hover:text-white'}`}>
              Dailies Engine <span className="bg-emerald-500 text-black text-[9px] px-1 rounded font-bold">BETA</span>
            </button>
          </div>
        </header>

        <main className="flex-grow w-full h-full overflow-hidden relative">
          {isStudioMode ? (
            <StudioContent
              onExit={() => setIsStudioMode(false)}
              prompt={studioPrompt}
              setPrompt={setStudioPrompt}
              isStarted={isPipelineStarted}
              setIsStarted={setIsPipelineStarted}
            />
          ) : (
            <div className="w-full max-w-4xl mx-auto flex-grow flex flex-col p-4 h-full overflow-y-auto">
              {appState === AppState.IDLE ? (
                <>
                  <div className="flex-grow flex items-center justify-center min-h-[300px]">
                    <div className="relative text-center">
                      <h2 className="text-3xl text-gray-600">Type in the prompt box to start</h2>
                      <CurvedArrowDownIcon className="absolute top-full left-1/2 -translate-x-1/2 mt-4 w-24 h-24 text-gray-700 opacity-60" />
                    </div>
                  </div>
                  <div className="pb-4">
                    <PromptForm onGenerate={handleGenerate} initialValues={initialFormValues} />
                  </div>
                </>
              ) : (
                <div className="flex-grow flex items-center justify-center">
                  {appState === AppState.LOADING && <LoadingIndicator />}
                  {appState === AppState.SUCCESS && videoUrl && (
                    <VideoResult
                      videoUrl={videoUrl}
                      onRetry={handleRetry}
                      onNewVideo={handleNewVideo}
                      onExtend={handleExtend}
                      canExtend={canExtend}
                      aspectRatio={lastConfig?.aspectRatio || AspectRatio.LANDSCAPE}
                    />
                  )}
                  {appState === AppState.ERROR && errorMessage && (
                    <div className="text-center bg-red-900/20 border border-red-500 p-8 rounded-lg">
                      <h2 className="text-xl text-red-400 mb-2">Error</h2>
                      <p className="text-red-300">{errorMessage}</p>
                      <button onClick={() => { setAppState(AppState.IDLE); setErrorMessage(null); }} className="mt-4 px-4 py-2 bg-gray-700 rounded">Back</button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </main>
      </div>
    </ProductionProvider>
  );
};

export default App;
