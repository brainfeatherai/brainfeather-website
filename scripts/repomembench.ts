import { baselinePasses, runRepoMemBench } from '../src/lib/benchmark/repomembench.ts';

const iterations = Number(process.env.REPOMEMBENCH_ITERATIONS ?? 300);
const report = runRepoMemBench({
  iterations: Number.isInteger(iterations) && iterations > 0 ? iterations : 300,
});

console.log(JSON.stringify(report, null, 2));
if (!baselinePasses(report)) process.exitCode = 1;
