/**
 * Modal for triggering "Generate Variations" — collects prompt, count, and
 * optional parameters before dispatching to the backend.
 */
import { useState } from 'react';
import { Shuffle, X, Plus, Trash2 } from 'lucide-react';

const PRESET_PARAMS = [
  'wall_thickness',
  'hole_pattern',
  'base_size',
  'clamp_type',
  'material',
  'mounting_pattern',
];

interface Props {
  projectId: string;
  defaultPrompt?: string;
  onClose: () => void;
  onSubmit: (prompt: string, numVariations: number, params: string[]) => void;
  isGenerating: boolean;
}

export default function VariationsModal({
  defaultPrompt = '',
  onClose,
  onSubmit,
  isGenerating,
}: Props) {
  const [prompt, setPrompt] = useState(defaultPrompt);
  const [numVariations, setNumVariations] = useState(5);
  const [selectedParams, setSelectedParams] = useState<string[]>([]);
  const [customParam, setCustomParam] = useState('');

  function toggleParam(p: string) {
    setSelectedParams(prev =>
      prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p],
    );
  }

  function addCustom() {
    const trimmed = customParam.trim().toLowerCase().replace(/\s+/g, '_');
    if (trimmed && !selectedParams.includes(trimmed)) {
      setSelectedParams(prev => [...prev, trimmed]);
    }
    setCustomParam('');
  }

  function handleSubmit() {
    if (!prompt.trim()) return;
    onSubmit(prompt.trim(), numVariations, selectedParams);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-lg bg-cadsurface-900 border border-cadsurface-700 rounded-xl shadow-2xl mx-4">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-cadsurface-700">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-violet-600/20 flex items-center justify-center">
              <Shuffle size={14} className="text-violet-400" />
            </div>
            <span className="font-semibold text-slate-200 text-sm">Generate Variations</span>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300 transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-4">
          {/* Prompt */}
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">
              Design description
            </label>
            <textarea
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
              placeholder="e.g., drill jig for 6061 aluminum wing panel, 4x M8 holes on 50mm BCD"
              rows={3}
              className="w-full bg-cadsurface-800 border border-cadsurface-600 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-violet-500 resize-none"
            />
          </div>

          {/* Count */}
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">
              Number of variations
              <span className="ml-1 text-slate-500 font-normal">(2–10)</span>
            </label>
            <div className="flex items-center gap-2">
              {[3, 5, 7, 10].map(n => (
                <button
                  key={n}
                  onClick={() => setNumVariations(n)}
                  className={`flex-1 py-1.5 rounded-lg text-sm font-medium border transition-all ${
                    numVariations === n
                      ? 'bg-violet-600 border-violet-500 text-white'
                      : 'bg-cadsurface-800 border-cadsurface-600 text-slate-400 hover:border-violet-600/50 hover:text-slate-300'
                  }`}
                >
                  {n}
                </button>
              ))}
              <input
                type="number"
                min={2}
                max={10}
                value={numVariations}
                onChange={e => setNumVariations(Math.min(10, Math.max(2, Number(e.target.value))))}
                className="w-16 bg-cadsurface-800 border border-cadsurface-600 rounded-lg px-2 py-1.5 text-sm text-center text-slate-200 focus:outline-none focus:border-violet-500"
              />
            </div>
          </div>

          {/* Parameters to vary */}
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">
              Parameters to vary
              <span className="ml-1 text-slate-500 font-normal">(optional — AI auto-picks if none selected)</span>
            </label>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {PRESET_PARAMS.map(p => (
                <button
                  key={p}
                  onClick={() => toggleParam(p)}
                  className={`px-2.5 py-1 rounded-full text-xs font-mono border transition-all ${
                    selectedParams.includes(p)
                      ? 'bg-violet-600/20 border-violet-500 text-violet-300'
                      : 'bg-cadsurface-800 border-cadsurface-700 text-slate-500 hover:border-violet-600/40 hover:text-slate-300'
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
            {/* Custom param */}
            <div className="flex gap-2">
              <input
                value={customParam}
                onChange={e => setCustomParam(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') addCustom(); }}
                placeholder="Add custom parameter…"
                className="flex-1 bg-cadsurface-800 border border-cadsurface-600 rounded-lg px-3 py-1.5 text-xs text-slate-300 placeholder-slate-600 focus:outline-none focus:border-violet-500"
              />
              <button
                onClick={addCustom}
                className="px-3 py-1.5 bg-cadsurface-700 border border-cadsurface-600 rounded-lg text-slate-400 hover:text-slate-200 transition-colors"
              >
                <Plus size={14} />
              </button>
            </div>
            {/* Custom params list */}
            {selectedParams.filter(p => !PRESET_PARAMS.includes(p)).length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {selectedParams.filter(p => !PRESET_PARAMS.includes(p)).map(p => (
                  <span
                    key={p}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-mono bg-violet-600/20 border border-violet-500 text-violet-300"
                  >
                    {p}
                    <button onClick={() => toggleParam(p)} className="hover:text-white">
                      <Trash2 size={10} />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Estimated time note */}
          <p className="text-xs text-slate-500">
            Each variation calls Zoo.dev sequentially (~30–90s each). Estimated total:{' '}
            <span className="text-slate-400">{Math.ceil(numVariations * 60 / 60)} – {Math.ceil(numVariations * 90 / 60)} min</span>
          </p>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-cadsurface-700 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-slate-400 hover:text-slate-200 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!prompt.trim() || isGenerating}
            className="flex items-center gap-2 px-5 py-2 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
          >
            <Shuffle size={14} />
            {isGenerating ? 'Queuing…' : `Generate ${numVariations} Variations`}
          </button>
        </div>
      </div>
    </div>
  );
}
