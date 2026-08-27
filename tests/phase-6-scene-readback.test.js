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
  "var ECHO_SCENE_READBACK_CONTRACT_VERSION = '1.0.0';",
  'function echoSceneReadbackContract_',
  'function echoGetSceneReadbackContract',
  'function echoPhase6SceneReadback_',
  'function echoPhase6AssertSceneReadback_',
  "action === 'scene-readback-contract'",
  "case 'scene-readback-contract':",
  'scene_readback_contract:',
  "failure_status: 'SCENE_READBACK_FAILED'",
  "commit_rule: 'A transaction is not reported as committed until readback succeeds.'"
]) {
  assert(code.includes(required), 'missing Phase 6 contract: ' + required);
}

const commitStart = code.indexOf('function echoPhase2CommitPlan_');
const commitEnd = code.indexOf('\nfunction ', commitStart + 10);
const commitSource = code.slice(commitStart, commitEnd);
assert(
  commitSource.indexOf('echoPhase6AssertSceneReadback_') <
    commitSource.indexOf("status: 'COMMITTED'"),
  'normal commits must pass scene readback before COMMITTED'
);

const correctionStart = code.indexOf('function commitSceneCorrectionCore_');
const correctionEnd = code.indexOf('\nfunction ', correctionStart + 10);
const correctionSource = code.slice(correctionStart, correctionEnd);
assert(
  correctionSource.indexOf('echoPhase6AssertSceneReadback_') <
    correctionSource.indexOf("status: 'COMMITTED'"),
  'corrections must pass scene readback before COMMITTED'
);

for (const forbidden of [
  'SCENE-20260826-2356-A11C',
  'SCENE-CORRECTION-20260827-0020-F4D8',
  'fullThreeTruthsSceneText_'
]) {
  assert(!code.includes(forbidden), 'private or historical content leaked: ' + forbidden);
}

const helpers = new Function(
  code + '\nreturn { echoSceneReadbackContract_, echoGetSceneReadbackContract, echoPhase6SceneReadback_ };'
)();

const validRow = {
  feed_id: 'FEED-1',
  event_id: 'EVENT-1',
  scene_id: 'SCENE-1',
  revision_id: 'REV-1',
  revision_number: 2,
  scene_contract_version: '1.0.0',
  narrative_text: 'Eine Szene.\n\nMireth: „Bleib hier.“',
  scene_blocks_json: [
    { type: 'prose', text: 'Eine Szene.' },
    { type: 'dialogue', speaker: 'Mireth', text: 'Bleib hier.' }
  ]
};

const valid = helpers.echoPhase6SceneReadback_(validRow, {
  feedId: 'FEED-1',
  eventId: 'EVENT-1',
  revisionId: 'REV-1'
});
assert.strictEqual(valid.ok, true);
assert.strictEqual(valid.status, 'VERIFIED');
assert.strictEqual(valid.blockCount, 2);
assert.strictEqual(valid.formattedTextPresent, true);
assert(!Object.prototype.hasOwnProperty.call(valid, 'text'));
assert(!Object.prototype.hasOwnProperty.call(valid, 'formattedText'));

const contract = helpers.echoSceneReadbackContract_();
assert.strictEqual(contract.version, '1.0.0');
assert.strictEqual(contract.source, 'SCENE_FEED');
assert.strictEqual(contract.failure_status, 'SCENE_READBACK_FAILED');
assert.deepStrictEqual(
  helpers.echoGetSceneReadbackContract(),
  { ok: true, contract }
);

const noBlocks = helpers.echoPhase6SceneReadback_(
  Object.assign({}, validRow, { scene_blocks_json: [] }),
  { feedId: 'FEED-1', eventId: 'EVENT-1', revisionId: 'REV-1' }
);
assert.strictEqual(noBlocks.ok, false);
assert.strictEqual(noBlocks.status, 'SCENE_READBACK_FAILED');
assert(noBlocks.errors.includes('visible scene blocks missing'));

const mismatchedNarrative = helpers.echoPhase6SceneReadback_(
  Object.assign({}, validRow, { narrative_text: 'Andere Szene.' }),
  { feedId: 'FEED-1', eventId: 'EVENT-1', revisionId: 'REV-1' }
);
assert.strictEqual(mismatchedNarrative.ok, false);
assert(mismatchedNarrative.errors.includes('narrative_text does not match scene blocks'));

const mismatchedRevision = helpers.echoPhase6SceneReadback_(
  validRow,
  { feedId: 'FEED-1', eventId: 'EVENT-1', revisionId: 'REV-2' }
);
assert.strictEqual(mismatchedRevision.ok, false);
assert(mismatchedRevision.errors.includes('revision_id mismatch'));

const invalidJson = helpers.echoPhase6SceneReadback_(
  Object.assign({}, validRow, { scene_blocks_json: '{not-json}' }),
  { feedId: 'FEED-1', eventId: 'EVENT-1', revisionId: 'REV-1' }
);
assert.strictEqual(invalidJson.ok, false);
assert(invalidJson.errors.some((error) => error.startsWith('scene_blocks_json invalid:')));

console.log('Phase 6 scene readback checks passed.');
