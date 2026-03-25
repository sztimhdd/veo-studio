/**
 * LeftSidebar — Creative control center
 * Contains Director's Plan editable fields, Production Bible (per-asset regen),
 * and Project Options controls.
 */
import React, { useState } from 'react';
import { ChevronLeftIcon, ChevronRightIcon, ChevronDownIcon, ChevronUpIcon, Image as ImageIcon, DownloadIcon } from 'lucide-react';
import { useProduction } from '../../context/ProductionContext';
import { AssetItem, DirectorModel, VideoModel } from '../../types';

interface LeftSidebarProps {
  editedPrompts: Record<number, string>;
  onPromptChange: (index: number, newPrompt: string) => void;
  onAssetRegen: (asset: AssetItem, feedback: string) => void;
  regeneratingAssetId: string | null;
  onExport?: () => void;
}

const CollapsibleSection: React.FC<{ title: string; children: React.ReactNode; defaultOpen?: boolean }> = ({ title, children, defaultOpen = true }) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-gray-800">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-4 py-3 text-xs font-bold text-gray-400 hover:text-white transition-colors outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 uppercase tracking-widest bg-[#12122A]"
        style={{ fontFamily: 'Poppins, sans-serif' }}
      >
        {title}
        {isOpen ? <ChevronUpIcon className="w-4 h-4" /> : <ChevronDownIcon className="w-4 h-4" />}
      </button>
      {isOpen && <div className="p-4 space-y-4 bg-[#0F0F23]">{children}</div>}
    </div>
  );
};

const LeftSidebar: React.FC<LeftSidebarProps> = ({ editedPrompts, onPromptChange, onAssetRegen, regeneratingAssetId, onExport }) => {
  const { state, dispatch } = useProduction();
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem('aw_left_sidebar') === 'collapsed'; } catch { return false; }
  });

  const [assetFeedbacks, setAssetFeedbacks] = useState<Record<string, string>>({});

  const toggle = () => {
    setCollapsed(prev => {
      const next = !prev;
      try { localStorage.setItem('aw_left_sidebar', next ? 'collapsed' : 'expanded'); } catch {}
      return next;
    });
  };

  const plan = state.artifacts.plan;
  const assets = state.artifacts.assets;
  const options = state.projectOptions;

  return (
    <div
      data-testid="left-sidebar"
      style={{ width: collapsed ? 48 : 280, transition: 'width 250ms ease-in-out' }}
      className="flex-shrink-0 bg-[#0F0F23] border-r border-gray-800 flex flex-col h-full overflow-hidden z-20 relative"
    >
      <button
        onClick={toggle}
        aria-label={collapsed ? 'Expand tools' : 'Collapse tools'}
        aria-expanded={!collapsed}
        className="absolute top-3 right-0 w-full flex justify-center py-1.5 text-gray-500 hover:text-white transition-colors duration-200 cursor-pointer focus-visible:ring-2 focus-visible:ring-indigo-500 outline-none z-10"
      >
        {collapsed ? <ChevronRightIcon className="w-4 h-4" /> : <ChevronLeftIcon className="w-4 h-4" />}
      </button>

      {collapsed ? (
        <div className="flex flex-col items-center pt-10 gap-6">
          <div className="text-gray-600 hover:text-white cursor-pointer" onClick={toggle} title="Director's Plan">
            <ImageIcon className="w-5 h-5" />
          </div>
        </div>
      ) : (
        <div className="flex-grow overflow-y-auto pt-10 pb-10 custom-scrollbar">
          
          <CollapsibleSection title="Director's Plan">
            {plan ? plan.shots.map((shot, i) => (
              <div key={shot.id} className="bg-[#1E1B4B] rounded-lg p-3 border border-indigo-500/20">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-[10px] text-indigo-300 font-bold bg-indigo-900/50 px-2 py-0.5 rounded">SC01_SH{String(i+1).padStart(2, '0')}</span>
                  <span className="text-[9px] text-gray-400 bg-black/40 px-1.5 py-0.5 rounded">{shot.camera_movement}</span>
                </div>
                <textarea
                  className="w-full h-20 bg-black/40 border border-gray-700/50 rounded-md p-2 text-xs text-gray-300 focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-none transition-colors"
                  value={editedPrompts[i] ?? shot.prompt}
                  onChange={(e) => onPromptChange(i, e.target.value)}
                  placeholder="Shot prompt..."
                />
              </div>
            )) : <p className="text-xs text-gray-500">No plan generated yet.</p>}
          </CollapsibleSection>

          <CollapsibleSection title="Production Bible">
            {assets.length > 0 ? assets.map(asset => {
              const isRegening = regeneratingAssetId === asset.id;
              return (
                <div key={asset.id} className="bg-[#1E1B4B] rounded-lg p-3 border border-pink-500/20">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-[10px] text-pink-300 font-bold uppercase">{asset.type}</span>
                    <span className="text-[9px] text-gray-500">{asset.source}</span>
                  </div>
                  <div className="relative aspect-video bg-black/50 rounded overflow-hidden mb-2 border border-gray-800">
                    {isRegening ? (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className="w-5 h-5 border-2 border-pink-500 border-t-transparent rounded-full animate-spin" />
                      </div>
                    ) : (
                      <img src={asset.url} alt={asset.type} className="w-full h-full object-cover" />
                    )}
                  </div>
                  <input
                    type="text"
                    disabled={isRegening}
                    placeholder="e.g. Make the cape blue"
                    className="w-full bg-black/40 border border-gray-700/50 rounded-md px-2 py-1.5 text-xs text-gray-300 focus:outline-none focus:ring-1 focus:ring-pink-500 mb-2 disabled:opacity-50"
                    value={assetFeedbacks[asset.id] || ''}
                    onChange={e => setAssetFeedbacks({...assetFeedbacks, [asset.id]: e.target.value})}
                  />
                  <button
                    disabled={isRegening}
                    onClick={() => onAssetRegen(asset, assetFeedbacks[asset.id] || '')}
                    className="w-full py-1.5 rounded-md bg-gray-800 hover:bg-gray-700 text-[10px] font-bold text-gray-300 transition-colors disabled:opacity-50 outline-none focus-visible:ring-1 focus-visible:ring-pink-500"
                  >
                    {isRegening ? 'GENERATING...' : 'REGEN ASSET'}
                  </button>
                </div>
              );
            }) : <p className="text-xs text-gray-500">No assets generated yet.</p>}
          </CollapsibleSection>

          <CollapsibleSection title="Project Options" defaultOpen={false}>
            <div className="space-y-3">
              <div>
                <label className="block text-[10px] text-gray-500 mb-1">Director Model</label>
                <select
                  className="w-full bg-black/40 border border-gray-700/50 rounded p-1.5 text-xs text-gray-300 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  value={options.directorModel}
                  onChange={e => dispatch({ type: 'UPDATE_PROJECT_OPTIONS', payload: { directorModel: e.target.value as DirectorModel } })}
                >
                  <option value={DirectorModel.FLASH}>Gemini 2.0 Flash</option>
                  <option value={DirectorModel.PRO}>Gemini 2.5 Pro</option>
                </select>
              </div>
              <div>
                <label className="block text-[10px] text-gray-500 mb-1">Video Model</label>
                <select
                  className="w-full bg-black/40 border border-gray-700/50 rounded p-1.5 text-xs text-gray-300 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  value={options.videoModel}
                  onChange={e => dispatch({ type: 'UPDATE_PROJECT_OPTIONS', payload: { videoModel: e.target.value as VideoModel } })}
                >
                  <option value={VideoModel.FAST}>Veo 3.1 Fast</option>
                  <option value={VideoModel.HIGH}>Veo 3.1 High Quality</option>
                </select>
              </div>
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="block text-[10px] text-gray-500 mb-1">Resolution</label>
                  <select
                    className="w-full bg-black/40 border border-gray-700/50 rounded p-1.5 text-xs text-gray-300 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    value={options.resolution}
                    onChange={e => dispatch({ type: 'UPDATE_PROJECT_OPTIONS', payload: { resolution: e.target.value as '720p' | '1080p' } })}
                  >
                    <option value="720p">720p</option>
                    <option value="1080p">1080p</option>
                  </select>
                </div>
                <div className="flex-1">
                  <label className="block text-[10px] text-gray-500 mb-1">Ratio</label>
                  <select
                    className="w-full bg-black/40 border border-gray-700/50 rounded p-1.5 text-xs text-gray-300 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    value={options.aspectRatio}
                    onChange={e => dispatch({ type: 'UPDATE_PROJECT_OPTIONS', payload: { aspectRatio: e.target.value as '16:9' | '9:16' } })}
                  >
                    <option value="16:9">16:9</option>
                    <option value="9:16">9:16</option>
                  </select>
                </div>
              </div>
            </div>

            {state.phase === 'COMPLETE' && onExport && (
              <div className="pt-4 mt-4 border-t border-gray-800">
                <button
                  onClick={onExport}
                  className="w-full flex items-center justify-center gap-2 py-2 rounded bg-indigo-600 hover:bg-indigo-500 text-xs font-bold text-white transition-colors"
                >
                  <DownloadIcon className="w-4 h-4" />
                  EXPORT COMMERCIAL
                </button>
              </div>
            )}
          </CollapsibleSection>

        </div>
      )}
    </div>
  );
};

export default LeftSidebar;
