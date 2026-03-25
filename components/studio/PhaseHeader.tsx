/**
 * PhaseHeader — phase stepper bar for embedding inside App.tsx <header>
 * Reads phase from ProductionContext. Fixed in header at z-40.
 */
import React from 'react';
import { CheckCircleIcon } from 'lucide-react';
import { useProduction } from '../../context/ProductionContext';
import { PipelinePhase } from '../../types';

const PHASES: { phase: PipelinePhase; label: string }[] = [
  { phase: 'PLANNING',  label: 'Director' },
  { phase: 'ASSET_GEN', label: 'Artist'   },
  { phase: 'DRAFTING',  label: 'Draft'    },
  { phase: 'CRITIQUE',  label: 'Critique' },
  { phase: 'COMPLETE',  label: 'Complete' },
];

const PHASE_ORDER = PHASES.map(p => p.phase);

const PhaseHeader: React.FC = () => {
  const { state } = useProduction();
  const currentIdx = PHASE_ORDER.indexOf(state.phase as PipelinePhase);

  return (
    <div
      data-testid="phase-stepper"
      className="flex items-center gap-1 px-2"
      role="navigation"
      aria-label="Production phases"
    >
      {PHASES.map(({ phase, label }, idx) => {
        const isPast    = currentIdx > idx;
        const isCurrent = currentIdx === idx;

        return (
          <React.Fragment key={phase}>
            {idx > 0 && (
              <div className={`h-px w-6 flex-shrink-0 rounded ${isPast ? 'bg-emerald-500' : 'bg-gray-700'}`} />
            )}
            <div
              className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] font-semibold uppercase tracking-wider transition-colors duration-200
                ${isCurrent ? 'bg-indigo-600/30 text-indigo-300 border border-indigo-500/50' :
                  isPast    ? 'text-emerald-400' :
                              'text-gray-600'}`}
              aria-current={isCurrent ? 'step' : undefined}
            >
              {isPast
                ? <CheckCircleIcon className="w-3 h-3 flex-shrink-0" />
                : <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${isCurrent ? 'bg-indigo-400 animate-pulse' : 'bg-gray-700'}`} />
              }
              <span>{label}</span>
            </div>
          </React.Fragment>
        );
      })}
    </div>
  );
};

export default PhaseHeader;
