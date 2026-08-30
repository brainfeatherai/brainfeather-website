import assert from 'node:assert/strict';
import test from 'node:test';
import { baselinePasses, runRepoMemBench } from './repomembench.ts';

test('preserves the Brainfeather 1.5.2 baseline in RepoMemBench v0.2', () => {
  const report = runRepoMemBench({ iterations: 5 });
  assert.equal(report.benchmark, '0.2.0');
  assert.equal(report.baseline, 'brainfeather-1.5.2');
  assert.equal(report.retrieval.staleRecallRate, 0);
  assert.equal(report.retrieval.crossProjectLeakageRate, 0);
  assert.equal(report.temporal.historicalAccuracy, 1);
  assert.equal(report.temporal.currentAccuracy, 1);
  assert.equal(report.context.budgetRespected, true);
  assert.equal(report.evidence.validFileEvidencePreserved, true);
  assert.equal(baselinePasses(report), true);
});

test('enforces exact protected metrics from the baseline artifact', () => {
  const report = runRepoMemBench({ iterations: 1 });
  const regressed = structuredClone(report);
  regressed.retrieval.hitAtThree = 0.99;
  assert.equal(baselinePasses(regressed), false);
  const branchLeak = structuredClone(report);
  branchLeak.capabilities.branchIsolation.measuredLeakageRate = 0.5;
  assert.equal(baselinePasses(branchLeak), false);
  const taskRankingRegression = structuredClone(report);
  taskRankingRegression.capabilities.taskIsolation.rankingAccuracy = 0.5;
  assert.equal(baselinePasses(taskRankingRegression), false);
});

test('protects branch and task isolation as supported capabilities', () => {
  const report = runRepoMemBench({ iterations: 1 });
  assert.equal(report.capabilities.branchIsolation.supported, true);
  assert.equal(report.capabilities.branchIsolation.rankingAccuracy, 1);
  assert.equal(report.capabilities.branchIsolation.measuredLeakageRate, 0);
  assert.equal(report.capabilities.taskIsolation.supported, true);
  assert.equal(report.capabilities.taskIsolation.rankingAccuracy, 1);
  assert.equal(report.capabilities.taskIsolation.measuredLeakageRate, 0);
});
