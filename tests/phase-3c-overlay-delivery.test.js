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
  "var ECHO_OVERLAY_CONTRACT_VERSION = '1.0.0';",
  "version: '1.1.0',",
  'readback_endpoint',
  'success_acknowledgement_requires',
  'function echoOverlayContract_',
  'function echoGetOverlayContract',
  'function overlaySceneDeliveryPayload_',
  'function echoTurnDelivery_',
  'formattedText',
  'narrativeText',
  'overlayContract: echoOverlayContract_()',
  'overlay_contract: echoOverlayContract_()',
  "case 'overlay-contract':"
]) {
  assert(code.includes(required), `missing Phase 3C contract: ${required}`);
}

for (const forbidden of [
  'SCENE-20260826-2356-A11C',
  'SCENE-CORRECTION-20260827-0020-F4D8',
  'fullThreeTruthsSceneText_'
]) {
  assert(!code.includes(forbidden), `private or historical content leaked: ${forbidden}`);
}

const helpers = new Function(
  code + '\nreturn { overlaySceneDeliveryPayload_, chronicleFrom_, echoTurnDelivery_, echoOverlayContract_, echoGetOverlayContract };'
)();

const pending = helpers.echoTurnDelivery_({ validation_status: 'PENDING' });
assert.strictEqual(pending.overlay_ready, false);
assert.strictEqual(pending.chat_response, '');
assert.strictEqual(pending.wait_for_processor, true);
assert.strictEqual(pending.include_narrative_in_chat, false);

const committed = helpers.echoTurnDelivery_({
  validation_status: 'COMMITTED',
  ui_feed_id: 'FEED-1'
});
assert.strictEqual(committed.overlay_ready, true);
assert.strictEqual(committed.ui_feed_id, 'FEED-1');
assert.strictEqual(committed.chat_response, 'Übertragen.');
assert.strictEqual(committed.narrative_destination, 'OVERLAY_ONLY');

const incompleteCommit = helpers.echoTurnDelivery_({
  validation_status: 'COMMITTED'
});
assert.strictEqual(incompleteCommit.overlay_ready, false);
assert.strictEqual(incompleteCommit.chat_response, '');
assert.strictEqual(incompleteCommit.requires_readback, true);

const failed = helpers.echoTurnDelivery_({
  validation_status: 'ERROR',
  error_code: 'BAD_PAYLOAD'
});
assert.strictEqual(failed.overlay_ready, false);
assert.strictEqual(failed.chat_response, '');
assert.strictEqual(failed.error_code, 'BAD_PAYLOAD');

const scene = helpers.overlaySceneDeliveryPayload_({
  feed_id: 'FEED-1',
  event_id: 'EVENT-1',
  scene_id: 'SCENE-1',
  revision_id: 'REV-1',
  revision_number: 2,
  sequence: 3,
  title: 'Demo',
  scene_type: 'narrative',
  narrative_text: 'Eine Szene.',
  scene_blocks_json: [
    { type: 'prose', text: 'Eine Szene.' },
    { type: 'dialogue', speaker: 'Mireth', text: 'Bleib hier.' },
    { type: 'change', text: 'Die Lage hat sich verändert.' }
  ],
  location_id: 'LOC_DEMO',
  mood: 'neutral',
  status: 'PLAY',
  available_actions_json: []
});

assert.strictEqual(
  scene.formattedText,
  'Eine Szene.\n\nMireth: „Bleib hier.“\n\nDie Lage hat sich verändert.'
);
assert.strictEqual(scene.narrativeText, scene.formattedText);
assert.strictEqual(scene.text, scene.formattedText);
assert.strictEqual(scene.blocks.length, 3);
assert.strictEqual(scene.blocks[1].type, 'dialogue');
assert.strictEqual(scene.blocks[2].type, 'change');
assert.strictEqual(scene.feedId, 'FEED-1');
assert.strictEqual(scene.sceneId, 'SCENE-1');
assert.strictEqual(scene.source, 'SCENE_FEED');
assert.strictEqual(scene.renderMode, 'BLOCKS_FIRST');

const chronicle = helpers.chronicleFrom_([{
  feed_id: 'FEED-1',
  event_id: 'EVENT-1',
  title: 'Demo',
  scene_type: 'narrative',
  narrative_text: 'Eine Szene.',
  scene_blocks_json: [
    { type: 'prose', text: 'Eine Szene.' },
    { type: 'dialogue', speaker: 'Mireth', text: 'Bleib hier.' }
  ],
  location_id: 'LOC_DEMO',
  mood: 'neutral',
  status: 'PLAY',
  available_actions_json: []
}], []);

assert.strictEqual(chronicle.length, 1);
assert(Array.isArray(chronicle[0].blocks));
assert.strictEqual(chronicle[0].blocks[1].type, 'dialogue');
assert.strictEqual(chronicle[0].formattedText, 'Eine Szene.\n\nMireth: „Bleib hier.“');
assert(chronicle[0].resolution);
assert.strictEqual(chronicle[0].sceneContractVersion, '1.0.0');

const overlayContract = helpers.echoOverlayContract_();
assert.strictEqual(overlayContract.version, '1.0.0');
assert(overlayContract.current_scene.fields.includes('blocks'));
assert(overlayContract.current_scene.fields.includes('formattedText'));
assert.strictEqual(overlayContract.delivery.success_text, 'Übertragen.');
assert.deepStrictEqual(
  helpers.echoGetOverlayContract(),
  { ok: true, contract: overlayContract }
);

console.log('Phase 3C overlay delivery checks passed.');
