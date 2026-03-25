/**
 * RightSidebar — Collapsible log panel
 * React.memo isolated: only re-renders when logs or error change.
 * Persists collapsed state in localStorage('aw_right_sidebar').
 */
import React, { useEffect, useRef, useState } from 'react';
import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react';
import { useProduction } from '../../context/ProductionContext';

const AGENT_COLORS: Record<string, string> = {
  Director: 'text-indigo-400',
  Artist:   'text-pink-400',
  Engineer: 'text-amber-400',
  Critic:   'text-yellow-400',
  System:   'text-gray-500',
};

const AGENT_DOT_COLORS: Record<string, string> = {
  Director: 'bg-indigo-400',
  Artist:   'bg-pink-400',
  Engineer: 'bg-amber-400',
  Critic:   'bg-yellow-400',
  System:   'bg-gray-500',
};

// LogContent component is below...

// We can't return JSX from React.memo with a hook like that, let's restructure
const LogContent = React.memo(function LogContent() {
  const { state } = useProduction();
  const logsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [state.logs]);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Terminal-style header */}
      <div className="flex items-center gap-1.5 px-3 py-2 border-b border-gray-800 flex-shrink-0">
        <div className="w-2 h-2 rounded-full bg-red-500" />
        <div className="w-2 h-2 rounded-full bg-yellow-500" />
        <div className="w-2 h-2 rounded-full bg-green-500" />
        <span className="ml-2 text-[10px] text-gray-500 font-mono">pipeline_logs.log</span>
      </div>

      {/* Log entries */}
      <div className="flex-grow overflow-y-auto px-3 py-2 font-mono text-[11px] space-y-1">
        {state.error && (
          <div className="text-red-400 font-bold mb-2">[CRITICAL_FAILURE] {state.error}</div>
        )}
        {state.logs.map((log, i) => (
          <div key={i} className="flex gap-2 text-gray-400 leading-relaxed">
            <span className="text-gray-600 flex-shrink-0 tabular-nums">
              {new Date(log.timestamp).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
            <span className={`font-bold flex-shrink-0 ${AGENT_COLORS[log.agent] ?? 'text-gray-500'}`}>
              [{log.agent}]
            </span>
            <span className="break-words">{log.message}</span>
          </div>
        ))}
        <div ref={logsEndRef} />
      </div>
    </div>
  );
});

const RightSidebar: React.FC = () => {
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem('aw_right_sidebar') === 'collapsed'; } catch { return false; }
  });
  const { state } = useProduction();
  const lastAgent = state.logs.length > 0 ? state.logs[state.logs.length - 1].agent : 'System';

  const toggle = () => {
    setCollapsed(prev => {
      const next = !prev;
      try { localStorage.setItem('aw_right_sidebar', next ? 'collapsed' : 'expanded'); } catch {}
      return next;
    });
  };

  return (
    <div
      data-testid="right-sidebar"
      style={{ width: collapsed ? 48 : 260, transition: 'width 250ms ease-in-out' }}
      className="flex-shrink-0 bg-black border-l border-gray-800 flex flex-col overflow-hidden z-20 relative"
    >
      {/* Collapse toggle */}
      <button
        onClick={toggle}
        aria-label={collapsed ? 'Expand logs' : 'Collapse logs'}
        aria-expanded={!collapsed}
        className="absolute top-3 left-0 w-full flex justify-center py-1.5 text-gray-500 hover:text-white transition-colors duration-200 cursor-pointer focus-visible:ring-2 focus-visible:ring-indigo-500 outline-none z-10"
      >
        {collapsed
          ? <ChevronLeftIcon className="w-4 h-4" />
          : <ChevronRightIcon className="w-4 h-4" />
        }
      </button>

      {collapsed ? (
        <div className="flex flex-col items-center pt-10 gap-3 px-2">
          <div className={`w-2 h-2 rounded-full ${AGENT_DOT_COLORS[lastAgent] ?? 'bg-gray-500'} animate-pulse`} title={`Last: ${lastAgent}`} />
          <span className="text-[9px] text-gray-600 uppercase tracking-widest"
            style={{ writingMode: 'vertical-rl' }}>Logs</span>
        </div>
      ) : (
        <div className="pt-8 flex flex-col h-full overflow-hidden">
          <LogContent />
        </div>
      )}
    </div>
  );
};

export default RightSidebar;
