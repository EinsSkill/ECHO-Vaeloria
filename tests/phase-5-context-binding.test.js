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
  "var ECHO_CONTEXT_BINDING_VERSION = '1.0.0';",
  'function echoContextBindingContract_',
  'function echoGetContextBindingContract',
  'function echoPhase5ContextBinding_',
  'function echoPhase5AssertContextBinding_',
  "action === 'context-binding-contract'",
  "case 'context-binding-contract':",
  'submittedContextFingerprint',
  'context_fingerprint: event.context_fingerprint ||',
  "stale_policy: 'REJECT_BEFORE_COMMIT'",
  "context_version: 'phase-4'"
]) {
  assert(code.includes(required), 'missing Phase 5 contract: ' + required);
}

const commitStart = code.indexOf('function echoPhase2CommitPlan_');
const commitEnd = code.indexOf('\nfunction ', commitStart + 10);
const commitSource = code.slice(commitStart, commitEnd);
assert(
  commitSource.indexOf('echoPhase5AssertContextBinding_') <
    commitSource.indexOf('echoPhase2StartTransaction_'),
  'stale context must be rejected before the transaction is created'
);

const correctionStart = code.indexOf('function commitSceneCorrectionCore_');
const correctionEnd = code.indexOf('\nfunction ', correctionStart + 10);
const correctionSource = code.slice(correctionStart, correctionEnd);
assert(
  correctionSource.indexOf('echoPhase5AssertContextBinding_') <
    correctionSource.indexOf('findRow_'),
  'correction context must be checked before reading or writing correction state'
);

for (const forbidden of [
  'SCENE-20260826-2356-A11C',
  'SCENE-CORRECTION-20260827-0020-F4D8',
  'fullThreeTruthsSceneText_'
]) {
  assert(!code.includes(forbidden), 'private or historical content leaked: ' + forbidden);
}

const helpers = new Function(
  code + '\nreturn { echoContextBindingContract_, echoGetContextBindingContract, echoPhase5ContextBinding_, echoPhase5AssertContextBinding_ };'
)();

const matched = helpers.echoPhase5ContextBinding_('ABC', 'ABC');
assert.strictEqual(matched.status, 'MATCHED');
assert.strictEqual(matched.accepted, true);
assert.strictEqual(matched.supplied, true);

const legacy = helpers.echoPhase5ContextBinding_('', 'ABC');
assert.strictEqual(legacy.status, 'NOT_PROVIDED');
assert.strictEqual(legacy.accepted, true);
assert.strictEqual(legacy.supplied, false);

const stale = helpers.echoPhase5ContextBinding_('ABC', 'DEF');
assert.strictEqual(stale.status, 'STALE');
assert.strictEqual(stale.accepted, false);

const unavailable = helpers.echoPhase5ContextBinding_('ABC', '');
assert.strictEqual(unavailable.status, 'UNAVAILABLE');
assert.strictEqual(unavailable.accepted, false);

const asserted = helpers.echoPhase5AssertContextBinding_(
  {},
  { submittedContextFingerprint: 'ABC' },
  { fingerprint: 'ABC' }
);
assert.strictEqual(asserted.binding.status, 'MATCHED');

assert.throws(
  () => helpers.echoPhase5AssertContextBinding_(
    {},
    { submittedContextFingerprint: 'ABC' },
    { fingerprint: 'DEF' }
  ),
  /STALE/
);

const contract = helpers.echoContextBindingContract_();
assert.strictEqual(contract.version, '1.0.0');
assert.strictEqual(contract.stale_policy, 'REJECT_BEFORE_COMMIT');
assert.deepStrictEqual(
  helpers.echoGetContextBindingContract(),
  { ok: true, contract }
);

console.log('Phase 5 context binding checks passed.');
