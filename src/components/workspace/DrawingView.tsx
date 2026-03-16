import { useState, useRef, useCallback, useEffect } from 'react';
import {
  ZoomIn, ZoomOut, Maximize2, Printer, Download,
  Plus, Layers, Tag, Grid3x3, Loader2, RefreshCw,
} from 'lucide-react';
import { requestExport, fetchLatestDrawing, generateDrawing, IS_DEMO, requestDxfExport, requestIgesExport } from '../../lib/api';
import { useJobPoll } from '../../hooks/useJobPoll';

// Static BOM for demo / fallback
const BOM_ITEMS = [
  { item: 1, qty: 1,  partNumber: 'TL-4471-A',    description: 'Drill Jig Plate — Al 6061-T6',       material: 'Al 6061-T6', finish: 'Clear Anodize' },
  { item: 2, qty: 4,  partNumber: 'CL-12-RB',      description: 'Renewable Slip Bushing ⌀12mm',        material: 'Tool Steel',  finish: 'HRC 60' },
  { item: 3, qty: 2,  partNumber: 'MISU-DPDP6H7',  description: 'Diamond Locating Pin ⌀6 H7',          material: 'SCM415',      finish: 'Case Harden' },
  { item: 4, qty: 2,  partNumber: 'DC-205-U',       description: 'Hold-Down Toggle Clamp 150N',         material: 'Steel',       finish: 'Zinc Plate' },
  { item: 5, qty: 3,  partNumber: 'CL-RB10',        description: 'Rest Button ⌀10mm Fixed',             material: 'Tool Steel',  finish: 'HRC 58' },
  { item: 6, qty: 8,  partNumber: 'M8×20-ISO4762',  description: 'Socket Head Cap Screw M8×20',         material: 'A2-70 SS',    finish: 'As supplied' },
];

const TITLE_BLOCK = {
  title: 'WING PANEL DRILL JIG',
  partNumber: 'TL-4471-A',
  revision: 'Rev B',
  sheet: '1 of 2',
  scale: '1:2',
  material: 'Al 6061-T6',
  finish: 'Clear anodize per MIL-A-8625 Type II',
  weight: '0.61 kg',
  drawnBy: 'MR', drawnDate: '2026-02-10',
  checkedBy: 'AK', checkedDate: '2026-03-08',
  approvedBy: 'NK', approvedDate: '2026-03-10',
  company: 'ForgeAI Manufacturing',
  project: 'Boeing 787 Wing Panel — Station 14',
  ecrNumber: 'ECR-2847',
  tolerance: 'UNLESS OTHERWISE SPECIFIED\nDEC .X = ±0.5  .XX = ±0.1  .XXX = ±0.05\nANGULAR = ±0.5°\nSURFACE FINISH Ra 1.6 μm',
  standard: 'ASME Y14.5-2018 / AS9100 Rev D',
};

export default function DrawingView({ projectId = 'demo' }: { projectId?: string }) {
  const [zoom, setZoom] = useState(100);
  const [showBOM, setShowBOM] = useState(true);
  const [showAnnotations, setShowAnnotations] = useState(true);
  const [activeSheet, setActiveSheet] = useState(1);
  const [exportJobId, setExportJobId] = useState<string | null>(null);
  const [pdfExporting, setPdfExporting] = useState(false);
  const [serverSvg, setServerSvg] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const drawingRef = useRef<HTMLDivElement>(null);

  useJobPoll(exportJobId ? projectId : null, exportJobId);

  // In live mode, try to load existing server drawing
  useEffect(() => {
    if (IS_DEMO || projectId === 'demo') return;
    fetchLatestDrawing(projectId)
      .then((data: unknown) => {
        const d = data as { svg_json?: { svg?: string }; pdf_url?: string } | null;
        if (d?.svg_json?.svg) setServerSvg(d.svg_json.svg);
      })
      .catch(() => {});
  }, [projectId]);

  const handleGenerateDrawing = async () => {
    setGenerating(true);
    try {
      const res = await generateDrawing(projectId) as unknown;
      const d = res as { svg?: string } | null;
      if (d?.svg) setServerSvg(d.svg);
    } catch {}
    finally { setGenerating(false); }
  };

  const handleExportPDF = useCallback(async () => {
    setPdfExporting(true);
    try {
      if (IS_DEMO) {
        const { default: jsPDF } = await import('jspdf');
        const { default: html2canvas } = await import('html2canvas');
        if (!drawingRef.current) return;
        const canvas = await html2canvas(drawingRef.current, { backgroundColor: '#ffffff', scale: 2, useCORS: true });
        const imgData = canvas.toDataURL('image/png');
        const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a3' });
        const pageW = pdf.internal.pageSize.getWidth();
        const pageH = pdf.internal.pageSize.getHeight();
        pdf.addImage(imgData, 'PNG', 0, 0, pageW, pageH);
        pdf.save('TL-4471-A_RevB_Drawing.pdf');
      } else {
        const res = await requestExport(projectId, 'pdf');
        if (res) setExportJobId(res.job_id);
      }
    } finally {
      setPdfExporting(false);
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

        {/* Generate server drawing button (live mode) */}
        {!IS_DEMO && (
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
        )}

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
          onClick={() => IS_DEMO ? alert('DXF export requires a live project') : requestDxfExport(projectId)}
          className="flex items-center gap-1.5 text-xs px-2 py-1 rounded border border-cadsurface-700 text-slate-400 hover:text-slate-200 hover:border-cadblue-600/50 transition-colors"
          title="Export DXF (laser cut / CNC)"
        >
          <Download size={12} />DXF
        </button>
        <button
          onClick={() => IS_DEMO ? alert('IGES export requires a live project') : requestIgesExport(projectId)}
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
          <div
            ref={drawingRef}
            className="mx-auto bg-white shadow-2xl relative"
            style={{ width: `${(297 * zoom) / 100 * 3.78}px`, minWidth: '600px', aspectRatio: '297/210' }}
          >
            <div className="absolute inset-2 border-2 border-gray-800 overflow-hidden">
              <div className="absolute" style={{ left: '4%', top: '8%', width: '30%', height: '42%' }}>
                <DrawingView2D type="front" showAnnotations={showAnnotations} />
                <p className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-xs text-gray-700 font-bold whitespace-nowrap" style={{ fontSize: '8px' }}>FRONT VIEW — Scale 1:2</p>
              </div>
              <div className="absolute" style={{ left: '4%', top: '58%', width: '30%', height: '30%' }}>
                <DrawingView2D type="top" showAnnotations={showAnnotations} />
                <p className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-xs text-gray-700 font-bold whitespace-nowrap" style={{ fontSize: '8px' }}>TOP VIEW — Scale 1:2</p>
              </div>
              <div className="absolute" style={{ left: '37%', top: '8%', width: '14%', height: '42%' }}>
                <DrawingView2D type="right" showAnnotations={showAnnotations} />
                <p className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-xs text-gray-700 font-bold whitespace-nowrap" style={{ fontSize: '8px' }}>RIGHT — 1:2</p>
              </div>
              <div className="absolute" style={{ left: '53%', top: '5%', width: '44%', height: '52%' }}>
                <DrawingView2D type="iso" showAnnotations={showAnnotations} />
                <p className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-xs text-gray-700 font-bold whitespace-nowrap" style={{ fontSize: '8px' }}>ISOMETRIC — Not to scale</p>
              </div>
              {showBOM && (
                <div className="absolute" style={{ left: '4%', right: '2%', bottom: '14%', height: '22%' }}>
                  <BOMTable />
                </div>
              )}
              <TitleBlock />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function DrawingView2D({ type, showAnnotations }: { type: 'front' | 'top' | 'right' | 'iso'; showAnnotations: boolean }) {
  const commonStyle = "w-full h-full border border-gray-400 bg-gray-50 relative overflow-hidden";

  if (type === 'top') {
    return (
      <div className={commonStyle}>
        <svg viewBox="0 0 200 140" className="w-full h-full">
          <rect x="10" y="10" width="180" height="120" fill="none" stroke="#333" strokeWidth="1.5" />
          {[[35,30],[165,30],[35,110],[165,110]].map(([cx,cy],i) => (
            <g key={i}>
              <circle cx={cx} cy={cy} r="14" fill="none" stroke="#555" strokeWidth="1" />
              <circle cx={cx} cy={cy} r="7.5" fill="none" stroke="#333" strokeWidth="1.2" />
            </g>
          ))}
          <circle cx="28" cy="70" r="4" fill="none" stroke="#00a0a0" strokeWidth="1" strokeDasharray="3 2" />
          <circle cx="172" cy="70" r="4" fill="none" stroke="#00a0a0" strokeWidth="1" strokeDasharray="3 2" />
          <line x1="35" y1="0" x2="35" y2="140" stroke="#0080ff" strokeWidth="0.5" strokeDasharray="8 3 2 3" opacity="0.6" />
          <line x1="165" y1="0" x2="165" y2="140" stroke="#0080ff" strokeWidth="0.5" strokeDasharray="8 3 2 3" opacity="0.6" />
          <line x1="0" y1="30" x2="200" y2="30" stroke="#0080ff" strokeWidth="0.5" strokeDasharray="8 3 2 3" opacity="0.6" />
          <line x1="0" y1="110" x2="200" y2="110" stroke="#0080ff" strokeWidth="0.5" strokeDasharray="8 3 2 3" opacity="0.6" />
          <line x1="10" y1="2" x2="190" y2="2" stroke="#333" strokeWidth="0.7" />
          <text x="100" y="9" textAnchor="middle" fill="#333" fontSize="7" fontFamily="monospace">150</text>
          {showAnnotations && (
            <>
              <line x1="165" y1="16" x2="178" y2="6" stroke="#7c3aed" strokeWidth="0.6" />
              <text x="118" y="6" fill="#6d28d9" fontSize="6" fontFamily="monospace">⊕ ⌀0.1(M)|A|B|C</text>
              <rect x="88" y="130" width="8" height="6" rx="1" fill="#92400e" stroke="#d97706" strokeWidth="0.5" />
              <text x="92" y="135" textAnchor="middle" fill="#fef3c7" fontSize="5" fontWeight="bold">A</text>
            </>
          )}
        </svg>
      </div>
    );
  }

  if (type === 'front') {
    return (
      <div className={commonStyle}>
        <svg viewBox="0 0 200 100" className="w-full h-full">
          <rect x="10" y="15" width="180" height="70" fill="none" stroke="#333" strokeWidth="1.5" />
          {[35,165].map((cx,i) => (
            <g key={i}>
              <ellipse cx={cx} cy="15" rx="14" ry="4" fill="none" stroke="#333" strokeWidth="1" strokeDasharray="4 2" />
              <ellipse cx={cx} cy="15" rx="7.5" ry="2" fill="none" stroke="#555" strokeWidth="0.8" strokeDasharray="4 2" />
            </g>
          ))}
          <line x1="196" y1="15" x2="196" y2="85" stroke="#333" strokeWidth="0.7" />
          <text x="199" y="53" fill="#333" fontSize="7" fontFamily="monospace" transform="rotate(90,199,53)" dx="-10">15</text>
          <line x1="10" y1="7" x2="190" y2="7" stroke="#333" strokeWidth="0.7" />
          <text x="100" y="5" textAnchor="middle" fill="#333" fontSize="7" fontFamily="monospace">150</text>
          {showAnnotations && (
            <>
              <line x1="100" y1="85" x2="100" y2="95" stroke="#374151" strokeWidth="0.6" />
              <text x="62" y="98" fill="#374151" fontSize="6" fontFamily="monospace">⏥ 0.05  A</text>
              <polygon points="100,85 96,90 104,90" fill="none" stroke="#92400e" strokeWidth="0.7" />
              <rect x="97" y="90" width="7" height="5" rx="0.5" fill="#92400e" stroke="#d97706" strokeWidth="0.5" />
              <text x="100" y="94" textAnchor="middle" fill="#fef3c7" fontSize="4" fontWeight="bold">A</text>
            </>
          )}
        </svg>
      </div>
    );
  }

  if (type === 'right') {
    return (
      <div className={commonStyle}>
        <svg viewBox="0 0 80 200" className="w-full h-full">
          <rect x="10" y="25" width="60" height="150" fill="none" stroke="#333" strokeWidth="1.5" />
          <line x1="2" y1="25" x2="2" y2="175" stroke="#333" strokeWidth="0.7" />
          <text x="1" y="103" fill="#333" fontSize="7" fontFamily="monospace" transform="rotate(-90,1,103)" dx="-25">100</text>
          <line x1="10" y1="16" x2="70" y2="16" stroke="#333" strokeWidth="0.7" />
          <text x="40" y="14" textAnchor="middle" fill="#333" fontSize="7" fontFamily="monospace">15</text>
          {showAnnotations && (
            <>
              <line x1="74" y1="25" x2="78" y2="20" stroke="#374151" strokeWidth="0.6" />
              <text x="46" y="19" fill="#374151" fontSize="5" fontFamily="monospace">∥ 0.03|A</text>
            </>
          )}
        </svg>
      </div>
    );
  }

  return (
    <div className={commonStyle} style={{ background: '#f8fafc' }}>
      <svg viewBox="0 0 320 220" className="w-full h-full">
        <path d="M 50 80 L 230 80 L 230 160 L 50 160 Z" fill="#e0e8f0" stroke="#333" strokeWidth="1.2" />
        <path d="M 50 160 L 230 160 L 230 175 L 50 175 Z" fill="#c8d8e8" stroke="#333" strokeWidth="1" />
        {[[80,100],[160,100],[80,140],[160,140]].map(([cx,cy],i) => (
          <g key={i}>
            <ellipse cx={cx} cy={cy} rx="20" ry="20" fill="#d4e0ec" stroke="#555" strokeWidth="1" />
            <ellipse cx={cx} cy={cy} rx="11" ry="11" fill="#aec8d8" stroke="#333" strokeWidth="0.8" />
            <ellipse cx={cx} cy={cy} rx="5" ry="5" fill="#6090a8" stroke="#1d4ed8" strokeWidth="0.5" />
            <circle cx={cx+16} cy={cy-16} r="7" fill="white" stroke="#333" strokeWidth="0.6" />
            <text x={cx+16} y={cy-13} textAnchor="middle" fill="#333" fontSize="7" fontWeight="bold">2</text>
          </g>
        ))}
        <ellipse cx="60" cy="120" rx="5" ry="5" fill="#afc8d0" stroke="#00a0a0" strokeWidth="0.8" />
        <ellipse cx="220" cy="120" rx="5" ry="5" fill="#afc8d0" stroke="#00a0a0" strokeWidth="0.8" />
        <circle cx="60" cy="106" r="7" fill="white" stroke="#333" strokeWidth="0.6" />
        <text x="60" y="109" textAnchor="middle" fill="#333" fontSize="7" fontWeight="bold">3</text>
        <line x1="50" y1="68" x2="230" y2="68" stroke="#555" strokeWidth="0.7" />
        <text x="140" y="65" textAnchor="middle" fill="#555" fontSize="8" fontFamily="monospace">150</text>
        {showAnnotations && (
          <>
            <line x1="140" y1="175" x2="140" y2="190" stroke="#92400e" strokeWidth="0.8" />
            <rect x="136" y="190" width="9" height="7" rx="1" fill="#92400e" stroke="#d97706" strokeWidth="0.6" />
            <text x="140" y="196" textAnchor="middle" fill="#fef3c7" fontSize="6" fontWeight="bold">A</text>
          </>
        )}
      </svg>
    </div>
  );
}

function BOMTable() {
  return (
    <div className="w-full h-full border border-gray-600 overflow-hidden" style={{ fontSize: '7px' }}>
      <div className="flex items-center bg-gray-200 border-b border-gray-600 font-bold text-gray-800" style={{ minHeight: '16px' }}>
        <span className="border-r border-gray-600 px-1 w-8 shrink-0 text-center">ITEM</span>
        <span className="border-r border-gray-600 px-1 w-8 shrink-0 text-center">QTY</span>
        <span className="border-r border-gray-600 px-1 w-28 shrink-0">PART NUMBER</span>
        <span className="border-r border-gray-600 px-1 flex-1">DESCRIPTION</span>
        <span className="border-r border-gray-600 px-1 w-20 shrink-0">MATERIAL</span>
        <span className="px-1 w-24 shrink-0">FINISH / NOTES</span>
      </div>
      {BOM_ITEMS.map((row, i) => (
        <div key={row.item} className={`flex items-center border-b border-gray-400 text-gray-700 ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`} style={{ minHeight: '14px' }}>
          <span className="border-r border-gray-400 px-1 w-8 shrink-0 text-center font-semibold">{row.item}</span>
          <span className="border-r border-gray-400 px-1 w-8 shrink-0 text-center">{row.qty}</span>
          <span className="border-r border-gray-400 px-1 w-28 shrink-0 font-mono">{row.partNumber}</span>
          <span className="border-r border-gray-400 px-1 flex-1">{row.description}</span>
          <span className="border-r border-gray-400 px-1 w-20 shrink-0">{row.material}</span>
          <span className="px-1 w-24 shrink-0 text-gray-500">{row.finish}</span>
        </div>
      ))}
    </div>
  );
}

function TitleBlock() {
  return (
    <div className="absolute bottom-0 right-0 border-t border-l border-gray-700" style={{ width: '38%', height: '14%', fontSize: '6.5px' }}>
      <div className="flex h-full text-gray-800">
        <div className="flex-1 border-r border-gray-600 px-1 py-0.5 flex flex-col justify-between">
          <div>
            <p className="font-bold text-gray-600 mb-0.5" style={{ fontSize: '5.5px' }}>TOLERANCES</p>
            {TITLE_BLOCK.tolerance.split('\n').map((line, i) => (
              <p key={i} style={{ fontSize: '5.5px', lineHeight: 1.3 }}>{line}</p>
            ))}
          </div>
          <p style={{ fontSize: '5.5px' }} className="text-gray-500">{TITLE_BLOCK.standard}</p>
        </div>
        <div className="w-24 border-r border-gray-600">
          {[
            { label: 'DRAWN',    name: TITLE_BLOCK.drawnBy,   date: TITLE_BLOCK.drawnDate },
            { label: 'CHECKED',  name: TITLE_BLOCK.checkedBy,  date: TITLE_BLOCK.checkedDate },
            { label: 'APPROVED', name: TITLE_BLOCK.approvedBy, date: TITLE_BLOCK.approvedDate },
          ].map((row) => (
            <div key={row.label} className="flex border-b border-gray-400 last:border-0" style={{ height: '33.33%' }}>
              <span className="border-r border-gray-400 px-0.5 flex items-center font-bold text-gray-600 w-12 shrink-0" style={{ fontSize: '5.5px' }}>{row.label}</span>
              <span className="border-r border-gray-400 px-0.5 flex items-center w-7">{row.name}</span>
              <span className="px-0.5 flex items-center text-gray-500">{row.date.slice(5)}</span>
            </div>
          ))}
        </div>
        <div className="flex-1">
          <div className="border-b border-gray-600 px-1 py-0.5">
            <p className="font-bold text-gray-500" style={{ fontSize: '5.5px' }}>{TITLE_BLOCK.company}</p>
            <p className="font-bold text-gray-800" style={{ fontSize: '8px', lineHeight: 1.1 }}>{TITLE_BLOCK.title}</p>
          </div>
          <div className="flex" style={{ height: 'calc(100% - 28px)' }}>
            <div className="flex-1 border-r border-gray-400 px-1 py-0.5 flex flex-col justify-around">
              <div>
                <p className="text-gray-500 font-bold" style={{ fontSize: '5px' }}>PART NUMBER</p>
                <p className="font-mono font-bold text-gray-800" style={{ fontSize: '7.5px' }}>{TITLE_BLOCK.partNumber}</p>
              </div>
              <div>
                <p className="text-gray-500 font-bold" style={{ fontSize: '5px' }}>MATERIAL</p>
                <p className="font-mono">{TITLE_BLOCK.material}</p>
              </div>
            </div>
            <div className="w-16 px-1 py-0.5 flex flex-col justify-around">
              <div>
                <p className="text-gray-500 font-bold" style={{ fontSize: '5px' }}>REV</p>
                <p className="font-bold text-gray-900" style={{ fontSize: '8px' }}>{TITLE_BLOCK.revision}</p>
              </div>
              <div>
                <p className="text-gray-500 font-bold" style={{ fontSize: '5px' }}>SHEET</p>
                <p>{TITLE_BLOCK.sheet}</p>
              </div>
              <div>
                <p className="text-gray-500 font-bold" style={{ fontSize: '5px' }}>SCALE</p>
                <p>{TITLE_BLOCK.scale}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="absolute top-0.5 left-1 text-gray-400 font-mono" style={{ fontSize: '5px' }}>
        {TITLE_BLOCK.ecrNumber} · {TITLE_BLOCK.project}
      </div>
    </div>
  );
}
