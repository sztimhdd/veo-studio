
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import React, { useEffect, useRef } from 'react';
import { useProduction } from '../context/ProductionContext';
import { ArrowRightIcon, SparklesIcon, ChevronDownIcon, TvIcon, VideoIcon, FileImageIcon, FilmIcon, PlayIcon, CheckCircleIcon } from 'lucide-react';

const PipelineVisualizer: React.FC = () => {
  const { state } = useProduction();
  const logsEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll logs
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [state.logs]);

  const PhaseIndicator = ({ phase, current, label }: { phase: string, current: string, label: string }) => {
    const isPast = ['PLANNING', 'ASSET_GEN', 'DRAFTING', 'REFINING', 'RENDERING', 'COMPLETE'].indexOf(current) > ['PLANNING', 'ASSET_GEN', 'DRAFTING', 'REFINING', 'RENDERING', 'COMPLETE'].indexOf(phase);
    const isCurrent = current === phase;
    
    let color = "text-gray-500 border-gray-700";
    if (isCurrent) color = "text-indigo-400 border-indigo-500 animate-pulse";
    if (isPast) color = "text-emerald-400 border-emerald-500";
    
    return (
      <div className={`flex flex-col items-center gap-2 ${isCurrent || isPast ? 'opacity-100' : 'opacity-50'}`}>
         <div className={`w-8 h-8 rounded-full border-2 flex items-center justify-center ${color} bg-gray-900 z-10`}>
            {isPast ? <CheckCircleIcon className="w-4 h-4" /> : <div className={`w-2 h-2 rounded-full ${isCurrent ? 'bg-indigo-400' : 'bg-gray-600'}`} />}
         </div>
         <span className={`text-xs font-medium uppercase tracking-wider ${isCurrent ? 'text-indigo-300' : 'text-gray-500'}`}>{label}</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full gap-4 max-w-6xl mx-auto w-full">
      {/* 1. Header & Progress */}
      <div className="bg-gray-900/80 border border-gray-800 rounded-xl p-6 backdrop-blur-md">
        <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-3">
                <div className="p-2 bg-indigo-600/20 rounded-lg">
                    <SparklesIcon className="w-6 h-6 text-indigo-400" />
                </div>
                <div>
                    <h2 className="text-xl font-bold text-white">Agentic Production Studio</h2>
                    <p className="text-xs text-gray-400 font-mono">GEMINI-3-PRO // VEO-3.1 // ORCHESTRATOR</p>
                </div>
            </div>
            {state.phase === 'COMPLETE' && (
                 <span className="px-3 py-1 bg-emerald-500/20 text-emerald-400 text-xs rounded-full border border-emerald-500/50">Production Complete</span>
            )}
            {state.phase === 'ERROR' && (
                 <span className="px-3 py-1 bg-red-500/20 text-red-400 text-xs rounded-full border border-red-500/50">System Failure</span>
            )}
        </div>
        
        <div className="relative flex justify-between px-4">
             {/* Connector Line */}
             <div className="absolute top-4 left-0 w-full h-0.5 bg-gray-800 -z-0" />
             
             <PhaseIndicator phase="PLANNING" current={state.phase} label="Director" />
             <PhaseIndicator phase="ASSET_GEN" current={state.phase} label="Artist" />
             <PhaseIndicator phase="DRAFTING" current={state.phase} label="Draft" />
             <PhaseIndicator phase="REFINING" current={state.phase} label="Refine" />
             <PhaseIndicator phase="RENDERING" current={state.phase} label="Render" />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 flex-grow min-h-0">
         
         {/* 2. Left Panel: The Blueprint & Assets */}
         <div className="flex flex-col gap-4">
            <div className="bg-gray-900/60 border border-gray-800 rounded-xl p-4 flex-1 overflow-y-auto">
                <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-4 flex items-center gap-2">
                    <FileImageIcon className="w-4 h-4" /> Director's Plan
                </h3>
                {state.artifacts.plan ? (
                    <div className="space-y-4 text-sm">
                        <div className="p-3 bg-indigo-900/10 border border-indigo-500/20 rounded-lg">
                            <span className="text-indigo-400 font-bold block text-xs uppercase mb-1">Subject</span>
                            <p className="text-gray-300">{state.artifacts.plan.subject_prompt}</p>
                        </div>
                        <div className="p-3 bg-purple-900/10 border border-purple-500/20 rounded-lg">
                            <span className="text-purple-400 font-bold block text-xs uppercase mb-1">Action</span>
                            <p className="text-gray-300">{state.artifacts.plan.action_prompt}</p>
                        </div>
                        <div className="p-3 bg-amber-900/10 border border-amber-500/20 rounded-lg">
                             <span className="text-amber-400 font-bold block text-xs uppercase mb-1">Reasoning</span>
                             <p className="text-gray-400 italic">"{state.artifacts.plan.reasoning}"</p>
                        </div>
                    </div>
                ) : (
                    <div className="h-full flex items-center justify-center text-gray-600 italic text-sm">Waiting for Director...</div>
                )}
            </div>

            <div className="bg-gray-900/60 border border-gray-800 rounded-xl p-4 h-48">
                 <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-4 flex items-center gap-2">
                    <FileImageIcon className="w-4 h-4" /> Generated Assets
                </h3>
                <div className="flex gap-2 h-full overflow-x-auto">
                    {state.artifacts.assets.length > 0 ? (
                        state.artifacts.assets.map(asset => (
                            <div key={asset.id} className="min-w-[120px] h-32 relative rounded-lg overflow-hidden border border-gray-700 group">
                                <img src={asset.url} alt={asset.type} className="w-full h-full object-cover" />
                                <div className="absolute inset-0 bg-black/50 flex items-end p-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <span className="text-[10px] uppercase font-bold text-white">{asset.type}</span>
                                </div>
                            </div>
                        ))
                    ) : (
                        <div className="w-full h-32 border border-dashed border-gray-700 rounded-lg flex items-center justify-center text-gray-600 text-xs">
                            Generating Assets...
                        </div>
                    )}
                </div>
            </div>
         </div>

         {/* 3. Center Panel: The Viewport */}
         <div className="lg:col-span-2 flex flex-col gap-4">
             {/* Main Player */}
             <div className="bg-black border border-gray-800 rounded-xl overflow-hidden relative aspect-video shadow-2xl">
                 {state.artifacts.finalVideo ? (
                     <video src={state.artifacts.finalVideo.url} controls autoPlay loop className="w-full h-full object-contain" />
                 ) : state.artifacts.draftVideo ? (
                     <div className="relative w-full h-full">
                         <video src={state.artifacts.draftVideo.url} controls loop muted className="w-full h-full object-contain opacity-50 blur-sm grayscale" />
                         <div className="absolute inset-0 flex items-center justify-center">
                             <div className="bg-black/70 backdrop-blur-md px-6 py-3 rounded-full border border-gray-600 text-sm font-mono text-white animate-pulse">
                                 {state.phase === 'REFINING' ? 'EXTRACTING & REFINING FRAMES...' : 'RENDERING MASTER...'}
                             </div>
                         </div>
                     </div>
                 ) : (
                     <div className="w-full h-full flex flex-col items-center justify-center bg-gray-950 text-gray-600">
                         <div className="w-16 h-16 border-4 border-gray-800 border-t-indigo-900 rounded-full animate-spin mb-4 opacity-50"></div>
                         <p className="font-mono text-sm tracking-widest uppercase">Agentic Pipeline Active</p>
                     </div>
                 )}
             </div>

             {/* Refinement Compare */}
             <div className="grid grid-cols-2 gap-4 h-48">
                 <div className="bg-gray-900/60 border border-gray-800 rounded-xl p-3 flex flex-col">
                     <span className="text-[10px] text-gray-500 uppercase tracking-widest mb-2 block">Draft Frame (720p)</span>
                     {state.artifacts.anchorFrame?.original ? (
                         <img src={state.artifacts.anchorFrame.original} className="flex-1 object-contain rounded border border-gray-700 opacity-70" />
                     ) : (
                         <div className="flex-1 bg-gray-950 rounded border border-gray-800/50" />
                     )}
                 </div>
                 <div className="bg-gray-900/60 border border-gray-800 rounded-xl p-3 flex flex-col">
                     <span className="text-[10px] text-indigo-400 uppercase tracking-widest mb-2 block flex justify-between">
                        <span>Refined Anchor (4K)</span>
                        <SparklesIcon className="w-3 h-3" />
                     </span>
                     {state.artifacts.anchorFrame?.upscaled ? (
                         <img src={state.artifacts.anchorFrame.upscaled} className="flex-1 object-contain rounded border border-indigo-500/30 shadow-[0_0_15px_rgba(99,102,241,0.2)]" />
                     ) : (
                         <div className="flex-1 bg-gray-950 rounded border border-gray-800/50 flex items-center justify-center">
                             {state.phase === 'REFINING' && <SparklesIcon className="w-5 h-5 text-indigo-900 animate-pulse" />}
                         </div>
                     )}
                 </div>
             </div>
         </div>
      </div>

      {/* 4. Bottom Panel: Terminal Logs */}
      <div className="bg-black border border-gray-800 rounded-xl p-4 font-mono text-xs h-40 overflow-hidden flex flex-col">
          <div className="flex items-center gap-2 border-b border-gray-800 pb-2 mb-2">
              <div className="w-2 h-2 rounded-full bg-red-500" />
              <div className="w-2 h-2 rounded-full bg-yellow-500" />
              <div className="w-2 h-2 rounded-full bg-green-500" />
              <span className="ml-2 text-gray-500">pipeline_logs.log</span>
          </div>
          <div className="overflow-y-auto space-y-1 flex-grow">
              {state.logs.map((log, i) => (
                  <div key={i} className="flex gap-3 text-gray-400">
                      <span className="text-gray-600 min-w-[60px]">{new Date(log.timestamp).toLocaleTimeString([], {hour12: false, second: '2-digit', minute:'2-digit'})}</span>
                      <span className={`font-bold min-w-[80px] ${
                          log.agent === 'Director' ? 'text-indigo-400' :
                          log.agent === 'Artist' ? 'text-pink-400' :
                          log.agent === 'Engineer' ? 'text-amber-400' : 'text-gray-500'
                      }`}>[{log.agent}]</span>
                      <span>{log.message}</span>
                  </div>
              ))}
              {state.error && (
                  <div className="text-red-400 font-bold mt-2">
                      [CRITICAL_FAILURE] {state.error}
                  </div>
              )}
              <div ref={logsEndRef} />
          </div>
      </div>
    </div>
  );
};

export default PipelineVisualizer;
