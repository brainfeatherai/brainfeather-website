import assert from 'node:assert/strict';
import test from 'node:test';
import { baselinePasses, runRepoMemBench } from './repomembench.ts';

test('freezes the Brainfeather 1.5.2 coding-memory baseline', () => {
  const report = runRepoMemBench({ iterations: 5 });
  assert.equal(report.benchmark, '0.1.0');
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
});

test('records branch isolation as the next capability gap', () => {
  const report = runRepoMemBench({ iterations: 1 });
  assert.equal(report.capabilityGaps.branchIsolation.supported, false);
  assert.equal(report.capabilityGaps.branchIsolation.rankingAccuracy, 0.5);
  assert.equal(report.capabilityGaps.branchIsolation.rankingTarget, '100%');
  assert.equal(report.capabilityGaps.branchIsolation.measuredLeakageRate, 1);
  assert.equal(report.capabilityGaps.branchIsolation.target, '0%');
});
