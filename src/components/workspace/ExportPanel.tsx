/**
 * ExportPanel — Export geometry in multiple CAD formats.
 * Supports: STEP, IGES, STL, DXF
 */
import { useState } from 'react';
import { Download, FileDown, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { directExport, requestExport, IS_DEMO } from '../../lib/api';

type ExportFormat = 'step' | 'iges' | 'stl' | 'dxf';

interface FormatDef {
  id: ExportFormat;
  label: string;
  description: string;
  ext: string;
  color: string;
}

const FORMATS: FormatDef[] = [
  {
    id: 'step',
    label: 'STEP',
    description: 'ISO 10303 — Standard for Exchange of Product Data. Universal CAD format.',
    ext: '.step',
    color: 'bg-blue-600',
  },
  {
    id: 'iges',
    label: 'IGES',
    description: 'Initial Graphics Exchange Specification. Legacy interoperability format.',
    ext: '.igs',
    color: 'bg-purple-600',
  },
  {
    id: 'stl',
    label: 'STL',
    description: 'Stereolithography mesh format. Used for 3D printing and FEA.',
    ext: '.stl',
    color: 'bg-emerald-600',
  },
  {
    id: 'dxf',
    label: 'DXF',
    description: 'Drawing Exchange Format. 2D/3D data for CAD/CAM systems.',
    ext: '.dxf',
    color: 'bg-amber-600',
  },
];

interface Props {
  projectId?: string;
}

export default function ExportPanel({ projectId }: Props) {
  const [loading, setLoading] = useState<ExportFormat | null>(null);
  const [success, setSuccess] = useState<ExportFormat | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleExport(fmt: ExportFormat) {
    if (!projectId || IS_DEMO) {
      // Demo: simulate download
      setLoading(fmt);
      await new Promise(r => setTimeout(r, 1200));
      setLoading(null);
      setSuccess(fmt);
      setTimeout(() => setSuccess(null), 3000);
      return;
    }

    setLoading(fmt);
    setError(null);
    try {
      const blob = await directExport(projectId, fmt);
      if (blob) {
        // Trigger browser download
        const fmtDef = FORMATS.find(f => f.id === fmt)!;
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `export-${projectId.slice(0, 8)}${fmtDef.ext}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        setSuccess(fmt);
        setTimeout(() => setSuccess(null), 3000);
      } else {
        setError(`Export failed for ${fmt.toUpperCase()}. Please try again.`);
      }
    } catch {
      setError('Export failed. Check network connection.');
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-cadsurface-700 shrink-0">
        <FileDown size={14} className="text-cadblue-400" />
        <span className="text-xs font-semibold text-slate-200 uppercase tracking-wider">Export Geometry</span>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {error && (
          <div className="flex items-start gap-2 p-2.5 rounded bg-red-950/50 border border-red-800/50">
            <AlertCircle size={13} className="text-red-400 mt-0.5 shrink-0" />
            <p className="text-xs text-red-300">{error}</p>
          </div>
        )}

        <p className="text-xs text-slate-400 pb-1">
          Download the fixture geometry in industry-standard CAD formats.
          {IS_DEMO && ' (Demo mode — exports are simulated)'}
        </p>

        {FORMATS.map(fmt => {
          const isLoading = loading === fmt.id;
          const isDone = success === fmt.id;

          return (
            <div
              key={fmt.id}
              className="group flex items-center gap-3 p-3 rounded-lg bg-cadsurface-800 border border-cadsurface-700 hover:border-cadsurface-600 transition-all"
            >
              {/* Format badge */}
              <div className={`w-12 h-9 rounded flex items-center justify-center shrink-0 ${fmt.color}`}>
                <span className="text-xs font-bold text-white">{fmt.label}</span>
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-medium text-slate-200">{fmt.label}</span>
                  <span className="text-[10px] text-slate-500">{fmt.ext}</span>
                </div>
                <p className="text-[10px] text-slate-400 mt-0.5 leading-tight line-clamp-2">
                  {fmt.description}
                </p>
              </div>

              {/* Download button */}
              <button
                onClick={() => handleExport(fmt.id)}
                disabled={isLoading || !!loading}
                className={`shrink-0 w-8 h-8 flex items-center justify-center rounded-lg transition-all ${
                  isDone
                    ? 'bg-emerald-700 text-white'
                    : isLoading
                    ? 'bg-cadsurface-700 text-slate-400 cursor-wait'
                    : 'bg-cadsurface-700 hover:bg-cadblue-600 text-slate-300 hover:text-white'
                }`}
                title={`Export ${fmt.label}`}
              >
                {isLoading ? (
                  <Loader2 size={13} className="animate-spin" />
                ) : isDone ? (
                  <CheckCircle2 size={13} />
                ) : (
                  <Download size={13} />
                )}
              </button>
            </div>
          );
        })}
      </div>

      {/* Export all button */}
      <div className="p-3 border-t border-cadsurface-700 shrink-0">
        <button
          onClick={() => FORMATS.forEach((f, i) => setTimeout(() => handleExport(f.id), i * 800))}
          disabled={!!loading}
          className="w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-cadblue-600 hover:bg-cadblue-500 disabled:opacity-50 text-xs font-medium text-white transition-all"
        >
          <Download size={12} />
          Export All Formats
        </button>
      </div>
    </div>
  );
}
