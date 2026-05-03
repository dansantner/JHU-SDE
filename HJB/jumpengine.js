const { jStat } = require("jstat");

// --- GLOBAL DEFAULTS ---
const MU = 0.08;
const SIGMA = 0.15;
const N = 1000;
const ALLOCATIONS = 10;
const MONTHS = 240;

// Example Jumps Array:
// const JUMPS = [
//     { name: 'divorce', loss: 0.5, freqYears: 17.33 },
//     { name: 'medical', loss: 0.25, freqYears: 40 }
// ];

/**
 * Helper: Finds the closest bucket index for a given wealth amount
 */
function getBucketIndex(wealth, centers, n, maxWealth) {
    if (wealth <= 0) return 0;
    if (wealth >= maxWealth) return n;
    
    // Reverse the log-spacing formula to find the index directly
    let index = Math.round((Math.log(wealth) * n) / Math.log(maxWealth));
    
    // Clamp to bounds
    if (index < 0) return 0;
    if (index > n) return n;
    return index;
}

/**
 * Generates the Transition Probability Matrix for all allocations, including jump events
 */
function generateTPM(maxWealth, n, mu_annual, sigma_annual, allocations, jumps = []) {
    const dt = 1 / 12;
    const mu = mu_annual * dt;
    const sigma = sigma_annual * Math.sqrt(dt);

    let centers = [0];
    let bounds = [];
    
    let logMax = Math.log(maxWealth);
    for (let i = 1; i <= n; i++) {
        centers[i] = (i * logMax) / n;
    }
    centers = centers.map((v) => Math.exp(v));
    centers[0] = 0; 
    
    bounds = centers.map((v, i) => {
        if (i !== n) return v + (centers[i + 1] - v) / 2;
        else return Infinity;
    });
    bounds[-1] = -Infinity;

    // Process Jump Probabilities
    let jumpEvents = jumps.map(j => {
        // Probability of this specific jump happening in a single month
        let monthlyProb = (1 / j.freqYears) * dt; 
        return {
            lossFactor: 1 - j.loss, // If loss is 0.5, we keep 0.5
            prob: monthlyProb
        };
    });
    
    let probAnyJump = jumpEvents.reduce((sum, j) => sum + j.prob, 0);
    // Safety check: if jump probability exceeds 1 (impossible for small dt, but good practice)
    if (probAnyJump >= 1) throw new Error("Jump frequency too high for time step.");
    let probNoJump = 1 - probAnyJump;

    const u_steps = allocations + 1;
    const tpm = Array.from({ length: u_steps }, () => 
        Array.from({ length: n + 1 }, () => new Array(n + 1).fill(0))
    );

    for (let a = 0; a < u_steps; a++) {
        const u_val = a / allocations;
        const mu_p = u_val * mu;
        const sigma_p = u_val * sigma;

        for (let i = 1; i <= n; i++) {
            for (let j = 0; j <= n; j++) {
                
                // 1. Calculate the baseline probability of landing in bucket j
                let p_base = 0;
                const lower = (bounds[j - 1] - centers[i]) / centers[i];
                const upper = (bounds[j] - centers[i]) / centers[i];

                if (sigma_p === 0) {
                    if (mu_p > lower && mu_p <= upper) {
                        p_base = 1;
                    }
                } else {
                    p_base = jStat.normal.cdf(upper, mu_p, sigma_p) - jStat.normal.cdf(lower, mu_p, sigma_p);
                }

                if (p_base > 0) {
                    // 2a. Distribute probability for NO JUMP
                    tpm[a][i][j] += p_base * probNoJump;

                    // 2b. Distribute probability for EACH JUMP
                    for (let jump of jumpEvents) {
                        // Calculate wealth if market moved to j, but then a jump hit
                        let jumpedWealth = centers[j] * jump.lossFactor;
                        let jumpedIndex = getBucketIndex(jumpedWealth, centers, n, maxWealth);
                        
                        tpm[a][i][jumpedIndex] += p_base * jump.prob;
                    }
                }
            }
        }

        // Lock in the absorbing state (Ruin)
        tpm[a][0][0] = 1;
        for (let j = 1; j <= n; j++) {
            tpm[a][0][j] = 0;
        }
    }

    return { centers, bounds, tpm };
}

/**
 * Main Solver: Runs the Bellman Equation
 */
function solveProbabilityOfSuccess(
    {label,
    currentWealth, 
    targetWealth, 
    jumps = [],     // Added jumps parameter
    months = MONTHS, 
    n = N, 
    mu = MU, 
    sigma = SIGMA, 
    allocations = ALLOCATIONS}
) {
    label = label || 'Wealth Analysis'
    console.log(`\nInitializing DP Engine...`);
    console.log(`Target: $${targetWealth.toLocaleString()} over ${months} months.`);
    if (jumps.length > 0) {
        console.log(`Configured Jumps: ${jumps.map(j => j.name).join(', ')}`);
    }
    
    // Pass jumps to TPM generator
    const { centers, bounds, tpm } = generateTPM(targetWealth, n, mu, sigma, allocations, jumps);

    // ... [The rest of the Bellman DP Loop remains exactly the same as your code] ...
    
    let V = Array.from({ length: months + 1 }, () => new Array(n + 1).fill(0));
    let Policy = Array.from({ length: months + 1 }, () => new Array(n + 1).fill(0));

    for (let i = 0; i <= n; i++) {
        if (centers[i] >= targetWealth) {
            V[months][i] = 1.0;
        } else {
            V[months][i] = 0.0;
        }
    }

    console.log(`Running Backward Induction...`);

    for (let t = months - 1; t >= 0; t--) {
        V[t][0] = 0.0;
        Policy[t][0] = 0;
        V[t][n] = 1.0;
        Policy[t][n] = 0;

        for (let i = 1; i < n; i++) {
            let max_prob = -1;
            let best_u = -1;

            for (let a = 0; a <= allocations; a++) {
                let expected_prob = 0;
                for (let j = 0; j <= n; j++) {
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

    let start_index = getBucketIndex(currentWealth, centers, n, targetWealth);

    let p_success = V[0][start_index];
    let initial_action = Policy[0][start_index] / allocations;

    console.log(`\n--- ENGINE COMPLETE ---`);
    console.log(label)
    console.log(`Starting Wealth: $${currentWealth.toLocaleString()} (Bucket ${start_index})`);
    console.log(`Probability of Success: ${(p_success * 100).toFixed(2)}%`);
    console.log(`Optimal Initial Allocation: ${initial_action * 100}% Risk-on`);

    return { 
        metrics: {
            probability: p_success,
            initialAllocation: initial_action,
            startBucketIndex: start_index
        },
        grids: { V, Policy, centers, bounds }
    };
}

module.exports = {
    solveProbabilityOfSuccess,
    generateTPM,
    MU, SIGMA, N, ALLOCATIONS, MONTHS
};