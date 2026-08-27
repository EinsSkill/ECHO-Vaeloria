'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const codePath = path.join(__dirname, '..', 'apps-script', 'Code.gs');
const code = fs.readFileSync(codePath, 'utf8');

assert.doesNotThrow(() => new Function(code), 'Code.gs must remain valid JavaScript');

const functionNames = [...code.matchAll(/^function\s+([A-Za-z0-9_]+)\s*\(/gm)].map((match) => match[1]);
const functionCounts = {};
for (const name of functionNames) functionCounts[name] = (functionCounts[name] || 0) + 1;
for (const [name, count] of Object.entries(functionCounts)) {
  assert.strictEqual(count, 1, 'duplicate global function: ' + name);
}

const declaredInternalFunctions = new Set(functionNames);
const calledInternalFunctions = new Set(
  [...code.matchAll(/\b([A-Za-z_$][A-Za-z0-9_$]*_)\s*\(/g)].map((match) => match[1])
);
for (const name of calledInternalFunctions) {
  assert(
    declaredInternalFunctions.has(name),
    'internal helper is called but not defined: ' + name
  );
}

for (const required of [
  "var ECHO_EVENT_IDENTITY_VERSION = '1.0.0';",
  "var ECHO_COMMIT_RECONCILIATION_VERSION = '1.0.0';",
  'function echoCommitReconciliationContract_',
  'function echoGetCommitReconciliationContract',
  'function echoPhase7EventForFingerprint_',
  'function echoPhase7PayloadFingerprint_',
  'function echoPhase7AssertEventIdentity_',
  'function echoPhase7ReconcileCommit_',
  'function echoPhase7AssertCommitReconciled_',
  "action === 'commit-reconciliation-contract'",
  "case 'commit-reconciliation-contract':",
  'commit_reconciliation_contract:',
  "failure_status: 'COMMIT_RECONCILIATION_FAILED'",
  'EVENT_PAYLOAD_CONFLICT'
]) {
  assert(code.includes(required), 'missing Phase 7 contract: ' + required);
}

const commitStart = code.indexOf('function echoPhase2CommitPlan_');
const commitEnd = code.indexOf('\nfunction ', commitStart + 10);
const commitSource = code.slice(commitStart, commitEnd);
assert(
  commitSource.indexOf('echoPhase7AssertEventIdentity_') <
    commitSource.indexOf('echoPhase5AssertContextBinding_'),
  'event identity must be checked before context binding'
);
assert(
  commitSource.indexOf('echoPhase5AssertContextBinding_') <
    commitSource.indexOf('echoPhase2StartTransaction_'),
  'context and identity checks must happen before transaction creation'
);
assert(
  commitSource.indexOf('echoPhase6AssertSceneReadback_') <
    commitSource.indexOf('echoPhase7AssertCommitReconciled_'),
  'scene readback must precede cross-artifact reconciliation'
);
assert(
  commitSource.indexOf('echoPhase7AssertCommitReconciled_') <
    commitSource.indexOf("status: 'COMMITTED'"),
  'normal commits must reconcile all artifacts before COMMITTED'
);

const correctionStart = code.indexOf('function commitSceneCorrectionCore_');
const correctionEnd = code.indexOf('\nfunction ', correctionStart + 10);
const correctionSource = code.slice(correctionStart, correctionEnd);
assert(
  correctionSource.indexOf('echoPhase7AssertEventIdentity_') <
    correctionSource.indexOf('echoPhase5AssertContextBinding_'),
  'correction identity must be checked before context binding'
);
assert(
  correctionSource.indexOf('echoPhase5AssertContextBinding_') <
    correctionSource.indexOf('findRow_'),
  'correction context must be checked before reading or writing correction state'
);
assert(
  correctionSource.indexOf('echoPhase6AssertSceneReadback_') <
    correctionSource.indexOf('echoPhase7AssertCommitReconciled_'),
  'correction readback must precede reconciliation'
);
assert(
  correctionSource.indexOf('echoPhase7AssertCommitReconciled_') <
    correctionSource.indexOf("status: 'COMMITTED'"),
  'corrections must reconcile all artifacts before COMMITTED'
);

for (const forbidden of [
  'SCENE-20260826-2356-A11C',
  'SCENE-CORRECTION-20260827-0020-F4D8',
  'fullThreeTruthsSceneText_'
]) {
  assert(!code.includes(forbidden), 'private or historical content leaked: ' + forbidden);
}

const helpers = new Function(
  code + '\nreturn { echoCommitReconciliationContract_, echoGetCommitReconciliationContract, echoPhase7EventForFingerprint_, echoPhase7PayloadFingerprint_, echoPhase7PayloadFingerprintCandidates_, echoPhase7PayloadMatches_, echoPhase7AssertEventIdentity_ };'
)();

const event = {
  event_id: 'EVENT-1',
  event_type: 'PLAYER_ACTION',
  player_action: 'Ich bleibe stehen.',
  context_fingerprint: 'OLD-CONTEXT',
  context_read_at: '2026-08-27T15:00:00Z',
  scene: { feed_id: 'FEED-1', title: 'Eine Szene.' }
};
const projected = helpers.echoPhase7EventForFingerprint_(event);
assert.strictEqual(projected.context_fingerprint, undefined);
assert.strictEqual(projected.context_read_at, undefined);
assert.strictEqual(projected.event_id, event.event_id);
assert.strictEqual(event.context_fingerprint, 'OLD-CONTEXT');
assert.strictEqual(event.context_read_at, '2026-08-27T15:00:00Z');

const fakeUtilities = {
  DigestAlgorithm: { SHA_256: 'SHA_256' },
  Charset: { UTF_8: 'UTF_8' },
  computeDigest: (_algorithm, serialized) => [String(serialized).length % 251],
  base64Encode: (bytes) => String(bytes[0])
};
const runtime = new Function(
  'Utilities',
  code + '\nreturn { echoPhase7PayloadFingerprint_, echoPhase7PayloadFingerprintCandidates_, echoPhase7PayloadMatches_, echoPhase7AssertEventIdentity_ };'
)(fakeUtilities);

const candidates = runtime.echoPhase7PayloadFingerprintCandidates_(event);
assert.strictEqual(candidates.length, 2);
const stableTransaction = { status: 'RECOVERY_REQUIRED', payload_fingerprint: candidates[0] };
assert.strictEqual(runtime.echoPhase7PayloadMatches_(event, stableTransaction), true);
assert.doesNotThrow(() => runtime.echoPhase7AssertEventIdentity_(event, stableTransaction));

const legacyTransaction = { status: 'APPLYING', payload_fingerprint: candidates[1] };
assert.strictEqual(runtime.echoPhase7PayloadMatches_(event, legacyTransaction), true);
assert.doesNotThrow(() => runtime.echoPhase7AssertEventIdentity_(event, legacyTransaction));

const conflictingTransaction = { status: 'APPLYING', payload_fingerprint: 'different-payload' };
assert.strictEqual(runtime.echoPhase7PayloadMatches_(event, conflictingTransaction), false);
assert.throws(
  () => runtime.echoPhase7AssertEventIdentity_(event, conflictingTransaction),
  /EVENT_PAYLOAD_CONFLICT/
);

const contract = helpers.echoCommitReconciliationContract_();
assert.strictEqual(contract.version, '1.0.0');
assert.strictEqual(contract.identity_version, '1.0.0');
assert.deepStrictEqual(
  helpers.echoGetCommitReconciliationContract(),
  { ok: true, contract }
);
assert(contract.artifacts.includes('EVENT_LOG'));
assert(contract.artifacts.includes('SCENE_FEED'));
assert(contract.artifacts.includes('SCENE_REVISIONS'));
assert(contract.artifacts.includes('STATE_SNAPSHOT'));
assert.strictEqual(contract.failure_status, 'COMMIT_RECONCILIATION_FAILED');

console.log('Phase 7 event reconciliation checks passed.');
