const { jStat } = require("jstat");

// --- GLOBAL DEFAULTS ---
const MU = 0.08;              // 8% Risk-on Mean (Annual)
const SIGMA = 0.15;           // 15% Risk-on Volatility (Annual)
const N = 1000;               // 1000 Wealth Buckets
const ALLOCATIONS = 10;       // 10 steps (0.0 to 1.0)
const MONTHS = 240;           // 20 Years (20 * 12)

/**
 * Generates the Transition Probability Matrix for all allocations
 */
function generateTPM(maxWealth, n, mu_annual, sigma_annual, allocations) {
    // 0. Time-Scaling: Convert Annual Parameters to Monthly SDE Parameters
    const dt = 1 / 12;
    const mu = mu_annual * dt;
    const sigma = sigma_annual * Math.sqrt(dt);

    let centers = [0];
    let bounds = [];
    
    // 1. Generate Log-Spaced Centers
    let logMax = Math.log(maxWealth);
    for (let i = 1; i <= n; i++) {
        centers[i] = (i * logMax) / n;
    }
    centers = centers.map((v) => Math.exp(v));
    centers[0] = 0; // The Black Hole
    
    // 2. Generate Boundaries
    bounds = centers.map((v, i) => {
        if (i !== n) return v + (centers[i + 1] - v) / 2;
        else return Infinity;
    });
    bounds[-1] = -Infinity;

    // 3. Initialize the 3D Matrix: tpm[u_index][start_bucket][end_bucket]
    const u_steps = allocations + 1;
    const tpm = Array.from({ length: u_steps }, () => 
        Array.from({ length: n + 1 }, () => new Array(n + 1).fill(0))
    );

    // 4. Populate the Grids
    for (let a = 0; a < u_steps; a++) {
        const u_val = a / allocations;
        const mu_p = u_val * mu;
        const sigma_p = u_val * sigma;

        for (let i = 1; i <= n; i++) {
            for (let j = 0; j <= n; j++) {
                const lower = (bounds[j - 1] - centers[i]) / centers[i];
                const upper = (bounds[j] - centers[i]) / centers[i];

                if (sigma_p === 0) {
                    // ZERO-VARIANCE TRAP: 100% Safe Asset
                    if (mu_p > lower && mu_p <= upper) {
                        tpm[a][i][j] = 1;
                    } else {
                        tpm[a][i][j] = 0;
                    }
                } else {
                    // Standard stochastic evaluation
                    tpm[a][i][j] = jStat.normal.cdf(upper, mu_p, sigma_p) - jStat.normal.cdf(lower, mu_p, sigma_p);
                }
            }
        }

        // Lock in the absorbing state (Ruin) for this allocation
        tpm[a][0][0] = 1;
        for (let j = 1; j <= n; j++) {
            tpm[a][0][j] = 0;
        }
    }

    return { centers, bounds, tpm };
}

/**
 * Main Solver: Runs the Bellman Equation to find optimal policy and probability
 */
function solveProbabilityOfSuccess(
    currentWealth, 
    targetWealth, 
    months = MONTHS, 
    n = N, 
    mu = MU, 
    sigma = SIGMA, 
    allocations = ALLOCATIONS
) {
    console.log(`\nInitializing DP Engine...`);
    console.log(`Target: $${targetWealth.toLocaleString()} over ${months} months.`);
    
    // 1. Generate the Physics
    const { centers, bounds, tpm } = generateTPM(targetWealth, n, mu, sigma, allocations);

    // 2. Initialize the Scoreboard (V) and Playbook (Policy)
    let V = Array.from({ length: months + 1 }, () => new Array(n + 1).fill(0));
    let Policy = Array.from({ length: months + 1 }, () => new Array(n + 1).fill(0));

    // 3. Set Boundary Conditions at the Deadline (t = months)
    for (let i = 0; i <= n; i++) {
        if (centers[i] >= targetWealth) {
            V[months][i] = 1.0;
        } else {
            V[months][i] = 0.0;
        }
    }

    console.log(`Running Backward Induction...`);

    // 4. The Bellman Loop (Backward Induction)
    for (let t = months - 1; t >= 0; t--) {
        
        // The Black Hole: Always 0%
        V[t][0] = 0.0;
        Policy[t][0] = 0;

        // The Top Bucket: Already won the game
        V[t][n] = 1.0;
        Policy[t][n] = 0;

        // Evaluate every middle wealth bucket
        for (let i = 1; i < n; i++) {
            let max_prob = -1;
            let best_u = -1;

            // Test every allocation choice
            for (let a = 0; a <= allocations; a++) {
                let expected_prob = 0;

                // Sum up (Transition Probability * Future Value)
                for (let j = 0; j <= n; j++) {
                    // Only calculate if there's a non-zero probability to save CPU cycles
                    if (tpm[a][i][j] > 0) { 
                        expected_prob += tpm[a][i][j] * V[t + 1][j];
                    }
                }

                if (expected_prob > max_prob) {
                    max_prob = expected_prob;
                    best_u = a;
                }
            }

            V[t][i] = max_prob;
            Policy[t][i] = best_u;
        }
    }

    // 5. The Final Lookup
    // Find the bucket index closest to our starting currentWealth
    let start_index = 1;
    let min_diff = Infinity;
    for (let i = 1; i <= n; i++) {
        let diff = Math.abs(centers[i] - currentWealth);
        if (diff < min_diff) {
            min_diff = diff;
            start_index = i;
        }
    }

    let p_success = V[0][start_index];
    let initial_action = Policy[0][start_index] / allocations;

    console.log(`\n--- ENGINE COMPLETE ---`);
    console.log(`Starting Wealth: $${currentWealth.toLocaleString()} (Bucket ${start_index})`);
    console.log(`Probability of Success: ${(p_success * 100).toFixed(2)}%`);
    console.log(`Optimal Initial Allocation: ${initial_action * 100}% Risk-on`);

    // Return everything needed for the UI
    return { 
        metrics: {
            probability: p_success,
            initialAllocation: initial_action,
            startBucketIndex: start_index
        },
        grids: {
            V, 
            Policy, 
            centers,
            bounds
        }
    };
}

// Export the module
module.exports = {
    solveProbabilityOfSuccess,
    generateTPM,
    MU, SIGMA, N, ALLOCATIONS, MONTHS
};