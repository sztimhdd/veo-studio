/**
 * ShotCard — Full-width vertical feed card for a single Dailies shot
 * React.memo isolated. Muted auto-play video. Destructive regen confirmation.
 */
import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, ChevronRight, Volume2, VolumeX, AlertCircle, Clapperboard } from 'lucide-react';
import { ShotParams, VideoArtifact, ShotEvaluation } from '../../types';
import ConfirmDialog from './ConfirmDialog';

interface ShotCardProps {
  index: number;
  shotPlan: ShotParams | undefined;
  shotResult: VideoArtifact | undefined;
  evalScore: ShotEvaluation | undefined;
  isRegenerating: boolean;
  editedPrompt: string | undefined;
  onPromptChange: (index: number, newPrompt: string) => void;
  onRegenerate: (index: number, feedback: string) => void;
}

const ShotCard: React.FC<ShotCardProps> = React.memo(({
  index, shotPlan, shotResult, evalScore, isRegenerating, editedPrompt, onPromptChange, onRegenerate
}) => {
  const [promptExpanded, setPromptExpanded] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [isMuted, setIsMuted] = useState(true);
  const [showConfirm, setShowConfirm] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  const takeNumber = shotResult?.version || 1;
  const currentPrompt = editedPrompt ?? shotPlan?.prompt ?? '';

  // Intercept play when off-screen could be added here, currently just uses playsInline
  useEffect(() => {
    if (videoRef.current) videoRef.current.muted = isMuted;
  }, [isMuted]);

  const handleRollClick = () => {
    if (takeNumber >= 2) {
      setShowConfirm(true);
    } else {
      executeRegen();
    }
  };

  const executeRegen = () => {
    setShowConfirm(false);
    onRegenerate(index, feedback);
    setFeedback(''); // clear after submission
  };

  if (!shotPlan && !shotResult && !isRegenerating) {
    return (
      <div className="w-full bg-[#1E1B4B]/30 border border-gray-800 rounded-xl flex items-center justify-center aspect-video text-gray-500">
        <div className="flex flex-col items-center gap-2">
          <Clapperboard className="w-8 h-8 opacity-50" />
          <span className="text-sm font-medium">Awaiting pipeline...</span>
        </div>
      </div>
    );
  }

  return (
    <div data-testid={`shot-card-${index}`} className="w-full bg-[#1E1B4B] border border-gray-800 rounded-xl overflow-hidden shadow-2xl z-10 relative flex flex-col">
      
      {/* 1. Header Bar */}
      <div className="px-5 py-3 border-b border-gray-800 flex items-center justify-between bg-black/20">
        <div className="flex items-center gap-3">
          <span className="text-sm font-bold text-white tracking-widest" style={{ fontFamily: 'Poppins, sans-serif' }}>
            SC01_SH{String(index+1).padStart(2, '0')}
          </span>
          {shotResult && (
            <span className="bg-[#E11D48] text-white text-[10px] font-bold px-2 py-0.5 rounded shadow-sm">
              TAKE {takeNumber}
            </span>
          )}
          {shotPlan?.camera_movement && (
            <span className="bg-indigo-900/50 text-indigo-300 border border-indigo-500/30 text-[10px] font-medium px-2 py-0.5 rounded">
              {shotPlan.camera_movement}
            </span>
          )}
        </div>
        
        {evalScore && (
          <div className="flex items-center gap-2 text-xs font-bold" title={`Temporal: ${evalScore.temporalConsistencyScore} | Semantic: ${evalScore.semanticAlignmentScore} | Tech: ${evalScore.technicalQualityScore}`}>
            <span className="text-gray-400">CRITIC:</span>
            <span className={`px-2 py-0.5 rounded ${
              evalScore.overallScore >= 8.5 ? 'bg-emerald-900/50 text-emerald-400 border border-emerald-500/30' :
              evalScore.overallScore >= 7.0 ? 'bg-amber-900/50 text-amber-400 border border-amber-500/30' :
                                              'bg-red-900/50 text-red-400 border border-red-500/30'
            }`}>
              {evalScore.overallScore.toFixed(1)}/10
            </span>
          </div>
        )}
      </div>

      {/* 2. Video Player */}
      <div className="relative aspect-video w-full bg-black flex items-center justify-center">
        {isRegenerating ? (
          <div data-testid={`shot-skeleton-${index}`} className="absolute inset-0 bg-gray-900 animate-pulse flex flex-col items-center justify-center">
            <div className="w-8 h-8 border-4 border-[#E11D48] border-t-transparent rounded-full animate-spin mb-4" />
            <span className="text-sm text-gray-400 font-bold tracking-widest animate-pulse">ROLLING...</span>
          </div>
        ) : shotResult ? (
          <>
            <video
              ref={videoRef}
              src={shotResult.url}
              autoPlay
              loop
              playsInline
              muted={isMuted} // Controlled by internal state
              className="w-full h-full object-contain" // object-contain ensures we see whole frame
            />
            {/* Unmute overlay toggle */}
            <button
              onClick={() => setIsMuted(!isMuted)}
              className="absolute bottom-4 right-4 bg-black/60 hover:bg-black/80 text-white p-2 rounded-full backdrop-blur transition-colors outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
              aria-label={isMuted ? "Unmute" : "Mute"}
            >
              {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            </button>
          </>
        ) : (
          <div data-testid={`shot-skeleton-${index}`} className="absolute inset-0 bg-gray-900 animate-pulse" />
        )}
      </div>

      {/* 3. Collapsible Prompt Block */}
      <div className="border-b border-gray-800 bg-[#0F0F23]">
        <button
          className="w-full px-5 py-3 flex items-center justify-between text-xs font-bold text-gray-400 hover:text-white transition-colors outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
          onClick={() => setPromptExpanded(!promptExpanded)}
        >
          <span className="flex items-center gap-2">
            <Clapperboard className="w-4 h-4" />
            DIRECTOR'S PROMPT
          </span>
          {promptExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </button>
        {promptExpanded && (
          <div className="px-5 pb-4">
            <textarea
              className="w-full h-24 bg-black/40 border border-gray-800 rounded-md p-3 text-sm text-gray-300 focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-none"
              value={currentPrompt}
              onChange={(e) => onPromptChange(index, e.target.value)}
              placeholder="Edit the prompt for this shot..."
            />
            <p className="text-[10px] text-gray-500 mt-1 flex items-center gap-1">
              <AlertCircle className="w-3 h-3" />
              Edits here will be used for the next take. They override the Left Sidebar.
            </p>
          </div>
        )}
      </div>

      {/* 4. Feedback Input & Action Bar */}
      <div className="px-5 py-4 bg-[#1E1B4B] flex items-end gap-4">
        <div className="flex-grow flex flex-col">
          <label htmlFor={`feedback-${index}`} className="text-[10px] text-gray-400 uppercase font-bold tracking-wider mb-1.5" style={{ fontFamily: 'Poppins, sans-serif' }}>
            Director's Note — what should change?
          </label>
          <input
            id={`feedback-${index}`}
            type="text"
            className="w-full bg-black/30 border border-gray-700/50 rounded-lg px-4 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-[#E11D48] transition-colors placeholder:text-gray-600"
            placeholder="e.g. Slower pan, more rain, warmer light..."
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            disabled={isRegenerating}
            onKeyDown={(e) => { if (e.key === 'Enter' && !isRegenerating) handleRollClick(); }}
          />
        </div>
        
        <button
          data-testid={`roll-take-btn-${index}`}
          disabled={isRegenerating}
          onClick={handleRollClick}
          className="flex-shrink-0 bg-[#E11D48] hover:bg-[#be1039] disabled:bg-gray-800 disabled:text-gray-500 text-white font-bold py-2.5 px-6 rounded-lg transition-colors outline-none focus-visible:ring-2 focus-visible:ring-[#E11D48] focus-visible:ring-offset-2 focus-visible:ring-offset-[#1E1B4B]"
          style={{ fontFamily: 'Poppins, sans-serif' }}
        >
          {isRegenerating ? 'ROLLING...' : `ROLL TAKE ${takeNumber + (shotResult ? 1 : 0)}`}
        </button>
      </div>

      {/* 5. Destructive Regen Guard overlay */}
      <ConfirmDialog
        isOpen={showConfirm}
        title={`Roll Take ${takeNumber + 1}?`}
        message={`This will overwrite Take ${takeNumber}. Are you sure you want to regenerate this shot with the new feedback and prompt?`}
        confirmLabel="Roll Camera"
        cancelLabel="Cancel"
        onConfirm={executeRegen}
        onCancel={() => setShowConfirm(false)}
      />

    </div>
  );
}, (prev, next) => {
  // Custom memo to optimize rendering:
  // Only re-render if the shot plan, result, regen status, eval, or edited prompt changed.
  return prev.shotPlan === next.shotPlan &&
         prev.shotResult?.url === next.shotResult?.url &&
         prev.shotResult?.version === next.shotResult?.version &&
         prev.isRegenerating === next.isRegenerating &&
         prev.editedPrompt === next.editedPrompt &&
         prev.evalScore === next.evalScore;
});

export default ShotCard;
