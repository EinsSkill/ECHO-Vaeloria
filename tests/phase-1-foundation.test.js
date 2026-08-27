'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const codePath = path.join(__dirname, '..', 'apps-script', 'Code.gs');
const code = fs.readFileSync(codePath, 'utf8');

assert.doesNotThrow(() => new Function(code), 'Code.gs must remain valid JavaScript');
assert(!code.includes('fullThreeTruthsSceneText_'), 'historical hard-coded scene must be gone');
assert(!code.includes('SCENE-20260826-2356-A11C'), 'historical scene IDs must not be hard-coded');
assert(!code.includes('SCENE-CORRECTION-20260827-0020-F4D8'), 'historical correction IDs must not be hard-coded');

const coverageIds = [...code.matchAll(/\{ id: '(q\d{2})'/g)].map((match) => match[1]);
const uniqueIds = [...new Set(coverageIds)].sort();
assert.strictEqual(uniqueIds.length, 50, 'preference coverage must contain 50 unique questions');
assert.deepStrictEqual(uniqueIds, Array.from({ length: 50 }, (_, index) => `q${String(index + 1).padStart(2, '0')}`));

const runtimeBlock = code.match(/const ECHO_FAST_DEFAULT_RUNTIME_KEYS = \[[\s\S]*?\n\];/);
assert(runtimeBlock, 'canonical runtime key block must exist');
for (const legacyKey of [
  'world_location_id',
  'character_known_identity',
  'health',
  'world_clock',
  'elapsed_minutes',
  'held_item'
]) {
  assert(!runtimeBlock[0].includes(`'${legacyKey}'`), `legacy runtime key returned: ${legacyKey}`);
}

for (const required of [
  'function compileEffectivePreferencePolicy_',
  'function validatePreferenceCoverage_',
  'function canonicalStateKey_',
  'function itemOwnershipProjection_',
  'scene_blocks_json',
  'State reads are side-effect free'
]) {
  assert(code.includes(required), `missing Phase 1 contract: ${required}`);
}

console.log('Phase 1 foundation checks passed.');
