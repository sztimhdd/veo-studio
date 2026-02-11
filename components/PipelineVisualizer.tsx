
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

            <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 flex-grow min-h-0 overflow-hidden">

                {/* 2. Left Panel: The Blueprint & Assets */}
                <div className="flex flex-col gap-4 overflow-y-auto max-h-[calc(100vh-320px)]">
                    <div className="bg-gray-900/60 border border-gray-800 rounded-xl p-4 overflow-y-auto">
                        <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-4 flex items-center gap-2">
                            <FileImageIcon className="w-4 h-4" /> Director's Plan
                        </h3>
                        {state.artifacts.plan ? (
                            <div className="space-y-4 text-sm">
                                <div className="p-3 bg-indigo-900/10 border border-indigo-500/20 rounded-lg">
                                    <span className="text-indigo-400 font-bold block text-xs uppercase mb-1">Subject</span>
                                    <p className="text-gray-300">{state.artifacts.plan.subject_prompt}</p>
                                </div>
                                {state.artifacts.plan.shots?.map((shot) => (
                                    <div key={shot.id} className="p-3 bg-gray-800/50 border border-gray-700/50 rounded-lg">
                                        <span className="text-gray-400 font-bold block text-[10px] uppercase mb-1">
                                            Shot {shot.order}: {shot.camera_movement}
                                        </span>
                                        <p className="text-gray-300 text-xs">{shot.prompt}</p>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="h-full flex items-center justify-center text-gray-600 italic text-sm">Waiting for Director...</div>
                        )}
                    </div>

                    <div className="bg-gray-900/60 border border-gray-800 rounded-xl p-4 min-h-[160px]">
                        <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-4 flex items-center gap-2">
                            <FileImageIcon className="w-4 h-4" /> Production Bible
                        </h3>
                        <div className="flex gap-2 h-full overflow-x-auto">
                            {state.artifacts.assets.length > 0 ? (
                                state.artifacts.assets.map(asset => (
                                    <div key={asset.id} className="min-w-[120px] h-32 relative rounded-lg overflow-hidden border border-gray-700 group">
                                        <img src={asset.url} alt={asset.type} className="w-full h-full object-cover" />
                                        <div className="absolute inset-0 bg-black/50 flex flex-col justify-end p-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <span className="text-[10px] uppercase font-bold text-white">{asset.type}</span>
                                            <span className="text-[9px] text-gray-300 uppercase">{asset.source}</span>
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

                {/* 3. Center Panel: The Film Strip (Dailies) */}
                <div className="lg:col-span-3 flex flex-col gap-4">
                    <div className="bg-black border border-gray-800 rounded-xl p-6 shadow-2xl flex-grow flex flex-col">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-sm font-bold text-white uppercase tracking-widest flex items-center gap-2">
                                <FilmIcon className="w-4 h-4 text-indigo-500" /> The Dailies (Rushes)
                            </h3>
                            {state.phase === 'COMPLETE' && (
                                <div className="flex items-center gap-2 text-indigo-400 text-xs">
                                    <SparklesIcon className="w-3 h-3" /> All shots consistent
                                </div>
                            )}
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 h-full">
                            {[0, 1, 2].map((index) => {
                                const shotResult = state.artifacts.shots?.[index];
                                const shotPlan = state.artifacts.plan?.shots?.[index];

                                return (
                                    <div key={index} className="flex flex-col gap-2 relative group">
                                        <div className="aspect-[9/16] md:aspect-video bg-gray-900 rounded-lg overflow-hidden border border-gray-800 relative">
                                            {shotResult ? (
                                                <video
                                                    src={shotResult.url}
                                                    controls
                                                    autoPlay
                                                    loop
                                                    className="w-full h-full object-cover"
                                                />
                                            ) : (
                                                <div className="w-full h-full flex flex-col items-center justify-center">
                                                    {state.phase === 'DRAFTING' ? (
                                                        <>
                                                            <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mb-2"></div>
                                                            <span className="text-[9px] text-indigo-400 uppercase animate-pulse">Rolling...</span>
                                                        </>
                                                    ) : (
                                                        <span className="text-[9px] text-gray-700 uppercase">Wait</span>
                                                    )}
                                                </div>
                                            )}

                                            {/* Overlay Shot Info */}
                                            {shotPlan && (
                                                <div className="absolute top-2 left-2 px-2 py-1 bg-black/60 backdrop-blur rounded text-[9px] font-mono text-white border border-white/10">
                                                    SC01_SH0{index + 1}
                                                </div>
                                            )}
                                        </div>
                                        {shotPlan && (
                                            <p className="text-[10px] text-gray-500 line-clamp-2 leading-tight">
                                                {shotPlan.camera_movement}
                                            </p>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            </div>


            {/* 4. Bottom Panel: Terminal Logs — Full Width */}
            <div className="bg-black border border-gray-800 rounded-xl p-4 font-mono text-xs h-36 overflow-hidden flex flex-col flex-shrink-0">
                <div className="flex items-center gap-2 border-b border-gray-800 pb-2 mb-2">
                    <div className="w-2 h-2 rounded-full bg-red-500" />
                    <div className="w-2 h-2 rounded-full bg-yellow-500" />
                    <div className="w-2 h-2 rounded-full bg-green-500" />
                    <span className="ml-2 text-gray-500">pipeline_logs.log</span>
                </div>
                <div className="overflow-y-auto space-y-1 flex-grow">
                    {state.logs.map((log, i) => (
                        <div key={i} className="flex gap-3 text-gray-400">
                            <span className="text-gray-600 min-w-[60px]">{new Date(log.timestamp).toLocaleTimeString([], { hour12: false, second: '2-digit', minute: '2-digit' })}</span>
                            <span className={`font-bold min-w-[80px] ${log.agent === 'Director' ? 'text-indigo-400' :
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
