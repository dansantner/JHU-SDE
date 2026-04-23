import { useState, useCallback, useRef, useEffect } from 'react';
import { Chart, registerables } from 'chart.js';
import engine from '../engine.js';
const { solveProbabilityOfSuccess } = engine;

Chart.register(...registerables);

// Use N=150 buckets for browser performance; full fidelity retained via log-spacing
const N_BUCKETS   = 150;
const ALLOC_STEPS = 10;

const fmt$ = v => '$' + Math.round(v).toLocaleString();
const fmtPct = (v, d = 1) => (v * 100).toFixed(d) + '%';

// ─── Shared chart helpers ────────────────────────────────────────────────────

const DARK_GRID  = { color: 'rgba(255,255,255,0.05)' };
const TICK_COLOR = '#475569';
const TITLE_COLOR = '#94a3b8';

function logXScale(minVal) {
  return {
    type: 'logarithmic',
    min: minVal,
    title: { display: true, text: 'Wealth', color: TITLE_COLOR, font: { size: 11 } },
    ticks: {
      color: TICK_COLOR,
      maxTicksLimit: 8,
      callback(v) {
        if (v >= 1e9) return '$' + (v / 1e9).toFixed(1) + 'B';
        if (v >= 1e6) return '$' + (v / 1e6).toFixed(v % 1e6 === 0 ? 0 : 1) + 'M';
        if (v >= 1e3) return '$' + (v / 1e3).toFixed(0) + 'K';
        return '$' + v;
      },
    },
    grid: DARK_GRID,
  };
}

function pctYScale(label) {
  return {
    min: 0,
    max: 1.05,
    title: { display: true, text: label, color: TITLE_COLOR, font: { size: 11 } },
    ticks: { color: TICK_COLOR, callback: v => fmtPct(v) },
    grid: DARK_GRID,
  };
}

function baseScatterOptions(xScale, yScale) {
  return {
    animation: false,
    responsive: true,
    maintainAspectRatio: true,
    aspectRatio: 2.6,
    plugins: { legend: { display: false } },
    scales: { x: xScale, y: yScale },
  };
}

function lineDataset(data, color, fill = true) {
  return {
    data,
    borderColor: color,
    backgroundColor: fill ? color + '20' : 'transparent',
    borderWidth: 2,
    pointRadius: 0,
    showLine: true,
    fill,
    tension: 0.2,
  };
}

function markerDataset(x, yMax = 1.05) {
  return {
    data: [{ x, y: 0 }, { x, y: yMax }],
    borderColor: '#f59e0b',
    borderWidth: 1.5,
    borderDash: [5, 4],
    pointRadius: 0,
    showLine: true,
    fill: false,
  };
}

// ─── App ─────────────────────────────────────────────────────────────────────

export default function App() {
  const [horizon,     setHorizon]     = useState(10);
  const [beginWealth, setBeginWealth] = useState(1_500_000);
  const [endWealth,   setEndWealth]   = useState(3_500_000);
  const [muScale,     setMuScale]     = useState(1.0);
  const [result,      setResult]      = useState(null);
  const [computing,   setComputing]   = useState(false);
  const [error,       setError]       = useState(null);

  const mu    = parseFloat((0.08 * muScale).toFixed(4));
  const sigma = parseFloat((0.15 * muScale).toFixed(4));

  const c1Ref  = useRef(null); const c1Inst = useRef(null);
  const c2Ref  = useRef(null); const c2Inst = useRef(null);
  const c3Ref  = useRef(null); const c3Inst = useRef(null);

  const handleCompute = useCallback(() => {
    if (beginWealth <= 0 || endWealth <= beginWealth || horizon <= 0) {
      setError('Target wealth must exceed starting wealth, and horizon must be positive.');
      return;
    }
    setError(null);
    setComputing(true);
    setResult(null);
    setTimeout(() => {
      try {
        const res = solveProbabilityOfSuccess(
          beginWealth,
          endWealth,
          Math.round(horizon * 12),
          N_BUCKETS,
          mu,
          sigma,
          ALLOC_STEPS,
        );
        setResult(res);
      } catch (e) {
        setError(e.message);
      }
      setComputing(false);
    }, 10);
  }, [beginWealth, endWealth, horizon, mu, sigma]);

  // Build / rebuild charts whenever result changes
  useEffect(() => {
    if (!result) return;

    const { metrics, grids } = result;
    const { centers, V, Policy } = grids;
    const { startBucketIndex, probability } = metrics;
    const months = Math.round(horizon * 12);

    // Sensible log x-axis lower bound: skip the tiny near-zero buckets
    const xMin = Math.max(10_000, beginWealth / 200);

    // Chart 1 — V[0] by wealth
    const v0Pts = centers.slice(1).map((c, i) => ({ x: c, y: V[0][i + 1] }));
    buildChart(c1Ref, c1Inst, 'scatter', {
      datasets: [
        lineDataset(v0Pts, '#38bdf8'),
        markerDataset(beginWealth),
      ],
    }, {
      ...baseScatterOptions(logXScale(xMin), pctYScale('P(Success)')),
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: { label: ctx => `${fmt$(ctx.parsed.x)}  →  ${fmtPct(ctx.parsed.y, 2)}` },
        },
      },
    });

    // Chart 2 — Policy[0] by wealth (normalized to 0–1 equity fraction)
    const pol0Pts = centers.slice(1).map((c, i) => ({
      x: c,
      y: Policy[0][i + 1] / ALLOC_STEPS,
    }));
    buildChart(c2Ref, c2Inst, 'scatter', {
      datasets: [
        lineDataset(pol0Pts, '#4ade80'),
        markerDataset(beginWealth),
      ],
    }, {
      ...baseScatterOptions(logXScale(xMin), pctYScale('Equity Allocation')),
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: { label: ctx => `${fmt$(ctx.parsed.x)}  →  ${fmtPct(ctx.parsed.y)} equity` },
        },
      },
    });

    // Chart 3 — P(success) vs elapsed time at starting bucket
    const timePts = Array.from({ length: months + 1 }, (_, t) => ({
      x: parseFloat((t / 12).toFixed(4)),
      y: V[t][startBucketIndex],
    }));
    buildChart(c3Ref, c3Inst, 'scatter', {
      datasets: [lineDataset(timePts, '#a78bfa')],
    }, {
      animation: false,
      responsive: true,
      maintainAspectRatio: true,
      aspectRatio: 2.6,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => `${ctx.parsed.x.toFixed(1)} yr  →  ${fmtPct(ctx.parsed.y, 2)}`,
          },
        },
      },
      scales: {
        x: {
          title: { display: true, text: 'Time Elapsed (years)', color: TITLE_COLOR, font: { size: 11 } },
          ticks: { color: TICK_COLOR },
          grid: DARK_GRID,
        },
        y: pctYScale('P(Success)'),
      },
    });

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result]);

  // Destroy all chart instances on unmount
  useEffect(() => () => {
    [c1Inst, c2Inst, c3Inst].forEach(r => r.current?.destroy());
  }, []);

  const p = result?.metrics.probability ?? 0;
  const { valColor, borderColor: pBorder } = result
    ? p > 0.8
      ? { valColor: 'text-emerald-400', borderColor: 'border-emerald-500/25' }
      : p > 0.5
      ? { valColor: 'text-amber-400',   borderColor: 'border-amber-500/25' }
      : { valColor: 'text-red-400',     borderColor: 'border-red-500/25' }
    : { valColor: 'text-sky-400',       borderColor: 'border-sky-500/25' };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200">
      <div className="max-w-6xl mx-auto px-5 py-8">

        {/* Header */}
        <header className="mb-8">
          <h1 className="text-2xl font-bold text-slate-100 tracking-tight">
            HJB Probability of Success
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Hamilton–Jacobi–Bellman dynamic programming · Optimal equity allocation for a wealth target
          </p>
        </header>

        <div className="grid gap-6" style={{ gridTemplateColumns: '260px 1fr' }}>

          {/* ── Left: Controls ───────────────────────────────────────────── */}
          <aside className="bg-slate-900 border border-slate-800 rounded-xl p-5 self-start">
            <p className="text-[11px] text-slate-500 font-semibold uppercase tracking-widest mb-5">
              Parameters
            </p>

            <Field label="Horizon">
              <div className="flex gap-2 items-center">
                <NumberInput
                  value={horizon} min={1} max={50}
                  onChange={setHorizon}
                  className="w-20"
                />
                <span className="text-slate-500 text-xs">yr → {Math.round(horizon * 12)} mo</span>
              </div>
            </Field>

            <Field label="Starting Wealth">
              <NumberInput value={beginWealth} min={1} onChange={setBeginWealth} />
              <p className="text-[11px] text-slate-500 mt-1">{fmt$(beginWealth)}</p>
            </Field>

            <Field label="Target Wealth">
              <NumberInput value={endWealth} min={1} onChange={setEndWealth} />
              <p className="text-[11px] text-slate-500 mt-1">{fmt$(endWealth)}</p>
            </Field>

            <Field label="Return Assumptions">
              <div className="flex justify-between text-xs mb-2.5">
                <span className="text-sky-400 font-mono">μ = {fmtPct(mu)}</span>
                <span className="text-orange-400 font-mono">σ = {fmtPct(sigma)}</span>
              </div>
              <input
                type="range" min="0.25" max="2.0" step="0.05"
                value={muScale}
                onChange={e => setMuScale(parseFloat(e.target.value))}
                className="w-full"
              />
              <div className="flex justify-between mt-2 text-[10px] text-slate-600">
                <span>2% / 3.8%</span>
                <span className="text-slate-500">8% / 15% ●</span>
                <span>16% / 30%</span>
              </div>
            </Field>

            <button
              onClick={handleCompute}
              disabled={computing}
              className={`w-full mt-2 py-2.5 rounded-lg text-sm font-semibold border transition-colors
                ${computing
                  ? 'bg-sky-500/10 border-sky-500/20 text-sky-400/60 cursor-wait'
                  : 'bg-sky-500/15 border-sky-500/30 text-sky-400 hover:bg-sky-500/25 cursor-pointer'
                }`}
            >
              {computing ? 'Computing…' : 'Compute'}
            </button>

            {error && (
              <div className="mt-3 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2.5">
                {error}
              </div>
            )}
          </aside>

          {/* ── Right: Results ────────────────────────────────────────────── */}
          <main>
            {!result && !computing && (
              <div className="flex items-center justify-center h-72 text-slate-600 text-sm">
                Set parameters and press Compute
              </div>
            )}

            {computing && (
              <div className="flex items-center justify-center h-72 text-sky-400 text-sm">
                Running backward induction…
              </div>
            )}

            {result && (
              <>
                {/* Metrics strip */}
                <div className="grid grid-cols-2 gap-3 mb-5">
                  <MetricCard
                    label="Probability of Success"
                    value={fmtPct(result.metrics.probability, 2)}
                    valueClass={valColor}
                    borderClass={pBorder}
                    sub={`${fmt$(beginWealth)} → ${fmt$(endWealth)}  ·  ${horizon} yr`}
                  />
                  <MetricCard
                    label="Optimal Initial Equity Allocation"
                    value={fmtPct(result.metrics.initialAllocation)}
                    valueClass="text-violet-400"
                    borderClass="border-violet-500/25"
                    sub={`μ = ${fmtPct(mu)}  ·  σ = ${fmtPct(sigma)}`}
                  />
                </div>

                {/* Chart 1 */}
                <ChartCard title="Success Probability by Starting Wealth  (t = 0)">
                  <canvas ref={c1Ref} />
                </ChartCard>

                {/* Chart 2 */}
                <ChartCard title="Optimal Equity Allocation by Starting Wealth  (t = 0)">
                  <canvas ref={c2Ref} />
                </ChartCard>

                {/* Chart 3 */}
                <ChartCard title={`P(Success) vs. Time Elapsed  ·  starting at ${fmt$(beginWealth)}`}>
                  <canvas ref={c3Ref} />
                </ChartCard>
              </>
            )}
          </main>
        </div>

        <footer className="mt-10 text-center text-xs text-slate-800">
          Dan Santner · JHU SDE · HJB Dynamic Programming
        </footer>
      </div>
    </div>
  );
}

// ─── Small helper components ──────────────────────────────────────────────────

function Field({ label, children }) {
  return (
    <div className="mb-4">
      <p className="text-xs text-slate-400 font-medium mb-1.5">{label}</p>
      {children}
    </div>
  );
}

function NumberInput({ value, min, max, onChange, className = 'w-full' }) {
  return (
    <input
      type="number"
      min={min} max={max}
      value={value}
      onChange={e => onChange(parseFloat(e.target.value))}
      className={`${className} bg-slate-800 border border-slate-700 rounded-md text-sm
        text-slate-200 px-3 py-2 focus:outline-none focus:border-sky-500`}
    />
  );
}

function MetricCard({ label, value, valueClass, borderClass, sub }) {
  return (
    <div className={`bg-slate-900 border ${borderClass} rounded-xl p-4`}>
      <p className="text-[10px] text-slate-500 uppercase tracking-widest mb-2">{label}</p>
      <p className={`text-4xl font-bold tabular-nums tracking-tight ${valueClass}`}>{value}</p>
      <p className="text-[10px] text-slate-500 mt-1.5">{sub}</p>
    </div>
  );
}

function ChartCard({ title, children }) {
  return (
    <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 mb-4">
      <p className="text-[11px] text-slate-500 font-semibold uppercase tracking-widest mb-3">{title}</p>
      {children}
    </div>
  );
}

// ─── Chart factory ────────────────────────────────────────────────────────────

function buildChart(canvasRef, instRef, type, data, options) {
  if (instRef.current) instRef.current.destroy();
  instRef.current = new Chart(canvasRef.current, { type, data, options });
}
