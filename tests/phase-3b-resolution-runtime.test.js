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
  assert.strictEqual(count, 1, `duplicate global function: ${name}`);
}

const declaredInternalFunctions = new Set(functionNames);
const calledInternalFunctions = new Set(
  [...code.matchAll(/\b([A-Za-z_$][A-Za-z0-9_$]*_)\s*\(/g)].map((match) => match[1])
);
for (const name of calledInternalFunctions) {
  assert(
    declaredInternalFunctions.has(name),
    `internal helper is called but not defined: ${name}`
  );
}

for (const required of [
  "var ECHO_RESOLUTION_CONTRACT_VERSION = '1.0.0';",
  'var ECHO_RESOLUTION_MODES_',
  'var ECHO_RESOLUTION_OUTCOMES_',
  'function normalizeResolution_',
  'function resolutionSystemText_',
  'function sceneBlocksWithResolution_',
  'resolution_json',
  'resolution_mode',
  'resolution_outcome',
  'explicit_no_roll',
  'function echoGetResolutionContract',
  'resolution_contract',
  "scene_contract: echoSceneContract_()",
  "resolutionContract: echoResolutionContract_()"
]) {
  assert(code.includes(required), `missing Phase 3B contract: ${required}`);
}

for (const forbidden of [
  'SCENE-20260826-2356-A11C',
  'SCENE-CORRECTION-20260827-0020-F4D8',
  'fullThreeTruthsSceneText_',
  'LOC_VAEL_THARYN_HIDDEN_WALL_HOLLOW'
]) {
  assert(!code.includes(forbidden), `private or historical content leaked: ${forbidden}`);
}

// Execute only the standalone Apps-Script source and exercise pure helpers.
// No workbook, Script Properties or other Apps-Script service is touched.
const helpers = new Function(
  code + '\nreturn { normalizeResolution_, resolutionSystemText_, sceneBlocksWithResolution_, echoResolutionContract_, echoGetResolutionContract };'
)();

const roll = helpers.normalizeResolution_({
  mode: 'ROLL',
  check: 'Wahrnehmung',
  dc: 12,
  d20: 14,
  modifier: 2
});
assert.strictEqual(roll.total, 16);
assert.strictEqual(roll.outcome, 'SUCCESS');

const rollText = helpers.resolutionSystemText_(roll);
for (const expected of [
  'Probe: Wahrnehmung',
  'W20: 14',
  'Modifikator: +2',
  'SG: 12',
  'Gesamt: 16',
  'Ergebnis: Erfolg'
]) {
  assert(rollText.includes(expected), `missing roll text: ${expected}`);
}

assert.strictEqual(
  helpers.normalizeResolution_({
    mode: 'ROLL',
    check: 'Probe',
    dc: 20,
    d20: 20,
    modifier: -4
  }).outcome,
  'CRITICAL_SUCCESS'
);
assert.strictEqual(
  helpers.normalizeResolution_({
    mode: 'ROLL',
    check: 'Probe',
    dc: 1,
    d20: 1,
    modifier: 50
  }).outcome,
  'CRITICAL_FAILURE'
);

const noRoll = helpers.normalizeResolution_({
  mode: 'NO_ROLL',
  explicit_no_roll: true,
  reason: 'Der Spieler hat ausdrücklich auf einen Würfelwurf verzichtet.'
});
assert.strictEqual(noRoll.mode, 'NO_ROLL');
assert.strictEqual(noRoll.d20, undefined);
assert(helpers.resolutionSystemText_(noRoll).includes('ausdrücklich ohne Würfel'));

assert.throws(
  () => helpers.normalizeResolution_({
    mode: 'NO_ROLL',
    reason: 'Die Handlung ist ausdrücklich gesetzt.'
  }),
  /explicit_no_roll/
);
assert.throws(
  () => helpers.normalizeResolution_({
    mode: 'NO_ROLL',
    explicit_no_roll: true,
    reason: 'Sicher.',
    d20: 12
  }),
  /cannot contain/
);

const noCheck = helpers.normalizeResolution_({
  mode: 'NO_CHECK',
  reason: 'Die Handlung gelingt sicher.'
});
assert(noCheck.mode === 'NO_CHECK');
assert(helpers.resolutionSystemText_(noCheck).includes('Keine Probe erforderlich'));

assert.throws(
  () => helpers.normalizeResolution_({
    mode: 'ROLL',
    check: 'Probe',
    dc: 10,
    d20: 8,
    modifier: 1,
    total: 99
  }),
  /does not match/
);
assert.throws(
  () => helpers.normalizeResolution_({
    mode: 'ROLL',
    check: 'Probe',
    dc: 10,
    d20: 8,
    modifier: 1,
    outcome: 'SUCCESS'
  }),
  /does not match/
);

const blocks = helpers.sceneBlocksWithResolution_([
  { type: 'prose', text: 'Die Szene.' },
  { type: 'system', text: 'Probe: veraltete Anzeige.' },
  { type: 'prompt', text: 'Was tust du?' }
], roll);
assert.strictEqual(blocks.filter((block) => block.type === 'system').length, 1);
assert.strictEqual(blocks[1].type, 'system');
assert(blocks[1].text.includes('W20: 14'));
assert.strictEqual(blocks[2].type, 'prompt');

const contract = helpers.echoResolutionContract_();
assert.deepStrictEqual(
  contract.modes.map((mode) => mode.mode),
  ['ROLL', 'NO_ROLL', 'NO_CHECK']
);
assert.deepStrictEqual(
  helpers.echoGetResolutionContract(),
  { ok: true, contract }
);

console.log('Phase 3B resolution runtime checks passed.');
