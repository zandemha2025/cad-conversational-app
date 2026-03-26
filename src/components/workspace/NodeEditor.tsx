import { useState, useCallback, useEffect, useRef } from 'react';
import { regenerateNodeGraph, updateNodeParams } from '../../lib/api';
import { useNodeGraph } from '../../hooks/useNodeGraph';
import type { ApiNodeDef, ApiConnection, ApiNodeParam } from '../../types';
import {
  FileInput, Printer, Crosshair, AlertTriangle,
  CheckCircle2, FileOutput, RefreshCw, ZoomIn, ZoomOut, Maximize2, Sparkles,
  Cpu, Info, Loader2, Pencil, Check, X, Move, GitBranch,
} from 'lucide-react';

// ── Category styling ──────────────────────────────────────────────────────────

type Category = 'input' | 'foundation' | 'geometry' | 'print' | 'output';

const CAT: Record<Category, {
  headerBg: string; accent: string; portColor: string; wireColor: string; badge: string;
}> = {
  input:      { headerBg: 'bg-slate-800/80',    accent: 'border-l-slate-500',    portColor: '#64748b', wireColor: '#475569', badge: 'INPUT'      },
  foundation: { headerBg: 'bg-cadblue-950/60',  accent: 'border-l-cadblue-500',  portColor: '#3b82f6', wireColor: '#2563eb', badge: 'FOUNDATION' },
  geometry:   { headerBg: 'bg-emerald-950/60',  accent: 'border-l-emerald-500',  portColor: '#10b981', wireColor: '#059669', badge: 'GEOMETRY'   },
  print:      { headerBg: 'bg-amber-950/50',    accent: 'border-l-amber-500',    portColor: '#f59e0b', wireColor: '#d97706', badge: 'PRINT'      },
  output:     { headerBg: 'bg-purple-950/60',   accent: 'border-l-purple-500',   portColor: '#8b5cf6', wireColor: '#7c3aed', badge: 'OUTPUT'     },
};

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  'input':      <FileInput size={13} />,
  'foundation': <Crosshair size={13} />,
  'geometry':   <Cpu size={13} />,
  'print':      <Printer size={13} />,
  'output':     <FileOutput size={13} />,
};

function portY(node: ApiNodeDef) { return node.y + node.h / 2; }

// ── Dependency path calculator ─────────────────────────────────────────────────

function getDependencyPath(nodeId: string, conns: ApiConnection[]): Set<string> {
  const visited = new Set<string>();
  const queue = [nodeId];
  while (queue.length > 0) {
    const curr = queue.shift()!;
    if (visited.has(curr)) continue;
    visited.add(curr);
    conns.filter(c => c.from_node === curr).forEach(c => {
      if (!visited.has(c.to_node)) queue.push(c.to_node);
    });
  }
  return visited;
}

// ── Inline-editable param row ─────────────────────────────────────────────────

function ParamRow({ param, nodeId, projectId, onUpdated }: {
  param: ApiNodeParam; nodeId: string; projectId: string;
  onUpdated: (key: string, value: string | number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [editVal, setEditVal] = useState(String(param.value));
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleEdit = () => { setEditVal(String(param.value)); setEditing(true); setTimeout(() => inputRef.current?.focus(), 50); };
  const handleCancel = () => { setEditing(false); };
  const handleSave = async () => {
    if (editVal === String(param.value)) { setEditing(false); return; }
    setSaving(true);
    try {
      if (projectId && projectId !== 'demo') {
        await updateNodeParams(projectId, nodeId, [{ name: param.name, value: param.type === 'number' ? parseFloat(editVal) : editVal, type: param.type }]);
      }
      onUpdated(param.name, param.type === 'number' ? parseFloat(editVal) : editVal);
    } finally {
      setSaving(false);
      setEditing(false);
    }
  };

  const isHighlight = param.name.toLowerCase().includes('size') || param.name.toLowerCase().includes('bore') || param.name.toLowerCase().includes('dims');
  const isWarn = String(param.value).toLowerCase().includes('suppressed') || String(param.value).toLowerCase().includes('⚠');
  const isOk = String(param.value).toLowerCase().includes('ok') || String(param.value).toLowerCase().includes('constrained');

  return (
    <div
      className="flex items-center justify-between gap-2 group"
      onMouseDown={e => e.stopPropagation()} // prevent drag from param rows
    >
      <span className="text-slate-600 shrink-0" style={{ fontSize: '10px' }}>{param.name}</span>
      {editing ? (
        <div className="flex items-center gap-1">
          <input
            ref={inputRef}
            value={editVal}
            onChange={e => setEditVal(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') handleCancel(); }}
            className="text-xs font-mono bg-cadsurface-700 border border-cadblue-500 rounded px-1.5 py-0.5 w-24 outline-none text-cadblue-200"
            style={{ fontSize: '10px' }}
          />
          <button onClick={handleSave} disabled={saving} className="text-emerald-400 hover:text-emerald-300">
            {saving ? <Loader2 size={9} className="animate-spin" /> : <Check size={9} />}
          </button>
          <button onClick={handleCancel} className="text-slate-500 hover:text-slate-300"><X size={9} /></button>
        </div>
      ) : (
        <div className="flex items-center gap-1">
          <span className={`font-mono truncate text-right ${
            isWarn ? 'text-amber-400' : isOk ? 'text-emerald-400' : isHighlight ? 'text-cadblue-300' : 'text-slate-400'
          }`} style={{ fontSize: '10px' }}>
            {isOk && <CheckCircle2 size={8} className="inline mr-0.5 mb-0.5" />}
            {isWarn && <AlertTriangle size={8} className="inline mr-0.5 mb-0.5" />}
            {String(param.value)}{param.unit ? ` ${param.unit}` : ''}
          </span>
          {param.type === 'number' || param.type === 'string' ? (
            <button onClick={handleEdit} className="opacity-0 group-hover:opacity-100 text-slate-600 hover:text-slate-400 transition-opacity">
              <Pencil size={8} />
            </button>
          ) : null}
        </div>
      )}
    </div>
  );
}

// ── Node card ─────────────────────────────────────────────────────────────────

function NodeCard({ node, selected, inDepPath, projectId, onParamUpdated, onDragStart }: {
  node: ApiNodeDef; selected: boolean; inDepPath: boolean;
  projectId: string; onParamUpdated: (nodeId: string, key: string, value: string | number) => void;
  onDragStart: (e: React.MouseEvent, nodeId: string) => void;
}) {
  const cat = CAT[node.category as Category] ?? CAT.input;
  const categoryIcon = CATEGORY_ICONS[node.category] ?? <Cpu size={13} />;
  const isWarnNode = node.params.some(p => String(p.value).includes('⚠'));

  return (
    <div
      className={`absolute rounded-xl border-l-[3px] border overflow-hidden select-none transition-shadow ${cat.accent} ${
        selected
          ? 'shadow-lg shadow-cadblue-950/80 ring-1 ring-cadblue-500/50 border-cadsurface-600'
          : inDepPath && !selected
          ? 'border-emerald-700/60 ring-1 ring-emerald-500/20 shadow-md shadow-emerald-950/50'
          : 'border-cadsurface-700 hover:border-cadsurface-600'
      }`}
      style={{ left: node.x, top: node.y, width: node.w, background: '#0d1424', cursor: 'grab' }}
    >
      {/* Draggable header */}
      <div
        className={`flex items-center justify-between px-3 py-2 ${cat.headerBg} border-b border-cadsurface-700/60`}
        onMouseDown={e => onDragStart(e, node.id)}
        style={{ cursor: 'grab' }}
      >
        <div className="flex items-center gap-1.5">
          <span className={`${{ input: 'text-slate-400', foundation: 'text-cadblue-400', geometry: 'text-emerald-400', print: 'text-amber-400', output: 'text-purple-400' }[node.category] ?? 'text-slate-400'}`}>
            {categoryIcon}
          </span>
          <span className="text-xs font-bold text-slate-200 truncate">{node.label}</span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {node.ai_generated && (
            <span className="text-xs px-1.5 py-0 rounded bg-violet-900/50 border border-violet-700/50 text-violet-300 font-mono" style={{ fontSize: '9px' }}>AI</span>
          )}
          <span className="text-xs rounded px-1 text-slate-700 font-mono" style={{ fontSize: '8px' }}>{cat.badge}</span>
          <Move size={9} className="text-slate-700 ml-0.5" />
        </div>
      </div>
      <div className="px-3 py-2 space-y-1">
        {node.params.map(p => (
          <ParamRow key={p.name} param={p} nodeId={node.id} projectId={projectId}
            onUpdated={(key, val) => onParamUpdated(node.id, key, val)} />
        ))}
      </div>
      {isWarnNode && (
        <div className="mx-2 mb-2 flex items-center gap-1.5 bg-amber-950/40 border border-amber-700/40 rounded-lg px-2 py-1.5">
          <AlertTriangle size={10} className="text-amber-400 shrink-0" />
          <span className="text-amber-300" style={{ fontSize: '10px' }}>Warning — review before export</span>
        </div>
      )}
    </div>
  );
}

// ── Connection path builder ───────────────────────────────────────────────────

function buildConnectionPath(nodes: ApiNodeDef[], conn: ApiConnection): string {
  const from = nodes.find(n => n.id === conn.from_node);
  const to = nodes.find(n => n.id === conn.to_node);
  if (!from || !to) return '';
  const x1 = from.x + from.w;
  const y1 = portY(from);
  const x2 = to.x;
  const y2 = portY(to);
  const cp = Math.abs(x2 - x1) / 2;
  return `M ${x1},${y1} C ${x1 + cp},${y1} ${x2 - cp},${y2} ${x2},${y2}`;
}

// ── Main NodeEditor ───────────────────────────────────────────────────────────

export default function NodeEditor({ projectId = 'demo' }: { projectId?: string }) {
  const [selected, setSelected] = useState<string | null>(null);
  const [zoom, setZoom] = useState(100);
  const [regenerating, setRegenerating] = useState(false);
  const { graph, loading, refetch } = useNodeGraph(projectId);

  const [localNodes, setLocalNodes] = useState<ApiNodeDef[]>([]);
  const [localConns, setLocalConns] = useState<ApiConnection[]>([]);

  // Dragging ref — avoids stale closures and keeps perf high
  const dragRef = useRef<{
    nodeId: string;
    startMouseX: number;
    startMouseY: number;
    startNodeX: number;
    startNodeY: number;
    hasMoved: boolean;
  } | null>(null);

  useEffect(() => {
    if (graph) {
      setLocalNodes(graph.nodes);
      setLocalConns(graph.connections);
      if (!selected && graph.nodes.length > 0) setSelected(graph.nodes[0]?.id ?? null);
    }
  }, [graph]);

  const handleRegenerate = useCallback(async () => {
    setRegenerating(true);
    await regenerateNodeGraph(projectId).catch(() => {});
    refetch();
    setRegenerating(false);
  }, [projectId, refetch]);

  const handleParamUpdated = useCallback((nodeId: string, key: string, value: string | number) => {
    setLocalNodes(prev => prev.map(n => n.id === nodeId ? {
      ...n, params: n.params.map(p => p.name === key ? { ...p, value } : p),
    } : n));
    if (projectId && projectId !== 'demo') regenerateNodeGraph(projectId).catch(() => {});
  }, [projectId]);

  // ── Drag handlers ────────────────────────────────────────────────────────────

  const handleNodeDragStart = useCallback((e: React.MouseEvent, nodeId: string) => {
    e.preventDefault();
    e.stopPropagation();
    const node = localNodes.find(n => n.id === nodeId);
    if (!node) return;
    dragRef.current = {
      nodeId,
      startMouseX: e.clientX,
      startMouseY: e.clientY,
      startNodeX: node.x,
      startNodeY: node.y,
      hasMoved: false,
    };
  }, [localNodes]);

  const handleCanvasMouseMove = useCallback((e: React.MouseEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    const scale = zoom / 100;
    const dx = (e.clientX - drag.startMouseX) / scale;
    const dy = (e.clientY - drag.startMouseY) / scale;
    if (Math.abs(dx) > 2 || Math.abs(dy) > 2) {
      drag.hasMoved = true;
      const newX = Math.max(0, drag.startNodeX + dx);
      const newY = Math.max(0, drag.startNodeY + dy);
      setLocalNodes(prev => prev.map(n =>
        n.id === drag.nodeId ? { ...n, x: newX, y: newY } : n,
      ));
    }
  }, [zoom]);

  const handleCanvasMouseUp = useCallback((e: React.MouseEvent) => {
    const drag = dragRef.current;
    dragRef.current = null;
    // Treat as click-to-select if no drag movement
    if (drag && !drag.hasMoved) {
      setSelected(drag.nodeId);
    }
    e.stopPropagation();
  }, []);

  const handleCanvasBackground = useCallback(() => {
    if (!dragRef.current) setSelected(null);
  }, []);

  // ── Dependency path ──────────────────────────────────────────────────────────
  const depPath = selected ? getDependencyPath(selected, localConns) : new Set<string>();
  const hasSelection = selected !== null;

  const noGraph = !loading && localNodes.length === 0;

  const CANVAS_W = Math.max(1400, localNodes.reduce((m, n) => Math.max(m, n.x + n.w + 80), 1400));
  const CANVAS_H = Math.max(700,  localNodes.reduce((m, n) => Math.max(m, n.y + n.h + 80), 700));

  const selectedNode = localNodes.find(n => n.id === selected);

  return (
    <div className="flex flex-col h-full bg-cadsurface-950 overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-cadsurface-700 shrink-0 bg-cadsurface-900">
        <div className="flex items-center gap-2 px-3 py-1.5 bg-violet-950/50 border border-violet-700/40 rounded-lg">
          <Sparkles size={12} className="text-violet-400" />
          <span className="text-xs text-violet-300 font-medium">AI Generated</span>
          <span className="text-xs text-slate-600">·</span>
          <span className="text-xs text-slate-500">{localNodes.length} nodes · {localConns.length} connections</span>
        </div>
        <div className="w-px h-5 bg-cadsurface-700" />
        {loading && <Loader2 size={13} className="text-slate-500 animate-spin" />}
        <button onClick={handleRegenerate} disabled={regenerating}
          className="flex items-center gap-1.5 text-xs btn-ghost px-2.5 py-1.5 rounded-lg border border-cadsurface-700 hover:border-cadblue-700/50 disabled:opacity-50">
          <RefreshCw size={12} className={regenerating ? 'animate-spin' : ''} />
          {regenerating ? 'Regenerating…' : 'Regenerate'}
        </button>

        {/* Dep path indicator */}
        {selected && (
          <div className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg bg-emerald-950/40 border border-emerald-700/30 text-emerald-300">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            {depPath.size} nodes in path
          </div>
        )}

        <div className="flex-1" />
        <div className="flex items-center gap-1 bg-cadsurface-800 rounded-lg border border-cadsurface-700 px-1 py-1">
          <button onClick={() => setZoom(z => Math.max(40, z - 10))} className="w-6 h-6 flex items-center justify-center text-slate-400 hover:text-slate-200"><ZoomOut size={12} /></button>
          <span className="text-xs font-mono text-slate-400 w-10 text-center">{zoom}%</span>
          <button onClick={() => setZoom(z => Math.min(160, z + 10))} className="w-6 h-6 flex items-center justify-center text-slate-400 hover:text-slate-200"><ZoomIn size={12} /></button>
          <button onClick={() => setZoom(100)} className="w-6 h-6 flex items-center justify-center text-slate-400 hover:text-slate-200"><Maximize2 size={11} /></button>
        </div>
      </div>

      {/* Empty state for real projects with no graph */}
      {noGraph && (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center max-w-sm px-6">
            <div className="w-16 h-16 rounded-2xl bg-violet-900/20 border border-violet-700/30 flex items-center justify-center mx-auto mb-4">
              <GitBranch size={26} className="text-violet-400" />
            </div>
            <p className="text-sm font-semibold text-slate-300 mb-1">No Node Graph Yet</p>
            <p className="text-xs text-slate-500 leading-relaxed mb-4">
              Generate a fixture via AI Chat to build the node graph. The graph will appear here once generation completes.
            </p>
            <button
              onClick={handleRegenerate}
              disabled={regenerating}
              className="flex items-center gap-2 text-xs px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white font-medium transition-colors mx-auto"
            >
              {regenerating ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
              {regenerating ? 'Generating…' : 'Generate Graph'}
            </button>
          </div>
        </div>
      )}

      {/* Canvas + detail panel */}
      {!noGraph && <div className="flex flex-1 overflow-hidden">
        {/* Scrollable canvas */}
        <div
          className="flex-1 overflow-auto"
          style={{ cursor: dragRef.current ? 'grabbing' : 'default' }}
          onMouseMove={handleCanvasMouseMove}
          onMouseUp={handleCanvasMouseUp}
          onMouseLeave={() => { dragRef.current = null; }}
        >
          <div
            className="relative origin-top-left"
            style={{ width: CANVAS_W, height: CANVAS_H, transform: `scale(${zoom / 100})` }}
            onClick={handleCanvasBackground}
          >
            {/* Dot-grid background */}
            <div className="absolute inset-0" style={{
              backgroundImage: 'radial-gradient(circle, #1e293b 1px, transparent 1px)',
              backgroundSize: '24px 24px',
            }} />

            {/* SVG connections */}
            <svg className="absolute inset-0 overflow-visible pointer-events-none" width={CANVAS_W} height={CANVAS_H}>
              {localConns.map((c, i) => {
                const path = buildConnectionPath(localNodes, c);
                if (!path) return null;
                const fromNode = localNodes.find(n => n.id === c.from_node);
                const cat = fromNode ? CAT[fromNode.category as Category] : CAT.input;
                const isHighlighted = hasSelection && depPath.has(c.from_node) && depPath.has(c.to_node);
                const dimmed = hasSelection && !isHighlighted;
                return (
                  <path
                    key={i}
                    d={path}
                    stroke={isHighlighted ? cat.wireColor : dimmed ? '#1e293b' : cat.wireColor}
                    strokeWidth={isHighlighted ? 2.5 : 1.5}
                    fill="none"
                    opacity={isHighlighted ? 1.0 : dimmed ? 0.15 : 0.55}
                  />
                );
              })}

              {/* Port dots */}
              {localNodes.map(node => {
                const cat = CAT[node.category as Category] ?? CAT.input;
                const isInput = node.category === 'input';
                const isOutput = node.category === 'output';
                const dimmed = hasSelection && !depPath.has(node.id);
                return (
                  <g key={node.id} opacity={dimmed ? 0.25 : 1}>
                    {!isOutput && <circle cx={node.x + node.w} cy={portY(node)} r="4" fill="#0d1424" stroke={cat.portColor} strokeWidth="1.5" />}
                    {!isInput  && <circle cx={node.x}          cy={portY(node)} r="4" fill="#0d1424" stroke={cat.portColor} strokeWidth="1.5" />}
                  </g>
                );
              })}
            </svg>

            {/* Empty state */}
            {!loading && localNodes.length === 0 && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 pointer-events-none">
                <div className="w-14 h-14 rounded-2xl bg-cadsurface-800/80 border border-cadsurface-700 flex items-center justify-center">
                  <Sparkles size={24} className="text-slate-600" />
                </div>
                <p className="text-sm font-medium text-slate-500">No node graph yet</p>
                <p className="text-xs text-slate-600 text-center max-w-xs leading-relaxed">
                  Generate a fixture via the AI chat to see the parametric node graph
                </p>
              </div>
            )}

            {/* Node cards */}
            {localNodes.map(node => (
              <div
                key={node.id}
                style={{ opacity: hasSelection && !depPath.has(node.id) && selected !== node.id ? 0.4 : 1, transition: 'opacity 0.15s' }}
              >
                <NodeCard
                  node={node}
                  selected={selected === node.id}
                  inDepPath={depPath.has(node.id) && selected !== node.id}
                  projectId={projectId}
                  onParamUpdated={handleParamUpdated}
                  onDragStart={handleNodeDragStart}
                />
              </div>
            ))}
          </div>
        </div>

        {/* Right detail panel */}
        <div className="w-56 shrink-0 border-l border-cadsurface-700 flex flex-col bg-cadsurface-900 overflow-y-auto">
          <div className="px-4 py-3 border-b border-cadsurface-700">
            <p className="text-xs font-bold text-slate-300">Node Inspector</p>
            <p className="text-xs text-slate-600 mt-0.5">{selectedNode ? selectedNode.label : 'Click a node to inspect'}</p>
          </div>
          {selectedNode ? (
            <div className="p-4 space-y-4">
              <div className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-lg border text-xs ${
                { input: 'bg-slate-800 border-slate-700 text-slate-400',
                  foundation: 'bg-cadblue-950/40 border-cadblue-700/40 text-cadblue-300',
                  geometry: 'bg-emerald-950/40 border-emerald-700/40 text-emerald-300',
                  print: 'bg-amber-950/40 border-amber-700/40 text-amber-300',
                  output: 'bg-purple-950/40 border-purple-700/40 text-purple-300',
                }[selectedNode.category] ?? 'bg-slate-800 border-slate-700 text-slate-400'
              }`}>
                {CATEGORY_ICONS[selectedNode.category]}
                <span className="font-medium">{CAT[selectedNode.category as Category]?.badge ?? 'NODE'}</span>
              </div>
              {selectedNode.ai_generated && (
                <div className="flex items-start gap-2 bg-violet-950/30 border border-violet-700/30 rounded-lg p-2">
                  <Sparkles size={11} className="text-violet-400 mt-0.5 shrink-0" />
                  <p className="text-xs text-violet-300 leading-relaxed">Generated by AI from template + touchpoints</p>
                </div>
              )}

              {/* Dependency path info */}
              {depPath.size > 1 && (
                <div className="flex items-start gap-2 bg-emerald-950/20 border border-emerald-700/25 rounded-lg p-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 mt-1 shrink-0" />
                  <p className="text-xs text-emerald-300 leading-relaxed">
                    Downstream: {depPath.size - 1} node{depPath.size !== 2 ? 's' : ''} highlighted
                  </p>
                </div>
              )}

              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Parameters</p>
                <div className="space-y-2">
                  {selectedNode.params.map(p => (
                    <div key={p.name} className="bg-cadsurface-800 rounded-lg px-3 py-2">
                      <p className="text-xs text-slate-600">{p.name}</p>
                      <p className="text-sm font-mono mt-0.5 text-slate-200">{String(p.value)}{p.unit ? ` ${p.unit}` : ''}</p>
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex items-start gap-1.5">
                <Info size={11} className="text-slate-600 mt-0.5 shrink-0" />
                <p className="text-xs text-slate-600 leading-relaxed">Drag header to move · hover param to edit</p>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <p className="text-xs text-slate-700 text-center px-4">Select a node to inspect and edit its parameters</p>
            </div>
          )}
        </div>
      </div>}

      {/* Status bar */}
      <div className="flex items-center gap-3 px-4 py-1.5 border-t border-cadsurface-700 shrink-0 bg-cadsurface-900/60">
        <div className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
          <span className="text-xs text-slate-500">Graph valid</span>
        </div>
        <span className="text-slate-700">·</span>
        <span className="text-xs text-slate-600">{projectId ? `Project ${projectId.slice(0, 8)}` : 'No project'}</span>
        <span className="text-slate-700">·</span>
        <span className="text-xs text-slate-600">Drag node header to reposition · scroll to pan</span>
        <div className="flex-1" />
        <span className="text-xs text-slate-700 font-mono">
          {graph?.generated_at ? new Date(graph.generated_at).toLocaleTimeString() : 'Last generated: just now'}
        </span>
      </div>
    </div>
  );
}
