import assert from 'node:assert/strict';
import test from 'node:test';
import { baselinePasses, runRepoMemBench } from './repomembench.ts';

test('preserves the Brainfeather 1.5.2 baseline in RepoMemBench v0.4', () => {
  const report = runRepoMemBench({ iterations: 5 });
  assert.equal(report.benchmark, '0.4.0');
  assert.equal(report.retrieval.abstentionAccuracy, 1);
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

/* Floors, not pins: an improvement passes, a regression below the
   recorded floor fails. */
test('enforces generalization floors without pinning them', () => {
  const report = runRepoMemBench({ iterations: 1 });
  const improved = structuredClone(report);
  improved.generalization.holdout.hitAtThree = 1;
  assert.equal(baselinePasses(improved), true);
  const regressed = structuredClone(report);
  regressed.generalization.holdout.hitAtThree = 0.7;
  assert.equal(baselinePasses(regressed), false);
  /* A declined relevant query is a miss; it can never exceed the misses. */
  for (const split of [report.generalization.dev, report.generalization.holdout]) {
    assert.ok(split.falseAbstentionRate <= 1 - split.hitAtThree + 1e-9);
  }
  const abstentionRegressed = structuredClone(report);
  abstentionRegressed.generalization.dev.abstentionAccuracy = 0.5;
  assert.equal(baselinePasses(abstentionRegressed), false);
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
