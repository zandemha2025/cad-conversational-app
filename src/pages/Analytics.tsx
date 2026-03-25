import { useState, useEffect } from 'react';
import { BarChart3, TrendingUp, Clock, AlertTriangle, ChevronLeft, Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { fetchValidationTrends, fetchDfmFrequency, fetchReleaseVelocity } from '../lib/api';

interface TrendPoint { date: string; errors: number; warnings: number; }
interface DfmFreq { rule: string; count: number; process: string; }
interface VelocityItem { category: string; avg_days: number; projects: number; }

function MiniLineChart({ data }: { data: TrendPoint[] }) {
  if (data.length < 2) return <div className="h-20 flex items-center justify-center text-xs text-slate-600">No trend data yet</div>;
  const maxErr = Math.max(...data.map((d) => d.errors), 1);
  const maxWarn = Math.max(...data.map((d) => d.warnings), 1);
  const w = 360, h = 80;
  const step = w / (data.length - 1);

  const errPts = data.map((d, i) => `${i * step},${h - (d.errors / maxErr) * (h - 8)}`).join(' ');
  const warnPts = data.map((d, i) => `${i * step},${h - (d.warnings / maxWarn) * (h - 8)}`).join(' ');

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-20">
      <polyline points={warnPts} fill="none" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <polyline points={errPts} fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      {data.map((d, i) => (
        <g key={i}>
          <circle cx={i * step} cy={h - (d.errors / maxErr) * (h - 8)} r="3" fill="#ef4444" />
          <circle cx={i * step} cy={h - (d.warnings / maxWarn) * (h - 8)} r="3" fill="#f59e0b" />
        </g>
      ))}
    </svg>
  );
}

function HorizBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = Math.round((value / max) * 100);
  return (
    <div className="flex-1 h-2 bg-cadsurface-800 rounded-full overflow-hidden">
      <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

export default function Analytics() {
  const navigate = useNavigate();
  const [trends, setTrends] = useState<TrendPoint[]>([]);
  const [dfm, setDfm] = useState<DfmFreq[]>([]);
  const [velocity, setVelocity] = useState<VelocityItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetchValidationTrends(),
      fetchDfmFrequency(),
      fetchReleaseVelocity(),
    ]).then(([trendData, dfmData, velocityData]) => {
      if (trendData && trendData.length > 0) {
        setTrends(trendData.map((t) => ({
          date: t.date as string,
          errors: (t as unknown as { error_count: number }).error_count ?? 0,
          warnings: (t as unknown as { warning_count: number }).warning_count ?? 0,
        })));
      }
      if (dfmData && dfmData.length > 0) {
        setDfm(dfmData.map((d) => ({
          rule: d.rule,
          count: d.count,
          process: d.severity ?? 'General',
        })));
      }
      if (velocityData && velocityData.length > 0) {
        setVelocity(velocityData.map((v) => ({
          category: v.category,
          avg_days: v.avg_days,
          projects: v.count,
        })));
      }
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const totalProjects = velocity.reduce((s, v) => s + v.projects, 0);
  const avgVelocity = totalProjects > 0
    ? velocity.reduce((s, v) => s + v.avg_days * v.projects, 0) / totalProjects
    : 0;
  const latestErrors = trends[trends.length - 1]?.errors ?? 0;
  const latestWarnings = trends[trends.length - 1]?.warnings ?? 0;
  const maxDfm = Math.max(...dfm.map((d) => d.count), 1);

  return (
    <div className="min-h-screen bg-cadsurface-950 text-slate-200">
      <div className="max-w-6xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <button onClick={() => navigate(-1)} className="p-1.5 rounded-lg text-slate-500 hover:text-slate-200 hover:bg-cadsurface-800 transition-colors">
            <ChevronLeft size={18} />
          </button>
          <div className="flex items-center gap-3">
            <BarChart3 size={24} className="text-cadblue-400" />
            <div>
              <h1 className="text-xl font-bold">Analytics</h1>
              <p className="text-sm text-slate-500">Design quality metrics and release velocity</p>
            </div>
          </div>
          {loading && <Loader2 size={14} className="animate-spin text-slate-500 ml-auto" />}
        </div>

        {/* KPI row */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          {[
            { label: 'Open Errors', value: latestErrors, color: latestErrors === 0 ? 'text-emerald-400' : 'text-red-400', sub: 'today' },
            { label: 'Open Warnings', value: latestWarnings, color: latestWarnings === 0 ? 'text-emerald-400' : 'text-amber-400', sub: 'today' },
            { label: 'Avg Time-to-Release', value: avgVelocity > 0 ? `${avgVelocity.toFixed(1)}d` : '—', color: 'text-cadblue-400', sub: 'all categories' },
            { label: 'Total Projects', value: totalProjects > 0 ? totalProjects : '—', color: 'text-slate-200', sub: 'last 30 days' },
          ].map((kpi) => (
            <div key={kpi.label} className="bg-cadsurface-900 border border-cadsurface-700 rounded-xl p-4">
              <p className="text-xs text-slate-500 mb-1">{kpi.label}</p>
              <p className={`text-2xl font-bold ${kpi.color}`}>{kpi.value}</p>
              <p className="text-xs text-slate-600 mt-0.5">{kpi.sub}</p>
            </div>
          ))}
        </div>

        {/* Charts row */}
        <div className="grid grid-cols-2 gap-6 mb-6">
          {/* Validation trend */}
          <div className="bg-cadsurface-900 border border-cadsurface-700 rounded-xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <TrendingUp size={14} className="text-cadblue-400" />
              <h2 className="text-sm font-semibold text-slate-200">Validation Score Trend</h2>
              <span className="ml-auto text-xs text-slate-500">Last 7 days</span>
            </div>
            <MiniLineChart data={trends} />
            {trends.length >= 2 && (
              <div className="flex items-center gap-4 mt-3">
                <span className="flex items-center gap-1.5 text-xs text-red-400">
                  <div className="w-3 h-0.5 bg-red-500 rounded" /> Errors
                </span>
                <span className="flex items-center gap-1.5 text-xs text-amber-400">
                  <div className="w-3 h-0.5 bg-amber-500 rounded" /> Warnings
                </span>
              </div>
            )}
            <div className="mt-3 grid grid-cols-7 gap-0">
              {trends.map((t) => (
                <div key={t.date} className="text-center">
                  <p className="text-xs text-slate-700" style={{ fontSize: '9px' }}>
                    {new Date(t.date).toLocaleDateString('en', { weekday: 'short' }).slice(0, 2)}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Release velocity */}
          <div className="bg-cadsurface-900 border border-cadsurface-700 rounded-xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <Clock size={14} className="text-emerald-400" />
              <h2 className="text-sm font-semibold text-slate-200">Release Velocity by Category</h2>
            </div>
            {velocity.length === 0 ? (
              <p className="text-xs text-slate-600 py-4 text-center">No release data yet</p>
            ) : (
              <div className="space-y-3">
                {velocity.map((v) => (
                  <div key={v.category} className="flex items-center gap-3">
                    <span className="text-xs text-slate-400 w-28 shrink-0">{v.category}</span>
                    <HorizBar
                      value={v.avg_days}
                      max={Math.max(...velocity.map((x) => x.avg_days))}
                      color={v.avg_days < 3 ? 'bg-emerald-600' : v.avg_days < 5 ? 'bg-amber-600' : 'bg-red-600'}
                    />
                    <span className="text-xs text-slate-400 w-12 text-right font-mono">{v.avg_days}d</span>
                    <span className="text-xs text-slate-600 w-10 text-right">{v.projects}</span>
                  </div>
                ))}
              </div>
            )}
            <p className="text-xs text-slate-700 mt-3">Days from creation to released revision</p>
          </div>
        </div>

        {/* DFM frequency */}
        <div className="bg-cadsurface-900 border border-cadsurface-700 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle size={14} className="text-amber-400" />
            <h2 className="text-sm font-semibold text-slate-200">Most Common DFM Warnings</h2>
            <span className="ml-auto text-xs text-slate-500">All projects · last 30 days</span>
          </div>
          {dfm.length === 0 ? (
            <p className="text-xs text-slate-600 py-4 text-center">No DFM data yet — run validation on your projects</p>
          ) : (
            <div className="space-y-3">
              {dfm.map((d, i) => (
                <div key={i} className="flex items-center gap-3">
                  <span className="text-xs text-slate-600 w-5 text-right font-mono">{i + 1}</span>
                  <span className="text-xs text-slate-300 flex-1">{d.rule}</span>
                  <span className="text-xs text-slate-600 px-1.5 py-0.5 rounded bg-cadsurface-800 font-mono">{d.process}</span>
                  <HorizBar value={d.count} max={maxDfm} color="bg-amber-600" />
                  <span className="text-xs text-amber-400 font-mono w-8 text-right">{d.count}×</span>
                </div>
              ))}
            </div>
          )}
          {dfm.length >= 2 && (
            <p className="text-xs text-slate-700 mt-4">
              Address "{dfm[0].rule}" and "{dfm[1].rule}" first — they account for {Math.round((dfm[0].count + dfm[1].count) / dfm.reduce((s, d) => s + d.count, 0) * 100)}% of all DFM issues.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
