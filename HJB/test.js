const fs = require('fs');
const { solveProbabilityOfSuccess } = require('./jumpengine'); // Adjust filename if needed

// 1. Run Baseline
const baseline = solveProbabilityOfSuccess({
    label: 'No Jumps',
    currentWealth: 1500000,
    targetWealth: 2000000, 
    jumps: [],
    months: 120
});

// 2. Run Jump-Diffusion
const jumpRun = solveProbabilityOfSuccess({
    label: 'With Jumps',
    currentWealth: 1500000,
    targetWealth: 2000000,
    jumps: [
        { name: 'divorce', loss: 0.5, freqYears: 17.33 },
        { name: 'medical', loss: 0.25, freqYears: 40 }
    ],
    months: 120
});

// 3. Extract the exact arrays needed for graphing t=0
const plotData = {
    wealth_buckets: baseline.grids.centers,
    baseline_probability: baseline.grids.V[0],
    baseline_policy: baseline.grids.Policy[0],
    jump_probability: jumpRun.grids.V[0],
    jump_policy: jumpRun.grids.Policy[0]
};

// 4. Export to JSON
fs.writeFileSync('chart_data.json', JSON.stringify(plotData));
console.log("✅ Data successfully exported to chart_data.json");