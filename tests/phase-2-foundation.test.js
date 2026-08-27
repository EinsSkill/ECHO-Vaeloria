'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const codePath = path.join(__dirname, '..', 'apps-script', 'Code.gs');
const code = fs.readFileSync(codePath, 'utf8');

assert.doesNotThrow(() => new Function(code), 'Code.gs must remain valid JavaScript');

const functionCounts = {};
for (const match of code.matchAll(/^function\s+([A-Za-z0-9_]+)\s*\(/gm)) {
  functionCounts[match[1]] = (functionCounts[match[1]] || 0) + 1;
}
for (const [name, count] of Object.entries(functionCounts)) {
  assert.strictEqual(count, 1, `duplicate global function: ${name}`);
}

for (const required of [
  'ECHO_PHASE2_SCHEMA_',
  'TURN_TRANSACTIONS',
  'SCENE_REVISIONS',
  'ITEM_STATE',
  'GROUP_MEMBERS',
  'getEchoAuthoritativeContext_',
  'echoPhase2CommitPlan_',
  'echoPhase2RecoverTransactions_',
  'echoPhase2AppendSceneRevision_',
  'echoPhase2ItemProjection_',
  'echoPhase2ApplyGroupMemberUpdates_',
  'migrateEchoPhase2',
  "source_of_truth: 'ECHO_WORKBOOK'",
  'read_before_every_turn: true',
  'context_fingerprint'
]) {
  assert(code.includes(required), `missing Phase 2 contract: ${required}`);
}

for (const sheet of [
  'CANON', 'DECISIONS', 'RULES', 'ECHO_SYSTEM', 'WORLD', 'TIMELINE',
  'CHARACTERS', 'SPECIES', 'FACTIONS', 'RELATIONSHIPS', 'FLAGS',
  'PLAYER_EXPERIENCE', 'GAME_DESIGN', 'UI_DESIGN', 'STATE_SNAPSHOT',
  'EVENT_LOG', 'SCENE_FEED', 'RELATIONSHIP_STATE', 'THREADS',
  'ECHO_PREFERENCE_PROFILE', 'ECHO_CHARACTER_PROFILES', 'ITEM_STATE',
  'GROUP_MEMBERS'
]) {
  assert(code.includes(`'${sheet}'`) || code.includes(`"${sheet}"`), `context source missing: ${sheet}`);
}

const correctionStart = code.indexOf('function commitSceneCorrectionCore_');
const correctionEnd = code.indexOf('\nfunction ', correctionStart + 10);
assert(correctionStart >= 0, 'correction core must exist');
const correction = code.slice(correctionStart, correctionEnd < 0 ? code.length : correctionEnd);
assert(correction.includes('echoPhase2AppendSceneRevision_'), 'correction must append a revision');
assert(!correction.includes('setCellByHeader_'), 'correction must not mutate the old scene row');

assert(!code.includes('function fullThreeTruthsSceneText_'), 'old hard-coded scene helper must stay removed');
const declaredInternalFunctions = new Set(
  [...code.matchAll(/^function\s+([A-Za-z0-9_]+)\s*\(/gm)].map((match) => match[1])
);
const calledInternalFunctions = new Set(
  [...code.matchAll(/\b([A-Za-z_$][A-Za-z0-9_$]*_)\s*\(/g)].map((match) => match[1])
);
for (const name of calledInternalFunctions) {
  assert(
    declaredInternalFunctions.has(name),
    `internal helper is called but not defined: ${name}`
  );
}


console.log('Phase 2 foundation checks passed.');
