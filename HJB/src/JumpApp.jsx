import { useState, useCallback, useRef, useEffect } from 'react';
import { Chart, registerables } from 'chart.js';
import jumpengine from '../jumpengine.js';

Chart.register(...registerables);

const { solveProbabilityOfSuccess } = jumpengine;

// N that balances fidelity vs. browser speed (jumpengine uses dense 3-D TPM)
const N_BUCKETS   = 1000;
const ALLOC_STEPS = 10;

const fmt$ = v => '$' + Math.round(v).toLocaleString();
const fmtPct = (v, d = 1) => (v * 100).toFixed(d) + '%';

// ─── Chart helpers ─────────────────────────────────────────────────────────

const BLUE   = '#38bdf8';
const ORANGE = '#f97316';
const AMBER  = '#f59e0b';
const DGRID  = { color: 'rgba(255,255,255,0.05)' };
const TCOL   = '#475569';
const HTCOL  = '#94a3b8';

function logXAxis(minVal) {
  return {
    type: 'logarithmic',
    min: minVal,
    title: { display: true, text: 'Wealth', color: HTCOL, font: { size: 11 } },
    ticks: {
      color: TCOL,
      maxTicksLimit: 7,
      callback(v) {
        if (v >= 1e9) return '$' + (v / 1e9).toFixed(1) + 'B';
        if (v >= 1e6) return '$' + (v / 1e6).toFixed(v % 1e6 === 0 ? 0 : 1) + 'M';
        if (v >= 1e3) return '$' + (v / 1e3).toFixed(0) + 'K';
        return '$' + v;
      },
    },
    grid: DGRID,
  };
}

function pctYAxis(label) {
  return {
    min: 0, max: 1.05,
    title: { display: true, text: label, color: HTCOL, font: { size: 11 } },
    ticks: { color: TCOL, callback: v => fmtPct(v) },
    grid: DGRID,
  };
}

const BASE_OPTS = {
  animation: false,
  responsive: true,
  maintainAspectRatio: true,
  aspectRatio: 2.7,
};

function lineDs(data, color, label, fill = false) {
  return {
    label, data,
    borderColor: color,
    backgroundColor: color + '1a',
    borderWidth: 2,
    pointRadius: 0,
    showLine: true,
    fill: fill ? 'origin' : false,
    tension: 0.2,
  };
}

function markerDs(x) {
  return {
    label: '_marker',
    data: [{ x, y: 0 }, { x, y: 1.05 }],
    borderColor: AMBER,
    borderWidth: 1.5,
    borderDash: [5, 3],
    pointRadius: 0,
    showLine: true,
    fill: false,
  };
}

const LEGEND_OPTS = {
  display: true,
  labels: {
    color: HTCOL,
    font: { size: 11 },
    boxWidth: 14,
    filter: item => item.text !== '_marker',
  },
};

function tooltipWealth() {
  return {
    filter: ctx => ctx.dataset.label !== '_marker',
    callbacks: { label: ctx => `${fmt$(ctx.parsed.x)}  →  ${fmtPct(ctx.parsed.y, 2)}` },
  };
}

function buildChart(canvasRef, instRef, type, data, options) {
  if (instRef.current) instRef.current.destroy();
  instRef.current = new Chart(canvasRef.current, { type, data, options });
}

// ─── UI sub-components ─────────────────────────────────────────────────────

function Field({ label, children }) {
  return (
    <div className="mb-3.5">
      <p className="text-xs text-slate-400 font-medium mb-1.5">{label}</p>
      {children}
    </div>
  );
}

function NumberInput({ value, min, max, step, onChange, className = 'w-full' }) {
  return (
    <input
      type="number" min={min} max={max} step={step} value={value}
      onChange={e => onChange(parseFloat(e.target.value))}
      className={`${className} bg-slate-800 border border-slate-700 rounded-md text-sm
        text-slate-200 px-3 py-2 focus:outline-none focus:border-sky-500`}
    />
  );
}

function Toggle({ checked, onChange }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
        checked ? 'bg-sky-500' : 'bg-slate-700'
      }`}
    >
      <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
        checked ? 'translate-x-4' : 'translate-x-1'
      }`} />
    </button>
  );
}

function JumpSection({ title, accentColor, jump, onChange }) {
  return (
    <div className={`rounded-lg border p-3 mb-2.5 transition-colors ${
      jump.enabled
        ? 'border-slate-600 bg-slate-800/60'
        : 'border-slate-800 bg-transparent'
    }`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold" style={{ color: jump.enabled ? accentColor : '#475569' }}>
          {title}
        </span>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-slate-600">{jump.enabled ? 'on' : 'off'}</span>
          <Toggle checked={jump.enabled} onChange={v => onChange({ ...jump, enabled: v })} />
        </div>
      </div>
      {jump.enabled && (
        <div className="grid grid-cols-2 gap-2">
          <div>
            <p className="text-[10px] text-slate-600 mb-1">Every ___ years</p>
            <NumberInput
              value={jump.freqYears} min={0.5} max={200} step={0.5}
              onChange={v => onChange({ ...jump, freqYears: v })}
            />
          </div>
          <div>
            <p className="text-[10px] text-slate-600 mb-1">Asset depletion %</p>
            <NumberInput
              value={Math.round(jump.loss * 100)} min={1} max={99} step={1}
              onChange={v => onChange({ ...jump, loss: v / 100 })}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function MetricCard({ label, value, valueClass, borderClass, sub }) {
  return (
    <div className={`bg-slate-900 border ${borderClass} rounded-xl p-4`}>
      <p className="text-[10px] text-slate-500 uppercase tracking-widest mb-2">{label}</p>
      <p className={`text-4xl font-bold tabular-nums tracking-tight ${valueClass}`}>{value}</p>
      {sub && <p className="text-[10px] text-slate-500 mt-1.5">{sub}</p>}
    </div>
  );
}

function ChartCard({ title, canvasRef }) {
  return (
    <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 mb-4">
      <p className="text-[11px] text-slate-500 font-semibold uppercase tracking-widest mb-3">{title}</p>
      <canvas ref={canvasRef} />
    </div>
  );
}

// ─── Main App ───────────────────────────────────────────────────────────────

export default function JumpApp() {
  const [horizon,     setHorizon]     = useState(10);
  const [beginWealth, setBeginWealth] = useState(1_500_000);
  const [endWealth,   setEndWealth]   = useState(2_000_000);
  const [muScale,     setMuScale]     = useState(1.0);

  // Jump parameters — defaults match test.js
  const [jump1, setJump1] = useState({ enabled: true,  freqYears: 17.33, loss: 0.50 });
  const [jump2, setJump2] = useState({ enabled: true,  freqYears: 40,    loss: 0.25 });

  const [baseResult, setBaseResult] = useState(null);
  const [jumpResult, setJumpResult] = useState(null);
  const [computing,  setComputing]  = useState(false);
  const [error,      setError]      = useState(null);

  const mu    = parseFloat((0.08 * muScale).toFixed(4));
  const sigma = parseFloat((0.15 * muScale).toFixed(4));

  const c1Ref = useRef(null); const c1Inst = useRef(null);
  const c2Ref = useRef(null); const c2Inst = useRef(null);
  const c3Ref = useRef(null); const c3Inst = useRef(null);

  const handleCompute = useCallback(() => {
    if (beginWealth <= 0 || endWealth <= beginWealth || horizon <= 0) {
      setError('Target wealth must exceed starting wealth, and horizon must be positive.');
      return;
    }
    setError(null);
    setComputing(true);
    setBaseResult(null);
    setJumpResult(null);

    setTimeout(() => {
      try {
        const months      = Math.round(horizon * 12);
        const activeJumps = [
          jump1.enabled ? { name: 'divorce',  loss: jump1.loss, freqYears: jump1.freqYears } : null,
          jump2.enabled ? { name: 'medical',  loss: jump2.loss, freqYears: jump2.freqYears } : null,
        ].filter(Boolean);

        const base = solveProbabilityOfSuccess({
          label: 'Baseline',
          currentWealth: beginWealth,
          targetWealth:  endWealth,
          jumps:         [],
          months,
          n:             N_BUCKETS,
          mu,
          sigma,
          allocations:   ALLOC_STEPS,
        });

        const jump = solveProbabilityOfSuccess({
          label: 'With Jumps',
          currentWealth: beginWealth,
          targetWealth:  endWealth,
          jumps:         activeJumps,
          months,
          n:             N_BUCKETS,
          mu,
          sigma,
          allocations:   ALLOC_STEPS,
        });

        setBaseResult(base);
        setJumpResult(jump);
      } catch (e) {
        setError(e.message);
      }
      setComputing(false);
    }, 10);
  }, [beginWealth, endWealth, horizon, mu, sigma, jump1, jump2]);

  useEffect(() => {
    if (!baseResult || !jumpResult) return;

    const centers   = baseResult.grids.centers;
    const baseV0    = baseResult.grids.V[0];
    const jumpV0    = jumpResult.grids.V[0];
    const basePol0  = baseResult.grids.Policy[0];
    const jumpPol0  = jumpResult.grids.Policy[0];
    const baseSI    = baseResult.metrics.startBucketIndex;
    const jumpSI    = jumpResult.metrics.startBucketIndex;
    const baseVt    = baseResult.grids.V.map(row => row[baseSI]);
    const jumpVt    = jumpResult.grids.V.map(row => row[jumpSI]);

    // Skip bucket 0 (ruin / $0) — log axis can't render 0
    const wPts  = arr => centers.slice(1).map((c, i) => ({ x: c, y: arr[i + 1] }));
    const polPts = arr => centers.slice(1).map((c, i) => ({ x: c, y: arr[i + 1] / ALLOC_STEPS }));
    const tPts  = arr => arr.map((v, t) => ({ x: parseFloat((t / 12).toFixed(3)), y: v }));

    const xMin = Math.max(10_000, beginWealth / 200);

    // Chart 1 — P(Success) by wealth
    buildChart(c1Ref, c1Inst, 'scatter', {
      datasets: [
        lineDs(wPts(baseV0), BLUE,   'Baseline',   true),
        lineDs(wPts(jumpV0), ORANGE, 'With Jumps',  true),
        markerDs(beginWealth),
      ],
    }, {
      ...BASE_OPTS,
      plugins: { legend: LEGEND_OPTS, tooltip: tooltipWealth() },
      scales: { x: logXAxis(xMin), y: pctYAxis('P(Success)') },
    });

    // Chart 2 — Optimal equity allocation by wealth
    buildChart(c2Ref, c2Inst, 'scatter', {
      datasets: [
        lineDs(polPts(basePol0), BLUE,   'Baseline'),
        lineDs(polPts(jumpPol0), ORANGE, 'With Jumps'),
        markerDs(beginWealth),
      ],
    }, {
      ...BASE_OPTS,
      plugins: { legend: LEGEND_OPTS, tooltip: tooltipWealth() },
      scales: { x: logXAxis(xMin), y: pctYAxis('Equity Allocation') },
    });

    // Chart 3 — P(Success) vs time elapsed at starting bucket
    buildChart(c3Ref, c3Inst, 'scatter', {
      datasets: [
        lineDs(tPts(baseVt), BLUE,   'Baseline',   true),
        lineDs(tPts(jumpVt), ORANGE, 'With Jumps',  true),
      ],
    }, {
      ...BASE_OPTS,
      plugins: { legend: LEGEND_OPTS },
      scales: {
        x: {
          title: { display: true, text: 'Time Elapsed (years)', color: HTCOL, font: { size: 11 } },
          ticks: { color: TCOL },
          grid: DGRID,
        },
        y: pctYAxis('P(Success)'),
      },
    });
  }, [baseResult, jumpResult, beginWealth]);

  useEffect(() => () => [c1Inst, c2Inst, c3Inst].forEach(r => r.current?.destroy()), []);

  const pBase  = baseResult?.metrics.probability ?? 0;
  const pJump  = jumpResult?.metrics.probability ?? 0;
  const delta  = baseResult && jumpResult ? pBase - pJump : null;

  function probColor(p) {
    return p > 0.8 ? 'text-emerald-400' : p > 0.5 ? 'text-amber-400' : 'text-red-400';
  }
  function probBorder(p) {
    return p > 0.8 ? 'border-emerald-500/25' : p > 0.5 ? 'border-amber-500/25' : 'border-red-500/25';
  }

  const anyActive = jump1.enabled || jump2.enabled;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200">
      <div className="max-w-6xl mx-auto px-5 py-8">

        <header className="mb-8">
          <h1 className="text-2xl font-bold text-slate-100 tracking-tight">
            HJB — Jump-Adjusted Probability of Success
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Hamilton–Jacobi–Bellman DP with Poisson jump events · Divorce &amp; health crisis scenarios
          </p>
        </header>

        <div className="grid gap-6" style={{ gridTemplateColumns: '260px 1fr' }}>

          {/* ── Controls ─────────────────────────────────────────────── */}
          <aside className="bg-slate-900 border border-slate-800 rounded-xl p-5 self-start">

            <p className="text-[11px] text-slate-500 font-semibold uppercase tracking-widest mb-4">
              Market Parameters
            </p>

            <Field label="Horizon">
              <div className="flex gap-2 items-center">
                <NumberInput value={horizon} min={1} max={50} onChange={setHorizon} className="w-20" />
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
                type="range" min="0.25" max="2.0" step="0.05" value={muScale}
                onChange={e => setMuScale(parseFloat(e.target.value))}
                className="w-full cursor-pointer"
                style={{
                  WebkitAppearance: 'none', appearance: 'none',
                  height: 4, background: 'rgba(255,255,255,0.12)', borderRadius: 2, outline: 'none',
                }}
              />
              <div className="flex justify-between mt-2 text-[10px] text-slate-700">
                <span>2% / 3.8%</span>
                <span className="text-slate-600">8% / 15% ●</span>
                <span>16% / 30%</span>
              </div>
            </Field>

            <div className="border-t border-slate-800 my-4" />

            <p className="text-[11px] text-slate-500 font-semibold uppercase tracking-widest mb-3">
              Jump Events
            </p>

            <JumpSection
              title="Divorce"
              accentColor={ORANGE}
              jump={jump1}
              onChange={setJump1}
            />
            <JumpSection
              title="Health Crisis"
              accentColor="#a78bfa"
              jump={jump2}
              onChange={setJump2}
            />

            <button
              onClick={handleCompute}
              disabled={computing}
              className={`w-full mt-3 py-2.5 rounded-lg text-sm font-semibold border transition-colors
                ${computing
                  ? 'bg-sky-500/10 border-sky-500/20 text-sky-400/50 cursor-wait'
                  : 'bg-sky-500/15 border-sky-500/30 text-sky-400 hover:bg-sky-500/25 cursor-pointer'
                }`}
            >
              {computing ? 'Computing two scenarios…' : 'Compute'}
            </button>

            {error && (
              <div className="mt-3 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2.5">
                {error}
              </div>
            )}
          </aside>

          {/* ── Results ──────────────────────────────────────────────── */}
          <main>
            {!baseResult && !computing && (
              <div className="flex items-center justify-center h-72 text-slate-700 text-sm">
                Set parameters and press Compute
              </div>
            )}

            {computing && (
              <div className="flex items-center justify-center h-72 text-sky-400 text-sm">
                Running baseline + jump scenario backward induction…
              </div>
            )}

            {baseResult && jumpResult && (
              <>
                {/* Metrics */}
                <div className="grid grid-cols-3 gap-3 mb-5">
                  <MetricCard
                    label="Baseline P(Success)"
                    value={fmtPct(pBase, 2)}
                    valueClass={probColor(pBase)}
                    borderClass={probBorder(pBase)}
                    sub={`No jump events · ${fmt$(beginWealth)} → ${fmt$(endWealth)} / ${horizon} yr`}
                  />
                  <MetricCard
                    label={anyActive ? 'Jump-Adjusted P(Success)' : 'With Jumps (none active)'}
                    value={fmtPct(pJump, 2)}
                    valueClass={anyActive ? probColor(pJump) : 'text-slate-600'}
                    borderClass={anyActive ? probBorder(pJump) : 'border-slate-800'}
                    sub={[
                      jump1.enabled && `Divorce: ${jump1.freqYears}yr / ${Math.round(jump1.loss*100)}%`,
                      jump2.enabled && `Health: ${jump2.freqYears}yr / ${Math.round(jump2.loss*100)}%`,
                    ].filter(Boolean).join(' · ') || 'No jumps enabled'}
                  />
                  <MetricCard
                    label="Jump Cost"
                    value={delta !== null ? `−${fmtPct(delta, 2)}` : '—'}
                    valueClass={delta > 0.01 ? 'text-red-400' : delta > 0.002 ? 'text-amber-400' : 'text-emerald-400'}
                    borderClass={delta > 0.01 ? 'border-red-500/25' : 'border-slate-800'}
                    sub={delta > 0.001
                      ? 'Reduction in probability of success due to jump events'
                      : 'Negligible jump impact at these parameters'}
                  />
                </div>

                <ChartCard title="Success Probability by Starting Wealth  (t = 0)" canvasRef={c1Ref} />
                <ChartCard title="Optimal Equity Allocation by Starting Wealth  (t = 0)" canvasRef={c2Ref} />
                <ChartCard
                  title={`P(Success) vs. Time Elapsed  ·  starting at ${fmt$(beginWealth)}`}
                  canvasRef={c3Ref}
                />
              </>
            )}
          </main>
        </div>

        <footer className="mt-10 text-center text-xs text-slate-800">
          Dan Santner · JHU SDE · HJB Dynamic Programming with Jump Diffusion
        </footer>
      </div>
    </div>
  );
}
