
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import React, { useEffect, useRef, useState } from 'react';
import { useProduction } from '../context/ProductionContext';
import { ArrowRightIcon, SparklesIcon, ChevronDownIcon, TvIcon, VideoIcon, FileImageIcon, FilmIcon, PlayIcon, CheckCircleIcon, RefreshCwIcon, MessageSquareIcon } from 'lucide-react';

interface PipelineVisualizerProps {
    onRegenerate?: (index: number, feedback: string) => Promise<void>;
    onRefine?: (index: number) => Promise<void>;
}

const PipelineVisualizer: React.FC<PipelineVisualizerProps> = ({ onRegenerate, onRefine }) => {
    const { state } = useProduction();
    const logsEndRef = useRef<HTMLDivElement>(null);
    const [regeneratingIndices, setRegeneratingIndices] = useState<Set<number>>(new Set());
    const [refiningIndices, setRefiningIndices] = useState<Set<number>>(new Set());
    const [feedbackInputs, setFeedbackInputs] = useState<Record<number, string>>({});
    const [showFeedbackFor, setShowFeedbackFor] = useState<number | null>(null);

    // Auto-scroll logs
    useEffect(() => {
        logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [state.logs]);

    const handleRegenerateClick = async (index: number) => {
        const feedback = feedbackInputs[index] || "";
        if (onRegenerate) {
            setRegeneratingIndices(prev => new Set(prev).add(index));
            setShowFeedbackFor(null);
            try {
                await onRegenerate(index, feedback);
            } finally {
                setRegeneratingIndices(prev => {
                    const next = new Set(prev);
                    next.delete(index);
                    return next;
                });
            }
        }
    };

    const handleRefineClick = async (index: number) => {
        if (onRefine) {
            setRefiningIndices(prev => new Set(prev).add(index));
            try {
                await onRefine(index);
            } finally {
                setRefiningIndices(prev => {
                    const next = new Set(prev);
                    next.delete(index);
                    return next;
                });
            }
        }
    };

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
                        <div className="flex gap-2">
                            <button
                                onClick={async () => {
                                    if (!state.artifacts.shots) return;
                                    const btn = document.getElementById('export-btn');
                                    if (btn) btn.innerText = 'Stitching...';
                                    try {
                                        const { stitchVideos } = await import('../services/stitchService');
                                        const { url, extension } = await stitchVideos(state.artifacts.shots);
                                        const a = document.createElement('a');
                                        a.href = url;
                                        a.download = `veo_commercial_export.${extension}`;
                                        a.click();
                                    } catch (e) {
                                        console.error(e);
                                        alert('Stitching failed');
                                    } finally {
                                        if (btn) btn.innerText = 'Export Full Commercial';
                                    }
                                }}
                                id="export-btn"
                                className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-full shadow-lg transition-all flex items-center gap-2">
                                <FilmIcon className="w-3 h-3" /> Export Full Commercial
                            </button>
                            <span className="px-3 py-1 bg-emerald-500/20 text-emerald-400 text-xs rounded-full border border-emerald-500/50 flex items-center">
                                Production Complete
                            </span>
                        </div>
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
                                    <SparklesIcon className="w-3 h-3" /> All scenes consistent
                                </div>
                            )}
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 h-full">
                            {state.artifacts.plan?.scenes?.map((scenePlan, index) => {
                                const sceneResult = state.artifacts.shots?.[index];
                                const isRegenerating = regeneratingIndices.has(index);

                                return (
                                    <div key={index} className="flex flex-col gap-2 relative group">
                                        <div className="aspect-[9/16] md:aspect-video bg-gray-900 rounded-lg overflow-hidden border border-gray-800 relative group">
                                            {sceneResult && !isRegenerating ? (
                                                <>
                                                    <video
                                                        src={sceneResult.url}
                                                        controls
                                                        autoPlay
                                                        loop
                                                        className="w-full h-full object-cover"
                                                    />
                                                    
                                                    {/* Critic Tools Overlay */}
                                                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-3 p-4">
                                                        {showFeedbackFor === index ? (
                                                            <div className="w-full flex flex-col gap-2 animate-in fade-in zoom-in duration-200">
                                                                <textarea 
                                                                    className="w-full bg-gray-800 border border-gray-600 rounded p-2 text-[10px] text-white outline-none focus:border-indigo-500"
                                                                    placeholder="Describe changes (e.g. 'more rain', 'slower pan')..."
                                                                    value={feedbackInputs[index] || ""}
                                                                    onChange={(e) => setFeedbackInputs({...feedbackInputs, [index]: e.target.value})}
                                                                    autoFocus
                                                                />
                                                                <div className="flex gap-2">
                                                                    <button 
                                                                        onClick={() => handleRegenerateClick(index)}
                                                                        className="flex-grow py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] font-bold rounded flex items-center justify-center gap-1">
                                                                        <RefreshCwIcon className="w-3 h-3" /> Regenerate Take {sceneResult.version ? sceneResult.version + 1 : 2}
                                                                    </button>
                                                                    <button 
                                                                        onClick={() => setShowFeedbackFor(null)}
                                                                        className="px-2 py-1.5 bg-gray-700 hover:bg-gray-600 text-white text-[10px] font-bold rounded">
                                                                        Cancel
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        ) : (
                                                            <div className="flex flex-col gap-2 w-full px-4">
                                                                <button 
                                                                    onClick={() => setShowFeedbackFor(index)}
                                                                    className="w-full px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white text-xs font-bold rounded-full shadow-xl flex items-center justify-center gap-2 transform transition-transform active:scale-95">
                                                                    <MessageSquareIcon className="w-4 h-4" /> Add Feedback
                                                                </button>
                                                                
                                                                {/* Only show Refine button if not already refined and not regenerating */}
                                                                {!sceneResult.selectedKeyframe && (
                                                                    <button 
                                                                        onClick={() => handleRefineClick(index)}
                                                                        disabled={refiningIndices.has(index)}
                                                                        className="w-full px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-full shadow-xl flex items-center justify-center gap-2 transform transition-transform active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed">
                                                                        {refiningIndices.has(index) ? (
                                                                            <>
                                                                                <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                                                                Refining...
                                                                            </>
                                                                        ) : (
                                                                            <>
                                                                                <SparklesIcon className="w-4 h-4" /> Refine & Master (4K)
                                                                            </>
                                                                        )}
                                                                    </button>
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>
                                                </>
                                            ) : (
                                                <div className="w-full h-full flex flex-col items-center justify-center">
                                                    {(state.phase === 'DRAFTING' || isRegenerating) ? (
                                                        <>
                                                            <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mb-2"></div>
                                                            <span className="text-[9px] text-indigo-400 uppercase animate-pulse">
                                                                {isRegenerating ? `Rolling Take ${sceneResult?.version ? sceneResult.version + 1 : 2}...` : 'Rolling...'}
                                                            </span>
                                                        </>
                                                    ) : (
                                                        <span className="text-[9px] text-gray-700 uppercase">Wait</span>
                                                    )}
                                                </div>
                                            )}

                                            {sceneResult?.selectedKeyframe && (
                                                <div className="absolute top-2 right-2 px-2 py-1 bg-emerald-600/90 backdrop-blur rounded text-[9px] font-bold text-white border border-white/20 flex items-center gap-1 shadow-lg">
                                                    <SparklesIcon className="w-3 h-3" /> 4K MASTERED
                                                </div>
                                            )}
                                            {/* Overlay Scene Info */}
                                            {scenePlan && (
                                                <div className="absolute top-2 left-2 px-2 py-1 bg-black/60 backdrop-blur rounded text-[9px] font-mono text-white border border-white/10 flex items-center gap-2">
                                                    SCENE {index + 1} 
                                                    <span className="text-gray-400">({scenePlan.duration_seconds}s)</span>
                                                    {sceneResult?.version && sceneResult.version > 1 && (
                                                        <span className="text-amber-400 font-bold border-l border-white/20 pl-2">TAKE {sceneResult.version}</span>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                        {scenePlan && (
                                            <div className="flex flex-col gap-1">
                                                <div className="flex items-center gap-2 text-[10px] text-gray-400">
                                                    <span>{scenePlan.segments.length} segment{scenePlan.segments.length > 1 ? 's' : ''}</span>
                                                    <span className="text-gray-600">•</span>
                                                    <span className="line-clamp-1">{scenePlan.segments[0]?.camera_movement || 'Static'}</span>
                                                </div>
                                                {sceneResult?.userFeedback && (
                                                    <div className="flex gap-1 items-start bg-amber-900/10 border border-amber-500/20 rounded p-1.5 mt-1">
                                                        <MessageSquareIcon className="w-2.5 h-2.5 text-amber-500 mt-0.5" />
                                                        <p className="text-[9px] text-amber-200/70 italic leading-tight">
                                                            "{sceneResult.userFeedback}"
                                                        </p>
                                                    </div>
                                                )}
                                            </div>
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
