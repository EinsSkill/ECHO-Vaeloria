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
  "var ECHO_SCENE_CONTRACT_VERSION = '1.0.0';",
  'var ECHO_SCENE_BLOCK_TYPES_',
  'var ECHO_SCENE_BLOCK_TYPE_ALIASES_',
  'function normalizeSceneBlocks_',
  'function sceneBlocksForStorage_',
  'function echoSceneContract_',
  "storage_field: 'scene_blocks_json'",
  "scene_contract_version: ECHO_SCENE_CONTRACT_VERSION",
  'Only visible blocks may be written to SCENE_FEED.',
  'scene_contract: echoSceneContract_()',
  'sceneContract: echoSceneContract_()'
]) {
  assert(code.includes(required), `missing Phase 3A contract: ${required}`);
}

for (const type of [
  'heading', 'prose', 'dialogue', 'action', 'sensory',
  'system', 'change', 'status', 'prompt'
]) {
  assert(code.includes(`  ${type}: true`), `scene block type missing: ${type}`);
}

for (const alias of [
  "narrative: 'prose'",
  "dialog: 'dialogue'",
  "stage_direction: 'action'",
  "system_message: 'system'",
  "consequence: 'change'",
  "status_line: 'status'",
  "next_action: 'prompt'"
]) {
  assert(code.includes(alias), `scene block alias missing: ${alias}`);
}

for (const forbidden of [
  'SCENE-20260826-2356-A11C',
  'SCENE-CORRECTION-20260827-0020-F4D8',
  'fullThreeTruthsSceneText_'
]) {
  assert(!code.includes(forbidden), `private or historical content leaked: ${forbidden}`);
}

// Execute only the standalone Apps-Script source in a local JS scope and exercise
// the pure scene helpers without touching any Apps-Script services.
const helpers = new Function(
  code + '\nreturn { normalizeSceneBlocks_, sceneTextFromBlocks_, sceneBlocksForStorage_ };'
)();

const normalized = helpers.normalizeSceneBlocks_([
  { type: 'narrative', content: 'Die Höhle schweigt.' },
  { type: 'dialog', speaker: 'Mireth', text: 'Bleib stehen.' },
  { type: 'system_message', text: 'Keine Probe erforderlich.' },
  { type: 'consequence', text: 'Die Resonanz verändert sich.' }
], { strict: true });

assert.deepStrictEqual(
  normalized.map((block) => block.type),
  ['prose', 'dialogue', 'system', 'change']
);
assert.strictEqual(normalized[1].speaker, 'Mireth');

const rendered = helpers.sceneTextFromBlocks_(normalized, '');
assert(rendered.includes('Mireth: „Bleib stehen.“'));
assert(rendered.includes('SYSTEM: Keine Probe erforderlich.'));
assert(rendered.includes('ÄNDERUNGEN: Die Resonanz verändert sich.'));

assert.throws(
  () => helpers.normalizeSceneBlocks_([{ type: 'secret', text: 'intern' }], { strict: true }),
  /Unknown scene block type/
);
assert.throws(
  () => helpers.normalizeSceneBlocks_([{ type: 'prose', text: 'intern', visibility: 'HIDDEN' }], { strict: true }),
  /cannot be hidden/
);

const legacyStorage = helpers.sceneBlocksForStorage_({
  narrative_text: 'Eine ältere Szene ohne Blockstruktur.'
});
assert.strictEqual(legacyStorage.length, 1);
assert.strictEqual(legacyStorage[0].type, 'prose');

console.log('Phase 3A narrative runtime checks passed.');
