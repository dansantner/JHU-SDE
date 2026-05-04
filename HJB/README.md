# HJB — Hamilton-Jacobi-Bellman Optimal Portfolio Allocation

JHU Stochastic Differential Equations — Final Project  
Dan Santner

---

## Overview

Solves the stochastic optimal control problem for wealth accumulation using backward induction on a discretized Hamilton-Jacobi-Bellman (HJB) equation. Given a starting wealth, a target wealth, and an investment horizon, the engine finds the probability-maximizing equity allocation at every wealth level and time step. A second engine extends the model with Poisson jump diffusion to price the probability cost of rare but severe wealth shocks (divorce, health crisis).

---

## Key Files

| File | Purpose |
|------|---------|
| `engine.js` | Core HJB solver. Builds a dense transition probability matrix (TPM) over log-spaced wealth buckets and runs backward induction to produce `V[t][i]` (probability of success) and `Policy[t][i]` (optimal equity allocation). Exports `solveProbabilityOfSuccess`. |
| `jumpengine.js` | Extended solver with Poisson jump events. Each jump is defined by a frequency (years between events) and an asset depletion percentage. The TPM probability mass is split between normal diffusion and jump-displaced landing buckets. Exports the same interface as `engine.js`. |
| `index.html` | Interactive dashboard for `engine.js`. Built with React + Chart.js via Vite, deployed as a single self-contained HTML file to GitHub Pages. Shows P(success) by wealth, optimal equity allocation, and P(success) vs. time elapsed. |
| `jump-viz.html` | Interactive dashboard for `jumpengine.js`. Overlays baseline vs. jump-adjusted curves on all three charts and shows a jump-cost metric card. |
| `test.js` | Node.js script that runs both baseline and jump scenarios, prints results to stdout, and writes `chart_data.json` for offline analysis. |

---

## How It Works

1. **Log-spaced wealth grid** — N buckets spanning `[0, targetWealth]` on a log scale give fine resolution near the goal and coarse resolution far from it.
2. **Transition Probability Matrix** — For each allocation and source bucket, the engine computes where wealth lands after one monthly time step using the lognormal return distribution (via `jStat.normal.cdf`). Jump events redistribute probability mass from the landed bucket to a depleted bucket proportionally to the monthly jump probability.
3. **Backward induction** — Terminal condition: `V[T][i] = 1` if `centers[i] >= targetWealth`, else `0`. The Bellman equation sweeps backward from `T` to `0`, choosing the allocation that maximizes expected `V[t+1]`.
4. **Read-out** — `V[0][startBucket]` is the probability of reaching the target. `Policy[0][startBucket]` is the optimal initial equity allocation.

---

## Deployment

The dashboards are static single-file HTML pages hosted on **GitHub Pages** from the `main` branch root.

**Build and deploy:**

```bash
cd HJB
npm install

# Build both dashboards
npm run build:all

# Commit and push — GitHub Pages serves index.html and jump-viz.html automatically
git add index.html jump-viz.html
git commit -m "Rebuild dashboards"
git push
```

**Build individually:**

```bash
npm run build        # rebuilds index.html (engine.js dashboard)
npm run build:jump   # rebuilds jump-viz.html (jumpengine.js dashboard)
```

**Run test.js locally:**

```bash
node test.js         # prints results and writes chart_data.json
```

**CI** — A GitHub Actions workflow (`.github/workflows/run-test.yml`) runs `test.js` on `ubuntu-latest` on every push to `HJB/jumpengine.js` or `HJB/test.js`, and uploads `chart_data.json` as an artifact.

---

## Parameters

| Parameter | Default | Description |
|-----------|---------|-------------|
| `currentWealth` | — | Starting portfolio value ($) |
| `targetWealth` | — | Goal wealth ($) |
| `months` | 240 | Investment horizon |
| `n` | 1000 | Number of wealth buckets |
| `mu` | 0.08 | Annual expected return |
| `sigma` | 0.15 | Annual volatility |
| `allocations` | 10 | Discrete equity allocation steps (0%–100%) |
| `jumps` | `[]` | Array of `{ name, loss, freqYears }` for jump events |
