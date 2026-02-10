
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import {Video} from '@google/genai';
import React, {useCallback, useEffect, useState} from 'react';
import ApiKeyDialog from './components/ApiKeyDialog';
import {CurvedArrowDownIcon} from './components/icons';
import LoadingIndicator from './components/LoadingIndicator';
import PromptForm from './components/PromptForm';
import VideoResult from './components/VideoResult';
import PipelineVisualizer from './components/PipelineVisualizer';
import { ProductionProvider, useProduction } from './context/ProductionContext';
import { generateVideo } from './services/geminiService';
import {
  extractFrameFromBlob,
  runArtistAgent,
  runDirectorAgent,
  runDraftingAgent,
  runMasteringAgent,
  runRefinerAgent
} from './services/pipelineService';
import {
  AppState,
  AspectRatio,
  GenerateVideoParams,
  GenerationMode,
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

  const startPipeline = async () => {
    if (!prompt.trim()) return;
    setIsStarted(true);
    dispatch({ type: 'START_PIPELINE' });
    dispatch({ type: 'ADD_LOG', payload: { agent: 'System', message: 'Initializing pipeline...', phase: 'PLANNING' } });

    try {
      // 1. DIRECTOR
      dispatch({ type: 'ADD_LOG', payload: { agent: 'Director', message: 'Analyzing prompt and creating shot list...', phase: 'PLANNING' } });
      const plan = await runDirectorAgent(prompt);
      dispatch({ type: 'UPDATE_ARTIFACTS', payload: { plan } });
      dispatch({ type: 'ADD_LOG', payload: { agent: 'Director', message: 'Shot plan approved.', phase: 'PLANNING' } });

      // 2. ARTIST
      dispatch({ type: 'SET_PHASE', payload: 'ASSET_GEN' });
      dispatch({ type: 'ADD_LOG', payload: { agent: 'Artist', message: 'Generating visual assets...', phase: 'ASSET_GEN' } });
      const assets = await runArtistAgent(plan);
      dispatch({ type: 'UPDATE_ARTIFACTS', payload: { assets } });
      dispatch({ type: 'ADD_LOG', payload: { agent: 'Artist', message: `Assets created: ${assets.length} files.`, phase: 'ASSET_GEN' } });

      // 3. DRAFTING
      dispatch({ type: 'SET_PHASE', payload: 'DRAFTING' });
      dispatch({ type: 'ADD_LOG', payload: { agent: 'Engineer', message: 'Starting Veo Fast draft generation...', phase: 'DRAFTING' } });
      const draftVideo = await runDraftingAgent(plan, assets);
      dispatch({ type: 'UPDATE_ARTIFACTS', payload: { draftVideo } });
      dispatch({ type: 'ADD_LOG', payload: { agent: 'Engineer', message: 'Draft video available for review.', phase: 'DRAFTING' } });

      // 4. REFINING
      dispatch({ type: 'SET_PHASE', payload: 'REFINING' });
      dispatch({ type: 'ADD_LOG', payload: { agent: 'Engineer', message: 'Extracting reference frame from draft...', phase: 'REFINING' } });
      
      // Safety delay for browser blob processing
      await new Promise(r => setTimeout(r, 1000));
      const frameBlob = await extractFrameFromBlob(draftVideo.blob, 0.5); // Extract at 0.5s
      const originalFrameUrl = URL.createObjectURL(frameBlob);
      
      dispatch({ type: 'ADD_LOG', payload: { agent: 'Engineer', message: 'Upscaling anchor frame with Gemini 3 Pro...', phase: 'REFINING' } });
      const upscaledBlob = await runRefinerAgent(frameBlob, plan);
      const upscaledUrl = URL.createObjectURL(upscaledBlob);
      
      dispatch({ type: 'UPDATE_ARTIFACTS', payload: { 
        anchorFrame: { original: originalFrameUrl, upscaled: upscaledUrl, blob: upscaledBlob } 
      }});
      
      // 5. MASTERING
      dispatch({ type: 'SET_PHASE', payload: 'RENDERING' });
      dispatch({ type: 'ADD_LOG', payload: { agent: 'Engineer', message: 'Rendering final 1080p master with Veo 3.1...', phase: 'RENDERING' } });
      const finalVideo = await runMasteringAgent(plan, upscaledBlob);
      
      dispatch({ type: 'UPDATE_ARTIFACTS', payload: { finalVideo } });
      dispatch({ type: 'SET_PHASE', payload: 'COMPLETE' });
      dispatch({ type: 'ADD_LOG', payload: { agent: 'System', message: 'Production complete. Delivery ready.', phase: 'COMPLETE' } });

    } catch (e: any) {
      console.error(e);
      dispatch({ type: 'SET_ERROR', payload: e.message || "Unknown Pipeline Error" });
      dispatch({ type: 'ADD_LOG', payload: { agent: 'System', message: `CRITICAL ERROR: ${e.message}`, phase: 'ERROR' } });
    }
  };

  return (
    <div className="flex flex-col h-full w-full max-w-7xl mx-auto px-4 py-6">
       {!isStarted ? (
         <div className="flex flex-col items-center justify-center h-full max-w-2xl mx-auto text-center">
            <h2 className="text-4xl font-bold bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent mb-6">
              Agentic Video Studio
            </h2>
            <p className="text-gray-400 mb-8 text-lg">
               Describe your vision. A team of AI agents (Director, Artist, Engineer) will plan, sketch, draft, and refine your video automatically.
            </p>
            <textarea 
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="E.g. A cyberpunk samurai meditating in a neon garden, rain falling..."
              className="w-full bg-gray-800/50 border border-gray-700 rounded-xl p-4 text-white placeholder-gray-500 focus:ring-2 focus:ring-indigo-500 outline-none min-h-[120px] mb-6"
            />
            <div className="flex gap-4">
              <button onClick={onExit} className="px-6 py-3 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-colors">
                Back to Classic
              </button>
              <button 
                onClick={startPipeline}
                disabled={!prompt.trim()}
                className="px-8 py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-lg shadow-lg shadow-indigo-900/30 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed">
                Start Production
              </button>
            </div>
         </div>
       ) : (
         <div className="flex flex-col h-full">
            <div className="flex justify-between items-center mb-4">
               <button onClick={() => { setIsStarted(false); dispatch({type: 'RESET'}); }} className="text-xs text-gray-500 hover:text-gray-300">
                  ← Abort Production
               </button>
            </div>
            <PipelineVisualizer />
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
      const {objectUrl, blob, video} = await generateVideo(params);
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
                Agentic <span className="bg-amber-500 text-black text-[9px] px-1 rounded font-bold">NEW</span>
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
