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
  "var ECHO_PROJECTION_CONTRACT_VERSION = '1.0.0';",
  'function echoProjectionContract_',
  'function echoGetProjectionContract',
  'function echoPhase4ProjectCharacters_',
  'function echoPhase4ProjectGroups_',
  'function echoPhase4WorldProjection_',
  'projection_contract: echoProjectionContract_()',
  "context_version: 'phase-4'",
  "case 'projection-contract':",
  'characters: projections.characters',
  'groups: projections.groups',
  "numeric_relationship_source: 'RELATIONSHIP_STATE'"
]) {
  assert(code.includes(required), 'missing Phase 4 contract: ' + required);
}

for (const forbidden of [
  'SCENE-20260826-2356-A11C',
  'SCENE-CORRECTION-20260827-0020-F4D8',
  'fullThreeTruthsSceneText_'
]) {
  assert(!code.includes(forbidden), 'private or historical content leaked: ' + forbidden);
}

const helpers = new Function(
  code + '\nreturn { echoProjectionContract_, echoPhase4ProjectCharacters_, echoPhase4ProjectGroups_, echoPhase4WorldProjection_, echoPhase4BuildProjections_ };'
)();

const profiles = [
  {
    entityId: 'NPC_ALPHA',
    displayName: 'Alpha',
    status: 'ACTIVE',
    groupRole: 'dominant_guide',
    relationshipAxes: { trust: 'unknown', summary: 'qualitative profile note' },
    boundaries: ['limit-a'],
    magicResonance: { primary: 'echo' },
    groupPosition: { aliases: ['ALPHA_ALIAS'] },
    preferences: { intimacy: { pacing: 'slow' } }
  },
  {
    entityId: 'NPC_BETA',
    displayName: 'Beta',
    status: 'ACTIVE',
    groupRole: 'scout',
    relationshipAxes: {},
    boundaries: [],
    magicResonance: {},
    groupPosition: {}
  }
];

const relationshipRows = [
  {
    state_id: 'REL-BETA-OLD',
    entity_a: 'PLAYER',
    entity_b: 'NPC_BETA',
    trust: '20',
    status: 'ACTIVE',
    consent_state: 'UNKNOWN',
    updated_at: '2026-08-26T10:00:00Z',
    __rowNumber: 2
  },
  {
    state_id: 'REL-BETA-NEW',
    entity_a: 'PLAYER',
    entity_b: 'NPC_BETA',
    trust: '60',
    tension: '35',
    status: 'ACTIVE',
    consent_state: 'NEGOTIATED',
    boundaries_json: '["limit-b"]',
    updated_at: '2026-08-26T11:00:00Z',
    __rowNumber: 3
  },
  {
    state_id: 'REL-ALPHA',
    entity_a: 'PLAYER',
    entity_b: 'ALPHA_ALIAS',
    status: 'ACTIVE',
    consent_state: 'UNKNOWN',
    updated_at: '2026-08-26T09:00:00Z',
    __rowNumber: 1
  },
  {
    entity_b: 'WISE_GUIDE',
    status: 'ACTIVE',
    updated_at: '2026-08-26T12:00:00Z'
  }
];

const groupRows = [
  {
    member_id: 'MEM-A2',
    group_id: 'GROUP_B',
    entity_id: 'NPC_ALPHA',
    display_name: 'NPC_ALPHA',
    role: 'role-b',
    status: 'ACTIVE',
    position: 2,
    traits_json: '{}',
    boundaries_json: '[]'
  },
  {
    member_id: 'MEM-A1',
    group_id: 'GROUP_A',
    entity_id: 'NPC_ALPHA',
    display_name: 'NPC_ALPHA',
    role: 'role-a',
    status: 'ACTIVE',
    position: 1,
    traits_json: '{}',
    boundaries_json: '[]'
  },
  {
    member_id: 'MEM-B-LEFT',
    group_id: 'GROUP_X',
    entity_id: 'NPC_BETA',
    status: 'LEFT'
  },
  {
    member_id: 'MEM-B-PAUSED',
    group_id: 'GROUP_Y',
    entity_id: 'NPC_BETA',
    status: 'PAUSED'
  },
  {
    member_id: 'MEM-B',
    group_id: 'GROUP_C',
    entity_id: 'NPC_BETA',
    display_name: 'Beta',
    role: 'scout',
    status: 'ACTIVE',
    position: 1,
    traits_json: '{}',
    boundaries_json: '[]'
  }
];

const characters = helpers.echoPhase4ProjectCharacters_(
  relationshipRows,
  groupRows,
  profiles,
  {}
);
assert.deepStrictEqual(
  characters.map((character) => character.entityId),
  ['NPC_ALPHA', 'NPC_BETA']
);
assert.strictEqual(characters[0].displayName, 'Alpha');
assert.strictEqual(characters[0].role, 'dominante Führerin');
assert.strictEqual(characters[0].relationship.stateId, 'REL-ALPHA');
assert.strictEqual(characters[0].relationship.numericState, 'not_established');
assert(
  characters[0].relationship.axes.every((axis) => axis.established === false),
  'profile values must not become numeric relationship state'
);
assert.strictEqual(characters[1].relationship.stateId, 'REL-BETA-NEW');
assert(
  characters[1].relationship.axes.some(
    (axis) => axis.key === 'trust' && axis.established === true && axis.valueText === 'aufgebaut'
  )
);
assert.strictEqual(characters[1].relationship.consent.state, 'NEGOTIATED');
assert.deepStrictEqual(characters[1].relationship.boundaries, ['limit-b']);
assert.deepStrictEqual(
  characters[0].memberships.map((membership) => membership.groupId),
  ['GROUP_A', 'GROUP_B']
);
assert.deepStrictEqual(
  characters[1].memberships.map((membership) => membership.groupId),
  ['GROUP_C']
);
assert.deepStrictEqual(
  characters[0].groupRoles,
  ['role-a', 'role-b']
);

const groups = helpers.echoPhase4ProjectGroups_(groupRows, profiles);
assert.deepStrictEqual(
  groups.map((group) => group.groupId),
  ['GROUP_A', 'GROUP_B', 'GROUP_C']
);
assert.strictEqual(groups[0].memberCount, 1);

const emptyWorld = helpers.echoPhase4WorldProjection_({}, {});
assert.strictEqual(emptyWorld.available, false);
assert.strictEqual(emptyWorld.locationId, null);
assert.strictEqual(emptyWorld.chapterLabel, null);

const sceneWorld = helpers.echoPhase4WorldProjection_({}, { location_id: 'LOC_TEST' });
assert.strictEqual(sceneWorld.available, true);
assert.strictEqual(sceneWorld.source, 'SCENE_FEED');
assert.strictEqual(sceneWorld.locationId, 'LOC_TEST');

const storedWorld = helpers.echoPhase4WorldProjection_({
  'player.location_id': { value: 'LOC_TEST' },
  'story.chapter_id': { value: '1' },
  'story.chapter_label': { value: 'Chapter One' },
  'world.clock': { value: '10:00' },
  'world.elapsed_minutes': { value: 25 },
  'world.known_regions': { value: '["REGION_A"]' }
}, {});
assert.strictEqual(storedWorld.available, true);
assert.strictEqual(storedWorld.locationId, 'LOC_TEST');
assert.strictEqual(storedWorld.chapterId, '1');
assert.deepStrictEqual(storedWorld.knownRegions, ['REGION_A']);

const bundle = helpers.echoPhase4BuildProjections_(
  {},
  {},
  relationshipRows,
  groupRows,
  { characters: profiles, characterPreferences: {} },
  []
);
assert.strictEqual(bundle.version, '1.0.0');
assert.strictEqual(bundle.characters.length, 2);
assert.strictEqual(bundle.relationships.length, 2);
assert.strictEqual(bundle.groups.length, 3);
assert.strictEqual(helpers.echoProjectionContract_().numeric_relationship_source, 'RELATIONSHIP_STATE');

console.log('Phase 4 stable projection checks passed.');
