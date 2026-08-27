// ECHO – consolidated Apps Script backend
//
// This file is intentionally standalone so it can be copied into the private
// Apps-Script project as the complete backend. Live state and secrets remain
// outside this repository in Script Properties and the private ECHO sheet.
//
// The former split modules are preserved in Git history; their logic is
// consolidated below to avoid missing dependencies in a single-file project.

// ===== Web app entry point and configuration =====

var ECHO_CONFIG = {
  spreadsheetIdProperty: 'ECHO_SPREADSHEET_ID',
  apiKeyProperty: 'ECHO_API_KEY',
  sheets: {
    state: 'STATE_SNAPSHOT',
    eventLog: 'EVENT_LOG',
    sceneFeed: 'SCENE_FEED',
    turnInbox: 'TURN_INBOX',
    relationships: 'RELATIONSHIP_STATE',
    threads: 'THREADS',
    preferences: 'ECHO_PREFERENCE_PROFILE',
    characterProfiles: 'ECHO_CHARACTER_PROFILES',
    transactions: 'TURN_TRANSACTIONS',
    sceneRevisions: 'SCENE_REVISIONS',
    groupMembers: 'GROUP_MEMBERS',
    items: 'ITEM_STATE'
  }
};


var ECHO_BUILD_ID = 'phase-4-state-projections-2026-08-27';
var ECHO_STATE_MODEL_VERSION = '3.0.0';
var ECHO_TRANSACTION_MODEL_VERSION = '1.0.0';
var ECHO_PREFERENCE_POLICY_VERSION = '1.1.0';
var ECHO_SCENE_CONTRACT_VERSION = '1.0.0';
var ECHO_RESOLUTION_CONTRACT_VERSION = '1.0.0';
var ECHO_OVERLAY_CONTRACT_VERSION = '1.0.0';
var ECHO_PROJECTION_CONTRACT_VERSION = '1.0.0';

var ECHO_SCENE_BLOCK_TYPES_ = {
  heading: true,
  prose: true,
  dialogue: true,
  action: true,
  sensory: true,
  system: true,
  change: true,
  status: true,
  prompt: true
};

var ECHO_SCENE_BLOCK_TYPE_ALIASES_ = {
  narrative: 'prose',
  narration: 'prose',
  description: 'prose',
  text: 'prose',
  dialog: 'dialogue',
  speech: 'dialogue',
  npc_dialogue: 'dialogue',
  stage_direction: 'action',
  emote: 'action',
  gesture: 'action',
  sense: 'sensory',
  system_message: 'system',
  mechanic: 'system',
  consequence: 'change',
  update: 'change',
  status_line: 'status',
  next_action: 'prompt',
  choice: 'prompt',
  question: 'prompt'
};

var ECHO_STATE_ALIAS_TO_CANONICAL_ = {
  world_location_id: 'player.location_id',
  character_known_identity: 'player.known_identity',
  health: 'player.health',
  health_max: 'player.health_max',
  resonance_stage: 'player.resonance_stage',
  world_clock: 'world.clock',
  elapsed_minutes: 'world.elapsed_minutes',
  player_posture: 'player.posture',
  equipment_main_hand: 'player.equipment_main_hand',
  held_item: 'player.held_item',
  clothing_state: 'player.clothing_state',
  seal_threshold_state: 'player.seal_threshold_state',
  inventory: 'player.inventory',
  known_facts: 'player.known_facts',
  conditions: 'player.conditions',
  'player.health_current': 'player.health',
  'world.elapsed_minutes_legacy': 'world.elapsed_minutes'
};

var ECHO_AUTHORITY_ORDER_ = [
  'platform_and_safety',
  'player_stop_and_explicit_boundaries',
  'npc_boundaries_and_consent',
  'project_canon',
  'canonical_game_state',
  'established_relationship_state',
  'effective_player_preferences',
  'current_scene_improvisation'
];

var ECHO_CHAT_DELIVERY_POLICY = {
  version: '1.1.0',
  mode: 'OVERLAY_ONLY',
  chat_response_mode: 'ACK_ONLY',
  narrative_destination: 'SCENE_FEED',
  overlay_response_mode: 'FULL_NARRATIVE',
  acknowledgement_on_success: 'Übertragen.',
  failure_response: 'Fehler kurz melden; keine Erzählung im Chat ausgeben.',
  completion_rule: 'ACK_ONLY_AFTER_COMMIT_AND_READBACK',
  processing_mode: 'THOROUGH_PERSISTENCE_AND_CONSISTENCY_CHECK',
  preferred_quality_window: '2–3 Minuten interne Prüfung, sofern der Zug es erfordert',
  include_narrative_in_chat: false,
  readback_endpoint: 'gateway.status',
  success_acknowledgement_requires: ['COMMITTED', 'ui_feed_id'],
  narrative_readback: 'OVERLAY_ONLY'
};

function echoChatDeliveryPolicy_() {
  return {
    version: ECHO_CHAT_DELIVERY_POLICY.version,
    mode: ECHO_CHAT_DELIVERY_POLICY.mode,
    chat_response_mode: ECHO_CHAT_DELIVERY_POLICY.chat_response_mode,
    narrative_destination: ECHO_CHAT_DELIVERY_POLICY.narrative_destination,
    overlay_response_mode: ECHO_CHAT_DELIVERY_POLICY.overlay_response_mode,
    acknowledgement_on_success: ECHO_CHAT_DELIVERY_POLICY.acknowledgement_on_success,
    failure_response: ECHO_CHAT_DELIVERY_POLICY.failure_response,
    completion_rule: ECHO_CHAT_DELIVERY_POLICY.completion_rule,
    processing_mode: ECHO_CHAT_DELIVERY_POLICY.processing_mode,
    preferred_quality_window: ECHO_CHAT_DELIVERY_POLICY.preferred_quality_window,
    include_narrative_in_chat: ECHO_CHAT_DELIVERY_POLICY.include_narrative_in_chat,
    readback_endpoint: ECHO_CHAT_DELIVERY_POLICY.readback_endpoint,
    success_acknowledgement_requires: ECHO_CHAT_DELIVERY_POLICY.success_acknowledgement_requires.slice(),
    narrative_readback: ECHO_CHAT_DELIVERY_POLICY.narrative_readback
  };
}

/** Web-app entry point. GET is read-only except for processing queued turns. */

function doGet(e) {
  var action = e && e.parameter ? String(e.parameter.action || '') : '';
  if (action === 'health') {
    return jsonOutput_({ ok: true, service: 'ECHO', version: '1.1.0', build: ECHO_BUILD_ID, state_model: ECHO_STATE_MODEL_VERSION, preference_policy: ECHO_PREFERENCE_POLICY_VERSION });
  }
  if (action === 'delivery-policy') {
    return jsonOutput_(echoGetChatDeliveryPolicy());
  }
  if (action === 'scene-contract') {
    return jsonOutput_(echoGetSceneContract());
  }
  if (action === 'resolution-contract') {
    return jsonOutput_(echoGetResolutionContract());
  }
  if (action === 'overlay-contract') {
    return jsonOutput_(echoGetOverlayContract());
  }
  if (action === 'projection-contract') {
    return jsonOutput_(echoGetProjectionContract());
  }
  if (action === 'preferences') {
    return jsonOutput_(getEchoPreferenceContext_({ includeAudit: true }));
  }
  if (action === 'context') {
    requireApiKey_(e && e.parameter ? e.parameter.token : '');
    return jsonOutput_(getEchoAuthoritativeContext_({ includePrivate: true }));
  }
  if (action === 'validate-preferences') {
    return jsonOutput_(echoValidatePreferenceProfile());
  }
  if (action === 'state') {
    // State reads are side-effect free. The processor is driven by its trigger
    // or an explicit write path, never by an overlay GET request.
    return jsonOutput_(getOverlayState_());
  }
  if (action === 'diagnostics') {
    requireApiKey_(e && e.parameter ? e.parameter.token : '');
    return jsonOutput_(echoGetDiagnostics_());
  }

  var template = HtmlService.createTemplateFromFile('Index');
  template.webAppUrl = ScriptApp.getService().getUrl();
  return template
    .evaluate()
    .setTitle('ECHO')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function doPost(e) {
  try {
    var body = parsePostBody_(e);

    // Fast Turn Gateway: context / submit / status.
    // The gateway performs its own token check via ECHO_GATEWAY_TOKEN.
    if (body && ['context', 'submit', 'status'].indexOf(String(body.op || '')) !== -1) {
      if (!body.token && e && e.parameter && e.parameter.token) {
        body.token = e.parameter.token;
      }
      return jsonOutput_(echoHandleGatewayRequest(body));
    }

    // Existing direct API remains fully backwards compatible.
    requireApiKey_(body.token || (e && e.parameter ? e.parameter.token : ''));
    if (body.action === 'health') {
      return jsonOutput_({ ok: true, service: 'ECHO', version: '1.1.0', build: ECHO_BUILD_ID, state_model: ECHO_STATE_MODEL_VERSION, preference_policy: ECHO_PREFERENCE_POLICY_VERSION });
    }

    // Every external game turn enters TURN_INBOX as PENDING. The processor
    // remains the only writer for EVENT_LOG, SCENE_FEED and STATE_SNAPSHOT.
    var result = enqueueTurn_(body.event || body);
    return jsonOutput_(result);
  } catch (error) {
    return jsonOutput_({
      ok: false,
      error: String(error && error.message ? error.message : error)
    });
  }
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

function includeBase64(filename) {
  return Utilities.base64Encode(
    HtmlService.createHtmlOutputFromFile(filename).getContent(),
    Utilities.Charset.UTF_8
  );
}

function getOverlayStateForClient() {
  return getOverlayState_();
}

function setupEchoTrigger_() {
  ScriptApp.getProjectTriggers().forEach(function(trigger) {
    if (trigger.getHandlerFunction() === 'processTurnInbox') {
      ScriptApp.deleteTrigger(trigger);
    }
  });
  ScriptApp.newTrigger('processTurnInbox')
    .timeBased()
    .everyMinutes(1)
    .create();
}

function setupEchoTrigger() {
  setupEchoSchema();
  setupEchoTrigger_();
}

function processTurnInbox() {
  processTurnInbox_();
}

// ===== Turn contract and schema =====

// ECHO turn contract and inbox boundary.
// This module is public and secret-free. Live state remains in the private sheet.

var ECHO_CONTRACT_VERSION = '3.2.0';

var ECHO_RELATIONSHIP_NUMERIC_FIELDS = {
  trust: true,
  desire: true,
  fear: true,
  respect: true,
  tension: true,
  safety: true,
  dominance: true,
  submission: true,
  intimacy: true,
  power_gap: true,
  dependence: true,
  agency: true,
  resentment: true
};

var ECHO_CONSENT_STATES = {
  UNKNOWN: true,
  OPEN: true,
  NEGOTIATED: true,
  PAUSED: true,
  REVOKED: true
};

function requireNonEmptyString_(value, field) {
  if (value === undefined || value === null || String(value).trim() === '') {
    throw new Error(field + ' is required');
  }
}

function validateEventShape_(event) {
  if (!event || typeof event !== 'object' || Array.isArray(event)) {
    throw new Error('event must be an object');
  }

  requireNonEmptyString_(event.event_id, 'event_id');
  requireNonEmptyString_(event.event_type, 'event_type');
  requireNonEmptyString_(event.player_action, 'player_action');
  requireNonEmptyString_(event.narrative_summary, 'narrative_summary');

  if (!event.scene || typeof event.scene !== 'object' || Array.isArray(event.scene)) {
    throw new Error('scene is required');
  }

  ['feed_id', 'scene_type', 'title', 'location_id', 'narrative_text', 'mood', 'status']
    .forEach(function (key) {
      requireNonEmptyString_(event.scene[key], 'scene.' + key);
    });

  if (!Array.isArray(event.scene.available_actions_json)) {
    throw new Error('scene.available_actions_json must be an array');
  }
  validateSceneBlocks_(event.scene);
  normalizeResolution_(event.resolution);
  if (!event.state_updates || typeof event.state_updates !== 'object' || Array.isArray(event.state_updates)) {
    throw new Error('state_updates must be an object');
  }
  if (!event.relationship_updates || typeof event.relationship_updates !== 'object' || Array.isArray(event.relationship_updates)) {
    throw new Error('relationship_updates must be an object');
  }
  if (!Array.isArray(event.new_flags)) {
    throw new Error('new_flags must be an array');
  }
  if (event.preference_updates !== undefined) {
    validatePreferenceUpdates_(event.preference_updates);
  }
  if (event.character_profile_updates !== undefined) {
    validateCharacterProfileUpdates_(event.character_profile_updates);
  }
  validatePhase2EventUpdates_(event);

  Object.keys(event.relationship_updates).forEach(function (stateId) {
    normalizeRelationshipPatch_(event.relationship_updates[stateId] || {}, stateId);
  });
}

function normalizeRelationshipPatch_(patch, stateId) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
    throw new Error('relationship_updates.' + stateId + ' must be an object');
  }

  var out = {};
  Object.keys(patch).forEach(function (key) {
    if (key === 'state_id') return;

    var value = patch[key];
    if (ECHO_RELATIONSHIP_NUMERIC_FIELDS[key]) {
      var number = Number(value);
      if (!isFinite(number)) {
        throw new Error('relationship_updates.' + stateId + '.' + key + ' must be numeric');
      }
      out[key] = Math.max(0, Math.min(100, number));
      return;
    }

    if (key === 'consent_state') {
      var consent = String(value || '').toUpperCase();
      if (!ECHO_CONSENT_STATES[consent]) {
        throw new Error('Unknown consent_state: ' + consent);
      }
      out[key] = consent;
      return;
    }

    if (key === 'consent_profile') {
      out[key] = String(value || '');
      return;
    }

    if (key === 'boundaries_json') {
      if (typeof value === 'string') {
        parseJsonValue_(value);
        out[key] = value;
      } else if (Array.isArray(value)) {
        out[key] = JSON.stringify(value);
      } else {
        throw new Error('boundaries_json must be JSON or an array');
      }
      return;
    }

    if (key === 'intimacy_profile_json') {
      if (typeof value === 'string') parseJsonValue_(value);
      else if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error('intimacy_profile_json must be JSON or an object');
      }
      out[key] = typeof value === 'string' ? value : JSON.stringify(value);
      return;
    }

    out[key] = value;
  });

  return out;
}

function consentLabel_(state) {
  return {
    UNKNOWN: 'Grenzen noch nicht geklärt',
    OPEN: 'offen und freiwillig',
    NEGOTIATED: 'besprochen und vereinbart',
    PAUSED: 'pausiert',
    REVOKED: 'beendet'
  }[String(state || 'UNKNOWN').toUpperCase()] || 'Zustand unbekannt';
}

/**
 * The public API always enters through TURN_INBOX as PENDING.
 * EVENT_LOG, SCENE_FEED and STATE_SNAPSHOT are processor-owned.
 */
function enqueueTurn_(event) {
  validateEventShape_(event);

  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var inbox = getSheet_(ECHO_CONFIG.sheets.turnInbox);
    var eventLog = getSheet_(ECHO_CONFIG.sheets.eventLog);
    var existingEvent = findRow_(eventLog, 'event_id', event.event_id);
    if (existingEvent) {
      return {
        ok: true,
        queued: false,
        duplicate: true,
        validation_status: 'COMMITTED',
        event_id: event.event_id,
        ui_feed_id: findSceneFeedId_(event.event_id)
      };
    }

    var existingInbox = findInboxEvent_(inbox, event.event_id);
    if (existingInbox) {
      return {
        ok: true,
        queued: true,
        duplicate: true,
        validation_status: String(existingInbox.validation_status || 'PENDING').toUpperCase(),
        turn_id: existingInbox.turn_id,
        event_id: event.event_id,
        ui_feed_id: existingInbox.ui_feed_id || ''
      };
    }

    var now = new Date();
    var turnId = event.turn_id || ('TURN-' + event.event_id);
    appendObject_(inbox, {
      turn_id: turnId,
      chat_id: event.chat_id || 'ECHO-PROJECT',
      received_at: now,
      raw_input: event.raw_input || event.player_action,
      parsed_intent_json: jsonString_(event),
      validation_status: 'PENDING',
      commit_event_id: '',
      ui_feed_id: '',
      error_code: '',
      processed_at: ''
    });

    return {
      ok: true,
      queued: true,
      duplicate: false,
      validation_status: 'PENDING',
      turn_id: turnId,
      event_id: event.event_id,
      contract_version: ECHO_CONTRACT_VERSION
    };
  } finally {
    lock.releaseLock();
  }
}

function findInboxEvent_(sheet, eventId) {
  var rows = readTable_(sheet).rows;
  for (var i = 0; i < rows.length; i++) {
    var parsed = parseJson_(rows[i].parsed_intent_json, null);
    var candidate = parsed && parsed.event ? parsed.event : parsed;
    if (candidate && String(candidate.event_id || '') === String(eventId)) return rows[i];
  }
  return null;
}

function findSceneFeedId_(eventId) {
  var rows = readTable_(getSheet_(ECHO_CONFIG.sheets.sceneFeed)).rows;
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i].event_id || '') === String(eventId)) return rows[i].feed_id || '';
  }
  return '';
}

function setupEchoSchema() {
  var phase2 = echoPhase2EnsureSchema_();
  ensurePreferenceSheets_();
  ensureHeaders_(ECHO_CONFIG.sheets.relationships, [
    'respect', 'tension', 'safety', 'dominance', 'submission',
    'consent_state', 'boundaries_json', 'intimacy_phase', 'intimacy_profile_json',
    'teaching'
  ]);
  ensureHeaders_(ECHO_CONFIG.sheets.eventLog, ['content_rating', 'intimacy_mode', 'resolution_json', 'resolution_mode', 'resolution_outcome']);
  ensureHeaders_(ECHO_CONFIG.sheets.sceneFeed, ['content_rating', 'intimacy_mode', 'scene_blocks_json', 'scene_contract_version', 'resolution_json']);
  return {
    ok: true,
    phase2: phase2,
    message: 'ECHO-Schema geprüft; Phase-2-Projektionstabellen wurden rückwärtskompatibel vorbereitet.'
  };
}

function ensureHeaders_(sheetName, requiredHeaders) {
  var sheet = getSheet_(sheetName);
  var lastColumn = Math.max(1, sheet.getLastColumn());
  var headers = sheet.getRange(1, 1, 1, lastColumn).getDisplayValues()[0].map(function (value) {
    return String(value || '').trim();
  });
  var missing = requiredHeaders.filter(function (header) {
    return headers.indexOf(header) === -1;
  });
  if (!missing.length) return;
  sheet.getRange(1, lastColumn + 1, 1, missing.length).setValues([missing]);
}


function validateRelationshipTargets_(updates) {
  if (!updates || typeof updates !== 'object') return;

  var sheet = getSheet_(ECHO_CONFIG.sheets.relationships);
  Object.keys(updates).forEach(function (stateId) {
    var row = findRow_(sheet, 'state_id', stateId);
    if (!row || !row.__rowNumber) throw new Error('Unknown relationship state_id: ' + stateId);

    var patch = normalizeRelationshipPatch_(updates[stateId] || {}, stateId);
    Object.keys(patch).forEach(function (key) {
      if (!hasHeader_(sheet, key)) throw new Error('Missing relationship column: ' + key);
    });
  });
}

function hasHeader_(sheet, header) {
  return sheet.getRange(1, 1, 1, sheet.getLastColumn()).getDisplayValues()[0].indexOf(header) !== -1;
}

// ===== Sheets and JSON helpers =====

// ECHO Google Sheets storage and serialization helpers.

function appendObject_(sheet, object) {
  var table = readTable_(sheet);
  var row = table.headers.map(function(header) {
    return object[header] === undefined || object[header] === null ? '' : object[header];
  });
  sheet.appendRow(row);
}

function setCellByHeader_(sheet, rowNumber, header, value) {
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getDisplayValues()[0];
  var index = headers.indexOf(header);
  if (index === -1) return;
  sheet.getRange(rowNumber, index + 1).setValue(serializeValue_(value));
}

function findRow_(sheet, header, value) {
  var table = readTable_(sheet);
  for (var i = 0; i < table.rows.length; i++) {
    if (String(table.rows[i][header] || '') === String(value)) return table.rows[i];
  }
  return null;
}

function nextSequence_(sheet, header) {
  var values = readTable_(sheet).rows.map(function(row) { return Number(row[header]); }).filter(function(value) { return isFinite(value); });
  return values.length ? Math.max.apply(null, values) + 1 : 1;
}

function readTable_(sheet) {
  // Keep native numbers and Date values. Display strings can turn timestamps
  // into locale-specific text such as "46261,31773" and break ordering.
  var values = sheet.getDataRange().getValues();
  if (!values.length) return { headers: [], rows: [] };
  var headers = values[0].map(function(header) { return String(header || '').trim(); });
  var rows = [];
  for (var r = 1; r < values.length; r++) {
    var rowValues = values[r];
    if (!rowValues.some(function(value) { return String(value || '').trim() !== ''; })) continue;
    var object = { __rowNumber: r + 1 };
    headers.forEach(function(header, c) {
      if (header) object[header] = rowValues[c] === undefined ? '' : rowValues[c];
    });
    rows.push(object);
  }
  return { headers: headers, rows: rows };
}

function stateTimestamp_(value) {
  if (value instanceof Date) return value.getTime();
  var text = String(value || '').trim();
  if (!text) return 0;
  var parsed = Date.parse(text);
  if (isFinite(parsed)) return parsed;
  var numeric = Number(text.replace(',', '.'));
  return isFinite(numeric) ? numeric : 0;
}

function recordIsNewer_(candidate, current) {
  if (!current) return true;
  var candidateTime = stateTimestamp_(candidate && candidate.updated_at);
  var currentTime = stateTimestamp_(current && current.updated_at);
  if (candidateTime !== currentTime) return candidateTime > currentTime;
  return Number(candidate && candidate.__rowNumber || 0) > Number(current && current.__rowNumber || 0);
}

function canonicalStateKey_(key) {
  var normalized = String(key || '').trim();
  return ECHO_STATE_ALIAS_TO_CANONICAL_[normalized] || normalized;
}

function isLegacyStateKey_(key) {
  return Object.prototype.hasOwnProperty.call(
    ECHO_STATE_ALIAS_TO_CANONICAL_,
    String(key || '').trim()
  );
}

function getStateMap_() {
  var rows = readTable_(getSheet_(ECHO_CONFIG.sheets.state)).rows;
  var result = {};
  rows.forEach(function (row) {
    var rawKey = String(row.state_key || '').trim();
    if (!rawKey || isLegacyStateKey_(rawKey)) return;
    if (recordIsNewer_(row, result[rawKey])) result[rawKey] = row;
  });
  return result;
}

function stateValue_(state, key) {
  var canonical = canonicalStateKey_(key);
  return state[canonical] ? state[canonical].value : '';
}

function parseList_(raw, fallback) {
  var parsed = parseJson_(raw, null);
  return Array.isArray(parsed) ? parsed : fallback;
}

function parseJson_(raw, fallback) {
  if (raw === undefined || raw === null || raw === '') return fallback;
  try { return JSON.parse(raw); } catch (error) { return fallback; }
}

function parseJsonValue_(raw) {
  return JSON.parse(String(raw));
}

function parsePostBody_(e) {
  if (e && e.postData && e.postData.contents) return JSON.parse(e.postData.contents);
  if (e && e.parameter && e.parameter.payload) return JSON.parse(e.parameter.payload);
  return e && e.parameter ? e.parameter : {};
}

function serializeValue_(value) {
  if (value instanceof Date) return value;
  if (typeof value === 'object' && value !== null) return JSON.stringify(value);
  return value;
}

function jsonString_(value) {
  return typeof value === 'string' ? value : JSON.stringify(value === undefined ? {} : value);
}

function requireApiKey_(provided) {
  var expected = PropertiesService.getScriptProperties().getProperty(ECHO_CONFIG.apiKeyProperty);
  if (!expected) throw new Error('ECHO_API_KEY is not configured in Script Properties');
  if (String(provided || '') !== String(expected)) throw new Error('Invalid ECHO_API_KEY');
}

function getSheet_(name) {
  var sheet = echoSpreadsheet_().getSheetByName(name);
  if (!sheet) throw new Error('Missing sheet: ' + name);
  return sheet;
}

/**
 * Resolve the live spreadsheet for both standalone and bound Apps-Script projects.
 * A configured Script Property remains authoritative; bound projects can use their
 * container spreadsheet without an extra manual ID configuration step.
 */
function echoSpreadsheet_() {
  var props = PropertiesService.getScriptProperties();
  var spreadsheetId = String(props.getProperty(ECHO_CONFIG.spreadsheetIdProperty) || '').trim();
  if (spreadsheetId) return SpreadsheetApp.openById(spreadsheetId);

  var active = SpreadsheetApp.getActiveSpreadsheet();
  if (active) return active;

  throw new Error(
    'No spreadsheet configured. Bind the script to the ECHO sheet or set ECHO_SPREADSHEET_ID.'
  );
}

function jsonOutput_(object) {
  return ContentService.createTextOutput(JSON.stringify(object)).setMimeType(ContentService.MimeType.JSON);
}

// ===== Inbox processor and commit layer =====

// ECHO turn processing and persistence commit layer.

/**
 * A correction updates the presentation of an existing scene. It must not create
 * a second timeline event or apply relationship/state deltas a second time.
 */
function sceneTextForCorrection_(event) {
  if (!event || !event.scene) return '';
  return sceneTextFromBlocks_(
    event.scene.scene_blocks_json || event.scene.blocks_json || event.scene.blocks,
    event.scene.narrative_text
  );
}

function sceneTextForOverlay_(scene) {
  if (!scene) return '';
  return sceneTextFromBlocks_(
    scene.scene_blocks_json || scene.blocks_json || scene.blocks,
    scene.narrative_text
  );
}

function sceneBlocksRaw_(raw, strict) {
  var value = raw;
  if (value === undefined || value === null || value === '') return [];

  if (typeof value === 'string') {
    if (!value.trim()) return [];
    try {
      value = JSON.parse(value);
    } catch (error) {
      if (strict) throw new Error('scene blocks must be valid JSON.');
      return [];
    }
  }

  if (!Array.isArray(value)) {
    if (strict) throw new Error('scene blocks must be an array or JSON array.');
    return [];
  }
  return value;
}

function sceneBlockType_(rawType, strict) {
  var raw = String(rawType || 'prose').trim().toLowerCase();
  var type = ECHO_SCENE_BLOCK_TYPE_ALIASES_[raw] || raw;
  if (ECHO_SCENE_BLOCK_TYPES_[type]) return type;
  if (strict) throw new Error('Unknown scene block type: ' + raw);
  return 'prose';
}

function sceneBlockText_(block) {
  if (typeof block === 'string') return block.replace(/\r\n/g, '\n').trim();
  if (!block || typeof block !== 'object') return '';
  return String(
    block.text !== undefined
      ? block.text
      : (block.content !== undefined ? block.content : '')
  ).replace(/\r\n/g, '\n').trim();
}

function normalizeSceneBlocks_(raw, options) {
  options = options || {};
  var strict = options.strict !== false;
  return sceneBlocksRaw_(raw, strict).map(function (block, index) {
    if (typeof block === 'string') {
      var stringText = sceneBlockText_(block);
      if (!stringText) {
        if (strict) throw new Error('scene block ' + index + ' cannot be empty.');
        return null;
      }
      return {
        type: 'prose',
        text: stringText,
        speaker: '',
        character_id: '',
        tone: '',
        emphasis: ''
      };
    }

    if (!block || typeof block !== 'object' || Array.isArray(block)) {
      if (strict) throw new Error('scene block ' + index + ' must be an object or string.');
      return null;
    }

    var text = sceneBlockText_(block);
    if (!text) {
      if (strict) throw new Error('scene block ' + index + ' requires text or content.');
      return null;
    }

    var type = sceneBlockType_(block.type || block.kind || 'prose', strict);
    var visibility = String(block.visibility || 'VISIBLE').trim().toUpperCase();
    if (['HIDDEN', 'INTERNAL', 'SECRET'].indexOf(visibility) !== -1) {
      if (strict) throw new Error('scene block ' + index + ' cannot be hidden in SCENE_FEED.');
      return null;
    }

    var speaker = block.speaker === undefined || block.speaker === null
      ? ''
      : String(block.speaker).trim();
    var characterId = block.character_id || block.characterId || '';
    if (characterId !== '' && typeof characterId !== 'string') {
      characterId = String(characterId);
    }

    return {
      type: type,
      text: text,
      speaker: speaker,
      character_id: String(characterId || '').trim(),
      tone: String(block.tone || '').trim(),
      emphasis: String(block.emphasis || '').trim()
    };
  }).filter(function (block) {
    return !!block;
  });
}

function sceneBlocksFrom_(raw) {
  return normalizeSceneBlocks_(raw, { strict: false });
}

function sceneTextFromBlocks_(raw, fallback) {
  var blocks = sceneBlocksFrom_(raw);
  if (!blocks.length) {
    return String(fallback || '')
      .replace(/\r\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  return blocks.map(function (block) {
    var text = String(block.text || '').trim();
    var type = String(block.type || 'prose').toLowerCase();

    if (type === 'dialogue') {
      var dialogue = text.replace(/^[„"“]+|[“"”]+$/g, '').trim();
      return block.speaker
        ? String(block.speaker).trim() + ': „' + dialogue + '“'
        : '„' + dialogue + '“';
    }
    if (type === 'system') return 'SYSTEM: ' + text;
    if (type === 'change') return 'ÄNDERUNGEN: ' + text;
    if (type === 'status') return 'STATUS: ' + text;
    return text;
  }).filter(function (text) {
    return !!text;
  }).join('\n\n');
}

function sceneBlocksForOverlay_(scene) {
  if (!scene) return [];
  var raw = scene.scene_blocks_json || scene.blocks_json || scene.blocks;
  var blocks = sceneBlocksFrom_(raw);
  if (blocks.length) return blocks;

  var fallback = String(scene.narrative_text || '').trim();
  return fallback
    ? [{ type: 'prose', text: fallback, speaker: '', character_id: '', tone: '', emphasis: '' }]
    : [];
}

function sceneBlocksForStorage_(scene) {
  scene = scene || {};
  var raw = scene.scene_blocks_json !== undefined
    ? scene.scene_blocks_json
    : (scene.blocks_json !== undefined ? scene.blocks_json : scene.blocks);
  var blocks = normalizeSceneBlocks_(raw, { strict: true });
  if (!blocks.length && String(scene.narrative_text || '').trim()) {
    blocks = normalizeSceneBlocks_([scene.narrative_text], { strict: true });
  }
  if (!blocks.length) throw new Error('scene requires at least one visible scene block.');
  return blocks;
}

function validateSceneBlocks_(scene) {
  if (!scene) return;
  var raw = scene.scene_blocks_json !== undefined
    ? scene.scene_blocks_json
    : (scene.blocks_json !== undefined ? scene.blocks_json : scene.blocks);
  if (raw === undefined || raw === null || raw === '') return;
  normalizeSceneBlocks_(raw, { strict: true });
}

var ECHO_RESOLUTION_MODES_ = {
  ROLL: 'ROLL',
  NO_ROLL: 'NO_ROLL',
  NO_CHECK: 'NO_CHECK'
};

var ECHO_RESOLUTION_OUTCOMES_ = {
  CRITICAL_FAILURE: 'CRITICAL_FAILURE',
  FAILURE: 'FAILURE',
  SUCCESS: 'SUCCESS',
  CRITICAL_SUCCESS: 'CRITICAL_SUCCESS'
};

function resolutionRaw_(value) {
  if (value === undefined || value === null || value === '') return {};
  if (typeof value === 'string') {
    var parsed = parseJsonValue_(value);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('resolution must be an object or JSON object.');
    }
    return parsed;
  }
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('resolution must be an object.');
  }
  return value;
}

function resolutionField_(raw, keys, fallback) {
  for (var i = 0; i < keys.length; i++) {
    if (Object.prototype.hasOwnProperty.call(raw, keys[i]) &&
        raw[keys[i]] !== undefined && raw[keys[i]] !== null && raw[keys[i]] !== '') {
      return raw[keys[i]];
    }
  }
  return fallback;
}

function resolutionBoolean_(value) {
  if (value === true || value === 1) return true;
  var normalized = String(value === undefined || value === null ? '' : value)
    .trim()
    .toLowerCase();
  return ['true', '1', 'yes', 'ja', 'y'].indexOf(normalized) !== -1;
}

function resolutionInteger_(value, field, minimum, maximum) {
  if (value === undefined || value === null || value === '') return null;
  var number = Number(value);
  if (!isFinite(number) || Math.floor(number) !== number) {
    throw new Error(field + ' must be an integer.');
  }
  if (number < minimum || number > maximum) {
    throw new Error(field + ' must be between ' + minimum + ' and ' + maximum + '.');
  }
  return number;
}

function resolutionMode_(value, raw) {
  var candidate = String(value || '').trim().toUpperCase().replace(/[\s-]+/g, '_');
  if (!candidate) {
    if (resolutionBoolean_(resolutionField_(raw, ['explicit_no_roll', 'explicitNoRoll', 'no_roll_confirmed'], false))) {
      return ECHO_RESOLUTION_MODES_.NO_ROLL;
    }
    if (resolutionField_(raw, ['d20', 'roll', 'w20', 'dc', 'difficulty', 'sg', 'check', 'check_name', 'skill'], null) !== null) {
      return ECHO_RESOLUTION_MODES_.ROLL;
    }
    return ECHO_RESOLUTION_MODES_.NO_CHECK;
  }

  var aliases = {
    ROLL: ECHO_RESOLUTION_MODES_.ROLL,
    CHECK: ECHO_RESOLUTION_MODES_.ROLL,
    D20: ECHO_RESOLUTION_MODES_.ROLL,
    NO_ROLL: ECHO_RESOLUTION_MODES_.NO_ROLL,
    WITHOUT_ROLL: ECHO_RESOLUTION_MODES_.NO_ROLL,
    WITHOUT_DICE: ECHO_RESOLUTION_MODES_.NO_ROLL,
    NO_DICE: ECHO_RESOLUTION_MODES_.NO_ROLL,
    NO_DICE_ROLL: ECHO_RESOLUTION_MODES_.NO_ROLL,
    EXPLICIT_NO_ROLL: ECHO_RESOLUTION_MODES_.NO_ROLL,
    NO_CHECK: ECHO_RESOLUTION_MODES_.NO_CHECK,
    NONE: ECHO_RESOLUTION_MODES_.NO_CHECK,
    AUTO: ECHO_RESOLUTION_MODES_.NO_CHECK,
    AUTOMATIC: ECHO_RESOLUTION_MODES_.NO_CHECK
  };
  if (!aliases[candidate]) throw new Error('Unknown resolution mode: ' + candidate);
  return aliases[candidate];
}

function resolutionOutcomeFromRoll_(d20, total, dc) {
  if (d20 === 20) return ECHO_RESOLUTION_OUTCOMES_.CRITICAL_SUCCESS;
  if (d20 === 1) return ECHO_RESOLUTION_OUTCOMES_.CRITICAL_FAILURE;
  return total >= dc
    ? ECHO_RESOLUTION_OUTCOMES_.SUCCESS
    : ECHO_RESOLUTION_OUTCOMES_.FAILURE;
}

function resolutionOutcome_(value) {
  var candidate = String(value || '').trim().toUpperCase().replace(/[\s-]+/g, '_');
  var aliases = {
    CRITICAL_SUCCESS: ECHO_RESOLUTION_OUTCOMES_.CRITICAL_SUCCESS,
    CRIT_SUCCESS: ECHO_RESOLUTION_OUTCOMES_.CRITICAL_SUCCESS,
    NATURAL_20: ECHO_RESOLUTION_OUTCOMES_.CRITICAL_SUCCESS,
    NAT20: ECHO_RESOLUTION_OUTCOMES_.CRITICAL_SUCCESS,
    SUCCESS: ECHO_RESOLUTION_OUTCOMES_.SUCCESS,
    SUCCEEDED: ECHO_RESOLUTION_OUTCOMES_.SUCCESS,
    ERFOLG: ECHO_RESOLUTION_OUTCOMES_.SUCCESS,
    CRITICAL_FAILURE: ECHO_RESOLUTION_OUTCOMES_.CRITICAL_FAILURE,
    CRIT_FAILURE: ECHO_RESOLUTION_OUTCOMES_.CRITICAL_FAILURE,
    NATURAL_1: ECHO_RESOLUTION_OUTCOMES_.CRITICAL_FAILURE,
    NAT1: ECHO_RESOLUTION_OUTCOMES_.CRITICAL_FAILURE,
    FAILURE: ECHO_RESOLUTION_OUTCOMES_.FAILURE,
    FAILED: ECHO_RESOLUTION_OUTCOMES_.FAILURE,
    FEHLSCHLAG: ECHO_RESOLUTION_OUTCOMES_.FAILURE
  };
  if (!aliases[candidate]) throw new Error('Unknown resolution outcome: ' + candidate);
  return aliases[candidate];
}

function resolutionOutcomeLabel_(outcome) {
  return {
    CRITICAL_SUCCESS: 'Kritischer Erfolg',
    SUCCESS: 'Erfolg',
    FAILURE: 'Fehlschlag',
    CRITICAL_FAILURE: 'Kritischer Fehlschlag'
  }[outcome] || 'unbekannt';
}

function normalizeResolution_(value) {
  var supplied = !(value === undefined || value === null || value === '');
  var raw = resolutionRaw_(value);
  var mode = resolutionMode_(
    resolutionField_(raw, ['mode', 'roll_mode', 'resolution_mode'], ''),
    raw
  );
  var reason = String(resolutionField_(
    raw,
    ['reason', 'no_roll_reason', 'explanation'],
    ''
  ) || '').trim();
  var source = String(resolutionField_(raw, ['source'], 'ECHO_CHATGPT') || 'ECHO_CHATGPT').trim();

  if (mode === ECHO_RESOLUTION_MODES_.ROLL) {
    var check = String(resolutionField_(
      raw,
      ['check', 'check_name', 'label', 'skill', 'probe', 'attribute'],
      ''
    ) || '').trim();
    if (!check) throw new Error('resolution.check is required for ROLL.');

    var dc = resolutionInteger_(
      resolutionField_(raw, ['dc', 'difficulty', 'sg'], null),
      'resolution.dc',
      1,
      40
    );
    var d20 = resolutionInteger_(
      resolutionField_(raw, ['d20', 'roll', 'w20'], null),
      'resolution.d20',
      1,
      20
    );
    if (dc === null) throw new Error('resolution.dc is required for ROLL.');
    if (d20 === null) throw new Error('resolution.d20 is required for ROLL.');

    var modifier = resolutionInteger_(
      resolutionField_(raw, ['modifier', 'mod', 'bonus', 'check_modifier'], 0),
      'resolution.modifier',
      -50,
      50
    );
    if (modifier === null) modifier = 0;

    var total = d20 + modifier;
    var suppliedTotal = resolutionInteger_(
      resolutionField_(raw, ['total', 'sum', 'result_total'], null),
      'resolution.total',
      -49,
      90
    );
    if (suppliedTotal !== null && suppliedTotal !== total) {
      throw new Error('resolution.total does not match d20 + modifier.');
    }

    var outcome = resolutionOutcomeFromRoll_(d20, total, dc);
    var suppliedOutcome = resolutionField_(raw, ['outcome', 'result'], null);
    if (suppliedOutcome !== null && resolutionOutcome_(suppliedOutcome) !== outcome) {
      throw new Error('resolution.outcome does not match the roll.');
    }

    return {
      version: ECHO_RESOLUTION_CONTRACT_VERSION,
      mode: ECHO_RESOLUTION_MODES_.ROLL,
      check: check,
      dc: dc,
      d20: d20,
      modifier: modifier,
      total: total,
      outcome: outcome,
      source: source || 'ECHO_CHATGPT'
    };
  }

  if (mode === ECHO_RESOLUTION_MODES_.NO_ROLL) {
    var explicitNoRoll = resolutionBoolean_(resolutionField_(
      raw,
      ['explicit_no_roll', 'explicitNoRoll', 'no_roll_confirmed'],
      false
    ));
    if (!explicitNoRoll) {
      throw new Error('NO_ROLL requires explicit_no_roll=true.');
    }
    if (['d20', 'roll', 'w20', 'total', 'sum', 'result_total', 'dc', 'difficulty', 'sg']
      .some(function (key) { return Object.prototype.hasOwnProperty.call(raw, key); })) {
      throw new Error('NO_ROLL cannot contain dice, total or DC fields.');
    }
    if (!reason) throw new Error('resolution.reason is required for NO_ROLL.');

    return {
      version: ECHO_RESOLUTION_CONTRACT_VERSION,
      mode: ECHO_RESOLUTION_MODES_.NO_ROLL,
      explicit_no_roll: true,
      reason: reason,
      source: source || 'ECHO_CHATGPT'
    };
  }

  if (supplied && !reason) {
    throw new Error('resolution.reason is required for NO_CHECK.');
  }

  return {
    version: ECHO_RESOLUTION_CONTRACT_VERSION,
    mode: ECHO_RESOLUTION_MODES_.NO_CHECK,
    reason: reason || 'Keine Probe erforderlich.',
    source: source || 'ECHO_CHATGPT'
  };
}

function resolutionSystemText_(resolution) {
  var normalized = normalizeResolution_(resolution);
  if (normalized.mode === ECHO_RESOLUTION_MODES_.ROLL) {
    var modifierText = normalized.modifier >= 0
      ? '+' + normalized.modifier
      : String(normalized.modifier);
    return 'Probe: ' + normalized.check +
      ' · W20: ' + normalized.d20 +
      ' · Modifikator: ' + modifierText +
      ' · SG: ' + normalized.dc +
      ' · Gesamt: ' + normalized.total +
      ' · Ergebnis: ' + resolutionOutcomeLabel_(normalized.outcome);
  }
  if (normalized.mode === ECHO_RESOLUTION_MODES_.NO_ROLL) {
    return 'Keine Probe erforderlich · ausdrücklich ohne Würfel · ' + normalized.reason;
  }
  return 'Keine Probe erforderlich · ' + normalized.reason;
}

function resolutionSystemBlock_(resolution) {
  return {
    type: 'system',
    text: resolutionSystemText_(resolution),
    speaker: 'SYSTEM',
    character_id: '',
    tone: '',
    emphasis: ''
  };
}

function sceneBlocksWithResolution_(rawBlocks, resolution) {
  var normalizedResolution = normalizeResolution_(resolution);
  var blocks = normalizeSceneBlocks_(rawBlocks, { strict: true });
  var filtered = blocks.filter(function (block) {
    return !(block.type === 'system' &&
      (/^Probe:\s/.test(String(block.text || '')) ||
       /^Keine Probe erforderlich/.test(String(block.text || ''))));
  });
  var insertAt = filtered.length;
  for (var i = 0; i < filtered.length; i++) {
    if (['change', 'status', 'prompt'].indexOf(filtered[i].type) !== -1) {
      insertAt = i;
      break;
    }
  }
  filtered.splice(insertAt, 0, resolutionSystemBlock_(normalizedResolution));
  return filtered;
}

function echoResolutionContract_() {
  return {
    version: ECHO_RESOLUTION_CONTRACT_VERSION,
    modes: [
      {
        mode: ECHO_RESOLUTION_MODES_.ROLL,
        required: ['check', 'dc', 'd20'],
        optional: ['modifier'],
        validation: 'd20 1–20; modifier -50–50; total must equal d20 + modifier; natural 20/1 are critical.'
      },
      {
        mode: ECHO_RESOLUTION_MODES_.NO_ROLL,
        required: ['explicit_no_roll', 'reason'],
        forbidden: ['d20', 'roll', 'total', 'dc', 'difficulty'],
        validation: 'Only an explicitly marked no-roll action may bypass a check.'
      },
      {
        mode: ECHO_RESOLUTION_MODES_.NO_CHECK,
        required: ['reason'],
        validation: 'Use when no uncertain or mechanically relevant check is needed.'
      }
    ],
    persistence: {
      event_log: ['resolution_json', 'resolution_mode', 'resolution_outcome'],
      scene_feed: ['resolution_json'],
      visible_block_type: 'system'
    },
    source_of_truth: 'ECHO_WORKBOOK',
    caller_rule: 'The caller supplies the structured resolution; Apps Script validates and persists it.'
  };
}

function echoGetResolutionContract() {
  return {
    ok: true,
    contract: echoResolutionContract_()
  };
}

function echoOverlayContract_() {
  return {
    version: ECHO_OVERLAY_CONTRACT_VERSION,
    endpoint: 'GET?action=state',
    source_of_truth: 'ECHO_WORKBOOK',
    current_scene: {
      fields: [
        'feedId', 'eventId', 'sceneId', 'revisionId', 'revisionNumber',
        'title', 'narrativeText', 'formattedText', 'text', 'blocks',
        'resolution', 'sceneType', 'status', 'locationId',
        'sceneContractVersion', 'resolutionContractVersion'
      ],
      blocks_source: 'SCENE_FEED.scene_blocks_json',
      rendering_rule: 'Render visible blocks in order; use formattedText/text only as a legacy fallback.'
    },
    chronicle: {
      field: 'chronicle',
      entries_include_blocks: true,
      entries_include_resolution: true
    },
    delivery: {
      chat_response_mode: 'ACK_ONLY',
      success_requires: ['validation_status=COMMITTED', 'ui_feed_id'],
      success_text: 'Übertragen.',
      narrative_destination: 'currentScene',
      no_narrative_in_chat: true
    }
  };
}

function echoGetOverlayContract() {
  return {
    ok: true,
    contract: echoOverlayContract_()
  };
}


function echoProjectionContract_() {
  return {
    version: ECHO_PROJECTION_CONTRACT_VERSION,
    source_of_truth: 'ECHO_WORKBOOK',
    read_rule: 'Rebuild projections from the current workbook context before every turn.',
    unknown_value_rule: 'Unknown values remain null, UNKNOWN or an empty collection until the workbook establishes them.',
    projections: {
      world: {
        source_sheets: ['STATE_SNAPSHOT', 'SCENE_FEED'],
        fields: [
          'available', 'locationId', 'locationLabel', 'chapterId',
          'chapterLabel', 'clock', 'elapsedMinutes', 'knownRegions'
        ]
      },
      characters: {
        source_sheets: [
          'ECHO_CHARACTER_PROFILES', 'RELATIONSHIP_STATE',
          'GROUP_MEMBERS', 'ECHO_PREFERENCE_PROFILE'
        ],
        fields: [
          'entityId', 'displayName', 'status', 'profile',
          'preferenceData', 'relationship', 'memberships', 'groupIds'
        ]
      },
      relationships: {
        source_sheets: ['RELATIONSHIP_STATE', 'ECHO_CHARACTER_PROFILES'],
        fields: [
          'stateId', 'entityA', 'entityB', 'status', 'lastEventId',
          'numericState', 'axes', 'consent', 'boundaries', 'intimacy'
        ]
      },
      groups: {
        source_sheets: ['GROUP_MEMBERS'],
        fields: ['groupId', 'label', 'active', 'memberCount', 'members']
      }
    },
    invariants: [
      'Stable entity IDs come from workbook rows; display labels never replace them.',
      'Stored numeric relationship values are projected only when present in relationship state.',
      'LEFT, INACTIVE and PAUSED memberships are excluded from active group projections.',
      'Consent and boundaries are descriptive state; they never create consent or permission.',
      'Projections never choose a player action, rewrite canon or mutate workbook state.'
    ],
    numeric_relationship_source: 'RELATIONSHIP_STATE',
    player_entity: 'PLAYER'
  };
}

function echoGetProjectionContract() {
  return {
    ok: true,
    contract: echoProjectionContract_()
  };
}

function echoSceneContract_() {
  return {
    version: ECHO_SCENE_CONTRACT_VERSION,
    storage_field: 'scene_blocks_json',
    block_types: Object.keys(ECHO_SCENE_BLOCK_TYPES_),
    aliases: ECHO_SCENE_BLOCK_TYPE_ALIASES_,
    required_block_fields: ['type', 'text'],
    optional_block_fields: ['speaker', 'character_id', 'tone', 'emphasis'],
    order: ['heading', 'prose', 'dialogue', 'action', 'sensory', 'system', 'change', 'status', 'prompt'],
    visibility_rule: 'Only visible blocks may be written to SCENE_FEED.',
    legacy_rule: 'Missing blocks are normalized to one prose block from narrative_text.'
  };
}

function echoGetSceneContract() {
  return {
    ok: true,
    contract: echoSceneContract_(),
    resolution_contract: echoResolutionContract_(),
    overlay_contract: echoOverlayContract_(),
    projection_contract: echoProjectionContract_()
  };
}

function isSceneCorrection_(event) {
  return event &&
    String(event.event_type || '').toUpperCase() === 'SYSTEM_CORRECTION' &&
    String(event.correction_for_turn_id || '').trim() !== '';
}

function isSceneCorrectionRow_(row) {
  if (!row || !row.parsed_intent_json) return false;
  try {
    return isSceneCorrection_(parseJsonValue_(row.parsed_intent_json));
  } catch (error) {
    return false;
  }
}

function validateSceneCorrection_(event) {
  if (!isSceneCorrection_(event)) {
    throw new Error('Invalid scene correction');
  }

  requireNonEmptyString_(event.event_id, 'event_id');
  requireNonEmptyString_(event.player_action, 'player_action');
  requireNonEmptyString_(event.narrative_summary, 'narrative_summary');

  if (!event.scene || typeof event.scene !== 'object' || Array.isArray(event.scene)) {
    throw new Error('scene is required');
  }

  ['feed_id', 'scene_type', 'title', 'location_id', 'narrative_text', 'mood', 'status']
    .forEach(function (key) {
      requireNonEmptyString_(event.scene[key], 'scene.' + key);
    });

  if (event.scene.available_actions_json !== undefined &&
      !Array.isArray(event.scene.available_actions_json)) {
    throw new Error('scene.available_actions_json must be an array');
  }
  validateSceneBlocks_(event.scene);
}

function commitSceneCorrection_(event) {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    echoPhase2EnsureSchema_();
    return commitSceneCorrectionCore_(event, {});
  } finally {
    lock.releaseLock();
  }
}

function processTurnInbox_() {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    echoPhase2EnsureSchema_();
    echoPhase2RecoverTransactions_();

    var sheet = getSheet_(ECHO_CONFIG.sheets.turnInbox);
    var table = readTable_(sheet);
    if (!table.rows.length) return { processed: 0, recovered: 0 };

    var processed = 0;
    var recovered = 0;

    table.rows.forEach(function (row) {
      var status = String(row.validation_status || '').toUpperCase();
      var processingAge = stateTimestamp_(row.locked_at || row.processed_at || row.received_at);
      var staleProcessing = status === 'PROCESSING' &&
        processingAge > 0 &&
        new Date().getTime() - processingAge > 5 * 60 * 1000;

      if (status === 'PROCESSING' && !staleProcessing) return;
      if (staleProcessing) {
        status = 'RECOVERY_REQUIRED';
        recovered += 1;
      }

      var retryableCorrection = status === 'ERROR' &&
        !String(row.processed_at || '').trim() &&
        isSceneCorrectionRow_(row);

      if (['PENDING', 'READY', 'RECOVERY_REQUIRED'].indexOf(status) === -1 && !retryableCorrection) {
        return;
      }

      var eventIdForRecovery = String(row.commit_event_id || '').trim();
      var attempt = Number(row.attempt_count || 0) + 1;
      var token = 'PROC-' + Utilities.getUuid();
      updateTurnInboxRow_(row.__rowNumber, {
        validation_status: 'PROCESSING',
        processing_token: token,
        attempt_count: attempt,
        locked_at: new Date(),
        error_code: ''
      });

      try {
        if (!row.raw_input || !row.parsed_intent_json) {
          throw new Error('raw_input and parsed_intent_json are required');
        }

        var intent = parseJsonValue_(row.parsed_intent_json);
        if (!intent || typeof intent !== 'object') {
          throw new Error('parsed_intent_json is not an object');
        }

        var event = intent.event || intent;
        event.turn_id = event.turn_id || row.turn_id;
        event.chat_id = event.chat_id || row.chat_id;
        event.raw_input = event.raw_input || row.raw_input;
        event.event_id = event.event_id ||
          ('EVT-' + String(row.turn_id || Utilities.getUuid()).replace(/[^A-Za-z0-9_-]/g, ''));
        eventIdForRecovery = String(event.event_id || '');

        var result;
        if (isSceneCorrection_(event)) {
          result = commitSceneCorrectionCore_(event, {
            transactionId: row.transaction_id || ''
          });
        } else {
          validateEventShape_(event);
          result = commitTurnCore_(event, {
            skipInboxAppend: true,
            transactionId: row.transaction_id || ''
          });
        }

        updateTurnInboxRow_(row.__rowNumber, {
          validation_status: 'COMMITTED',
          processing_token: '',
          locked_at: '',
          transaction_id: result.transaction_id || row.transaction_id || '',
          commit_event_id: result.event_id,
          ui_feed_id: result.ui_feed_id || '',
          error_code: '',
          processed_at: new Date()
        });
        processed += 1;
      } catch (error) {
        var transaction = echoPhase2TransactionForEvent_(eventIdForRecovery || row.commit_event_id || '');
        var recoverable = transaction &&
          ['PREPARED', 'APPLYING', 'RECOVERY_REQUIRED'].indexOf(
            String(transaction.status || '').toUpperCase()
          ) !== -1;

        updateTurnInboxRow_(row.__rowNumber, {
          validation_status: recoverable ? 'RECOVERY_REQUIRED' : 'ERROR',
          processing_token: '',
          locked_at: '',
          error_code: String(error && error.message ? error.message : error),
          processed_at: recoverable ? '' : new Date()
        });
      }
    });

    return { processed: processed, recovered: recovered };
  } finally {
    lock.releaseLock();
  }
}

function commitTurn_(event, options) {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    echoPhase2EnsureSchema_();
    return commitTurnCore_(event, options || {});
  } finally {
    lock.releaseLock();
  }
}

function applyStateUpdates_(updates, eventId, now) {
  if (!updates || typeof updates !== 'object') return;

  var inventoryAdded;
  var inventoryRemoved;
  var factsAdded;
  var conditionAdded;
  var conditionRemoved;
  var conditionDuration;

  Object.keys(updates).forEach(function(key) {
    key = canonicalStateKey_(key);
    var value = updates[key];
    switch (key) {
      case 'player.location_id':
        updateStateKey_('player.location_id', value, 'text', 'runtime state', eventId, now);
        break;
      case 'player.known_identity':
        updateStateKey_('player.known_identity', value, 'text', 'runtime state', eventId, now);
        break;
      case 'player.health':
        updateStateKey_('player.health', numericHealth_(value), 'number', 'runtime state', eventId, now);
        break;
      case 'player.health_max':
        updateStateKey_('player.health_max', numericValue_(value, 10), 'number', 'runtime state', eventId, now);
        break;
      case 'world.clock':
        updateStateKey_('world.clock', numericValue_(value, value), 'number', 'runtime state', eventId, now);
        break;
      case 'world.elapsed_minutes':
        updateStateKey_('world.elapsed_minutes', numericValue_(value, value), 'number', 'runtime state', eventId, now);
        break;
      case 'player.resonance_stage':
        updateStateKey_('player.resonance_stage', value, 'text', 'runtime state', eventId, now);
        break;
      case 'player.equipment_main_hand':
        updateStateKey_('player.equipment_main_hand', value, 'text', 'runtime state', eventId, now);
        break;
      case 'player.held_item':
        updateStateKey_('player.held_item', value, 'text', 'runtime state', eventId, now);
        break;
      case 'player.posture':
        updateStateKey_('player.posture', value, 'text', 'runtime state', eventId, now);
        break;
      case 'player.inventory':
        updateStateKey_('player.inventory', value, 'json', 'runtime state', eventId, now);
        break;
      case 'player.known_facts':
        updateStateKey_('player.known_facts', value, 'json', 'runtime state', eventId, now);
        break;
      case 'player.conditions':
        updateStateKey_('player.conditions', value, 'json', 'runtime state', eventId, now);
        break;
      case 'inventory_added':
        inventoryAdded = value;
        break;
      case 'inventory_removed':
        inventoryRemoved = value;
        break;
      case 'known_facts_added':
        factsAdded = value;
        break;
      case 'condition_added':
        conditionAdded = value;
        break;
      case 'condition_removed':
        conditionRemoved = value;
        break;
      case 'condition_duration_scenes':
        conditionDuration = numericValue_(value, null);
        break;
      case 'item_updates':
      case 'group_member_updates':
      case 'group_updates':
        // Phase 2 has dedicated normalized projections for these updates.
        break;
      default:
        updateStateKey_(key, value, valueType_(value), 'runtime state', eventId, now);
    }
  });

  if (inventoryAdded !== undefined || inventoryRemoved !== undefined) {
    var inventory = parseList_(stateValue_(getStateMap_(), 'player.inventory'), []);
    inventory = mergeInventory_(inventory, inventoryAdded, inventoryRemoved);
    updateStateKey_('player.inventory', inventory, 'json', 'runtime state', eventId, now);
  }
  if (factsAdded !== undefined) {
    var facts = parseList_(stateValue_(getStateMap_(), 'player.known_facts'), []);
    updateStateKey_('player.known_facts', mergeUnique_(facts, listValue_(factsAdded)), 'json', 'runtime state', eventId, now);
  }
  if (conditionAdded !== undefined || conditionRemoved !== undefined || conditionDuration !== null && conditionDuration !== undefined) {
    var conditions = parseList_(stateValue_(getStateMap_(), 'player.conditions'), []);
    conditions = mergeConditions_(conditions, conditionAdded, conditionRemoved, conditionDuration, eventId);
    updateStateKey_('player.conditions', conditions, 'json', 'runtime state', eventId, now);
  }
}

function applyRelationshipUpdates_(updates, eventId, now) {
  if (!updates || typeof updates !== 'object') return;
  var sheet = getSheet_(ECHO_CONFIG.sheets.relationships);
  Object.keys(updates).forEach(function(stateId) {
    var row = findRow_(sheet, 'state_id', stateId);
    if (!row || !row.__rowNumber) throw new Error('Unknown relationship state_id: ' + stateId);
    var patch = normalizeRelationshipPatch_(updates[stateId] || {}, stateId);
    Object.keys(patch).forEach(function(key) {
      if (key === 'state_id') return;
      if (!hasHeader_(sheet, key)) throw new Error('Missing relationship column: ' + key);
      setCellByHeader_(sheet, row.__rowNumber, key, patch[key]);
    });
    setCellByHeader_(sheet, row.__rowNumber, 'last_event_id', eventId);
  });
}

function updateStateKey_(key, value, valueType, scope, eventId, now) {
  key = canonicalStateKey_(key);
  var sheet = getSheet_(ECHO_CONFIG.sheets.state);
  var rows = readTable_(sheet).rows.filter(function (candidate) {
    return String(candidate.state_key || '').trim() === key &&
      !isLegacyStateKey_(candidate.state_key);
  });
  var row = null;
  rows.forEach(function (candidate) {
    if (recordIsNewer_(candidate, row)) row = candidate;
  });

  var formatted = serializeValue_(value);
  if (row && row.__rowNumber) {
    setCellByHeader_(sheet, row.__rowNumber, 'value', formatted);
    setCellByHeader_(sheet, row.__rowNumber, 'value_type', valueType);
    setCellByHeader_(sheet, row.__rowNumber, 'last_event_id', eventId || '');
    setCellByHeader_(sheet, row.__rowNumber, 'updated_at', now || new Date());
    return;
  }

  appendObject_(sheet, {
    state_key: key,
    value: formatted,
    value_type: valueType || 'text',
    scope: scope || 'runtime state',
    source: 'ECHO_CHATGPT',
    last_event_id: eventId || '',
    updated_at: now || new Date(),
    record_status: 'CURRENT'
  });
}

function updateTurnInboxRow_(rowNumber, patch) {
  var sheet = getSheet_(ECHO_CONFIG.sheets.turnInbox);
  Object.keys(patch).forEach(function(key) {
    setCellByHeader_(sheet, rowNumber, key, patch[key]);
  });
}


function valueType_(value) {
  return Array.isArray(value) || (value && typeof value === 'object') ? 'json' : (typeof value === 'number' ? 'number' : 'text');
}

function numberOrBlank_(value) {
  if (value === undefined || value === null || value === '') return '';
  var number = Number(value);
  return isFinite(number) ? number : '';
}

function numericValue_(value, fallback) {
  var number = numberOrBlank_(value);
  return number === '' ? fallback : number;
}

function numericHealth_(value) {
  if (typeof value === 'string' && value.indexOf('/') !== -1) value = value.split('/')[0];
  return numericValue_(value, 0);
}

function listValue_(value) {
  if (Array.isArray(value)) return value;
  if (value === undefined || value === null || value === '') return [];
  return [value];
}

function mergeUnique_(base, additions) {
  var result = Array.isArray(base) ? base.slice() : [];
  (Array.isArray(additions) ? additions : [additions]).forEach(function(item) {
    if (item === undefined || item === null || item === '') return;
    var signature = typeof item === 'object' ? JSON.stringify(item) : String(item);
    if (!result.some(function(existing) {
      var existingSignature = typeof existing === 'object' ? JSON.stringify(existing) : String(existing);
      return existingSignature === signature;
    })) result.push(item);
  });
  return result;
}

function inventoryItemKey_(item) {
  if (typeof item === 'string') return 'name:' + item;
  if (!item || typeof item !== 'object') return String(item);
  return String(item.item_id || item.id || item.name || item.label || JSON.stringify(item));
}

function mergeInventory_(base, additions, removals) {
  var result = Array.isArray(base) ? base.slice() : [];
  listValue_(additions).forEach(function(item) {
    if (item === undefined || item === null || item === '') return;
    var key = inventoryItemKey_(item);
    var index = result.findIndex(function(existing) { return inventoryItemKey_(existing) === key; });
    if (index === -1) result.push(item);
    else if (typeof item === 'object' && typeof result[index] === 'object') result[index] = Object.assign({}, result[index], item);
  });
  listValue_(removals).forEach(function(item) {
    var key = inventoryItemKey_(item);
    result = result.filter(function(existing) { return inventoryItemKey_(existing) !== key; });
  });
  return result;
}

function conditionName_(value) {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object') return String(value.name || value.label || '');
  return '';
}

function mergeConditions_(base, additions, removals, duration, eventId) {
  var result = Array.isArray(base) ? base.slice() : [];
  listValue_(removals).forEach(function(item) {
    var name = conditionName_(item);
    result = result.filter(function(existing) { return conditionName_(existing) !== name; });
  });
  listValue_(additions).forEach(function(item) {
    var name = conditionName_(item);
    if (!name) return;
    var index = result.findIndex(function(existing) { return conditionName_(existing) === name; });
    var next = typeof item === 'object' ? Object.assign({}, item) : { name: name };
    if (duration !== null && duration !== undefined && duration !== '') next.remaining_scenes = duration;
    next.applied_by_event = eventId;
    if (index === -1) result.push(next);
    else result[index] = Object.assign({}, result[index], next);
  });
  return result;
}

// ===== Read-only overlay projection =====

// ECHO read-only overlay state projection.
// The projection exposes only facts already present in the private state store.

function overlaySceneDeliveryPayload_(scene) {
  scene = scene || {};
  var formattedText = sceneTextForOverlay_(scene);
  var feedId = String(scene.feed_id || '');
  var eventId = String(scene.event_id || '');
  var sceneId = String(scene.scene_id || feedId);
  var revisionId = String(scene.revision_id || '');
  var revisionNumber = Number(scene.revision_number || 0);

  return {
    feedId: feedId,
    feed_id: feedId,
    eventId: eventId,
    event_id: eventId,
    sceneId: sceneId,
    scene_id: sceneId,
    revisionId: revisionId,
    revision_id: revisionId,
    revisionNumber: revisionNumber,
    revision_number: revisionNumber,
    sequence: Number(scene.sequence || 0),
    title: scene.title || 'Neue Szene',
    narrativeText: formattedText,
    formattedText: formattedText,
    text: formattedText,
    blocks: sceneBlocksForOverlay_(scene),
    resolution: normalizeResolution_(scene.resolution_json),
    sceneType: scene.scene_type || 'narrative',
    scene_type: scene.scene_type || 'narrative',
    status: scene.status || 'PLAY',
    locationId: String(scene.location_id || ''),
    location_id: String(scene.location_id || ''),
    mood: scene.mood || 'unbestimmt',
    contentRating: scene.content_rating || '',
    intimacyMode: scene.intimacy_mode || '',
    availableActions: actionsFromScene_(scene.available_actions_json),
    sceneContractVersion: scene.scene_contract_version || ECHO_SCENE_CONTRACT_VERSION,
    resolutionContractVersion: ECHO_RESOLUTION_CONTRACT_VERSION,
    source: 'SCENE_FEED',
    renderMode: 'BLOCKS_FIRST'
  };
}


/* ===== Phase 4: stable workbook-backed state projections ===== */

function echoPhase4CompareText_(left, right) {
  var a = String(left === undefined || left === null ? '' : left).toLowerCase();
  var b = String(right === undefined || right === null ? '' : right).toLowerCase();
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

function echoPhase4ValueOrNull_(value) {
  return value === undefined || value === null || value === '' ? null : value;
}

function echoPhase4JsonValue_(raw, fallback) {
  if (raw === undefined || raw === null || raw === '') return fallback;
  if (typeof raw === 'string') return parseJson_(raw, fallback);
  return raw;
}

function echoPhase4ListValue_(raw) {
  if (Array.isArray(raw)) return raw.slice();
  var parsed = echoPhase4JsonValue_(raw, null);
  return Array.isArray(parsed) ? parsed : [];
}

function echoPhase4CanonicalEntityId_(entityId, profileByEntity) {
  var id = String(entityId || '').trim();
  var profile = profileByEntity && profileByEntity[id];
  return profile && profile.entityId ? String(profile.entityId) : id;
}

function echoPhase4IsPlayerEntity_(entityId) {
  return String(entityId || '').trim().toUpperCase() === 'PLAYER';
}

function echoPhase4HasTechnicalLabel_(value, entityId) {
  var label = String(value || '').trim();
  if (!label) return true;

  var normalizedLabel = label.toUpperCase().replace(/[ -]+/g, '_');
  var normalizedId = String(entityId || '').trim().toUpperCase().replace(/[ -]+/g, '_');
  if (normalizedId && normalizedLabel === normalizedId) return true;

  return /^[A-Z0-9]+(?:_[A-Z0-9]+)+$/.test(normalizedLabel);
}

function echoPhase4PreferredDisplayName_(row, profile, entityId) {
  if (profile && String(profile.displayName || '').trim()) {
    return String(profile.displayName).trim();
  }

  var rowLabel = String(row && (row.display_name || row.name || '') || '').trim();
  if (rowLabel && !echoPhase4HasTechnicalLabel_(rowLabel, entityId)) return rowLabel;
  return rowLabel || String(entityId || '').trim();
}

function echoPhase4RoleLabel_(role) {
  var value = String(role || '').trim();
  var labels = {
    first_echo_expert_and_dominant_guide: 'ECHO-Expertin · dominante Führerin',
    echo_master: 'ECHO-Expertin',
    dominant_guide: 'dominante Führerin'
  };
  return labels[value] || value.replace(/_/g, ' ');
}

function echoPhase4PreferredRole_(row, profile) {
  if (profile && String(profile.groupRole || '').trim()) {
    return echoPhase4RoleLabel_(profile.groupRole);
  }

  var rowRole = String(row && row.role || '').trim();
  return echoPhase4HasTechnicalLabel_(rowRole, '')
    ? ''
    : echoPhase4RoleLabel_(rowRole);
}

function echoPhase4GroupMembershipActive_(row) {
  var status = String(row && row.status || '').trim().toUpperCase();
  if (!status) return true;
  return ['ACTIVE', 'OPEN', 'CURRENT', 'PLAY', 'NEGOTIATED', 'LOCKED', 'UNINITIALIZED'].indexOf(status) !== -1;
}

function echoPhase4RowIsLater_(candidate, current) {
  if (!current) return true;

  var candidateTime = stateTimestamp_(candidate.updated_at || candidate.timestamp || candidate.created_at);
  var currentTime = stateTimestamp_(current.updated_at || current.timestamp || current.created_at);
  if (candidateTime !== currentTime) return candidateTime > currentTime;

  var candidateRow = Number(candidate.__rowNumber || 0);
  var currentRow = Number(current.__rowNumber || 0);
  return candidateRow >= currentRow;
}

function echoPhase4NonNumericRelationshipAxes_(axes) {
  var output = {};
  Object.keys(axes || {}).forEach(function (key) {
    var value = axes[key];
    if (value === undefined || value === null || value === '') return;
    if (String(value).toLowerCase() === 'unknown') return;
    if (typeof value === 'number' && !isFinite(value)) return;
    if (axisValue_(value) !== null) return;
    output[key] = value;
  });
  return output;
}

function echoPhase4MembershipRole_(row, profile) {
  var rowRole = String(row && row.role || '').trim();
  if (rowRole) return echoPhase4RoleLabel_(rowRole);
  return profile && String(profile.groupRole || '').trim()
    ? echoPhase4RoleLabel_(profile.groupRole)
    : '';
}

function echoPhase4NormalizeMembership_(row, profileByEntity) {
  row = row || {};
  if (!echoPhase4GroupMembershipActive_(row)) return null;

  var rawEntityId = String(row.entity_id || '').trim();
  var groupId = String(row.group_id || '').trim();
  if (!rawEntityId || !groupId || echoPhase4IsPlayerEntity_(rawEntityId)) return null;

  var entityId = echoPhase4CanonicalEntityId_(rawEntityId, profileByEntity);
  if (!entityId || isTechnicalRelationshipPlaceholder_({ entity_b: entityId })) return null;

  var profile = profileByEntity && profileByEntity[entityId];
  var traits = echoPhase4JsonValue_(row.traits_json, {});
  var boundaries = echoPhase4JsonValue_(row.boundaries_json, []);
  if (!traits || typeof traits !== 'object' || Array.isArray(traits)) traits = {};
  if (!Array.isArray(boundaries)) boundaries = [];

  return {
    memberId: echoPhase4ValueOrNull_(row.member_id),
    groupId: groupId,
    entityId: entityId,
    displayName: echoPhase4PreferredDisplayName_(row, profile, entityId),
    role: echoPhase4MembershipRole_(row, profile),
    status: String(row.status || 'ACTIVE').toUpperCase(),
    active: true,
    joinedAt: echoPhase4ValueOrNull_(row.joined_at),
    leftAt: echoPhase4ValueOrNull_(row.left_at),
    position: echoPhase4ValueOrNull_(row.position),
    traits: traits,
    boundaries: boundaries,
    source: 'GROUP_MEMBERS'
  };
}

function echoPhase4MembershipCompare_(left, right) {
  var leftPosition = Number(left.position);
  var rightPosition = Number(right.position);
  var leftHasNumber = left.position !== null && left.position !== '' && isFinite(leftPosition);
  var rightHasNumber = right.position !== null && right.position !== '' && isFinite(rightPosition);

  if (leftHasNumber && rightHasNumber && leftPosition !== rightPosition) {
    return leftPosition - rightPosition;
  }
  if (leftHasNumber !== rightHasNumber) return leftHasNumber ? -1 : 1;

  var groupDiff = echoPhase4CompareText_(left.groupId, right.groupId);
  if (groupDiff) return groupDiff;
  return echoPhase4CompareText_(left.memberId, right.memberId);
}

function echoPhase4GroupMemberships_(rows, profileByEntity) {
  return (rows || [])
    .map(function (row) {
      return echoPhase4NormalizeMembership_(row, profileByEntity);
    })
    .filter(function (membership) {
      return !!membership;
    })
    .sort(echoPhase4MembershipCompare_);
}

function echoPhase4GroupMembershipsByEntity_(rows, profileByEntity) {
  var byEntity = {};
  echoPhase4GroupMemberships_(rows, profileByEntity).forEach(function (membership) {
    if (!byEntity[membership.entityId]) byEntity[membership.entityId] = [];
    byEntity[membership.entityId].push(membership);
  });
  return byEntity;
}

function echoPhase4RelationshipRowsByEntity_(rows, profileByEntity) {
  var latest = {};

  (rows || []).forEach(function (row) {
    var rawEntityId = String(row && (row.entity_b || row.character_id || row.entity_id || '') || '').trim();
    if (!rawEntityId || echoPhase4IsPlayerEntity_(rawEntityId)) return;
    var entityId = echoPhase4CanonicalEntityId_(rawEntityId, profileByEntity);
    if (!entityId || isTechnicalRelationshipPlaceholder_({ entity_b: entityId })) return;

    if (!latest[entityId] || echoPhase4RowIsLater_(row, latest[entityId])) {
      latest[entityId] = row;
    }
  });

  return latest;
}

function echoPhase4RelationshipProfile_(profile) {
  if (!profile) return null;

  return Object.assign({}, profile, {
    relationshipAxes: echoPhase4NonNumericRelationshipAxes_(profile.relationshipAxes || {})
  });
}

function echoPhase4ProjectGroups_(rows, profiles) {
  var profileByEntity = characterProfilesByEntity_(profiles || []);
  var groups = {};

  echoPhase4GroupMemberships_(rows, profileByEntity).forEach(function (membership) {
    if (!groups[membership.groupId]) {
      groups[membership.groupId] = {
        groupId: membership.groupId,
        label: membership.groupId,
        active: true,
        memberCount: 0,
        members: [],
        source: 'GROUP_MEMBERS'
      };
    }
    groups[membership.groupId].members.push(membership);
    groups[membership.groupId].memberCount += 1;
  });

  return Object.keys(groups)
    .sort(echoPhase4CompareText_)
    .map(function (groupId) {
      return groups[groupId];
    });
}

function echoPhase4ProjectCharacters_(relationshipRows, groupRows, profiles, characterPreferences) {
  profiles = Array.isArray(profiles) ? profiles : [];
  characterPreferences = characterPreferences || {};

  var profileByEntity = characterProfilesByEntity_(profiles);
  var relationshipByEntity = echoPhase4RelationshipRowsByEntity_(relationshipRows, profileByEntity);
  var membershipsByEntity = echoPhase4GroupMembershipsByEntity_(groupRows, profileByEntity);
  var entityIds = {};

  profiles.forEach(function (profile) {
    if (!profile || !echoProfileStatusIsActive_(profile.status)) return;
    var entityId = String(profile.entityId || '').trim();
    if (entityId && !echoPhase4IsPlayerEntity_(entityId) &&
        !isTechnicalRelationshipPlaceholder_({ entity_b: entityId })) {
      entityIds[entityId] = true;
    }
  });

  Object.keys(relationshipByEntity).forEach(function (entityId) {
    entityIds[entityId] = true;
  });
  Object.keys(membershipsByEntity).forEach(function (entityId) {
    entityIds[entityId] = true;
  });
  Object.keys(characterPreferences).forEach(function (entityId) {
    var canonical = echoPhase4CanonicalEntityId_(entityId, profileByEntity);
    if (canonical && !echoPhase4IsPlayerEntity_(canonical) &&
        !isTechnicalRelationshipPlaceholder_({ entity_b: canonical })) {
      entityIds[canonical] = true;
    }
  });

  return Object.keys(entityIds)
    .sort(function (left, right) {
      var leftProfile = profileByEntity[left];
      var rightProfile = profileByEntity[right];
      var nameDiff = echoPhase4CompareText_(
        leftProfile && leftProfile.displayName || left,
        rightProfile && rightProfile.displayName || right
      );
      return nameDiff || echoPhase4CompareText_(left, right);
    })
    .map(function (entityId) {
      var profile = profileByEntity[entityId] || null;
      var relationshipRow = relationshipByEntity[entityId] || null;
      var memberships = membershipsByEntity[entityId] || [];
      var displayName = echoPhase4PreferredDisplayName_(relationshipRow, profile, entityId);
      var role = echoPhase4PreferredRole_(relationshipRow, profile);
      var relationshipProfile = echoPhase4RelationshipProfile_(profile);
      var relationshipInput = Object.assign({}, relationshipRow || {}, {
        entity_b: entityId,
        display_name: displayName,
        role: role
      });

      if (!relationshipInput.consent_state && !relationshipInput.consent_profile) {
        relationshipInput.consent_state = 'UNKNOWN';
      }

      var relationshipOverlay = relationshipToOverlay_(relationshipInput, relationshipProfile);
      var profileOverlay = profile ? characterProfileToOverlay_(profile) : null;
      var preferenceData = profile && profile.preferences
        ? profile.preferences
        : (characterPreferences[entityId] || {});

      return {
        entityId: entityId,
        displayName: displayName,
        status: profile ? echoPhase4ValueOrNull_(profile.status) : null,
        role: role || null,
        available: true,
        source: relationshipRow && profile
          ? 'ECHO_CHARACTER_PROFILES+RELATIONSHIP_STATE'
          : (profile ? 'ECHO_CHARACTER_PROFILES' : (relationshipRow ? 'RELATIONSHIP_STATE' : 'GROUP_MEMBERS/ECHO_PREFERENCE_PROFILE')),
        profile: profileOverlay,
        preferenceData: preferenceData,
        relationship: {
          available: !!relationshipRow,
          stateId: relationshipRow ? echoPhase4ValueOrNull_(relationshipRow.state_id) : null,
          entityA: relationshipRow ? echoPhase4ValueOrNull_(relationshipRow.entity_a) : null,
          entityB: entityId,
          status: relationshipRow ? echoPhase4ValueOrNull_(relationshipRow.status) : null,
          lastEventId: relationshipRow ? echoPhase4ValueOrNull_(relationshipRow.last_event_id) : null,
          updatedAt: relationshipRow ? echoPhase4ValueOrNull_(relationshipRow.updated_at) : null,
          numericState: relationshipOverlay.stats.numericState,
          axes: relationshipOverlay.stats.axes,
          exactNumbersHidden: relationshipOverlay.stats.exactNumbersHidden,
          consent: relationshipOverlay.stats.consent,
          boundaries: relationshipOverlay.intimacy.boundaries || [],
          intimacy: relationshipOverlay.intimacy,
          overlay: relationshipOverlay
        },
        memberships: memberships,
        groupIds: memberships.map(function (membership) { return membership.groupId; }),
        groupRoles: memberships.map(function (membership) { return membership.role; })
      };
    });
}

function echoPhase4WorldProjection_(state, scene) {
  state = state || {};
  scene = scene || {};

  var stateLocationId = String(stateValue_(state, 'player.location_id') || '').trim();
  var sceneLocationId = String(scene.location_id || '').trim();
  var locationId = stateLocationId || sceneLocationId;
  var locationSource = stateLocationId ? 'STATE_SNAPSHOT' : (sceneLocationId ? 'SCENE_FEED' : 'STATE_SNAPSHOT');

  var chapterId = echoPhase4ValueOrNull_(stateValue_(state, 'story.chapter_id'));
  var chapterLabel = echoPhase4ValueOrNull_(stateValue_(state, 'story.chapter_label'));
  var clock = echoPhase4ValueOrNull_(stateValue_(state, 'world.clock'));
  var elapsedMinutes = echoPhase4ValueOrNull_(stateValue_(state, 'world.elapsed_minutes'));
  var knownRegions = echoPhase4ListValue_(stateValue_(state, 'world.known_regions'));

  return {
    available: !!(locationId || chapterId !== null || chapterLabel !== null ||
      clock !== null || elapsedMinutes !== null || knownRegions.length),
    source: locationSource,
    locationId: locationId || null,
    locationLabel: locationId ? locationLabel_(locationId) : null,
    chapterId: chapterId,
    chapterLabel: chapterLabel,
    clock: clock,
    elapsedMinutes: elapsedMinutes,
    knownRegions: knownRegions
  };
}

function echoPhase4BuildProjections_(state, scene, relationshipRows, groupRows, preferenceContext, warnings) {
  preferenceContext = preferenceContext || {};
  var profiles = Array.isArray(preferenceContext.characters) ? preferenceContext.characters : [];
  var characterPreferences = preferenceContext.characterPreferences || {};
  var characters = echoPhase4ProjectCharacters_(
    relationshipRows,
    groupRows,
    profiles,
    characterPreferences
  );
  var groups = echoPhase4ProjectGroups_(groupRows, profiles);
  var relationships = characters.map(function (character) {
    return character.relationship;
  });

  return {
    version: ECHO_PROJECTION_CONTRACT_VERSION,
    source: 'ECHO_WORKBOOK',
    world: echoPhase4WorldProjection_(state, scene),
    characters: characters,
    relationships: relationships,
    groups: groups,
    profileCount: profiles.length,
    relationshipCount: relationships.length,
    groupCount: groups.length,
    warnings: warnings || []
  };
}

function getOverlayState_() {
  var state = getStateMap_();
  var overlayWarnings = [];
  var sceneRows = readOverlayRows_(ECHO_CONFIG.sheets.sceneFeed, overlayWarnings);
  var eventRows = readOverlayRows_(ECHO_CONFIG.sheets.eventLog, overlayWarnings);
  var relationshipRows = readOverlayRows_(ECHO_CONFIG.sheets.relationships, overlayWarnings);
  var threadRows = readOverlayRows_(ECHO_CONFIG.sheets.threads, overlayWarnings);
  var preferenceContext = getEchoPreferenceContext_({ includeAudit: false });
  var groupMembers = echoPhase2GroupMembersForContext_(overlayWarnings);

  var playableScenes = echoPhase2EffectiveSceneRows_(sceneRows.filter(isPlayableScene_));
  var scene = latestBySequence_(playableScenes) || {};
  var events = eventRows.filter(function (row) { return row.event_id; }).slice().sort(sequenceAscending_);
  var latestEvent = events.length ? events[events.length - 1] : null;
  var projections = echoPhase4BuildProjections_(
    state,
    scene,
    relationshipRows,
    groupMembers,
    preferenceContext,
    overlayWarnings
  );

  var locationId = stateValue_(state, 'player.location_id') || scene.location_id || 'UNKNOWN_LOCATION';
  var health = numberOrBlank_(stateValue_(state, 'player.health'));
  var healthMax = numberOrBlank_(stateValue_(state, 'player.health_max'));
  if (healthMax === '' || healthMax <= 0) healthMax = 10;
  var conditions = parseList_(stateValue_(state, 'player.conditions'), []);
  var itemOwnership = itemOwnershipProjection_(state, overlayWarnings);
  var echoMastery = echoMasteryValue_(stateValue_(state, 'player.echo_mastery_profile'));
  var memoryState = localizeMemory_(stateValue_(state, 'player.memory_state') || 'NO_MEMORY');
  var currentLocation = locationLabel_(locationId);

  var currentScene = overlaySceneDeliveryPayload_(scene);
  currentScene.chapterLabel = chapterLabel_(state);
  currentScene.title = scene.title || 'Aktuelle Szene';
  currentScene.moodTag = localizeMood_(scene.mood || 'unbestimmt');
  if (!currentScene.text) {
    currentScene.text = 'Noch keine sichtbare Szene im persistenten Spielstand.';
    currentScene.narrativeText = currentScene.text;
    currentScene.formattedText = currentScene.text;
  }
  currentScene.location = currentLocation;
  currentScene.locationLabel = currentLocation;
  currentScene.locationId = locationId;

  var conditionNames = conditions.map(conditionName_).filter(function (name) { return !!name; });
  var currentHealth = health === '' ? null : Number(health);

  return {
    source: 'google-apps-script',
    stateModelVersion: ECHO_STATE_MODEL_VERSION,
    build: ECHO_BUILD_ID,
    overlayWarnings: overlayWarnings,
    generated_at: new Date().toISOString(),
    currentScene: currentScene,
    sceneActions: actionsFromScene_(scene.available_actions_json),
    chronicle: chronicleFrom_(playableScenes, events),
    lastConsequence: latestEvent ? (latestEvent.narrative_summary || null) : null,
    lastEventId: latestEvent ? latestEvent.event_id : '',
    lastFeedId: scene.feed_id || '',
    echoMastery: echoMastery,
    // Compatibility aliases for existing overlay clients. The readable label
    // is exposed separately from the canonical location ID.
    location: currentLocation,
    locationLabel: currentLocation,
    locationId: locationId,
    player: {
      name: stateValue_(state, 'player.name') || 'Namenlos',
      location: currentLocation,
      locationLabel: currentLocation,
      locationName: currentLocation,
      locationId: locationId,
      species: stateValue_(state, 'player.species') || 'unbekannt',
      tags: playerTags_(state, echoMastery),
      health: currentHealth,
      healthMax: healthMax,
      healthPercent: currentHealth === null ? null : Math.max(0, Math.min(100, currentHealth / healthMax * 100)),
      healthDescription: currentHealth === null
        ? 'Spürbar, aber unklar — Zustand unbestimmt.'
        : String(currentHealth) + ' von ' + String(healthMax) + ' Lebensenergie.',
      conditions: conditions,
      equipmentMainHand: stateValue_(state, 'player.equipment_main_hand') || '',
      heldItem: itemOwnership.playerHeldItem || '',
      posture: stateValue_(state, 'player.posture') || ''
    },
    stateSummary: {
      memory: memoryState,
      location: currentLocation,
      locationLabel: currentLocation,
      locationName: currentLocation,
      locationId: locationId,
      condition: currentHealth === null
        ? 'unbestimmt'
        : (currentHealth <= 0 ? 'bewusstlos' : (conditionNames.length ? conditionNames.join(' · ') : 'lebensfähig')),
      clockLabel: 'Weltuhr: ' + (stateValue_(state, 'world.clock') || 'unbekannt') + ' · pausiert zwischen Zügen.'
    },
    knownFacts: parseList_(stateValue_(state, 'player.known_facts'), []),
    inventory: itemOwnership.inventory || inventoryFrom_(stateValue_(state, 'player.inventory')),
    itemOwnership: itemOwnership.items,
    groupMembers: groupMembers,
    relationships: echoRelationshipOverlays_(relationshipRows, preferenceContext.characters),
    projections: projections,
    worldProjection: projections.world,
    characterProjections: projections.characters,
    groupProjections: projections.groups,
    relationshipProjections: projections.relationships,
    characters: projections.characters,
    groups: projections.groups,

    relationshipProfiles: preferenceContext.characters
      .filter(function (profile) {
        return !isTechnicalRelationshipPlaceholder_({ entity_b: profile.entityId });
      })
      .map(characterProfileToOverlay_),
    chatDelivery: echoChatDeliveryPolicy_(),
    preferenceContext: preferenceContext,
    threads: threadRows.filter(isVisibleThread_).map(threadToOverlay_),
    mapRegions: mapRegions_(state, locationId),
    selectedMapRegion: mapRegionIdForLocation_(locationId),
    chapters: chaptersFrom_(state),
    sceneContract: echoSceneContract_(),
    resolutionContract: echoResolutionContract_(),
    overlayContract: echoOverlayContract_(),
    projectionContract: echoProjectionContract_()
  };
}

function readOverlayRows_(sheetName, warnings) {
  try {
    return readTable_(getSheet_(sheetName)).rows;
  } catch (error) {
    warnings.push({
      sheet: sheetName,
      message: String(error && error.message ? error.message : error)
    });
    return [];
  }
}

function latestBySequence_(rows) {
  return rows.slice().sort(function (a, b) {
    var sequenceDiff = Number(b.sequence || 0) - Number(a.sequence || 0);
    if (sequenceDiff) return sequenceDiff;
    var timeDiff = stateTimestamp_(b.updated_at || b.timestamp) -
      stateTimestamp_(a.updated_at || a.timestamp);
    if (timeDiff) return timeDiff;
    return Number(b.__rowNumber || 0) - Number(a.__rowNumber || 0);
  })[0] || null;
}

function sequenceAscending_(a, b) {
  return Number(a.sequence || 0) - Number(b.sequence || 0);
}

function isPlayableScene_(row) {
  return row && row.feed_id && String(row.status || 'PLAY').toUpperCase() !== 'ARCHIVED';
}

function isVisibleThread_(row) {
  var status = String(row.status || 'OPEN').toUpperCase();
  return status !== 'ARCHIVED' && status !== 'HIDDEN';
}


function relationshipNote_(row, profile) {
  var note = String((row && row.notes) || (profile && profile.notes) || '').trim();
  var normalized = note.toLowerCase();

  if (
    normalized.indexOf('current numerical state') !== -1 ||
    normalized.indexOf('numerischer beziehungszustand') !== -1 ||
    normalized.indexOf('profil angelegt') !== -1
  ) {
    return 'Profil hinterlegt; numerische Beziehungswerte werden erst durch ausgespielte Ereignisse festgelegt.';
  }

  return note;
}

function profileHasDisplayData_(profile) {
  if (!profile) return false;

  return !!(
    profile.displayName ||
    profile.groupRole ||
    profile.primaryExpertise ||
    profile.secondaryExpertise ||
    profile.initiationStyle ||
    profile.aftercareStyle ||
    (Array.isArray(profile.dominanceStyles) && profile.dominanceStyles.length) ||
    (Array.isArray(profile.intimacyStyles) && profile.intimacyStyles.length) ||
    (Array.isArray(profile.boundaries) && profile.boundaries.length) ||
    Object.keys(profile.magicResonance || {}).length ||
    Object.keys(profile.groupPosition || {}).length ||
    Object.keys(profile.preferences || {}).length
  );
}

function localizeRelationshipProfileText_(value) {
  var text = String(value || '').trim();
  var labels = {
    stable_high_with_growing_teacher_student_intimacy_and_personal_vulnerability:
      'hoch und stabil; persönliche Verletzlichkeit und Lehrer-Schüler-Intimität wachsen',
    deepening_through_personal_truth_and_stillness_under_guidance:
      'vertieft sich durch persönliche Wahrheiten und stilles Befolgen ihrer Führung',
    very_strong_mutual_dark_romance_tension_nonexplicit:
      'sehr starke gegenseitige Dark-Romance-Spannung (nicht grafisch)',
    controlled_dark_romance_tension:
      'kontrollierte Dark-Romance-Spannung',
    truth_shared_and_stillness_under_guidance_continues:
      'Wahrheit geteilt; stille Führung setzt sich fort'
  };

  if (labels[text]) return labels[text];
  return /^[a-z0-9_-]+$/.test(text) ? text.replace(/_/g, ' ') : text;
}

function relationshipTextValue_(value) {
  if (value === undefined || value === null || value === '') return '';

  if (Array.isArray(value)) {
    return value.map(relationshipTextValue_).filter(function (item) {
      return !!item;
    }).join(', ');
  }

  if (typeof value === 'object') {
    var candidate = value.label || value.text || value.description || value.value;
    if (candidate !== undefined && candidate !== null && candidate !== '') {
      return relationshipTextValue_(candidate);
    }
    return JSON.stringify(value);
  }

  return localizeRelationshipProfileText_(value);
}

function relationshipQualitativeStats_(row, profile, intimacyProfile) {
  var sources = [];

  function addSource(source) {
    if (!source || typeof source !== 'object' || Array.isArray(source)) return;
    sources.push(source);
    ['relationship', 'relationship_state', 'qualitative', 'intimacy'].forEach(function (key) {
      if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
        sources.push(source[key]);
      }
    });
  }

  addSource(intimacyProfile);
  addSource(row || {});
  addSource(profile && profile.relationshipAxes);
  addSource(profile && profile.preferences);

  var definitions = [
    { key: 'trust', label: 'Vertrauen', sourceKeys: ['trust'] },
    { key: 'desire', label: 'Verlangen', sourceKeys: ['desire'] },
    { key: 'respect', label: 'Respekt', sourceKeys: ['respect'] },
    { key: 'tension', label: 'Spannung', sourceKeys: ['tension'] },
    { key: 'intimacy', label: 'Intimität', sourceKeys: ['intimacy'] },
    { key: 'fear', label: 'Angst', sourceKeys: ['fear'] },
    { key: 'dominance', label: 'Dominanz', sourceKeys: ['dominance'] },
    { key: 'resonance', label: 'Resonanz', sourceKeys: ['resonance'] },
    { key: 'teaching', label: 'Lehre', sourceKeys: ['teaching'] },
    { key: 'phase', label: 'Phase', sourceKeys: ['phase', 'intimacy_phase'] },
    { key: 'latest_truth', label: 'Letzte Wahrheit', sourceKeys: ['latest_truth'] },
    { key: 'summary', label: 'Einordnung', sourceKeys: ['summary', 'relationship_summary', 'current_summary'] }
  ];

  return definitions.map(function (definition) {
    var found = null;

    for (var i = 0; i < sources.length && found === null; i++) {
      for (var k = 0; k < definition.sourceKeys.length; k++) {
        var candidate = sources[i][definition.sourceKeys[k]];
        if (candidate === undefined || candidate === null || candidate === '') continue;
        if (typeof candidate === 'number') continue;

        var valueText = relationshipTextValue_(candidate);
        if (!valueText || valueText.toLowerCase() === 'unknown') continue;
        found = {
          key: definition.key,
          label: definition.label,
          value: candidate,
          valueText: valueText
        };
        break;
      }
    }

    return found;
  }).filter(function (item) {
    return !!item;
  });
}

function relationshipToOverlay_(row, profile) {
  row = row || {};
  profile = profile || {};
  var profileAxes = profile.relationshipAxes || {};
  var intimacyProfile = profileJsonObject_(row.intimacy_profile_json, {});
  var boundaries = parseJson_(row.boundaries_json, []);
  if (!Array.isArray(boundaries) || !boundaries.length) {
    boundaries = Array.isArray(profile.boundaries) ? profile.boundaries : [];
  }

  var consentState = relationshipConsentState_(row, intimacyProfile);
  var axisOrProfile = function (rowValue, profileKey) {
    var direct = axisValue_(rowValue);
    return direct !== null ? direct : axisValue_(profileAxes[profileKey]);
  };
  var axisDefinitions = [
    { key: 'trust', label: 'Vertrauen' },
    { key: 'desire', label: 'Verlangen' },
    { key: 'respect', label: 'Respekt' },
    { key: 'tension', label: 'Spannung' },
    { key: 'intimacy', label: 'Intimität' },
    { key: 'fear', label: 'Angst' },
    { key: 'dominance', label: 'Dominanz' },
    { key: 'resonance', label: 'Resonanz' }
  ];
  var allAxes = axisDefinitions.map(function (definition) {
    return {
      key: definition.key,
      label: definition.label,
      value: axisOrProfile(row[definition.key], definition.key)
    };
  });
  var visibleAxes = allAxes.filter(function (axis) { return axis.value !== null; });
  var qualitativeStats = relationshipQualitativeStats_(row, profile, intimacyProfile);
  var role = echoRelationshipRoleLabel_(row, profile);
  var summary = echoRelationshipSummary_(role, profile, consentState, allAxes, qualitativeStats);
  var displayRole = echoRelationshipCompactRole_(role, profile, allAxes, qualitativeStats);
  var profileLoaded = profileHasDisplayData_(profile) || qualitativeStats.length > 0;

  return {
    id: row.state_id || profile.entityId || row.entity_b || 'UNKNOWN_RELATIONSHIP',
    name: row.display_name || profile.displayName || row.entity_b || 'Unbekannte Bindung',
    role: displayRole,
    baseRole: role,
    note: [relationshipNote_(row, profile), summary].filter(function (value) {
      return !!value;
    }).join(' · '),
    summary: summary,
    axes: visibleAxes,
    stats: {
      displayMode: 'compact',
      exactNumbersHidden: true,
      profileLoaded: profileLoaded,
      numericState: visibleAxes.length ? 'partially_established' : 'not_established',
      numericStateLabel: visibleAxes.length
        ? 'teilweise erspielt'
        : (profileLoaded ? 'Profilwerte hinterlegt; numerische Werte entwickeln sich im Spiel' : 'noch nicht erspielt'),
      axes: allAxes.map(function (axis) {
        return {
          key: axis.key,
          label: axis.label,
          valueText: echoRelationshipAxisText_(axis.value),
          established: axis.value !== null
        };
      }),
      qualitative: qualitativeStats,
      powerStatus: profile.dominanceStyles && profile.dominanceStyles.length
        ? 'dominant'
        : 'noch nicht festgelegt',
      dominanceStyles: profile.dominanceStyles || [],
      role: role,
      compactRole: displayRole,
      expertise: {
        primary: profile.primaryExpertise || '',
        secondary: profile.secondaryExpertise || ''
      },
      magic: profile.magicResonance || {},
      consent: {
        state: consentState,
        label: consentLabel_(consentState)
      }
    },
    intimacy: {
      available: consentState !== 'UNKNOWN' || visibleAxes.some(function (axis) {
        return ['tension', 'desire', 'intimacy'].indexOf(axis.key) !== -1;
      }),
      consentState: consentState,
      consentLabel: consentLabel_(consentState),
      tension: axisOrProfile(row.tension, 'tension') !== null
        ? axisOrProfile(row.tension, 'tension')
        : axisOrProfile(row.intimacy, 'intimacy'),
      dominance: axisOrProfile(row.dominance, 'dominance'),
      submission: axisOrProfile(row.submission, 'submission'),
      dominanceStyles: profile.dominanceStyles || [],
      intimacyStyles: profile.intimacyStyles || [],
      initiationStyle: profile.initiationStyle || '',
      aftercareStyle: profile.aftercareStyle || '',
      boundaries: boundaries,
      phase: row.intimacy_phase || intimacyProfile.phase || '',
      qualitative: qualitativeStats,
      profileLoaded: profileLoaded
    }
  };
}


function relationshipConsentState_(row, intimacyProfile) {
  var raw = row.consent_state || row.consent_profile || intimacyProfile.consent_state || 'UNKNOWN';
  var normalized = String(raw || 'UNKNOWN').toUpperCase();
  return { UNKNOWN: true, OPEN: true, NEGOTIATED: true, PAUSED: true, REVOKED: true }[normalized]
    ? normalized
    : 'UNKNOWN';
}

function threadToOverlay_(row) {
  var priority = String(row.priority || '').toLowerCase();
  return {
    id: row.thread_id || row.thread_key || 'THREAD',
    label: row.question || row.label || row.thread_key || 'Offener Faden',
    priority: priority === 'high' || priority === 'hoch' ? 'hoch' : 'mittel',
    flag: String(row.status || 'OPEN').toUpperCase() === 'OPEN' ? 'offen' : ''
  };
}

function axisValue_(value) {
  if (value === undefined || value === null || value === '' || String(value).toLowerCase() === 'unknown') return null;
  var number = Number(value);
  return isFinite(number) ? Math.max(0, Math.min(100, number)) : null;
}

function actionsFromScene_(raw) {
  var actions = parseJson_(raw, []);
  if (!Array.isArray(actions)) return [];
  return actions.map(function (action) {
    return {
      id: action.id || 'ACT',
      label: action.label || 'Möglicher Ansatz',
      kind: 'suggestion'
    };
  }).filter(function (action) {
    return action.id !== 'ACT_FREE' && action.id !== 'ACT-FREE';
  });
}

function chronicleFrom_(scenes, events) {
  var entries = [];
  var sceneEventIds = {};

  scenes.slice().sort(sequenceAscending_).forEach(function (scene) {
    var delivery = overlaySceneDeliveryPayload_(scene);
    sceneEventIds[String(scene.event_id || '')] = true;
    entries.push({
      id: delivery.feedId,
      title: delivery.title,
      text: delivery.text,
      narrativeText: delivery.narrativeText,
      formattedText: delivery.formattedText,
      blocks: delivery.blocks,
      resolution: delivery.resolution,
      sceneType: delivery.sceneType,
      status: delivery.status,
      locationId: delivery.locationId,
      sceneContractVersion: delivery.sceneContractVersion,
      fiction: String(delivery.sceneType || '').toLowerCase() !== 'system'
    });
  });

  events.forEach(function (event) {
    if (sceneEventIds[String(event.event_id || '')]) return;
    entries.push({
      id: event.event_id,
      title: 'Ereignis ' + (event.sequence || ''),
      text: event.narrative_summary || event.player_action || '',
      narrativeText: event.narrative_summary || event.player_action || '',
      formattedText: event.narrative_summary || event.player_action || '',
      blocks: [],
      resolution: null,
      sceneType: 'event',
      status: 'COMMITTED',
      locationId: '',
      fiction: true
    });
  });

  return entries;
}


function normalizedItemIdentity_(item) {
  if (item && typeof item === 'object') {
    return String(item.item_id || item.id || item.name || item.label || '').trim();
  }
  return String(item || '').trim();
}

function inventoryContainsItem_(inventory, itemId) {
  var target = String(itemId || '').trim();
  return (Array.isArray(inventory) ? inventory : []).some(function (item) {
    return normalizedItemIdentity_(item) === target;
  });
}

function itemOwnershipProjection_(state, warnings) {
  warnings = warnings || [];
  var normalized = echoPhase2ItemProjection_(warnings);
  if (normalized.available && normalized.hasRows) {
    return {
      playerHeldItem: normalized.playerHeldItem,
      items: normalized.items,
      inventory: normalized.inventory,
      source: 'ITEM_STATE'
    };
  }

  var inventory = parseList_(stateValue_(state, 'player.inventory'), []);
  var owners = {};

  function add(itemId, ownerEntityId, source) {
    var id = normalizedItemIdentity_(itemId);
    if (!id) return;
    var existing = owners[id];
    if (existing && existing.ownerEntityId !== ownerEntityId) {
      existing.conflict = true;
      warnings.push({
        code: 'CONSISTENCY_WARNING',
        field: 'item_owner',
        item_id: id,
        message: 'Mehrere Besitzer für denselben Gegenstand: ' + id
      });
      return;
    }
    owners[id] = existing || {
      itemId: id,
      ownerEntityId: ownerEntityId,
      source: source,
      conflict: false
    };
  }

  inventory.forEach(function (item) {
    add(item, 'PLAYER', 'player.inventory');
  });

  var playerHeld = String(stateValue_(state, 'player.held_item') || '').trim();
  if (playerHeld && inventoryContainsItem_(inventory, playerHeld)) {
    add(playerHeld, 'PLAYER', 'player.held_item');
  } else if (playerHeld) {
    warnings.push({
      code: 'CONSISTENCY_WARNING',
      field: 'player.held_item',
      item_id: playerHeld,
      message: 'player.held_item wird ignoriert, weil der Gegenstand nicht im Spielerinventar liegt.'
    });
  }

  Object.keys(state || {}).forEach(function (key) {
    if (!/^[A-Za-z0-9_-]+\.held_item$/.test(key) || key === 'player.held_item') return;
    var held = String(stateValue_(state, key) || '').trim();
    if (held) add(held, key.replace(/\.held_item$/, ''), key);
  });

  var items = Object.keys(owners).map(function (id) { return owners[id]; });
  var projectedPlayerHeld = items.filter(function (item) {
    return item.ownerEntityId === 'PLAYER' && item.source === 'player.held_item';
  })[0];

  return {
    playerHeldItem: projectedPlayerHeld ? projectedPlayerHeld.itemId : '',
    items: items,
    inventory: inventoryFrom_(stateValue_(state, 'player.inventory')),
    source: 'STATE_SNAPSHOT'
  };
}

function inventoryFrom_(raw) {
  var list = parseJson_(raw, []);
  if (!Array.isArray(list)) return [];
  return list.map(function (item, index) {
    if (typeof item === 'string') return { id: 'I' + index, name: item, desc: '' };
    return {
      id: item.item_id || item.id || 'I' + index,
      name: item.name || item.label || 'Unbekannter Gegenstand',
      desc: item.desc || item.description || ''
    };
  });
}

function playerTags_(state, echoMastery) {
  var tags = [];
  if ((stateValue_(state, 'player.memory_state') || 'NO_MEMORY') === 'NO_MEMORY') tags.push('Keine Erinnerung');
  var health = numberOrBlank_(stateValue_(state, 'player.health'));
  if (health !== '' && health <= 0) tags.push('Bewusstlos');
  if (health === '') tags.push('Zustand unbestimmt');
  tags.push(echoMastery < 25 ? 'ECHO instabil' : 'ECHO erwacht');
  return tags;
}

function mapRegions_(state, locationId) {
  var regions = parseList_(stateValue_(state, 'world.known_regions'), []);
  var currentId = mapRegionIdForLocation_(locationId);
  var current = {
    id: currentId,
    name: locationLabel_(locationId),
    state: 'current',
    x: 50,
    y: 50,
    note: 'Aktueller Ort im persistenten Spielstand.'
  };

  var mapped = regions.filter(function (region) {
    return region && region.id && String(region.id) !== String(currentId);
  }).map(function (region) {
    return {
      id: region.id,
      name: region.name || region.id,
      state: region.state || 'known',
      x: Number(region.x) || 50,
      y: Number(region.y) || 50,
      note: region.note || ''
    };
  });

  return [current].concat(mapped);
}

function locationLabel_(id) {
  return {
    PRISON_CITY: 'Die Gefängnisstadt',
    LOC_VAEL_THARYN_AWAKENING: 'Vael Tharyn · Erwachungskammer',
    LOC_VAEL_THARYN_HIDDEN_WALL_HOLLOW: 'Vael Tharyn · Verborgene Mauerspalte',
    ASHFEN: 'Aschfenn',
    GRAUKUESTE: 'Graue Küste',
    RUINENWALD: 'Ruinenwald'
  }[id] || id || 'Unbekannter Ort';
}

function mapRegionIdForLocation_(locationId) {
  if (String(locationId || '').indexOf('VAEL_THARYN') !== -1) return 'PRISON_CITY';
  return locationId || 'UNKNOWN_LOCATION';
}

function chaptersFrom_(state) {
  var stored = parseList_(stateValue_(state, 'story.chapters'), []);
  if (stored.length) return stored;
  return [{
    id: stateValue_(state, 'story.chapter_id') || 1,
    label: chapterLabel_(state),
    locked: false
  }];
}

function chapterLabel_(state) {
  var stored = String(stateValue_(state, 'story.chapter_label') || '').trim();
  if (stored) return stored;

  var raw = String(stateValue_(state, 'story.chapter_id') || '').trim();
  if (!raw) return 'Kapitel unbekannt';

  var number = Number(raw);
  if (isFinite(number) && number > 0 && Math.floor(number) === number) {
    return 'Kapitel ' + romanNumeral_(number);
  }

  return raw.indexOf('Kapitel') === 0 ? raw : 'Kapitel ' + raw;
}

function romanNumeral_(number) {
  var values = [
    [1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'],
    [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'],
    [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']
  ];
  var result = '';
  for (var i = 0; i < values.length; i++) {
    while (number >= values[i][0]) {
      result += values[i][1];
      number -= values[i][0];
    }
  }
  return result;
}


function localizeMood_(mood) {
  return String(mood || 'unbestimmt')
    .replace('oppressive', 'bedrückend')
    .replace('mysterious', 'geheimnisvoll')
    .replace('awakening', 'erwachend')
    .replace(/\s*\/\s*/g, ' · ');
}

function localizeMemory_(value) {
  return String(value || '').toUpperCase() === 'NO_MEMORY' ? 'Keine Erinnerung' : String(value || 'unbestimmt');
}

function echoMasteryValue_(raw) {
  var parsed = parseJson_(raw, null);
  var candidate = parsed && typeof parsed === 'object'
    ? (parsed.percent !== undefined ? parsed.percent : (parsed.mastery !== undefined ? parsed.mastery : parsed.value))
    : raw;
  var number = Number(candidate);
  return isFinite(number) ? Math.max(0, Math.min(100, number)) : 0;
}


function echoGetDiagnostics_() {
  var preference = validateEchoPreferenceStorage_({ repair: false });
  var schema = echoPhase2SchemaStatus_();
  return {
    ok: preference.ok && schema.ready,
    build: ECHO_BUILD_ID,
    state_model_version: ECHO_STATE_MODEL_VERSION,
    transaction_model_version: ECHO_TRANSACTION_MODEL_VERSION,
    preference_policy_version: ECHO_PREFERENCE_POLICY_VERSION,
    phase2_schema: schema,
    preference_coverage: preference.preferenceCoverage,
    errors: preference.errors,
    warnings: preference.warnings.concat(schema.warnings || [])
  };
}

// ===== Fast Turn Gateway =====

// ECHO – Fast Turn Gateway
// Public, secret-free reference implementation.
// Live spreadsheet IDs, deployment URLs and tokens belong in Script Properties.

const ECHO_FAST_GATEWAY_VERSION = '1.3.0';

const ECHO_FAST_DEFAULT_RUNTIME_KEYS = [
  'save.last_event_id',
  'player.location_id',
  'player.known_identity',
  'player.health',
  'player.health_max',
  'player.resonance_stage',
  'player.memory_state',
  'player.posture',
  'player.equipment_main_hand',
  'player.held_item',
  'player.clothing_state',
  'player.seal_threshold_state',
  'player.inventory',
  'player.known_facts',
  'player.conditions',
  'player.echo_mastery_profile',
  'player.active_relationships',
  'world.clock',
  'world.elapsed_minutes',
  'world.known_regions',
  'story.chapter_id',
  'story.chapter_label'
];

function echoGetRuntimeContext() {
  var ss = echoFastSpreadsheet_();
  var inbox = echoFastRequireSheet_(ss, 'TURN_INBOX');
  var snapshot = echoFastRequireSheet_(ss, 'STATE_SNAPSHOT');
  var lastTurn = echoFastReadLatestInboxRow_(inbox);
  var state = echoFastReadSnapshotMap_(snapshot);
  var compact = {};

  echoFastRuntimeKeys_().forEach(function (key) {
    if (Object.prototype.hasOwnProperty.call(state, key)) compact[key] = state[key];
  });

  var authoritative = getEchoAuthoritativeContext_({ includePrivate: true });

  return {
    ok: true,
    version: ECHO_FAST_GATEWAY_VERSION,
    build: ECHO_BUILD_ID,
    context_version: 'phase-4',
    state_model_version: ECHO_STATE_MODEL_VERSION,
    transaction_model_version: ECHO_TRANSACTION_MODEL_VERSION,
    source_of_truth: 'ECHO_WORKBOOK',
    read_before_every_turn: true,
    revalidated_at_commit: true,
    commit_ready: !lastTurn || lastTurn.validation_status === 'COMMITTED',
    last_turn: lastTurn,
    snapshot: compact,
    authority: ECHO_AUTHORITY_ORDER_.slice(),
    canonical_context: authoritative,
    context_fingerprint: authoritative.fingerprint,
    chat_delivery: echoChatDeliveryPolicy_(),
    preference_policy: authoritative.preferences.effectivePolicy,
    preference_coverage: authoritative.preferences.preferenceCoverage,
    scene_contract: echoSceneContract_(),
    resolution_contract: echoResolutionContract_(),
    overlay_contract: echoOverlayContract_(),
    projection_contract: echoProjectionContract_(),
    projections: authoritative.projections,
    preferences: authoritative.preferences
  };
}

function echoTurnDelivery_(turn) {
  turn = turn || {};
  var status = String(turn.validation_status || '').trim().toUpperCase();
  var feedId = String(turn.ui_feed_id || '').trim();
  var overlayReady = status === 'COMMITTED' && !!feedId;
  var processing = ['PENDING', 'READY', 'PROCESSING', 'RECOVERY_REQUIRED'].indexOf(status) !== -1;

  return {
    validation_status: status || 'UNKNOWN',
    overlay_ready: overlayReady,
    ui_feed_id: overlayReady ? feedId : '',
    chat_response: overlayReady ? ECHO_CHAT_DELIVERY_POLICY.acknowledgement_on_success : '',
    include_narrative_in_chat: false,
    narrative_destination: 'OVERLAY_ONLY',
    wait_for_processor: processing,
    requires_readback: !overlayReady && status === 'COMMITTED',
    error_code: status === 'ERROR'
      ? String(turn.error_code || 'TURN_PROCESSING_ERROR')
      : ''
  };
}

function echoSubmitTurn(turn) {
  const normalized = echoFastNormalizeTurn_(turn);
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);

  try {
    const ss = echoFastSpreadsheet_();
    const inbox = echoFastRequireSheet_(ss, 'TURN_INBOX');

    // Idempotent retry: return the already-existing turn instead of duplicating it.
    const existingRow = echoFastFindTurnRow_(inbox, normalized.turn_id);
    if (existingRow) {
      const existing = echoFastReadInboxRow_(inbox, existingRow);
      return {
        ok: existing.validation_status !== 'ERROR',
        accepted: true,
        duplicate: true,
        row: existingRow,
        turn: existing,
        delivery: echoTurnDelivery_(existing),
        chat_delivery: echoChatDeliveryPolicy_()
      };
    }

    // ECHO sequencing rule: never create a dependent turn until the latest
    // inbox entry has been committed successfully.
    const latest = echoFastReadLatestInboxRow_(inbox);
    if (latest && latest.validation_status !== 'COMMITTED') {
      let code = 'PREVIOUS_TURN_NOT_COMMITTED';
      if (latest.validation_status === 'PENDING') code = 'PREVIOUS_TURN_PENDING';
      if (latest.validation_status === 'ERROR') code = 'PREVIOUS_TURN_ERROR';

      return {
        ok: false,
        accepted: false,
        duplicate: false,
        error: code,
        last_turn: latest,
        delivery: echoTurnDelivery_(latest),
        chat_delivery: echoChatDeliveryPolicy_()
      };
    }

    const lastRow = inbox.getLastRow();
    const targetRow = Math.max(2, lastRow + 1);
    const target = inbox.getRange(targetRow, 1, 1, 10);

    // Preserve only formatting. Never copy stale commit fields from G:J.
    if (lastRow >= 2) {
      inbox
        .getRange(lastRow, 1, 1, 10)
        .copyTo(target, SpreadsheetApp.CopyPasteType.PASTE_FORMAT, false);
    }

    target.setValues([[
      normalized.turn_id,
      normalized.chat_id,
      normalized.received_at,
      normalized.raw_input,
      normalized.parsed_intent_json,
      'PENDING',
      '',
      '',
      '',
      ''
    ]]);

    SpreadsheetApp.flush();
    if (normalized.context_fingerprint) {
      setCellByHeader_(inbox, targetRow, 'context_fingerprint', normalized.context_fingerprint);
    }
    if (normalized.context_read_at) {
      setCellByHeader_(inbox, targetRow, 'context_read_at', normalized.context_read_at);
    }

    // Processor may already have changed PENDING to COMMITTED/ERROR.
    const written = echoFastReadInboxRow_(inbox, targetRow);
    const acceptedStatuses = ['PENDING', 'COMMITTED', 'ERROR'];
    const verified =
      written.turn_id === normalized.turn_id &&
      acceptedStatuses.indexOf(written.validation_status) !== -1;

    if (!verified) throw new Error('TURN_INBOX verification failed after write.');

    return {
      ok: written.validation_status !== 'ERROR',
      accepted: true,
      duplicate: false,
      row: targetRow,
      turn: written,
      delivery: echoTurnDelivery_(written),
      chat_delivery: echoChatDeliveryPolicy_()
    };
  } finally {
    lock.releaseLock();
  }
}

/** Targeted status read for an already-submitted turn. */
function echoGetTurnStatus(turnId) {
  const id = echoFastRequiredString_(turnId, 'turn_id');
  const inbox = echoFastRequireSheet_(echoFastSpreadsheet_(), 'TURN_INBOX');
  const row = echoFastFindTurnRow_(inbox, id);

  if (!row) {
    return {
      ok: true,
      found: false,
      turn_id: id,
      delivery: echoTurnDelivery_({ validation_status: 'NOT_FOUND' })
    };
  }

  var turn = echoFastReadInboxRow_(inbox, row);
  return {
    ok: true,
    found: true,
    row: row,
    turn: turn,
    delivery: echoTurnDelivery_(turn),
    chat_delivery: echoChatDeliveryPolicy_()
  };
}

/** Router for an optional Web App or future custom connector. */
function echoHandleGatewayRequest(request) {
  var body = request || {};
  echoFastAssertGatewayToken_(body.token);

  switch (body.op) {
    case 'context':
    case 'canonical-context':
      return echoGetRuntimeContext();
    case 'scene-contract':
      return echoGetSceneContract();
    case 'resolution-contract':
      return echoGetResolutionContract();
    case 'overlay-contract':
      return echoGetOverlayContract();
    case 'projection-contract':
      return echoGetProjectionContract();
    case 'preferences': return echoGetPreferenceContext();
    case 'submit': return echoSubmitTurn(body.turn);
    case 'status': return echoGetTurnStatus(body.turn_id);
    case 'delivery-policy': return echoGetChatDeliveryPolicy();
    default: throw new Error('Unsupported gateway operation.');
  }
}

function echoGetChatDeliveryPolicy() {
  return {
    ok: true,
    policy: echoChatDeliveryPolicy_()
  };
}

function echoFastSpreadsheet_() {
  return echoSpreadsheet_();
}

function echoFastRequireSheet_(ss, name) {
  const sheet = ss.getSheetByName(name);
  if (!sheet) throw new Error('Required sheet missing: ' + name);
  return sheet;
}

function echoFastReadLatestInboxRow_(sheet) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return null;

  const values = sheet.getRange(2, 1, lastRow - 1, 10).getValues();
  let latest = null;
  values.forEach(function (value, index) {
    if (!String(value[0] || '').trim()) return;
    const candidate = echoFastReadInboxRow_(sheet, index + 2);
    if (!latest || echoFastInboxRowIsLater_(candidate, latest)) latest = candidate;
  });
  return latest;
}

function echoFastInboxRowIsLater_(candidate, current) {
  var candidateTime = stateTimestamp_(candidate && candidate.received_at);
  var currentTime = stateTimestamp_(current && current.received_at);
  if (candidateTime !== currentTime) return candidateTime > currentTime;
  return Number(candidate && candidate.row || 0) > Number(current && current.row || 0);
}

function echoFastReadInboxRow_(sheet, row) {
  var values = sheet.getRange(row, 1, 1, sheet.getLastColumn()).getValues()[0];
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getDisplayValues()[0].map(function (value) {
    return String(value || '').trim();
  });
  var parsed = null;

  var field = function (name) {
    var index = headers.indexOf(name);
    return index === -1 ? '' : values[index];
  };

  if (field('parsed_intent_json')) {
    try {
      var raw = field('parsed_intent_json');
      parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    } catch (err) {
      parsed = null;
    }
  }

  return {
    row: row,
    turn_id: echoFastJsonValue_(field('turn_id')),
    chat_id: echoFastJsonValue_(field('chat_id')),
    received_at: echoFastJsonValue_(field('received_at')),
    validation_status: echoFastJsonValue_(field('validation_status')),
    commit_event_id: echoFastJsonValue_(field('commit_event_id')),
    ui_feed_id: echoFastJsonValue_(field('ui_feed_id')),
    error_code: echoFastJsonValue_(field('error_code')),
    processed_at: echoFastJsonValue_(field('processed_at')),
    processing_token: echoFastJsonValue_(field('processing_token')),
    attempt_count: echoFastJsonValue_(field('attempt_count')),
    transaction_id: echoFastJsonValue_(field('transaction_id')),
    context_fingerprint: echoFastJsonValue_(field('context_fingerprint')),
    event_id: parsed && parsed.event_id ? parsed.event_id : null,
    scene_feed_id: parsed && parsed.scene && parsed.scene.feed_id ? parsed.scene.feed_id : null
  };
}

function echoFastReadSnapshotMap_(sheet) {
  const values = sheet.getDataRange().getValues();
  if (!values.length) return {};

  const headers = values[0].map(function (value) {
    return String(value || '').trim();
  });
  const keyIndex = headers.indexOf('state_key');
  const valueIndex = headers.indexOf('value');
  const typeIndex = headers.indexOf('value_type');
  const updatedIndex = headers.indexOf('updated_at');
  if (keyIndex === -1 || valueIndex === -1) return {};

  const latest = {};
  for (let index = 1; index < values.length; index++) {
    const row = values[index];
    const rawKey = String(row[keyIndex] || '').trim();
    if (!rawKey || isLegacyStateKey_(rawKey)) continue;

    const candidate = {
      value: row[valueIndex],
      value_type: typeIndex === -1 ? '' : row[typeIndex],
      updated_at: updatedIndex === -1 ? '' : row[updatedIndex],
      __rowNumber: index + 1
    };
    if (recordIsNewer_(candidate, latest[rawKey])) latest[rawKey] = candidate;
  }

  const out = {};
  Object.keys(latest).forEach(function (key) {
    out[key] = echoFastSnapshotValue_(
      latest[key].value,
      latest[key].value_type
    );
  });
  return out;
}

function echoFastSnapshotValue_(value, valueType) {
  var type = String(valueType || '').toLowerCase();
  if (type === 'json' || type === 'object' || type === 'array') {
    if (value && typeof value === 'object') return value;
    return parseJson_(value, value);
  }
  if (type === 'number') {
    var number = Number(value);
    return isFinite(number) ? number : value;
  }
  if (type === 'boolean') return String(value).toLowerCase() === 'true';
  return echoFastJsonValue_(value);
}

function echoFastRuntimeKeys_() {
  const raw = PropertiesService.getScriptProperties().getProperty('ECHO_RUNTIME_KEYS_JSON');
  const keys = raw
    ? (function () {
        try {
          var parsed = JSON.parse(raw);
          if (!Array.isArray(parsed) || !parsed.length) throw new Error('invalid');
          return parsed;
        } catch (err) {
          throw new Error('ECHO_RUNTIME_KEYS_JSON must be a non-empty JSON array.');
        }
      })()
    : ECHO_FAST_DEFAULT_RUNTIME_KEYS.slice();

  return keys.map(function (value) {
    return canonicalStateKey_(value);
  }).filter(function (key, index, list) {
    return !isLegacyStateKey_(key) && list.indexOf(key) === index;
  });
}

function echoFastFindTurnRow_(sheet, turnId) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return 0;

  const found = sheet
    .getRange(2, 1, lastRow - 1, 1)
    .createTextFinder(turnId)
    .matchEntireCell(true)
    .findNext();

  return found ? found.getRow() : 0;
}

function echoFastNormalizeTurn_(turn) {
  if (!turn || typeof turn !== 'object') throw new Error('turn must be an object.');

  var status = String(turn.validation_status || 'PENDING').trim();
  if (status !== 'PENDING') throw new Error('New turns must enter TURN_INBOX as PENDING.');

  var parsed = turn.parsed_intent_json;
  if (typeof parsed === 'string') {
    try { parsed = JSON.parse(parsed); }
    catch (err) { throw new Error('parsed_intent_json is not valid JSON.'); }
  }

  echoFastValidateIntent_(parsed);

  return {
    turn_id: echoFastRequiredString_(turn.turn_id, 'turn_id'),
    chat_id: echoFastRequiredString_(turn.chat_id, 'chat_id'),
    received_at: echoFastRequiredString_(turn.received_at, 'received_at'),
    raw_input: echoFastRequiredString_(turn.raw_input, 'raw_input'),
    parsed_intent_json: JSON.stringify(parsed),
    validation_status: 'PENDING',
    context_fingerprint: String(turn.context_fingerprint || ''),
    context_read_at: String(turn.context_read_at || '')
  };
}

function echoFastValidateIntent_(intent) {
  if (!intent || typeof intent !== 'object') {
    throw new Error('parsed_intent_json must be an object.');
  }

  echoFastRequiredString_(intent.event_id, 'parsed_intent_json.event_id');
  echoFastRequiredString_(intent.event_type, 'parsed_intent_json.event_type');
  echoFastRequiredString_(intent.player_action, 'parsed_intent_json.player_action');
  echoFastRequiredString_(intent.narrative_summary, 'parsed_intent_json.narrative_summary');

  if (!intent.scene || typeof intent.scene !== 'object') {
    throw new Error('parsed_intent_json.scene is required.');
  }

  echoFastRequiredString_(intent.scene.feed_id, 'parsed_intent_json.scene.feed_id');
  echoFastRequiredString_(intent.scene.scene_type, 'parsed_intent_json.scene.scene_type');
  echoFastRequiredString_(intent.scene.title, 'parsed_intent_json.scene.title');
  echoFastRequiredString_(intent.scene.location_id, 'parsed_intent_json.scene.location_id');
  echoFastRequiredString_(intent.scene.narrative_text, 'parsed_intent_json.scene.narrative_text');
  echoFastRequiredString_(intent.scene.mood, 'parsed_intent_json.scene.mood');
  echoFastRequiredString_(intent.scene.status, 'parsed_intent_json.scene.status');

  if (!Array.isArray(intent.scene.available_actions_json)) {
    throw new Error('parsed_intent_json.scene.available_actions_json must be an array.');
  }
  if (!intent.state_updates || typeof intent.state_updates !== 'object') {
    throw new Error('parsed_intent_json.state_updates must be an object.');
  }
  if (!intent.relationship_updates || typeof intent.relationship_updates !== 'object') {
    throw new Error('parsed_intent_json.relationship_updates must be an object.');
  }
  if (!Array.isArray(intent.new_flags)) {
    throw new Error('parsed_intent_json.new_flags must be an array.');
  }

  // Keep the fast path and the normal processor on the same contract.
  validateEventShape_(intent);
}

function echoFastRequiredString_(value, field) {
  const result = String(value == null ? '' : value).trim();
  if (!result) throw new Error(field + ' is required.');
  return result;
}

function echoFastAssertGatewayToken_(suppliedToken) {
  const expected = String(
    PropertiesService.getScriptProperties().getProperty('ECHO_GATEWAY_TOKEN') || ''
  );

  if (!expected) throw new Error('ECHO_GATEWAY_TOKEN is not configured.');
  if (String(suppliedToken || '') !== expected) {
    throw new Error('Unauthorized gateway request.');
  }
}

function echoFastJsonValue_(value) {
  return value instanceof Date ? value.toISOString() : value;
}


/* ===== Persistent preference and character profile layer =====
 *
 * The preference profile is player data, not scene prose. It is loaded on
 * every runtime-context request and is deliberately separate from canonical
 * world facts and numeric relationship state.
 *
 * Optional event additions:
 *   preference_updates: {
 *     player: { "category.key": value },
 *     group: { "category.key": value },
 *     characters: { "ENTITY_ID": { "category.key": value } }
 *   }
 *   character_profile_updates: {
 *     "ENTITY_ID": {
 *       display_name, status, group_role, primary_expertise,
 *       secondary_expertise, dominance_styles_json, intimacy_styles_json,
 *       initiation_style, aftercare_style, boundaries_json,
 *       relationship_axes_json, magic_resonance_json, group_position_json,
 *       notes
 *     }
 *   }
 *
 * Values are versioned in the sheet. The active value wins; superseded rows
 * remain as an audit trail. Numeric relationship values are never invented
 * from preferences and remain owned by RELATIONSHIP_STATE.
 */

var ECHO_PREFERENCE_SCHEMA_VERSION = '1.0.0';

var ECHO_PREFERENCE_HEADERS_ = [
  'preference_id', 'scope', 'subject_id', 'category', 'preference_key',
  'value_type', 'value_json', 'priority', 'source_type', 'source_ref',
  'status', 'profile_version', 'updated_at', 'notes'
];

var ECHO_CHARACTER_PROFILE_HEADERS_ = [
  'profile_id', 'entity_id', 'display_name', 'status', 'group_role',
  'primary_expertise', 'secondary_expertise', 'dominance_styles_json',
  'intimacy_styles_json', 'initiation_style', 'aftercare_style',
  'boundaries_json', 'relationship_axes_json', 'magic_resonance_json',
  'group_position_json', 'last_event_id', 'updated_at', 'notes'
];

var ECHO_PROFILE_ACTIVE_STATUSES_ = {
  ACTIVE: true,
  CONFIRMED: true
};

var ECHO_CHARACTER_JSON_FIELDS_ = {
  dominance_styles_json: true,
  intimacy_styles_json: true,
  boundaries_json: true,
  relationship_axes_json: true,
  magic_resonance_json: true,
  group_position_json: true
};

var ECHO_CHARACTER_PATCH_FIELDS_ = {
  display_name: true,
  status: true,
  group_role: true,
  primary_expertise: true,
  secondary_expertise: true,
  dominance_styles_json: true,
  intimacy_styles_json: true,
  initiation_style: true,
  aftercare_style: true,
  boundaries_json: true,
  relationship_axes_json: true,
  magic_resonance_json: true,
  group_position_json: true,
  notes: true
};


var ECHO_PREFERENCE_COVERAGE_ = [
  { id: 'q01', target: 'circle.structure', enforcement: 'SOFT', appliesWhen: 'group_context' },
  { id: 'q02', target: 'circle.target_size', enforcement: 'SOFT', appliesWhen: 'group_progression' },
  { id: 'q03', target: 'circle.role_distribution', enforcement: 'SOFT', appliesWhen: 'group_context' },
  { id: 'q04', target: 'circle.joining_pace', enforcement: 'SOFT', appliesWhen: 'group_progression' },
  { id: 'q05', target: 'circle.hierarchy', enforcement: 'SOFT', appliesWhen: 'group_context' },
  { id: 'q06', target: 'narration.density', enforcement: 'SOFT', appliesWhen: 'every_scene' },
  { id: 'q07', target: 'narration.dialogue_style', enforcement: 'SOFT', appliesWhen: 'every_scene' },
  { id: 'q08', target: 'player_agency', enforcement: 'HARD', appliesWhen: 'every_turn' },
  { id: 'q09', target: 'dice_policy', enforcement: 'HARD', appliesWhen: 'every_turn' },
  { id: 'q10', target: 'delivery.format', enforcement: 'HARD', appliesWhen: 'every_delivery' },
  { id: 'q11', target: 'intimacy.address_style', enforcement: 'SOFT', appliesWhen: 'relevant_character' },
  { id: 'q12', target: 'intimacy.psychological_tension', enforcement: 'SOFT', appliesWhen: 'intimacy_scene' },
  { id: 'q13', target: 'intimacy.control_and_restraint', enforcement: 'SOFT', appliesWhen: 'intimacy_scene' },
  { id: 'q14', target: 'safety.consent_and_boundaries', enforcement: 'HARD', appliesWhen: 'every_intimacy_scene' },
  { id: 'q15', target: 'intimacy.power_continuity', enforcement: 'SOFT', appliesWhen: 'relationship_scene' },
  { id: 'q16', target: 'intimacy.edging_and_denial', enforcement: 'SOFT', appliesWhen: 'relevant_character' },
  { id: 'q17', target: 'intimacy.explicitness_boundary', enforcement: 'HARD', appliesWhen: 'every_intimacy_scene' },
  { id: 'q18', target: 'intimacy.aftercare', enforcement: 'SOFT', appliesWhen: 'after_intimacy' },
  { id: 'q19', target: 'submission.service_and_worship', enforcement: 'SOFT', appliesWhen: 'relevant_character' },
  { id: 'q20', target: 'submission.obedience', enforcement: 'SOFT', appliesWhen: 'relevant_character' },
  { id: 'q21', target: 'submission.foot_focus_and_observation', enforcement: 'SOFT', appliesWhen: 'relevant_character' },
  { id: 'q22', target: 'circle.power_model', enforcement: 'SOFT', appliesWhen: 'group_context' },
  { id: 'q23', target: 'circle.player_centered_leadership', enforcement: 'SOFT', appliesWhen: 'group_context' },
  { id: 'q24', target: 'circle.target_members', enforcement: 'SOFT', appliesWhen: 'group_progression' },
  { id: 'q25', target: 'circle.women_relationships', enforcement: 'SOFT', appliesWhen: 'group_context' },
  { id: 'q26', target: 'circle.guest_participation', enforcement: 'SOFT', appliesWhen: 'guest_context' },
  { id: 'q27', target: 'circle.participant_constraints', enforcement: 'HARD', appliesWhen: 'every_participant' },
  { id: 'q28', target: 'circle.adult_and_sentient_scope', enforcement: 'HARD', appliesWhen: 'every_participant' },
  { id: 'q29', target: 'intensity.ceiling', enforcement: 'SOFT', appliesWhen: 'intensity_scene' },
  { id: 'q30', target: 'intensity.darkness_style', enforcement: 'SOFT', appliesWhen: 'intensity_scene' },
  { id: 'q31', target: 'intimacy.initiation_and_permission', enforcement: 'HARD', appliesWhen: 'every_intimacy_scene' },
  { id: 'q32', target: 'intimacy.earned_rewards_and_denial', enforcement: 'SOFT', appliesWhen: 'relevant_character' },
  { id: 'q33', target: 'narration.pacing', enforcement: 'SOFT', appliesWhen: 'every_scene' },
  { id: 'q34', target: 'overlay.compactness', enforcement: 'PROJECTION', appliesWhen: 'overlay' },
  { id: 'q35', target: 'overlay.numeric_stat_visibility', enforcement: 'HARD', appliesWhen: 'overlay_and_context' },
  { id: 'q36', target: 'persistence.repairability', enforcement: 'HARD', appliesWhen: 'every_commit' },
  { id: 'q37', target: 'relationships.conflict_repair', enforcement: 'SOFT', appliesWhen: 'relationship_conflict' },
  { id: 'q38', target: 'relationships.discipline_contexts', enforcement: 'SOFT', appliesWhen: 'relevant_character' },
  { id: 'q39', target: 'npc_autonomy', enforcement: 'HARD', appliesWhen: 'every_turn' },
  { id: 'q40', target: 'relationships.per_character_stats', enforcement: 'PROJECTION', appliesWhen: 'relationship_overlay' },
  { id: 'q41', target: 'relationships.progression', enforcement: 'SOFT', appliesWhen: 'relationship_scene' },
  { id: 'q42', target: 'circle.growth', enforcement: 'SOFT', appliesWhen: 'group_progression' },
  { id: 'q43', target: 'magic.first_expert', enforcement: 'SOFT', appliesWhen: 'echo_training' },
  { id: 'q44', target: 'magic.teaching_path', enforcement: 'SOFT', appliesWhen: 'echo_training' },
  { id: 'q45', target: 'magic.relationship_amplification', enforcement: 'SOFT', appliesWhen: 'magic_or_relationship_scene' },
  { id: 'q46', target: 'magic.darkness_and_protection', enforcement: 'SOFT', appliesWhen: 'magic_or_protection_scene' },
  { id: 'q47', target: 'magic.restoration_direction', enforcement: 'SOFT', appliesWhen: 'magic_progression' },
  { id: 'q48', target: 'magic.resonance_charge', enforcement: 'SOFT', appliesWhen: 'magic_progression' },
  { id: 'q49', target: 'magic.breakthroughs', enforcement: 'SOFT', appliesWhen: 'magic_progression' },
  { id: 'q50', target: 'magic.distinct_experts', enforcement: 'SOFT', appliesWhen: 'group_progression' }
];

function validatePreferenceCoverage_(answers) {
  var errors = [];
  var warnings = [];
  var missingQuestionIds = [];
  var presentQuestions = 0;
  var source = answers && typeof answers === 'object' && !Array.isArray(answers)
    ? answers
    : {};

  ECHO_PREFERENCE_COVERAGE_.forEach(function (definition) {
    if (Object.prototype.hasOwnProperty.call(source, definition.id)) {
      presentQuestions += 1;
    } else {
      missingQuestionIds.push(definition.id);
    }
  });

  if (!answers || typeof answers !== 'object' || Array.isArray(answers)) {
    errors.push('PREF-026 questionnaire_answers is missing or not an object.');
  }
  if (missingQuestionIds.length) {
    errors.push('Missing questionnaire answers: ' + missingQuestionIds.join(', '));
  }

  return {
    totalQuestions: ECHO_PREFERENCE_COVERAGE_.length,
    presentQuestions: presentQuestions,
    missingQuestionIds: missingQuestionIds,
    complete: missingQuestionIds.length === 0 && !!answers,
    errors: errors,
    warnings: warnings
  };
}

function compileEffectivePreferencePolicy_(player, group, characterPreferences, answers, includeQuestionValues) {
  var source = answers && typeof answers === 'object' && !Array.isArray(answers)
    ? answers
    : {};
  var questionRules = {};

  ECHO_PREFERENCE_COVERAGE_.forEach(function (definition) {
    var rule = {
      target: definition.target,
      enforcement: definition.enforcement,
      appliesWhen: definition.appliesWhen,
      sourceRef: 'PREF-026.' + definition.id
    };
    if (includeQuestionValues && Object.prototype.hasOwnProperty.call(source, definition.id)) {
      rule.answer = source[definition.id];
    }
    questionRules[definition.id] = rule;
  });

  return {
    version: ECHO_PREFERENCE_POLICY_VERSION,
    source: 'ECHO_PREFERENCE_PROFILE/PREF-026',
    coverage: validatePreferenceCoverage_(answers),
    questionRules: questionRules,
    hardConstraints: {
      stopWord: 'Stopp',
      explicitDiceOverride: 'ohne Würfel',
      defaultDice: 'W20',
      playerStoryAgency: true,
      npcAutonomy: true,
      consentRequired: true,
      noInventedNumericStats: true,
      adultSentientHumanoidScope: true
    },
    precedence: ECHO_AUTHORITY_ORDER_.slice(),
    player: player || {},
    group: group || {},
    characters: characterPreferences || {}
  };
}

function ensurePreferenceSheets_() {
  var preferenceSheet = ensureProfileSheetWithHeaders_(
    ECHO_CONFIG.sheets.preferences,
    ECHO_PREFERENCE_HEADERS_
  );
  var characterSheet = ensureProfileSheetWithHeaders_(
    ECHO_CONFIG.sheets.characterProfiles,
    ECHO_CHARACTER_PROFILE_HEADERS_
  );
  return {
    preferences: preferenceSheet,
    characterProfiles: characterSheet
  };
}

function ensureProfileSheetWithHeaders_(sheetName, requiredHeaders) {
  var ss = echoSpreadsheet_();
  var sheet = ss.getSheetByName(sheetName);

  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    sheet.getRange(1, 1, 1, requiredHeaders.length).setValues([requiredHeaders]);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, requiredHeaders.length)
      .setFontWeight('bold')
      .setWrap(true);
    return sheet;
  }

  var lastColumn = Math.max(1, sheet.getLastColumn());
  var headers = sheet.getRange(1, 1, 1, lastColumn).getDisplayValues()[0]
    .map(function (value) { return String(value || '').trim(); });

  if (!headers.some(function (header) { return !!header; })) {
    sheet.getRange(1, 1, 1, requiredHeaders.length).setValues([requiredHeaders]);
  } else {
    var missing = requiredHeaders.filter(function (header) {
      return headers.indexOf(header) === -1;
    });
    if (missing.length) {
      sheet.getRange(1, lastColumn + 1, 1, missing.length).setValues([missing]);
    }
  }

  if (sheet.getFrozenRows() < 1) sheet.setFrozenRows(1);
  return sheet;
}

function echoProfileStatusIsActive_(status) {
  return !!ECHO_PROFILE_ACTIVE_STATUSES_[String(status || '').toUpperCase()];
}

function profileJsonObject_(raw, fallback) {
  var parsed = parseJson_(raw, null);
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
    ? parsed
    : fallback;
}

function profileJsonArray_(raw, fallback) {
  var parsed = parseJson_(raw, null);
  return Array.isArray(parsed) ? parsed : fallback;
}

function profileValue_(raw, valueType) {
  if (raw === undefined || raw === null || raw === '') return '';
  var type = String(valueType || '').toLowerCase();

  if (type === 'json' || type === 'object' || type === 'array') {
    var parsed = parseJson_(raw, null);
    return parsed === null && String(raw) !== 'null' ? String(raw) : parsed;
  }
  if (type === 'number') return Number(raw);
  if (type === 'boolean') return String(raw).toLowerCase() === 'true';
  return raw;
}

function safePreferenceSegment_(segment, field) {
  var value = String(segment || '').trim();
  if (!value || !/^[A-Za-z0-9_-]+$/.test(value)) {
    throw new Error((field || 'preference path') + ' contains an invalid segment.');
  }
  if (['__proto__', 'prototype', 'constructor'].indexOf(value) !== -1) {
    throw new Error((field || 'preference path') + ' contains a reserved segment.');
  }
  return value;
}

function normalizePreferencePath_(path, field) {
  var raw = String(path || '').trim();
  if (!raw) throw new Error((field || 'preference path') + ' is required.');

  var parts = raw.split('.');
  parts.forEach(function (part) { safePreferenceSegment_(part, field || 'preference path'); });

  if (parts.length === 1) {
    return { category: 'general', key: parts[0], path: 'general.' + parts[0] };
  }

  return {
    category: parts[0],
    key: parts.slice(1).join('.'),
    path: raw
  };
}

function setNestedPreference_(target, path, value) {
  var parts = String(path || '').split('.');
  var cursor = target;

  parts.forEach(function (part, index) {
    safePreferenceSegment_(part, 'preference path');
    if (index === parts.length - 1) {
      cursor[part] = value;
      return;
    }
    if (!cursor[part] || typeof cursor[part] !== 'object' || Array.isArray(cursor[part])) {
      cursor[part] = {};
    }
    cursor = cursor[part];
  });
}

function profileId_(prefix) {
  var uuid = Utilities.getUuid().replace(/-/g, '').toUpperCase();
  return String(prefix || 'PROFILE') + '-' + uuid.slice(0, 16);
}

function validateEchoPreferenceStorage_(options) {
  options = options || {};
  var errors = [];
  var warnings = [];
  var questionnaireAnswers = null;

  try {
    if (options.repair !== false) ensurePreferenceSheets_();

    var preferenceTable = readTable_(getSheet_(ECHO_CONFIG.sheets.preferences));
    ECHO_PREFERENCE_HEADERS_.forEach(function (header) {
      if (preferenceTable.headers.indexOf(header) === -1) {
        errors.push('ECHO_PREFERENCE_PROFILE missing column: ' + header);
      }
    });

    var preferenceKeys = {};
    preferenceTable.rows.forEach(function (row) {
      if (!echoProfileStatusIsActive_(row.status)) return;

      var scope = String(row.scope || '').toUpperCase();
      var subjectId = String(row.subject_id || '').trim();
      var category = String(row.category || '').trim();
      var key = String(row.preference_key || '').trim();
      if (!scope || !subjectId || !category || !key) {
        errors.push('Active preference row is missing scope, subject, category or key.');
        return;
      }

      if (category === 'audit' && key === 'questionnaire_answers') {
        questionnaireAnswers = profileValue_(row.value_json, row.value_type);
      }

      var identity = [scope, subjectId, category, key].join('|');
      if (preferenceKeys[identity]) {
        warnings.push('Duplicate active preference; newest row wins: ' + identity);
      }
      preferenceKeys[identity] = true;

      if (row.value_json === undefined || row.value_json === '') {
        errors.push('Active preference has no value_json: ' + identity);
        return;
      }

      if (String(row.value_type || '').toLowerCase() === 'json') {
        try {
          JSON.parse(String(row.value_json));
        } catch (error) {
          errors.push('Invalid JSON in preference: ' + identity);
        }
      }
    });

    var characterTable = readTable_(getSheet_(ECHO_CONFIG.sheets.characterProfiles));
    ECHO_CHARACTER_PROFILE_HEADERS_.forEach(function (header) {
      if (characterTable.headers.indexOf(header) === -1) {
        errors.push('ECHO_CHARACTER_PROFILES missing column: ' + header);
      }
    });

    var characterIds = {};
    characterTable.rows.forEach(function (row) {
      if (!echoProfileStatusIsActive_(row.status)) return;
      var entityId = String(row.entity_id || '').trim();
      if (!entityId) {
        errors.push('Active character profile has no entity_id.');
        return;
      }
      if (characterIds[entityId]) {
        warnings.push('Duplicate active character profile; newest row wins: ' + entityId);
      }
      characterIds[entityId] = true;

      Object.keys(ECHO_CHARACTER_JSON_FIELDS_).forEach(function (field) {
        if (row[field] === undefined || row[field] === '') return;
        try {
          JSON.parse(String(row[field]));
        } catch (error) {
          errors.push('Invalid JSON in character profile ' + entityId + ': ' + field);
        }
      });
    });
  } catch (error) {
    errors.push(String(error && error.message ? error.message : error));
  }

  var preferenceCoverage = validatePreferenceCoverage_(questionnaireAnswers);
  errors = errors.concat(preferenceCoverage.errors);
  warnings = warnings.concat(preferenceCoverage.warnings);

  return {
    ok: errors.length === 0,
    errors: errors,
    warnings: warnings,
    preferenceCoverage: preferenceCoverage
  };
}

function readCharacterProfiles_() {
  var rows = readTable_(getSheet_(ECHO_CONFIG.sheets.characterProfiles)).rows;
  var newestByEntity = {};

  rows.forEach(function (row) {
    if (!echoProfileStatusIsActive_(row.status) || !row.entity_id) return;
    var entityId = String(row.entity_id);
    if (recordIsNewer_(row, newestByEntity[entityId])) newestByEntity[entityId] = row;
  });

  return Object.keys(newestByEntity).map(function (entityId) {
    var row = newestByEntity[entityId];
    return {
      profileId: row.profile_id || '',
      entityId: row.entity_id || '',
      displayName: row.display_name || row.entity_id || 'Unbekannte Frau',
      status: row.status || 'ACTIVE',
      groupRole: row.group_role || '',
      primaryExpertise: row.primary_expertise || '',
      secondaryExpertise: row.secondary_expertise || '',
      dominanceStyles: profileJsonArray_(row.dominance_styles_json, []),
      intimacyStyles: profileJsonArray_(row.intimacy_styles_json, []),
      initiationStyle: row.initiation_style || '',
      aftercareStyle: row.aftercare_style || '',
      boundaries: profileJsonArray_(row.boundaries_json, []),
      relationshipAxes: profileJsonObject_(row.relationship_axes_json, {}),
      magicResonance: profileJsonObject_(row.magic_resonance_json, {}),
      groupPosition: profileJsonObject_(row.group_position_json, {}),
      lastEventId: row.last_event_id || '',
      updatedAt: row.updated_at || '',
      notes: row.notes || ''
    };
  });
}

function characterProfilesByEntity_(profiles) {
  var byEntity = {};
  (profiles || []).forEach(function (profile) {
    var entityId = String(profile.entityId || '');
    if (entityId) byEntity[entityId] = profile;

    var position = profile.groupPosition || {};
    var canonicalId = String(position.canonical_character_id || '');
    if (canonicalId) byEntity[canonicalId] = profile;

    (Array.isArray(position.aliases) ? position.aliases : []).forEach(function (alias) {
      if (alias) byEntity[String(alias)] = profile;
    });
  });
  return byEntity;
}


function characterProfileToOverlay_(profile) {
  var axes = profile.relationshipAxes || {};
  var knownAxes = Object.keys(axes).filter(function (key) {
    return axisValue_(axes[key]) !== null;
  });
  var qualitativeStats = relationshipQualitativeStats_({}, profile, {});

  return {
    id: profile.entityId,
    name: profile.displayName,
    status: profile.status,
    role: profile.groupRole ? echoPhase4RoleLabel_(profile.groupRole) : 'Rolle noch nicht festgelegt',
    expertise: {
      primary: profile.primaryExpertise,
      secondary: profile.secondaryExpertise
    },
    power: {
      dominanceStyles: profile.dominanceStyles,
      initiationStyle: profile.initiationStyle,
      aftercareStyle: profile.aftercareStyle
    },
    magic: {
      primary: profile.magicResonance.primary || '',
      secondary: profile.magicResonance.secondary || [],
      paths: profile.magicResonance.paths || []
    },
    stats: {
      visibility: 'compact',
      profileLoaded: profileHasDisplayData_(profile) || qualitativeStats.length > 0,
      numericState: knownAxes.length ? 'partially_established' : 'not_established',
      numericStateLabel: knownAxes.length
        ? 'teilweise erspielt'
        : (qualitativeStats.length
          ? 'Profilwerte hinterlegt; numerische Werte entwickeln sich im Spiel'
          : 'noch nicht erspielt'),
      knownAxes: knownAxes,
      qualitative: qualitativeStats
    }
  };
}


function getEchoPreferenceContext_(options) {
  options = options || {};
  var validation = validateEchoPreferenceStorage_({ repair: false });
  var preferenceRows = [];
  try {
    preferenceRows = readTable_(getSheet_(ECHO_CONFIG.sheets.preferences)).rows;
  } catch (error) {
    validation.errors.push(String(error && error.message ? error.message : error));
  }

  var player = {};
  var group = {};
  var characterPreferences = {};
  var rawAudit = null;
  var profileVersion = ECHO_PREFERENCE_SCHEMA_VERSION;
  var seen = {};

  preferenceRows.forEach(function (row) {
    if (!echoProfileStatusIsActive_(row.status)) return;

    var scope = String(row.scope || '').toUpperCase();
    var subjectId = String(row.subject_id || '').trim();
    var category = String(row.category || '').trim();
    var key = String(row.preference_key || '').trim();
    if (!scope || !subjectId || !category || !key) return;

    var path = category + '.' + key;
    var value = profileValue_(row.value_json, row.value_type);
    var identity = [scope, subjectId, category, key].join('|');
    if (seen[identity]) {
      validation.warnings.push('Newest active preference wins for: ' + identity);
    }
    seen[identity] = true;

    if (category === 'meta' && key === 'profile_version') {
      profileVersion = String(value || profileVersion);
    }

    if (scope === 'PLAYER' && subjectId === 'PLAYER') {
      setNestedPreference_(player, path, value);
    } else if (scope === 'GROUP' && subjectId === 'ECHO_CIRCLE') {
      setNestedPreference_(group, path, value);
    } else if (scope === 'CHARACTER') {
      if (!characterPreferences[subjectId]) characterPreferences[subjectId] = {};
      setNestedPreference_(characterPreferences[subjectId], path, value);
    }

    if (category === 'audit' && key === 'questionnaire_answers') {
      rawAudit = value;
    }
  });

  var characters = [];
  try {
    characters = readCharacterProfiles_();
  } catch (error) {
    validation.errors.push(String(error && error.message ? error.message : error));
  }

  characters.forEach(function (profile) {
    profile.preferences = characterPreferences[profile.entityId] || {};
  });

  var preferenceCoverage = validatePreferenceCoverage_(rawAudit);
  var effectivePolicy = compileEffectivePreferencePolicy_(
    player,
    group,
    characterPreferences,
    rawAudit,
    !!options.includeAudit
  );

  validation.errors = validation.errors.concat(preferenceCoverage.errors);
  validation.warnings = validation.warnings.concat(preferenceCoverage.warnings);

  return {
    available: true,
    status: validation.ok && preferenceCoverage.complete ? 'READY' : 'DEGRADED',
    schemaVersion: ECHO_PREFERENCE_SCHEMA_VERSION,
    policyVersion: ECHO_PREFERENCE_POLICY_VERSION,
    profileVersion: profileVersion,
    profileSource: 'ECHO_PREFERENCE_PROFILE',
    characterSource: 'ECHO_CHARACTER_PROFILES',
    readOnEveryTurn: true,
    precedence: ECHO_AUTHORITY_ORDER_.slice(),
    player: player,
    group: group,
    characterPreferences: characterPreferences,
    characters: characters,
    preferenceCoverage: preferenceCoverage,
    effectivePolicy: effectivePolicy,
    audit: options.includeAudit ? rawAudit : null,
    validation: {
      ok: validation.ok && preferenceCoverage.complete,
      errors: validation.errors,
      warnings: validation.warnings
    },
    runtimeContract: {
      never_invent_numeric_stats: true,
      story_decisions_belong_to_player: true,
      npc_autonomy_enabled: true,
      default_dice: 'W20',
      author_override_phrase: 'ohne Würfel',
      stop_word_always_valid: 'Stopp',
      authority_order: ECHO_AUTHORITY_ORDER_.slice(),
      preference_policy_version: ECHO_PREFERENCE_POLICY_VERSION
    }
  };
}

/** Public diagnostics endpoint for setup and deployment verification. */
function echoGetPreferenceContext() {
  return getEchoPreferenceContext_({ includeAudit: true });
}

/** Public diagnostics endpoint for the profile schema. */
function echoValidatePreferenceProfile() {
  return validateEchoPreferenceStorage_({ repair: false });
}

function validatePreferenceUpdates_(updates) {
  if (!updates || typeof updates !== 'object' || Array.isArray(updates)) {
    throw new Error('preference_updates must be an object.');
  }

  ['player', 'global', 'group'].forEach(function (bucketName) {
    if (updates[bucketName] === undefined) return;
    if (!updates[bucketName] || typeof updates[bucketName] !== 'object' || Array.isArray(updates[bucketName])) {
      throw new Error('preference_updates.' + bucketName + ' must be an object.');
    }
    Object.keys(updates[bucketName]).forEach(function (path) {
      normalizePreferencePath_(path, 'preference_updates.' + bucketName);
      if (updates[bucketName][path] === undefined) {
        throw new Error('preference_updates.' + bucketName + '.' + path + ' cannot be undefined.');
      }
    });
  });

  if (updates.characters !== undefined) {
    if (!updates.characters || typeof updates.characters !== 'object' || Array.isArray(updates.characters)) {
      throw new Error('preference_updates.characters must be an object.');
    }
    Object.keys(updates.characters).forEach(function (entityId) {
      safePreferenceSegment_(entityId, 'preference_updates.characters');
      var bucket = updates.characters[entityId];
      if (!bucket || typeof bucket !== 'object' || Array.isArray(bucket)) {
        throw new Error('preference_updates.characters.' + entityId + ' must be an object.');
      }
      Object.keys(bucket).forEach(function (path) {
        normalizePreferencePath_(path, 'preference_updates.characters.' + entityId);
        if (bucket[path] === undefined) {
          throw new Error('preference_updates.characters.' + entityId + '.' + path + ' cannot be undefined.');
        }
      });
    });
  }

  var allowed = { player: true, global: true, group: true, characters: true };
  Object.keys(updates).forEach(function (key) {
    if (!allowed[key]) throw new Error('Unknown preference_updates bucket: ' + key);
  });
}

function validateCharacterProfileUpdates_(updates) {
  ensurePreferenceSheets_();
  if (!updates || typeof updates !== 'object' || Array.isArray(updates)) {
    throw new Error('character_profile_updates must be an object.');
  }

  var rows = readTable_(getSheet_(ECHO_CONFIG.sheets.characterProfiles)).rows;
  var existing = {};
  rows.forEach(function (row) {
    if (row.entity_id) existing[String(row.entity_id)] = row;
  });

  Object.keys(updates).forEach(function (entityId) {
    safePreferenceSegment_(entityId, 'character_profile_updates');
    var patch = updates[entityId];
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
      throw new Error('character_profile_updates.' + entityId + ' must be an object.');
    }

    Object.keys(patch).forEach(function (field) {
      if (!ECHO_CHARACTER_PATCH_FIELDS_[field]) {
        throw new Error('Unknown character profile field: ' + field);
      }
      if (ECHO_CHARACTER_JSON_FIELDS_[field]) {
        if (typeof patch[field] === 'string') {
          try { JSON.parse(patch[field]); } catch (error) {
            throw new Error('Invalid JSON for ' + field + ' on ' + entityId);
          }
        } else if (!patch[field] || typeof patch[field] !== 'object') {
          throw new Error(field + ' on ' + entityId + ' must be JSON or an object/array.');
        }
      }
    });

    if (!existing[entityId] && !String(patch.display_name || '').trim()) {
      throw new Error('New character profiles require display_name: ' + entityId);
    }
    if (patch.status !== undefined) {
      var status = String(patch.status || '').toUpperCase();
      if (['ACTIVE', 'CONFIRMED', 'DRAFT', 'ARCHIVED'].indexOf(status) === -1) {
        throw new Error('Unknown character profile status: ' + patch.status);
      }
    }
  });
}

function applyPreferenceUpdates_(updates, eventId, now) {
  if (!updates) return;
  ensurePreferenceSheets_();
  validatePreferenceUpdates_(updates);

  var playerUpdates = {};
  Object.keys(updates.global || {}).forEach(function (path) {
    playerUpdates[path] = updates.global[path];
  });
  Object.keys(updates.player || {}).forEach(function (path) {
    playerUpdates[path] = updates.player[path];
  });
  applyPreferenceBucket_(playerUpdates, 'PLAYER', 'PLAYER', eventId, now);

  applyPreferenceBucket_(updates.group || {}, 'GROUP', 'ECHO_CIRCLE', eventId, now);

  Object.keys(updates.characters || {}).forEach(function (entityId) {
    applyPreferenceBucket_(
      updates.characters[entityId],
      'CHARACTER',
      entityId,
      eventId,
      now
    );
  });
}

function applyPreferenceBucket_(bucket, scope, subjectId, eventId, now) {
  Object.keys(bucket || {}).forEach(function (path) {
    var normalized = normalizePreferencePath_(path, 'preference update');
    var sheet = getSheet_(ECHO_CONFIG.sheets.preferences);
    var table = readTable_(sheet);
    var identity = [scope, subjectId, normalized.category, normalized.key].join('|');

    table.rows.forEach(function (row) {
      var rowIdentity = [
        String(row.scope || '').toUpperCase(),
        String(row.subject_id || ''),
        String(row.category || ''),
        String(row.preference_key || '')
      ].join('|');
      if (rowIdentity === identity && echoProfileStatusIsActive_(row.status)) {
        setCellByHeader_(sheet, row.__rowNumber, 'status', 'SUPERSEDED');
        setCellByHeader_(sheet, row.__rowNumber, 'updated_at', now || new Date());
      }
    });

    appendObject_(sheet, {
      preference_id: profileId_('PREF'),
      scope: scope,
      subject_id: subjectId,
      category: normalized.category,
      preference_key: normalized.key,
      value_type: 'json',
      value_json: JSON.stringify(bucket[path]),
      priority: 'runtime',
      source_type: 'RUNTIME_EVENT',
      source_ref: eventId || '',
      status: 'CONFIRMED',
      profile_version: ECHO_PREFERENCE_SCHEMA_VERSION,
      updated_at: now || new Date(),
      notes: 'Fortgeschrieben durch ein bestätigtes ECHO-Event.'
    });
  });
}

function mergeProfileJson_(currentRaw, incoming) {
  var current = profileJsonObject_(currentRaw, {});
  var next = typeof incoming === 'string' ? parseJson_(incoming, null) : incoming;
  if (!next || typeof next !== 'object') return JSON.stringify(incoming);
  if (Array.isArray(next)) return JSON.stringify(next);
  return JSON.stringify(Object.assign({}, current, next));
}

function applyCharacterProfileUpdates_(updates, eventId, now) {
  if (!updates) return;
  ensurePreferenceSheets_();
  validateCharacterProfileUpdates_(updates);

  var sheet = getSheet_(ECHO_CONFIG.sheets.characterProfiles);
  Object.keys(updates).forEach(function (entityId) {
    var row = findRow_(sheet, 'entity_id', entityId);
    var patch = updates[entityId];

    if (row && row.__rowNumber) {
      Object.keys(patch).forEach(function (field) {
        var value = ECHO_CHARACTER_JSON_FIELDS_[field]
          ? mergeProfileJson_(row[field], patch[field])
          : patch[field];
        setCellByHeader_(sheet, row.__rowNumber, field, value);
      });
      setCellByHeader_(sheet, row.__rowNumber, 'last_event_id', eventId || '');
      setCellByHeader_(sheet, row.__rowNumber, 'updated_at', now || new Date());
      return;
    }

    var created = {
      profile_id: profileId_('CP'),
      entity_id: entityId,
      display_name: patch.display_name,
      status: patch.status || 'ACTIVE',
      group_role: '',
      primary_expertise: '',
      secondary_expertise: '',
      dominance_styles_json: '[]',
      intimacy_styles_json: '[]',
      initiation_style: '',
      aftercare_style: '',
      boundaries_json: '[]',
      relationship_axes_json: '{}',
      magic_resonance_json: '{}',
      group_position_json: '{}',
      last_event_id: eventId || '',
      updated_at: now || new Date(),
      notes: ''
    };

    Object.keys(patch).forEach(function (field) {
      created[field] = ECHO_CHARACTER_JSON_FIELDS_[field]
        ? JSON.stringify(patch[field])
        : patch[field];
    });
    appendObject_(sheet, created);
  });
}


/* ===== Relationship directory projection ===== */

function echoRelationshipRoleLabel_(row, profile) {
  if (row.role && row.role !== 'Beziehung · Zustand unbekannt') return row.role;

  var knownRoles = {
    first_echo_expert_and_dominant_guide: 'ECHO-Expertin · dominante Führerin',
    echo_master: 'ECHO-Expertin',
    dominant_guide: 'dominante Führerin'
  };
  if (profile.groupRole && knownRoles[profile.groupRole]) return knownRoles[profile.groupRole];
  if (profile.groupRole) return String(profile.groupRole).replace(/_/g, ' ');
  return 'Beziehung · Zustand unbekannt';
}

function echoRelationshipAxisText_(value) {
  if (value === null || value === undefined) return 'noch unbekannt';
  if (value >= 75) return 'hoch';
  if (value >= 45) return 'aufgebaut';
  return 'zart';
}

function echoRelationshipStyleLabels_(styles) {
  var labels = {
    strict_ruler: 'strenge Führung',
    dark_domme: 'dunkle Dominanz',
    seductive_master: 'verführerische Führung',
    consensual_power_exchange: 'vereinbarte Machtdynamik',
    ritualized_guidance: 'ritualisierte Führung',
    earned_reward_and_denial: 'verdiente Freigabe und Warten',
    foot_focus_possible: 'Fußfokus möglich'
  };
  return (Array.isArray(styles) ? styles : []).map(function (style) {
    return labels[style] || String(style).replace(/_/g, ' ');
  });
}


function echoRelationshipCompactRole_(role, profile, axes, qualitativeStats) {
  var parts = [role];
  if (profile.dominanceStyles && profile.dominanceStyles.length) {
    parts.push('dominant');
  }

  var profileLoaded = profileHasDisplayData_(profile) ||
    (qualitativeStats && qualitativeStats.length);
  parts.push(profileLoaded ? 'Profil: hinterlegt' : 'Stats: noch nicht erspielt');
  return parts.join(' · ');
}


function echoRelationshipExpertiseLabel_(profile) {
  var primary = String(profile.primaryExpertise || '');
  if (primary === 'foundational ECHO training; resonance sight; practical control') {
    return 'Grundlagen von ECHO, Resonanzsicht und praktische Kontrolle';
  }
  return primary;
}


function echoRelationshipSummary_(role, profile, consentState, axes, qualitativeStats) {
  var establishedAxes = axes.filter(function (axis) { return axis.value !== null; });
  var parts = [];

  if (establishedAxes.length) {
    parts.push('Stats: ' + establishedAxes.map(function (axis) {
      return axis.label + ': ' + echoRelationshipAxisText_(axis.value);
    }).join(' · '));
  } else if ((qualitativeStats || []).length) {
    parts.push('Stats: Profilwerte hinterlegt; numerische Beziehungswerte entwickeln sich im Spiel');
  } else {
    parts.push('Stats: noch nicht erspielt');
  }

  var highlights = (qualitativeStats || []).filter(function (stat) {
    return ['trust', 'desire', 'tension', 'intimacy', 'phase', 'teaching', 'summary'].indexOf(stat.key) !== -1;
  }).slice(0, 4);
  if (highlights.length) {
    parts.push('Profil: ' + highlights.map(function (stat) {
      return stat.label + ': ' + stat.valueText;
    }).join(' · '));
  }

  var styles = echoRelationshipStyleLabels_(profile.dominanceStyles);
  if (styles.length) parts.push('Macht: ' + styles.join(', '));

  var expertise = echoRelationshipExpertiseLabel_(profile);
  if (expertise) parts.push('ECHO: ' + expertise);

  parts.push('Einwilligung: ' + consentLabel_(consentState));
  return parts.join(' · ');
}



function isTechnicalRelationshipPlaceholder_(row) {
  row = row || {};
  var candidates = [row.entity_b, row.state_id, row.display_name, row.role].map(function (value) {
    return String(value || '').trim().toUpperCase().replace(/[ -]+/g, '_');
  });
  var placeholders = [
    'WISE_GUIDE',
    'WISEGUIDE',
    'SYSTEM_GUIDE',
    'RELATIONSHIP_TEMPLATE',
    'GENERIC_GUIDE'
  ];

  return candidates.some(function (candidate) {
    return placeholders.indexOf(candidate) !== -1;
  });
}

function echoRelationshipOverlays_(rows, profiles) {
  var profileByEntity = characterProfilesByEntity_(profiles || []);
  var linkedProfiles = {};
  var result = [];

  (rows || []).forEach(function (row) {
    if (isTechnicalRelationshipPlaceholder_(row)) return;

    var profile = profileByEntity[row.entity_b] || null;
    if (profile) linkedProfiles[profile.entityId] = true;
    result.push(relationshipToOverlay_(row, profile));
  });

  // A newly introduced woman is visible immediately, even if the separate
  // numeric RELATIONSHIP_STATE row is created by a later event.
  (profiles || []).forEach(function (profile) {
    if (isTechnicalRelationshipPlaceholder_({ entity_b: profile.entityId })) return;
    if (linkedProfiles[profile.entityId]) return;

    result.push(relationshipToOverlay_({
      entity_b: profile.entityId,
      consent_state: 'UNKNOWN',
      consent_profile: 'separate_profile_required',
      boundaries_json: JSON.stringify(profile.boundaries || []),
      intimacy_profile_json: '{}',
      notes: 'Profil hinterlegt; numerische Beziehungswerte werden erst durch ausgespielte Ereignisse festgelegt.'
    }, profile));
  });

  return result;
}



// ===== Phase 2: workbook authority, resumable transactions and projections =====

var ECHO_PHASE2_SCHEMA_VERSION = '1.0.0';

var ECHO_PHASE2_SCHEMA_ = {
  TURN_INBOX: [
    'turn_id', 'chat_id', 'received_at', 'raw_input', 'parsed_intent_json',
    'validation_status', 'commit_event_id', 'ui_feed_id', 'error_code',
    'processed_at', 'processing_token', 'attempt_count', 'transaction_id',
    'locked_at', 'context_fingerprint', 'context_read_at'
  ],
  EVENT_LOG: [
    'event_id', 'run_id', 'sequence', 'timestamp', 'chat_id', 'event_type',
    'player_action', 'narrative_summary', 'state_changes_json', 'new_flags',
    'affected_entities', 'canonicality', 'source', 'reversible', 'notes',
    'content_rating', 'intimacy_mode', 'resolution_json', 'resolution_mode', 'resolution_outcome', 'turn_id', 'transaction_id',
    'revision_id', 'committed_at', 'payload_fingerprint'
  ],
  SCENE_FEED: [
    'feed_id', 'run_id', 'sequence', 'event_id', 'scene_type', 'title',
    'location_id', 'narrative_text', 'scene_blocks_json', 'scene_contract_version', 'resolution_json', 'mood',
    'visible_changes_json', 'available_actions_json', 'portraits_json',
    'map_delta_json', 'relationship_delta_json', 'status', 'content_rating',
    'intimacy_mode', 'scene_id', 'revision_id', 'revision_number',
    'supersedes_feed_id', 'is_current', 'transaction_id', 'created_at'
  ],
  SCENE_REVISIONS: [
    'revision_id', 'scene_id', 'feed_id', 'revision_number', 'event_id',
    'source_event_id', 'turn_id', 'source_feed_id', 'supersedes_feed_id',
    'reason', 'created_at', 'transaction_id', 'payload_fingerprint'
  ],
  TURN_TRANSACTIONS: [
    'transaction_id', 'turn_id', 'event_id', 'status', 'created_at',
    'updated_at', 'attempt', 'payload_fingerprint', 'plan_json',
    'event_logged_at', 'scene_revision_at', 'state_applied_at',
    'relationships_applied_at', 'items_applied_at', 'group_members_applied_at',
    'preferences_applied_at', 'profiles_applied_at', 'committed_at',
    'error_code', 'recovery_action', 'context_fingerprint', 'ui_feed_id',
    'revision_id'
  ],
  ITEM_STATE: [
    'item_id', 'display_name', 'item_type', 'owner_type', 'owner_id',
    'location_id', 'status', 'metadata_json', 'last_event_id', 'updated_at',
    'source', 'revision'
  ],
  GROUP_MEMBERS: [
    'member_id', 'group_id', 'entity_id', 'display_name', 'role', 'status',
    'joined_at', 'left_at', 'position', 'traits_json', 'boundaries_json',
    'last_event_id', 'updated_at', 'source'
  ],
  RELATIONSHIP_STATE: [
    'state_id', 'entity_a', 'entity_b', 'trust', 'desire', 'respect', 'fear',
    'intimacy', 'power_gap', 'dependence', 'agency', 'resentment',
    'consent_profile', 'status', 'last_event_id', 'notes', 'tension', 'safety',
    'dominance', 'submission', 'consent_state', 'boundaries_json',
    'intimacy_phase', 'intimacy_profile_json', 'teaching', 'updated_at',
    'transaction_id'
  ]
};

function echoPhase2GetOrCreateSheet_(name) {
  var ss = echoSpreadsheet_();
  var sheet = ss.getSheetByName(name);
  return sheet || ss.insertSheet(name);
}

function echoPhase2EnsureHeadersOnSheet_(sheet, requiredHeaders) {
  var lastColumn = sheet.getLastColumn();
  var headers = lastColumn
    ? sheet.getRange(1, 1, 1, lastColumn).getDisplayValues()[0].map(function (value) {
        return String(value || '').trim();
      })
    : [];

  if (!headers.length || headers.every(function (header) { return !header; })) {
    sheet.getRange(1, 1, 1, requiredHeaders.length).setValues([requiredHeaders]);
    return requiredHeaders.length;
  }

  var missing = requiredHeaders.filter(function (header) {
    return headers.indexOf(header) === -1;
  });
  if (missing.length) {
    sheet.getRange(1, headers.length + 1, 1, missing.length).setValues([missing]);
  }
  return missing.length;
}

function echoPhase2EnsureSchema_() {
  var created = [];
  var addedHeaders = {};
  Object.keys(ECHO_PHASE2_SCHEMA_).forEach(function (sheetName) {
    var sheet = echoSpreadsheet_().getSheetByName(sheetName);
    if (!sheet) {
      sheet = echoPhase2GetOrCreateSheet_(sheetName);
      created.push(sheetName);
    }
    addedHeaders[sheetName] = echoPhase2EnsureHeadersOnSheet_(
      sheet,
      ECHO_PHASE2_SCHEMA_[sheetName]
    );
  });
  return {
    version: ECHO_PHASE2_SCHEMA_VERSION,
    ready: true,
    created: created,
    addedHeaders: addedHeaders
  };
}

function echoPhase2SchemaStatus_() {
  var warnings = [];
  var sheets = {};
  var ready = true;
  var ss = echoSpreadsheet_();

  Object.keys(ECHO_PHASE2_SCHEMA_).forEach(function (sheetName) {
    var sheet = ss.getSheetByName(sheetName);
    if (!sheet) {
      ready = false;
      sheets[sheetName] = { present: false, missing: ECHO_PHASE2_SCHEMA_[sheetName].slice() };
      return;
    }

    var lastColumn = sheet.getLastColumn();
    var headers = lastColumn
      ? sheet.getRange(1, 1, 1, lastColumn).getDisplayValues()[0].map(function (value) {
          return String(value || '').trim();
        })
      : [];
    var missing = ECHO_PHASE2_SCHEMA_[sheetName].filter(function (header) {
      return headers.indexOf(header) === -1;
    });
    if (missing.length) ready = false;
    sheets[sheetName] = { present: true, missing: missing };
  });

  if (!ready) warnings.push('Phase-2-Schema noch nicht vollständig migriert.');
  return {
    version: ECHO_PHASE2_SCHEMA_VERSION,
    ready: ready,
    sheets: sheets,
    warnings: warnings
  };
}

function echoPhase2StripRow_(row) {
  var output = {};
  Object.keys(row || {}).forEach(function (key) {
    if (key !== '__rowNumber') output[key] = row[key];
  });
  return output;
}

function echoPhase2Rows_(sheetName, warnings, options) {
  options = options || {};
  try {
    var rows = readTable_(getSheet_(sheetName)).rows;
    if (options.statuses) {
      rows = rows.filter(function (row) {
        return options.statuses.indexOf(String(row.status || '').toUpperCase()) !== -1;
      });
    }
    return rows.map(echoPhase2StripRow_);
  } catch (error) {
    if (warnings) {
      warnings.push({
        code: 'CONTEXT_SOURCE_UNAVAILABLE',
        sheet: sheetName,
        message: String(error && error.message ? error.message : error)
      });
    }
    return [];
  }
}

function echoPhase2LockedRows_(sheetName, warnings) {
  try {
    var rows = readTable_(getSheet_(sheetName)).rows;
    return rows
      .filter(function (row) {
        var status = String(row.status || '').trim().toUpperCase();
        return !status || status === 'LOCKED';
      })
      .map(echoPhase2StripRow_);
  } catch (error) {
    if (warnings) {
      warnings.push({
        code: 'CONTEXT_SOURCE_UNAVAILABLE',
        sheet: sheetName,
        message: String(error && error.message ? error.message : error)
      });
    }
    return [];
  }
}

function echoPhase2ActiveRows_(sheetName, warnings) {
  try {
    var rows = readTable_(getSheet_(sheetName)).rows;
    return rows
      .filter(function (row) {
        var status = String(row.status || '').trim().toUpperCase();
        return !status || ['ACTIVE', 'OPEN', 'CURRENT', 'PLAY', 'NEGOTIATED', 'LOCKED', 'UNINITIALIZED'].indexOf(status) !== -1;
      })
      .map(echoPhase2StripRow_);
  } catch (error) {
    if (warnings) {
      warnings.push({
        code: 'CONTEXT_SOURCE_UNAVAILABLE',
        sheet: sheetName,
        message: String(error && error.message ? error.message : error)
      });
    }
    return [];
  }
}

function echoPhase2Fingerprint_(value) {
  var serialized = jsonString_(value);
  try {
    var digest = Utilities.computeDigest(
      Utilities.DigestAlgorithm.SHA_256,
      serialized,
      Utilities.Charset.UTF_8
    );
    return Utilities.base64Encode(digest).replace(/=+$/, '');
  } catch (error) {
    return 'UNHASHED-' + serialized.length;
  }
}

function echoPhase2RecentRows_(rows, comparator, limit) {
  return (rows || []).slice().sort(comparator).slice(-limit);
}

function echoPhase2GroupMembersForContext_(warnings) {
  return echoPhase2ActiveRows_(ECHO_CONFIG.sheets.groupMembers, warnings);
}

function getEchoAuthoritativeContext_(options) {
  options = options || {};
  var warnings = [];
  var stateRows = echoPhase2Rows_(ECHO_CONFIG.sheets.state, warnings);
  var state = {};
  try {
    state = getStateMap_();
  } catch (error) {
    warnings.push({
      code: 'CONTEXT_STATE_UNAVAILABLE',
      message: String(error && error.message ? error.message : error)
    });
  }

  var eventRows = echoPhase2Rows_(ECHO_CONFIG.sheets.eventLog, warnings);
  var sceneRows = echoPhase2Rows_(ECHO_CONFIG.sheets.sceneFeed, warnings);
  var playableScenes = echoPhase2EffectiveSceneRows_(sceneRows.filter(isPlayableScene_));
  var relationshipRows = echoPhase2ActiveRows_(ECHO_CONFIG.sheets.relationships, warnings);
  var threadRows = echoPhase2ActiveRows_(ECHO_CONFIG.sheets.threads, warnings);
  var groupMembers = echoPhase2GroupMembersForContext_(warnings);
  var itemRows = echoPhase2Rows_(ECHO_CONFIG.sheets.items, warnings);
  var preferenceContext = getEchoPreferenceContext_({ includeAudit: !!options.includePrivate });

  var canonical = {
    canon: echoPhase2LockedRows_('CANON', warnings),
    decisions: echoPhase2LockedRows_('DECISIONS', warnings),
    rules: echoPhase2Rows_('RULES', warnings),
    echo_system: echoPhase2LockedRows_('ECHO_SYSTEM', warnings),
    world: echoPhase2LockedRows_('WORLD', warnings),
    timeline: echoPhase2LockedRows_('TIMELINE', warnings),
    characters: echoPhase2LockedRows_('CHARACTERS', warnings),
    species: echoPhase2LockedRows_('SPECIES', warnings),
    factions: echoPhase2LockedRows_('FACTIONS', warnings),
    relationships: echoPhase2LockedRows_('RELATIONSHIPS', warnings),
    flags: echoPhase2LockedRows_('FLAGS', warnings),
    player_experience: echoPhase2LockedRows_('PLAYER_EXPERIENCE', warnings),
    game_design: echoPhase2LockedRows_('GAME_DESIGN', warnings),
    ui_design: echoPhase2Rows_('UI_DESIGN', warnings)
  };

  var recentEvents = echoPhase2RecentRows_(
    eventRows.filter(function (row) { return !!row.event_id; }),
    sequenceAscending_,
    12
  );
  var recentScenes = echoPhase2RecentRows_(
    playableScenes,
    sequenceAscending_,
    12
  );
  var currentScene = latestBySequence_(playableScenes) || {};
  var openQuestions = echoPhase2Rows_('OPEN_QUESTIONS', warnings, { statuses: ['OPEN', 'ACTIVE'] });
  var projections = echoPhase4BuildProjections_(
    state,
    currentScene,
    relationshipRows,
    groupMembers,
    preferenceContext,
    warnings
  );

  var context = {
    context_version: 'phase-4',
    source_of_truth: 'ECHO_WORKBOOK',
    source_sheets: [
      'CANON', 'DECISIONS', 'RULES', 'ECHO_SYSTEM', 'WORLD', 'TIMELINE',
      'CHARACTERS', 'SPECIES', 'FACTIONS', 'RELATIONSHIPS', 'FLAGS',
      'PLAYER_EXPERIENCE', 'GAME_DESIGN', 'UI_DESIGN', 'STATE_SNAPSHOT',
      'EVENT_LOG', 'SCENE_FEED', 'RELATIONSHIP_STATE', 'THREADS',
      'ECHO_PREFERENCE_PROFILE', 'ECHO_CHARACTER_PROFILES', 'ITEM_STATE',
      'GROUP_MEMBERS'
    ],
    read_before_every_turn: true,
    revalidated_at_commit: true,
    authority: ECHO_AUTHORITY_ORDER_.slice(),
    canonical: canonical,
    current: {
      state_snapshot: stateRows,
      state_map: state,
      relationship_state: relationshipRows,
      character_profiles: echoPhase2Rows_(ECHO_CONFIG.sheets.characterProfiles, warnings),
      preferences: preferenceContext,
      items: itemRows,
      group_members: groupMembers,
      threads: threadRows,
      world_projection: projections.world,
      character_projections: projections.characters,
      relationship_projections: projections.relationships,
      group_projections: projections.groups
    },
    narrative: {
      current_scene: echoPhase2StripRow_(currentScene),
      recent_scenes: recentScenes,
      recent_events: recentEvents,
      open_questions: openQuestions
    },
    preferences: preferenceContext,
    unknowns: {
      open_questions: openQuestions,
      active_threads: threadRows
    },
    consistency: {
      warnings: warnings,
      schema: echoPhase2SchemaStatus_()
    },
    contract: {
      canonical_truth_rule: 'Only LOCKED canonical rows and committed runtime state are facts.',
      unknown_fact_rule: 'Unknown remains unknown until an event commits it.',
      preference_rule: 'Preferences guide presentation and open direction; they do not rewrite canon or create numeric relationship stats.',
      player_agency: true,
      npc_autonomy: true,
      consent_required: true,
      stop_word: 'Stopp',
      write_boundary: 'TURN_INBOX',
      narrative_destination: 'SCENE_FEED',
      chat_acknowledgement: 'Übertragen. only after commit and readback.',
      projection_rule: 'Use the current workbook-backed projections; never invent missing facts or numeric relationship values.'
    },
    projection_contract: echoProjectionContract_(),
    projections: projections
  };
  context.fingerprint = echoPhase2Fingerprint_(context);
  return context;
}

function echoPhase2TransactionForEvent_(eventId) {
  if (!eventId) return null;
  try {
    var rows = readTable_(getSheet_(ECHO_CONFIG.sheets.transactions)).rows;
    var matches = rows.filter(function (row) {
      return String(row.event_id || '') === String(eventId);
    });
    return matches.length ? matches[matches.length - 1] : null;
  } catch (error) {
    return null;
  }
}

function echoPhase2TransactionUpdate_(transactionId, patch) {
  var sheet = getSheet_(ECHO_CONFIG.sheets.transactions);
  var row = findRow_(sheet, 'transaction_id', transactionId);
  if (!row || !row.__rowNumber) throw new Error('Transaction not found: ' + transactionId);
  Object.keys(patch || {}).forEach(function (key) {
    setCellByHeader_(sheet, row.__rowNumber, key, patch[key]);
  });
}

function echoPhase2TransactionStage_(transaction, stage, patch) {
  var now = new Date();
  var update = patch || {};
  update.updated_at = now;
  update[stage + '_at'] = now;
  echoPhase2TransactionUpdate_(transaction.transaction_id, update);
  transaction.updated_at = now;
  transaction[stage + '_at'] = now;
  Object.keys(update).forEach(function (key) {
    transaction[key] = update[key];
  });
}

function echoPhase2TransactionId_(eventId, supplied) {
  if (supplied) return String(supplied);
  return 'TXN-' + String(eventId || Utilities.getUuid())
    .replace(/[^A-Za-z0-9_-]/g, '')
    .slice(0, 70);
}

function echoPhase2PlanForEvent_(event, options) {
  options = options || {};
  var scene = event.scene || {};
  var sceneId = String(options.sceneId || scene.scene_id || scene.base_scene_id || scene.feed_id || '').trim();
  var sceneRows = [];
  try {
    sceneRows = readTable_(getSheet_(ECHO_CONFIG.sheets.sceneFeed)).rows.filter(isPlayableScene_);
  } catch (error) {
    sceneRows = [];
  }
  var previous = echoPhase2LatestSceneRevision_(sceneRows, sceneId);
  var revisionNumber = Number(options.revisionNumber || scene.revision_number);
  if (!isFinite(revisionNumber) || revisionNumber < 1) {
    revisionNumber = previous ? echoPhase2SceneRevisionNumber_(previous) + 1 : 1;
  }
  var revisionId = String(options.revisionId || scene.revision_id || (
    'REV-' + String(event.event_id).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 60) + '-R' + revisionNumber
  ));
  var feedId = String(options.feedId || scene.feed_id || ('SCENE-' + event.event_id));
  return {
    sequence: Number(options.sequence || scene.sequence || nextSequence_(getSheet_(ECHO_CONFIG.sheets.eventLog), 'sequence')),
    sceneId: sceneId || feedId,
    feedId: feedId,
    revisionId: revisionId,
    revisionNumber: revisionNumber,
    supersedesFeedId: previous ? String(previous.feed_id || '') : '',
    payloadFingerprint: echoPhase2Fingerprint_(event)
  };
}

function echoPhase2StartTransaction_(event, options) {
  options = options || {};
  var sheet = getSheet_(ECHO_CONFIG.sheets.transactions);
  var existing = echoPhase2TransactionForEvent_(event.event_id);
  if (existing && String(existing.status || '').toUpperCase() === 'COMMITTED') {
    return {
      transaction: existing,
      plan: parseJson_(existing.plan_json, {}),
      duplicate: true
    };
  }

  var plan = existing ? parseJson_(existing.plan_json, null) : null;
  if (!plan || !plan.sequence) {
    plan = options.plan || echoPhase2PlanForEvent_(event, options);
    plan.contextFingerprint = options.contextFingerprint || '';
    plan.turnId = event.turn_id || '';
  }

  var transactionId = echoPhase2TransactionId_(event.event_id, options.transactionId || (existing && existing.transaction_id));
  var now = new Date();
  if (!existing) {
    appendObject_(sheet, {
      transaction_id: transactionId,
      turn_id: event.turn_id || '',
      event_id: event.event_id,
      status: 'PREPARED',
      created_at: now,
      updated_at: now,
      attempt: 1,
      payload_fingerprint: plan.payloadFingerprint || echoPhase2Fingerprint_(event),
      plan_json: jsonString_(plan),
      error_code: '',
      recovery_action: '',
      context_fingerprint: options.contextFingerprint || '',
      ui_feed_id: '',
      revision_id: plan.revisionId || ''
    });
    existing = echoPhase2TransactionForEvent_(event.event_id);
  }
  if (!existing) throw new Error('Transaction journal could not be created.');

  echoPhase2TransactionUpdate_(transactionId, {
    status: 'APPLYING',
    updated_at: now,
    attempt: Number(existing.attempt || 0) + (existing.status === 'PREPARED' ? 0 : 1),
    error_code: '',
    recovery_action: ''
  });

  existing.transaction_id = transactionId;
  existing.status = 'APPLYING';
  existing.plan_json = jsonString_(plan);
  existing.context_fingerprint = options.contextFingerprint || existing.context_fingerprint || '';
  existing.revision_id = plan.revisionId || existing.revision_id || '';
  return { transaction: existing, plan: plan, duplicate: false };
}

function echoPhase2RecoverTransactions_() {
  var sheet = getSheet_(ECHO_CONFIG.sheets.transactions);
  var now = new Date().getTime();
  readTable_(sheet).rows.forEach(function (transaction) {
    var status = String(transaction.status || '').toUpperCase();
    if (['PREPARED', 'APPLYING', 'RECOVERY_REQUIRED'].indexOf(status) === -1) return;
    var updated = stateTimestamp_(transaction.updated_at || transaction.created_at);
    if (!updated || now - updated < 5 * 60 * 1000) return;

    echoPhase2TransactionUpdate_(transaction.transaction_id, {
      status: 'RECOVERY_REQUIRED',
      recovery_action: 'retry_from_processor',
      updated_at: new Date()
    });

    var inbox = findRow_(getSheet_(ECHO_CONFIG.sheets.turnInbox), 'turn_id', transaction.turn_id);
    if (inbox && String(inbox.validation_status || '').toUpperCase() !== 'COMMITTED') {
      updateTurnInboxRow_(inbox.__rowNumber, {
        validation_status: 'RECOVERY_REQUIRED',
        transaction_id: transaction.transaction_id,
        processed_at: '',
        error_code: transaction.error_code || 'Transaction requires recovery.'
      });
    }
  });
}

function echoPhase2SceneRevisionNumber_(row) {
  var number = Number(row && row.revision_number);
  return isFinite(number) && number > 0 ? number : 1;
}

function echoPhase2SceneKey_(row) {
  return String(row && (row.scene_id || row.feed_id) || '').trim();
}

function echoPhase2SceneIsLater_(candidate, current) {
  if (!current) return true;
  var revisionDiff = echoPhase2SceneRevisionNumber_(candidate) - echoPhase2SceneRevisionNumber_(current);
  if (revisionDiff) return revisionDiff > 0;
  var sequenceDiff = Number(candidate.sequence || 0) - Number(current.sequence || 0);
  if (sequenceDiff) return sequenceDiff > 0;
  var timeDiff = stateTimestamp_(candidate.created_at || candidate.updated_at || candidate.timestamp) -
    stateTimestamp_(current.created_at || current.updated_at || current.timestamp);
  if (timeDiff) return timeDiff > 0;
  return Number(candidate.__rowNumber || 0) > Number(current.__rowNumber || 0);
}

function echoPhase2LatestSceneRevision_(rows, sceneId) {
  var candidates = (rows || []).filter(function (row) {
    return echoPhase2SceneKey_(row) === String(sceneId || '').trim();
  });
  var latest = null;
  candidates.forEach(function (row) {
    if (echoPhase2SceneIsLater_(row, latest)) latest = row;
  });
  return latest;
}

function echoPhase2EffectiveSceneRows_(rows) {
  var latest = {};
  (rows || []).forEach(function (row) {
    var key = echoPhase2SceneKey_(row);
    if (!key) return;
    if (echoPhase2SceneIsLater_(row, latest[key])) latest[key] = row;
  });
  return Object.keys(latest).map(function (key) { return latest[key]; });
}

function echoPhase2AppendSceneRevision_(event, options) {
  options = options || {};
  var scene = event.scene || {};
  var resolution = normalizeResolution_(event.resolution);
  var storageBlocks = sceneBlocksForStorage_(scene);
  if (!isSceneCorrection_(event)) {
    storageBlocks = sceneBlocksWithResolution_(storageBlocks, resolution);
  }
  var sceneFeed = getSheet_(ECHO_CONFIG.sheets.sceneFeed);
  var revisionSheet = getSheet_(ECHO_CONFIG.sheets.sceneRevisions);
  var sceneEventId = String(options.sceneEventId || event.event_id || '');
  var existingForEvent = findRow_(sceneFeed, 'event_id', sceneEventId);

  if (existingForEvent && !options.forceNewRevision && !existingForEvent.revision_id) {
    return {
      feed_id: String(existingForEvent.feed_id || ''),
      scene_id: String(existingForEvent.scene_id || existingForEvent.feed_id || ''),
      revision_id: '',
      revision_number: 1,
      duplicate: true
    };
  }

  var sceneId = String(options.sceneId || scene.scene_id || scene.base_scene_id || scene.feed_id || '').trim();
  var currentRows = readTable_(sceneFeed).rows.filter(isPlayableScene_);
  var previous = echoPhase2LatestSceneRevision_(currentRows, sceneId);
  var revisionNumber = Number(options.revisionNumber || scene.revision_number);
  if (!isFinite(revisionNumber) || revisionNumber < 1) {
    revisionNumber = previous ? echoPhase2SceneRevisionNumber_(previous) + 1 : 1;
  }

  var revisionId = String(options.revisionId || scene.revision_id || (
    'REV-' + String(event.event_id || Utilities.getUuid()).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 60) + '-R' + revisionNumber
  ));
  var feedId = String(options.feedId || scene.feed_id || ('SCENE-' + event.event_id));
  var feedRow = findRow_(sceneFeed, 'feed_id', feedId);
  if (feedRow && String(feedRow.revision_id || '') !== revisionId) {
    feedId = feedId + '-REV-' + String(revisionNumber);
    feedRow = findRow_(sceneFeed, 'feed_id', feedId);
  }

  if (feedRow && String(feedRow.revision_id || '') === revisionId) {
    return {
      feed_id: String(feedRow.feed_id || feedId),
      scene_id: String(feedRow.scene_id || sceneId || feedId),
      revision_id: revisionId,
      revision_number: echoPhase2SceneRevisionNumber_(feedRow),
      duplicate: true
    };
  }

  var now = new Date();
  var row = {
    feed_id: feedId,
    run_id: scene.run_id || event.run_id || 'PROTO-SAVE-001',
    sequence: scene.sequence === undefined ? (options.sequence || nextSequence_(getSheet_(ECHO_CONFIG.sheets.eventLog), 'sequence')) : scene.sequence,
    event_id: sceneEventId,
    scene_type: scene.scene_type || 'narrative',
    title: scene.title || 'Neue Szene',
    location_id: scene.location_id || stateValue_(getStateMap_(), 'player.location_id') || 'UNKNOWN_LOCATION',
    narrative_text: options.narrativeText !== undefined
      ? options.narrativeText
      : sceneTextFromBlocks_(storageBlocks, scene.narrative_text || event.narrative_summary || ''),
    scene_blocks_json: jsonString_(storageBlocks),
    scene_contract_version: ECHO_SCENE_CONTRACT_VERSION,
    mood: scene.mood || 'unbestimmt',
    visible_changes_json: jsonString_(scene.visible_changes_json || {}),
    available_actions_json: jsonString_(scene.available_actions_json || []),
    portraits_json: jsonString_(scene.portraits_json || {}),
    map_delta_json: jsonString_(scene.map_delta_json || {}),
    relationship_delta_json: jsonString_(scene.relationship_delta_json || {}),
    status: scene.status || 'PLAY',
    content_rating: scene.content_rating || event.content_rating || '',
    intimacy_mode: scene.intimacy_mode || event.intimacy_mode || '',
    resolution_json: jsonString_(resolution),
    scene_id: sceneId || feedId,
    revision_id: revisionId,
    revision_number: revisionNumber,
    supersedes_feed_id: options.supersedesFeedId !== undefined
      ? options.supersedesFeedId
      : (previous ? previous.feed_id : ''),
    is_current: 'TRUE',
    transaction_id: options.transactionId || '',
    created_at: now
  };
  appendObject_(sceneFeed, row);

  var revisionExisting = findRow_(revisionSheet, 'revision_id', revisionId);
  if (!revisionExisting) {
    appendObject_(revisionSheet, {
      revision_id: revisionId,
      scene_id: row.scene_id,
      feed_id: row.feed_id,
      revision_number: revisionNumber,
      event_id: options.correctionEventId || sceneEventId,
      source_event_id: sceneEventId,
      turn_id: event.turn_id || '',
      source_feed_id: options.sourceFeedId || (previous ? previous.feed_id : ''),
      supersedes_feed_id: row.supersedes_feed_id || '',
      reason: options.reason || 'NEW_SCENE',
      created_at: now,
      transaction_id: options.transactionId || '',
      payload_fingerprint: options.payloadFingerprint || echoPhase2Fingerprint_(event)
    });
  }

  return {
    feed_id: feedId,
    scene_id: row.scene_id,
    revision_id: revisionId,
    revision_number: revisionNumber,
    duplicate: false
  };
}

function echoPhase2NormalizeItemUpdates_(updates) {
  if (!updates) return [];
  if (Array.isArray(updates)) return updates.slice();
  if (updates.item_id || updates.id) return [updates];

  return Object.keys(updates).map(function (itemId) {
    var patch = updates[itemId] && typeof updates[itemId] === 'object'
      ? Object.assign({}, updates[itemId])
      : {};
    patch.item_id = patch.item_id || patch.id || itemId;
    return patch;
  });
}

function echoPhase2NormalizeItemPatch_(patch, fallbackId) {
  patch = patch || {};
  var itemId = String(patch.item_id || patch.id || fallbackId || '').trim();
  if (!itemId) throw new Error('item_updates requires item_id.');

  var ownerType = String(patch.owner_type || '').toUpperCase();
  var ownerId = String(patch.owner_id || '').trim();
  if (!ownerType) ownerType = ownerId === 'PLAYER' ? 'PLAYER' : (ownerId ? 'CHARACTER' : 'UNKNOWN');
  if (['PLAYER', 'CHARACTER', 'GROUP', 'LOCATION', 'NONE', 'UNKNOWN'].indexOf(ownerType) === -1) {
    throw new Error('Unknown item owner_type: ' + ownerType);
  }

  var rawStatus = String(patch.status || (ownerType === 'NONE' ? 'REMOVED' : 'ACTIVE')).toUpperCase();
  // Legacy STATE_SNAPSHOT inventory rows use CARRIED; ITEM_STATE uses
  // ACTIVE for an item owned by an entity but not currently held.
  var statusAliases = {
    CARRIED: 'ACTIVE'
  };
  var status = statusAliases[rawStatus] || rawStatus;
  if (['ACTIVE', 'HELD', 'REMOVED', 'DESTROYED', 'LOST', 'CONFLICT', 'UNKNOWN'].indexOf(status) === -1) {
    throw new Error('Unknown item status: ' + rawStatus);
  }

  var metadata = patch.metadata_json !== undefined ? patch.metadata_json : patch.metadata;
  if (metadata !== undefined && typeof metadata !== 'string') metadata = JSON.stringify(metadata);
  if (metadata === undefined) metadata = '{}';

  return {
    item_id: itemId,
    display_name: patch.display_name || patch.name || patch.label || itemId,
    item_type: patch.item_type || patch.type || '',
    owner_type: ownerType,
    owner_id: ownerId,
    location_id: patch.location_id || '',
    status: status,
    metadata_json: metadata,
    source: patch.source || 'ECHO_EVENT'
  };
}

function echoPhase2ItemList_(value) {
  if (Array.isArray(value)) return value;
  return parseList_(value, []);
}

function echoPhase2FindItemRow_(sheet, itemId) {
  return findRow_(sheet, 'item_id', itemId);
}

function echoPhase2UpsertItem_(sheet, patch, eventId, now) {
  var row = echoPhase2FindItemRow_(sheet, patch.item_id);
  if (!row) {
    appendObject_(sheet, {
      item_id: patch.item_id,
      display_name: patch.display_name,
      item_type: patch.item_type,
      owner_type: patch.owner_type,
      owner_id: patch.owner_id,
      location_id: patch.location_id,
      status: patch.status,
      metadata_json: patch.metadata_json,
      last_event_id: eventId || '',
      updated_at: now || new Date(),
      source: patch.source || 'ECHO_EVENT',
      revision: 1
    });
    return;
  }

  var nextRevision = Number(row.revision || 0) + 1;
  var update = Object.assign({}, patch, {
    last_event_id: eventId || row.last_event_id || '',
    updated_at: now || new Date(),
    revision: nextRevision
  });
  Object.keys(update).forEach(function (key) {
    setCellByHeader_(sheet, row.__rowNumber, key, update[key]);
  });
}

function echoPhase2ApplyItemStateUpdates_(event, eventId, now) {
  var sheet = getSheet_(ECHO_CONFIG.sheets.items);
  var stateUpdates = event.state_updates || {};
  var patches = echoPhase2NormalizeItemUpdates_(
    event.item_updates || stateUpdates.item_updates
  );

  var fullInventory = stateUpdates['player.inventory'] !== undefined
    ? stateUpdates['player.inventory']
    : stateUpdates.inventory;
  var inventoryItems = fullInventory === undefined ? null : echoPhase2ItemList_(fullInventory);
  if (inventoryItems) {
    inventoryItems.forEach(function (item) {
      var identity = normalizedItemIdentity_(item);
      patches.push(echoPhase2NormalizeItemPatch_(
        typeof item === 'object'
          ? Object.assign({}, item, { owner_type: 'PLAYER', owner_id: 'PLAYER' })
          : { item_id: item, display_name: item, owner_type: 'PLAYER', owner_id: 'PLAYER' },
        identity
      ));
    });
  }

  var added = echoPhase2ItemList_(stateUpdates.inventory_added);
  added.forEach(function (item) {
    patches.push(echoPhase2NormalizeItemPatch_(
      typeof item === 'object'
        ? Object.assign({}, item, { owner_type: 'PLAYER', owner_id: 'PLAYER' })
        : { item_id: item, display_name: item, owner_type: 'PLAYER', owner_id: 'PLAYER' },
      normalizedItemIdentity_(item)
    ));
  });

  var removed = echoPhase2ItemList_(stateUpdates.inventory_removed);
  removed.forEach(function (item) {
    var id = normalizedItemIdentity_(item);
    if (id) patches.push(echoPhase2NormalizeItemPatch_({
      item_id: id,
      owner_type: 'NONE',
      owner_id: '',
      status: 'REMOVED',
      source: 'ECHO_EVENT'
    }, id));
  });

  var held = stateUpdates['player.held_item'] !== undefined
    ? stateUpdates['player.held_item']
    : stateUpdates.held_item;
  var heldId = normalizedItemIdentity_(held);
  if (heldId && inventoryItems && inventoryItems.some(function (item) {
    return normalizedItemIdentity_(item) === heldId;
  })) {
    patches.push(echoPhase2NormalizeItemPatch_({
      item_id: heldId,
      owner_type: 'PLAYER',
      owner_id: 'PLAYER',
      status: 'HELD',
      source: 'ECHO_EVENT'
    }, heldId));
  }

  var byId = {};
  patches.forEach(function (rawPatch) {
    var patch = echoPhase2NormalizeItemPatch_(rawPatch, normalizedItemIdentity_(rawPatch));
    if (patch.item_id) byId[patch.item_id] = patch;
  });
  Object.keys(byId).forEach(function (itemId) {
    echoPhase2UpsertItem_(sheet, byId[itemId], eventId, now);
  });
}

function echoPhase2ItemProjection_(warnings) {
  warnings = warnings || [];
  var sheet;
  try {
    sheet = getSheet_(ECHO_CONFIG.sheets.items);
  } catch (error) {
    return { available: false, hasRows: false, items: [], inventory: [], playerHeldItem: '' };
  }

  var rows = readTable_(sheet).rows.filter(function (row) { return !!row.item_id; });
  if (!rows.length) return { available: true, hasRows: false, items: [], inventory: [], playerHeldItem: '' };

  var latest = {};
  rows.forEach(function (row) {
    if (recordIsNewer_(row, latest[row.item_id])) latest[row.item_id] = row;
  });

  var items = [];
  var inventory = [];
  var playerHeldItem = '';
  Object.keys(latest).forEach(function (itemId) {
    var row = latest[itemId];
    var ownerType = String(row.owner_type || '').toUpperCase();
    var status = String(row.status || '').toUpperCase();

    if (ownerType === 'PLAYER' && ['ACTIVE', 'HELD'].indexOf(status) !== -1) {
      var metadata = parseJson_(row.metadata_json, {});
      items.push({
        itemId: itemId,
        ownerEntityId: 'PLAYER',
        source: 'ITEM_STATE',
        status: status,
        label: row.display_name || itemId,
        conflict: false
      });
      inventory.push({
        id: itemId,
        name: row.display_name || itemId,
        desc: metadata.description || metadata.desc || ''
      });
      if (status === 'HELD') playerHeldItem = itemId;
    }
  });

  return {
    available: true,
    hasRows: true,
    playerHeldItem: playerHeldItem,
    items: items,
    inventory: inventory
  };
}

function migrateLegacyItemState_() {
  echoPhase2EnsureSchema_();
  var state = getStateMap_();
  var inventory = parseList_(stateValue_(state, 'player.inventory'), []);
  var held = String(stateValue_(state, 'player.held_item') || '').trim();
  var eventId = String(stateValue_(state, 'save.last_event_id') || 'PHASE2-MIGRATION');
  var now = new Date();
  var sheet = getSheet_(ECHO_CONFIG.sheets.items);
  var count = 0;

  inventory.forEach(function (item) {
    var patch = echoPhase2NormalizeItemPatch_(item, normalizedItemIdentity_(item));
    if (normalizedItemIdentity_(item) === held) patch.status = 'HELD';
    patch.owner_type = 'PLAYER';
    patch.owner_id = 'PLAYER';
    patch.source = 'PHASE2_MIGRATION';
    echoPhase2UpsertItem_(sheet, patch, eventId, now);
    count += 1;
  });

  return { ok: true, migrated_items: count, source: 'STATE_SNAPSHOT' };
}

function migrateEchoPhase2() {
  var schema = echoPhase2EnsureSchema_();
  var items = migrateLegacyItemState_();
  return { ok: true, schema: schema, item_state: items };
}

function echoPhase2NormalizeGroupUpdates_(updates) {
  if (!updates) return [];
  if (Array.isArray(updates)) return updates.slice();
  if (updates.member_id || updates.entity_id) return [updates];

  return Object.keys(updates).map(function (memberId) {
    var patch = updates[memberId] && typeof updates[memberId] === 'object'
      ? Object.assign({}, updates[memberId])
      : {};
    patch.member_id = patch.member_id || memberId;
    return patch;
  });
}

function echoPhase2NormalizeGroupPatch_(patch, fallbackId) {
  patch = patch || {};
  var memberId = String(patch.member_id || fallbackId || '').trim();
  var groupId = String(patch.group_id || '').trim();
  var entityId = String(patch.entity_id || '').trim();
  if (!memberId || !groupId || !entityId) {
    throw new Error('group_member_updates requires member_id, group_id and entity_id.');
  }

  var status = String(patch.status || 'ACTIVE').toUpperCase();
  if (['ACTIVE', 'PAUSED', 'LEFT', 'INACTIVE'].indexOf(status) === -1) {
    throw new Error('Unknown group member status: ' + status);
  }

  var json = function (value, fallback) {
    if (value === undefined || value === null || value === '') return fallback;
    return typeof value === 'string' ? (parseJsonValue_(value), value) : JSON.stringify(value);
  };

  return {
    member_id: memberId,
    group_id: groupId,
    entity_id: entityId,
    display_name: patch.display_name || patch.name || entityId,
    role: patch.role || '',
    status: status,
    joined_at: patch.joined_at || '',
    left_at: patch.left_at || '',
    position: patch.position === undefined ? '' : patch.position,
    traits_json: json(patch.traits_json !== undefined ? patch.traits_json : patch.traits, '{}'),
    boundaries_json: json(patch.boundaries_json !== undefined ? patch.boundaries_json : patch.boundaries, '[]'),
    source: patch.source || 'ECHO_EVENT'
  };
}

function validatePhase2EventUpdates_(event) {
  echoPhase2NormalizeItemUpdates_(event.item_updates || (event.state_updates && event.state_updates.item_updates))
    .forEach(function (patch) {
      echoPhase2NormalizeItemPatch_(patch, normalizedItemIdentity_(patch));
    });

  echoPhase2NormalizeGroupUpdates_(
    event.group_member_updates ||
    event.group_updates ||
    (event.state_updates && event.state_updates.group_member_updates)
  ).forEach(function (patch) {
    echoPhase2NormalizeGroupPatch_(patch, patch && patch.member_id);
  });
}

function echoPhase2ApplyGroupMemberUpdates_(event, eventId, now) {
  var updates = echoPhase2NormalizeGroupUpdates_(
    event.group_member_updates ||
    event.group_updates ||
    (event.state_updates && event.state_updates.group_member_updates)
  );
  if (!updates.length) return;

  var sheet = getSheet_(ECHO_CONFIG.sheets.groupMembers);
  updates.forEach(function (rawPatch) {
    var patch = echoPhase2NormalizeGroupPatch_(rawPatch, rawPatch && rawPatch.member_id);
    var row = findRow_(sheet, 'member_id', patch.member_id);
    var update = {
      last_event_id: eventId || '',
      updated_at: now || new Date()
    };

    if (!row) {
      update = Object.assign({}, patch, update);
      if (['LEFT', 'INACTIVE'].indexOf(patch.status) !== -1 && !patch.left_at) {
        update.left_at = now || new Date();
      }
      appendObject_(sheet, update);
      return;
    }

    Object.keys(rawPatch || {}).forEach(function (key) {
      if (key === 'member_id') return;
      if (patch[key] !== undefined) update[key] = patch[key];
    });
    if (patch.status && ['LEFT', 'INACTIVE'].indexOf(patch.status) !== -1 &&
        rawPatch.left_at === undefined && !row.left_at) {
      update.left_at = now || new Date();
    }
    Object.keys(update).forEach(function (key) {
      setCellByHeader_(sheet, row.__rowNumber, key, update[key]);
    });
  });
}

function echoPhase2CommitPlan_(event, options) {
  options = options || {};
  validateEventShape_(event);
  validatePhase2EventUpdates_(event);

  var context = getEchoAuthoritativeContext_({ includePrivate: false });
  var existing = echoPhase2StartTransaction_(event, {
    transactionId: options.transactionId || '',
    contextFingerprint: context.fingerprint
  });

  if (existing.duplicate) {
    return {
      ok: true,
      duplicate: true,
      transaction_id: existing.transaction.transaction_id,
      event_id: event.event_id,
      ui_feed_id: existing.transaction.ui_feed_id || ''
    };
  }

  var transaction = existing.transaction;
  var plan = existing.plan;
  var eventLogSheet = getSheet_(ECHO_CONFIG.sheets.eventLog);
  var sceneResult = null;
  var resolution = normalizeResolution_(event.resolution);

  try {
    if (!transaction.event_logged_at) {
      var existingEvent = findRow_(eventLogSheet, 'event_id', event.event_id);
      if (!existingEvent) {
        appendObject_(eventLogSheet, {
          event_id: event.event_id,
          run_id: event.run_id || 'PROTO-SAVE-001',
          sequence: plan.sequence,
          timestamp: new Date(),
          chat_id: event.chat_id || 'ECHO-PROJECT',
          event_type: event.event_type || 'PLAYER_ACTION',
          player_action: event.player_action,
          narrative_summary: event.narrative_summary,
          state_changes_json: jsonString_(event.state_updates || {}),
          new_flags: jsonString_(event.new_flags || []),
          affected_entities: jsonString_(event.affected_entities || []),
          canonicality: event.canonicality || 'PLAY',
          source: event.source || 'ECHO_CHATGPT',
          reversible: event.reversible === undefined ? 'TRUE' : String(event.reversible),
          notes: event.notes || '',
          content_rating: event.content_rating || '',
          intimacy_mode: event.intimacy_mode || '',
          resolution_json: jsonString_(resolution),
          resolution_mode: resolution.mode || '',
          resolution_outcome: resolution.outcome || '',
          turn_id: event.turn_id || '',
          transaction_id: transaction.transaction_id,
          revision_id: plan.revisionId || '',
          committed_at: new Date(),
          payload_fingerprint: plan.payloadFingerprint || ''
        });
      }
      echoPhase2TransactionStage_(transaction, 'event_logged');
    }

    if (!transaction.scene_revision_at) {
      sceneResult = echoPhase2AppendSceneRevision_(event, {
        sceneId: plan.sceneId,
        feedId: plan.feedId,
        revisionId: plan.revisionId,
        revisionNumber: plan.revisionNumber,
        sequence: plan.sequence,
        transactionId: transaction.transaction_id,
        payloadFingerprint: plan.payloadFingerprint,
        reason: 'NEW_SCENE'
      });
      echoPhase2TransactionStage_(transaction, 'scene_revision', {
        ui_feed_id: sceneResult.feed_id,
        revision_id: sceneResult.revision_id || ''
      });
    } else {
      sceneResult = {
        feed_id: transaction.ui_feed_id || '',
        revision_id: transaction.revision_id || ''
      };
    }

    if (!transaction.state_applied_at) {
      applyStateUpdates_(event.state_updates || {}, event.event_id, new Date());
      echoPhase2TransactionStage_(transaction, 'state_applied');
    }

    if (!transaction.relationships_applied_at) {
      applyRelationshipUpdates_(event.relationship_updates || {}, event.event_id, new Date());
      echoPhase2TransactionStage_(transaction, 'relationships_applied');
    }

    if (!transaction.items_applied_at) {
      echoPhase2ApplyItemStateUpdates_(event, event.event_id, new Date());
      echoPhase2TransactionStage_(transaction, 'items_applied');
    }

    if (!transaction.group_members_applied_at) {
      echoPhase2ApplyGroupMemberUpdates_(event, event.event_id, new Date());
      echoPhase2TransactionStage_(transaction, 'group_members_applied');
    }

    if (!transaction.preferences_applied_at) {
      applyPreferenceUpdates_(event.preference_updates || null, event.event_id, new Date());
      echoPhase2TransactionStage_(transaction, 'preferences_applied');
    }

    if (!transaction.profiles_applied_at) {
      applyCharacterProfileUpdates_(event.character_profile_updates || null, event.event_id, new Date());
      echoPhase2TransactionStage_(transaction, 'profiles_applied');
    }

    updateStateKey_('save.last_event_id', event.event_id, 'event_id', 'save metadata', event.event_id, new Date());
    echoPhase2TransactionUpdate_(transaction.transaction_id, {
      status: 'COMMITTED',
      committed_at: new Date(),
      updated_at: new Date(),
      error_code: '',
      recovery_action: ''
    });

    return {
      ok: true,
      duplicate: false,
      transaction_id: transaction.transaction_id,
      event_id: event.event_id,
      ui_feed_id: sceneResult ? sceneResult.feed_id : (transaction.ui_feed_id || ''),
      revision_id: sceneResult ? sceneResult.revision_id : (transaction.revision_id || '')
    };
  } catch (error) {
    echoPhase2TransactionUpdate_(transaction.transaction_id, {
      status: 'RECOVERY_REQUIRED',
      updated_at: new Date(),
      error_code: String(error && error.message ? error.message : error),
      recovery_action: 'retry_from_processor'
    });
    throw error;
  }
}

function commitTurnCore_(event, options) {
  return echoPhase2CommitPlan_(event, options || {});
}

function commitSceneCorrectionCore_(event, options) {
  options = options || {};
  validateSceneCorrection_(event);
  echoPhase2EnsureSchema_();

  var turnInboxSheet = getSheet_(ECHO_CONFIG.sheets.turnInbox);
  var originalTurn = findRow_(
    turnInboxSheet,
    'turn_id',
    event.correction_for_turn_id
  );
  if (!originalTurn) {
    throw new Error('Correction target turn not found: ' + event.correction_for_turn_id);
  }

  var originalEventId = String(originalTurn.commit_event_id || '').trim();
  var sceneFeedSheet = getSheet_(ECHO_CONFIG.sheets.sceneFeed);
  var targetScene = originalTurn.ui_feed_id
    ? findRow_(sceneFeedSheet, 'feed_id', originalTurn.ui_feed_id)
    : null;
  if (!targetScene && originalEventId) {
    targetScene = findRow_(sceneFeedSheet, 'event_id', originalEventId);
  }
  if (!targetScene) {
    throw new Error('Correction target scene not found for turn: ' + event.correction_for_turn_id);
  }

  var allScenes = readTable_(sceneFeedSheet).rows.filter(isPlayableScene_);
  var sceneId = echoPhase2SceneKey_(targetScene);
  var current = echoPhase2LatestSceneRevision_(allScenes, sceneId) || targetScene;
  var plan = echoPhase2PlanForEvent_(event, {
    sceneId: sceneId,
    feedId: event.scene.feed_id || String(current.feed_id || ''),
    revisionNumber: echoPhase2SceneRevisionNumber_(current) + 1,
    revisionId: 'REV-' + String(event.event_id).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 60) + '-R' + (echoPhase2SceneRevisionNumber_(current) + 1)
  });

  var started = echoPhase2StartTransaction_(event, {
    transactionId: options.transactionId || '',
    contextFingerprint: '',
    plan: plan
  });
  if (started.duplicate) {
    return {
      ok: true,
      correction: true,
      duplicate: true,
      transaction_id: started.transaction.transaction_id,
      event_id: originalEventId,
      ui_feed_id: started.transaction.ui_feed_id || ''
    };
  }

  var transaction = started.transaction;
  plan = started.plan || plan;
  try {
    var correctionScene = Object.assign({}, event.scene, {
      narrative_text: sceneTextForCorrection_(event)
    });
    var result = echoPhase2AppendSceneRevision_(
      Object.assign({}, event, { scene: correctionScene }),
      {
        forceNewRevision: true,
        sceneId: sceneId,
        feedId: plan.feedId,
        revisionId: plan.revisionId,
        revisionNumber: plan.revisionNumber,
        sequence: current.sequence,
        sceneEventId: originalEventId,
        correctionEventId: event.event_id,
        sourceFeedId: current.feed_id,
        supersedesFeedId: current.feed_id,
        transactionId: transaction.transaction_id,
        payloadFingerprint: echoPhase2Fingerprint_(event),
        reason: 'CORRECTION'
      }
    );
    echoPhase2TransactionStage_(transaction, 'scene_revision', {
      ui_feed_id: result.feed_id,
      revision_id: result.revision_id
    });
    echoPhase2TransactionUpdate_(transaction.transaction_id, {
      status: 'COMMITTED',
      committed_at: new Date(),
      updated_at: new Date(),
      error_code: '',
      recovery_action: ''
    });

    return {
      ok: true,
      correction: true,
      duplicate: false,
      transaction_id: transaction.transaction_id,
      event_id: originalEventId,
      ui_feed_id: result.feed_id,
      revision_id: result.revision_id
    };
  } catch (error) {
    echoPhase2TransactionUpdate_(transaction.transaction_id, {
      status: 'RECOVERY_REQUIRED',
      updated_at: new Date(),
      error_code: String(error && error.message ? error.message : error),
      recovery_action: 'retry_from_processor'
    });
    throw error;
  }
}

