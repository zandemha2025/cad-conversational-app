import { useState, useCallback, useEffect } from 'react';
import {
  ZoomIn, ZoomOut, Maximize2, Printer, Download,
  Plus, Layers, Tag, Grid3x3, Loader2, RefreshCw,
} from 'lucide-react';
import { fetchLatestDrawing, generateProjectDrawings, fetchProjectDrawings, directExport } from '../../lib/api';
import { useJobPoll } from '../../hooks/useJobPoll';


export default function DrawingView({ projectId = 'demo' }: { projectId?: string; projectName?: string }) {
  const [zoom, setZoom] = useState(100);
  const [showBOM, setShowBOM] = useState(true);
  const [showAnnotations, setShowAnnotations] = useState(true);
  const [activeSheet, setActiveSheet] = useState(1);
  const [exportJobId, setExportJobId] = useState<string | null>(null);
  const [pdfExporting, setPdfExporting] = useState(false);
  const [serverSvg, setServerSvg] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const { downloadUrl: pdfDownloadUrl } = useJobPoll(exportJobId ? projectId : null, exportJobId);

  // Auto-download PDF when job completes
  useEffect(() => {
    if (pdfDownloadUrl) {
      window.open(pdfDownloadUrl, '_blank');
      setExportJobId(null);
    }
  }, [pdfDownloadUrl]);

  // Try to load existing server drawing (try v2 endpoint first, fall back to v1)
  useEffect(() => {
    if (!projectId || projectId === 'demo') return;
    fetchProjectDrawings(projectId)
      .then((data: unknown) => {
        const arr = data as Array<{ svg_json?: { svg?: string } | null }> | null;
        if (arr && arr.length > 0 && arr[0]?.svg_json?.svg) {
          setServerSvg(arr[0].svg_json.svg);
        }
      })
      .catch(() => {
        // Fallback to v1 endpoint
        fetchLatestDrawing(projectId)
          .then((data: unknown) => {
            const d = data as { svg_json?: { svg?: string } | null } | null;
            if (d?.svg_json?.svg) setServerSvg(d.svg_json.svg);
          })
          .catch(() => {});
      });
  }, [projectId]);

  const handleGenerateDrawing = async () => {
    if (!projectId || projectId === 'demo') return;
    setGenerating(true);
    try {
      const res = await generateProjectDrawings(projectId) as unknown;
      // Backend returns { id, status, drawing: { svg_json: { svg: "..." } } }
      const d = res as { drawing?: { svg_json?: { svg?: string }; svg?: string } } | null;
      const svg = d?.drawing?.svg_json?.svg ?? d?.drawing?.svg ?? null;
      if (svg) {
        setServerSvg(svg);
      } else {
        // Refetch from DB after a short delay (generation may be async)
        setTimeout(async () => {
          try {
            const arr = await fetchProjectDrawings(projectId) as unknown as Array<{ svg_json?: { svg?: string } }> | null;
            if (arr && arr.length > 0 && arr[0]?.svg_json?.svg) setServerSvg(arr[0].svg_json.svg);
          } catch {}
        }, 3000);
      }
    } catch {}
    finally { setGenerating(false); }
  };

  const handleExportPDF = useCallback(async () => {
    if (!projectId || projectId === 'demo') return;
    setPdfExporting(true);
    try {
      const blob = await directExport(projectId, 'step'); // PDF not in directExport, use job
      if (blob) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `drawing-${projectId.slice(0, 8)}.pdf`;
        a.click();
        URL.revokeObjectURL(url);
      }
    } finally {
      setPdfExporting(false);
    }
  }, [projectId]);

  const handleDirectExport = useCallback(async (format: 'dxf' | 'iges') => {
    if (!projectId || projectId === 'demo') return;
    const blob = await directExport(projectId, format);
    if (blob) {
      const ext = format === 'dxf' ? '.dxf' : '.igs';
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `drawing-${projectId.slice(0, 8)}${ext}`;
      a.click();
      URL.revokeObjectURL(url);
    }
  }, [projectId]);

  return (
    <div className="h-full flex flex-col bg-cadsurface-950">
      {/* Toolbar */}
      <div className="flex items-center gap-1.5 px-3 py-2 border-b border-cadsurface-700 bg-cadsurface-900 shrink-0">
        <div className="flex items-center gap-1 bg-cadsurface-800 border border-cadsurface-700 rounded-lg px-1 py-0.5">
          <button onClick={() => setZoom((z) => Math.max(25, z - 25))} className="btn-ghost p-1 rounded"><ZoomOut size={13} /></button>
          <span className="text-xs text-slate-400 w-10 text-center font-mono">{zoom}%</span>
          <button onClick={() => setZoom((z) => Math.min(200, z + 25))} className="btn-ghost p-1 rounded"><ZoomIn size={13} /></button>
        </div>

        <button className="btn-ghost p-1.5 rounded border border-cadsurface-700" title="Fit page"><Maximize2 size={13} /></button>
        <div className="w-px h-5 bg-cadsurface-700 mx-1" />

        <button
          onClick={() => setShowAnnotations((p) => !p)}
          className={`flex items-center gap-1.5 text-xs px-2 py-1 rounded border transition-colors ${
            showAnnotations ? 'bg-cadblue-900/40 border-cadblue-700/50 text-cadblue-300' : 'border-cadsurface-700 text-slate-500 hover:text-slate-300'
          }`}
        >
          <Tag size={12} />GD&T
        </button>
        <button
          onClick={() => setShowBOM((p) => !p)}
          className={`flex items-center gap-1.5 text-xs px-2 py-1 rounded border transition-colors ${
            showBOM ? 'bg-cadblue-900/40 border-cadblue-700/50 text-cadblue-300' : 'border-cadsurface-700 text-slate-500 hover:text-slate-300'
          }`}
        >
          <Layers size={12} />BOM
        </button>
        <button className="flex items-center gap-1.5 text-xs px-2 py-1 rounded border border-cadsurface-700 text-slate-500 hover:text-slate-300 transition-colors">
          <Grid3x3 size={12} />Layers
        </button>

        {/* Generate server drawing button */}
        <>
          <div className="w-px h-5 bg-cadsurface-700 mx-1" />
          <button
            onClick={handleGenerateDrawing}
            disabled={generating}
            className="flex items-center gap-1.5 text-xs px-2 py-1 rounded border border-cadsurface-700 text-slate-400 hover:text-slate-200 hover:border-cadblue-600/50 disabled:opacity-50 transition-colors"
          >
            {generating ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
            {generating ? 'Generating…' : 'AI Drawing'}
          </button>
        </>

        <div className="flex-1" />

        <div className="flex items-center gap-1">
          {[1, 2].map((s) => (
            <button
              key={s}
              onClick={() => setActiveSheet(s)}
              className={`text-xs px-2.5 py-1 rounded border transition-colors ${
                activeSheet === s
                  ? 'bg-cadblue-600 border-cadblue-500 text-white'
                  : 'border-cadsurface-700 text-slate-500 hover:text-slate-300 hover:bg-cadsurface-800'
              }`}
            >
              Sheet {s}
            </button>
          ))}
          <button className="btn-ghost p-1 rounded text-slate-600 hover:text-slate-300"><Plus size={13} /></button>
        </div>

        <div className="w-px h-5 bg-cadsurface-700 mx-1" />
        <button onClick={() => window.print()} className="flex items-center gap-1.5 text-xs px-2 py-1 rounded border border-cadsurface-700 text-slate-400 hover:text-slate-200 hover:bg-cadsurface-800 transition-colors">
          <Printer size={12} />Print
        </button>
        <button
          onClick={handleExportPDF}
          disabled={pdfExporting}
          className="flex items-center gap-1.5 text-xs px-2 py-1 rounded bg-cadblue-600 hover:bg-cadblue-700 disabled:bg-cadblue-900 text-white transition-colors"
        >
          {pdfExporting ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
          {pdfExporting ? 'Exporting…' : 'Export PDF'}
        </button>
        <button
          onClick={() => handleDirectExport('dxf')}
          className="flex items-center gap-1.5 text-xs px-2 py-1 rounded border border-cadsurface-700 text-slate-400 hover:text-slate-200 hover:border-cadblue-600/50 transition-colors"
          title="Export DXF (laser cut / CNC)"
        >
          <Download size={12} />DXF
        </button>
        <button
          onClick={() => handleDirectExport('iges')}
          className="flex items-center gap-1.5 text-xs px-2 py-1 rounded border border-cadsurface-700 text-slate-400 hover:text-slate-200 hover:border-cadblue-600/50 transition-colors"
          title="Export IGES (CAD interop)"
        >
          <Download size={12} />IGES
        </button>
      </div>

      {/* Drawing canvas */}
      <div className="flex-1 overflow-auto bg-slate-700/30 p-6">
        {/* Server-generated SVG (live mode) */}
        {serverSvg ? (
          <div
            className="mx-auto bg-white shadow-2xl"
            style={{ width: `${(297 * zoom) / 100 * 3.78}px`, minWidth: '600px', aspectRatio: '297/210' }}
            dangerouslySetInnerHTML={{ __html: serverSvg }}
          />
        ) : (
          <div className="flex flex-col items-center justify-center h-full gap-4 text-center">
            <div className="w-16 h-16 rounded-2xl bg-cadsurface-800/80 border border-cadsurface-700 flex items-center justify-center">
              <Maximize2 size={28} className="text-slate-600" />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-400">No drawing yet</p>
              <p className="text-xs text-slate-600 mt-1 max-w-xs leading-relaxed">
                Click <strong className="text-slate-400">AI Drawing</strong> to generate an engineering drawing from your fixture geometry.
              </p>
            </div>
            <button
              onClick={handleGenerateDrawing}
              disabled={generating}
              className="flex items-center gap-2 text-sm px-4 py-2 rounded-lg bg-cadblue-600 hover:bg-cadblue-700 disabled:opacity-50 text-white transition-colors"
            >
              {generating ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
              {generating ? 'Generating…' : 'Generate Drawing'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}


