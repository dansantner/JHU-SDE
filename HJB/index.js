const {solveProbabilityOfSuccess} = require('./engine')
const {solveProbabilityOfSuccess: solve2} = require('./jumpengine')

const JUMPS = [
    { name: 'divorce', loss: 0.5, freqYears: 17.33 },
    { name: 'medical', loss: 0.25, freqYears: 40 }
];

// solve2(1_500_000,2_000_000,JUMPS,120,1000,.08,.15,10)
v1 = solve2({label:'No Life Events',
    currentWealth:1_500_000, 
    targetWealth:2_000_000, 
    jumps:[],     
    months:120, 
    n:1000, 
    mu:.08, 
    sigma:.15})
console.log(v1.grids.Policy)
solve2({label:'With Divorce and Medical Event',
    currentWealth:1_500_000, 
    targetWealth:2_000_000, 
    jumps:JUMPS,     
    months:120, 
    n:1000, 
    mu:.08, 
    sigma:.15})





