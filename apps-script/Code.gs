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
    characterProfiles: 'ECHO_CHARACTER_PROFILES'
  }
};


var ECHO_BUILD_ID = 'phase-1-foundation-2026-08-27';
var ECHO_STATE_MODEL_VERSION = '2.2.0';
var ECHO_PREFERENCE_POLICY_VERSION = '1.1.0';

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
  version: '1.0.0',
  mode: 'OVERLAY_ONLY',
  chat_response_mode: 'ACK_ONLY',
  narrative_destination: 'SCENE_FEED',
  overlay_response_mode: 'FULL_NARRATIVE',
  acknowledgement_on_success: 'Übertragen.',
  failure_response: 'Fehler kurz melden; keine Erzählung im Chat ausgeben.',
  completion_rule: 'ACK_ONLY_AFTER_COMMIT_AND_READBACK',
  processing_mode: 'THOROUGH_PERSISTENCE_AND_CONSISTENCY_CHECK',
  preferred_quality_window: '2–3 Minuten interne Prüfung, sofern der Zug es erfordert',
  include_narrative_in_chat: false
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
    include_narrative_in_chat: ECHO_CHAT_DELIVERY_POLICY.include_narrative_in_chat
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
  if (action === 'preferences') {
    return jsonOutput_(echoGetPreferenceContext_({ includeAudit: true }));
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

var ECHO_CONTRACT_VERSION = '2.1.0';

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
  ensurePreferenceSheets_();
  ensureHeaders_(ECHO_CONFIG.sheets.relationships, [
    'respect', 'tension', 'safety', 'dominance', 'submission',
    'consent_state', 'boundaries_json', 'intimacy_phase', 'intimacy_profile_json',
    'teaching'
  ]);
  ensureHeaders_(ECHO_CONFIG.sheets.eventLog, ['content_rating', 'intimacy_mode']);
  ensureHeaders_(ECHO_CONFIG.sheets.sceneFeed, ['content_rating', 'intimacy_mode', 'scene_blocks_json']);
  return { ok: true, message: 'ECHO-Schema geprüft und fehlende Spalten ergänzt.' };
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

function sceneBlocksFrom_(raw) {
  var value = raw;
  if (typeof value === 'string') value = parseJson_(value, null);
  if (!Array.isArray(value)) return [];

  return value.map(function (block) {
    if (typeof block === 'string') {
      return { type: 'prose', text: block };
    }
    if (!block || typeof block !== 'object') return null;
    return {
      type: block.type || block.kind || 'prose',
      speaker: block.speaker || '',
      text: block.text || block.content || ''
    };
  }).filter(function (block) {
    return block && String(block.text || '').trim() !== '';
  });
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
    if (type === 'dialogue' && String(block.speaker || '').trim()) {
      var dialogue = text.replace(/^„|“$/g, '').trim();
      return String(block.speaker).trim() + ': „' + dialogue + '“';
    }
    if (type === 'system') return 'SYSTEM: ' + text;
    return text;
  }).filter(function (text) {
    return !!text;
  }).join('\n\n');
}

function sceneBlocksForOverlay_(scene) {
  return sceneBlocksFrom_(
    scene && (scene.scene_blocks_json || scene.blocks_json || scene.blocks)
  );
}


function validateSceneBlocks_(scene) {
  if (!scene) return;
  var raw = scene.scene_blocks_json !== undefined
    ? scene.scene_blocks_json
    : (scene.blocks_json !== undefined ? scene.blocks_json : scene.blocks);
  if (raw === undefined || raw === null || raw === '') return;

  var blocks = typeof raw === 'string' ? parseJson_(raw, null) : raw;
  if (!Array.isArray(blocks)) {
    throw new Error('scene blocks must be an array or JSON array.');
  }

  blocks.forEach(function (block, index) {
    if (typeof block === 'string') {
      if (!block.trim()) throw new Error('scene block ' + index + ' cannot be empty.');
      return;
    }
    if (!block || typeof block !== 'object' || Array.isArray(block)) {
      throw new Error('scene block ' + index + ' must be an object or string.');
    }
    if (!String(block.text || block.content || '').trim()) {
      throw new Error('scene block ' + index + ' requires text or content.');
    }
    if (block.speaker !== undefined && typeof block.speaker !== 'string') {
      throw new Error('scene block ' + index + ' speaker must be text.');
    }
  });
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
  validateSceneCorrection_(event);

  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var turnInboxSheet = getSheet_(ECHO_CONFIG.sheets.turnInbox);
    var originalTurn = findRow_(
      turnInboxSheet,
      'turn_id',
      event.correction_for_turn_id
    );
    if (!originalTurn) {
      throw new Error(
        'Correction target turn not found: ' + event.correction_for_turn_id
      );
    }

    var originalEventId = String(originalTurn.commit_event_id || '').trim();
    var sceneFeedSheet = getSheet_(ECHO_CONFIG.sheets.sceneFeed);
    var targetScene = originalTurn.ui_feed_id
      ? findRow_(sceneFeedSheet, 'feed_id', originalTurn.ui_feed_id)
      : null;
    if (!targetScene && originalEventId) {
      targetScene = findRow_(sceneFeedSheet, 'event_id', originalEventId);
    }
    if (!targetScene || !targetScene.__rowNumber) {
      throw new Error(
        'Correction target scene not found for turn: ' + event.correction_for_turn_id
      );
    }
    if (originalEventId && String(targetScene.event_id || '') !== originalEventId) {
      throw new Error('Correction target event mismatch');
    }
    if (!hasHeader_(sceneFeedSheet, 'narrative_text')) {
      throw new Error('Missing scene column: narrative_text');
    }

    [
      'scene_type',
      'title',
      'location_id',
      'narrative_text',
      'mood',
      'visible_changes_json',
      'available_actions_json',
      'portraits_json',
      'map_delta_json',
      'relationship_delta_json',
      'scene_blocks_json',
      'status',
      'content_rating',
      'intimacy_mode'
    ].forEach(function (key) {
      if (event.scene[key] !== undefined && event.scene[key] !== null) {
        var value = key === 'narrative_text'
          ? sceneTextForCorrection_(event)
          : event.scene[key];
        setCellByHeader_(sceneFeedSheet, targetScene.__rowNumber, key, value);
      }
    });

    return {
      ok: true,
      correction: true,
      event_id: String(targetScene.event_id || originalEventId),
      ui_feed_id: String(targetScene.feed_id || originalTurn.ui_feed_id || '')
    };
  } finally {
    lock.releaseLock();
  }
}

function processTurnInbox_() {
  var sheet = getSheet_(ECHO_CONFIG.sheets.turnInbox);
  var table = readTable_(sheet);
  if (!table.rows.length) return { processed: 0 };

  var processed = 0;
  table.rows.forEach(function(row) {
    var status = String(row.validation_status || '').toUpperCase();
    var retryableCorrection = status === 'ERROR' &&
      !String(row.processed_at || '').trim() &&
      isSceneCorrectionRow_(row);
    if (['PENDING', 'READY'].indexOf(status) === -1 && !retryableCorrection) return;

    try {
      if (!row.raw_input || !row.parsed_intent_json) {
        throw new Error('raw_input and parsed_intent_json are required');
      }

      var intent = parseJsonValue_(row.parsed_intent_json);
      if (!intent || typeof intent !== 'object') throw new Error('parsed_intent_json is not an object');
      var event = intent.event || intent;
      event.turn_id = event.turn_id || row.turn_id;
      event.chat_id = event.chat_id || row.chat_id;
      event.raw_input = event.raw_input || row.raw_input;
      event.event_id = event.event_id || ('EVT-' + String(row.turn_id || Utilities.getUuid()).replace(/[^A-Za-z0-9_-]/g, ''));

      var result;
      if (isSceneCorrection_(event)) {
        result = commitSceneCorrection_(event);
      } else {
        validateEventShape_(event);
        result = commitTurn_(event, { skipInboxAppend: true });
      }
      updateTurnInboxRow_(row.__rowNumber, {
        validation_status: 'COMMITTED',
        commit_event_id: result.event_id,
        ui_feed_id: result.ui_feed_id || '',
        error_code: '',
        processed_at: new Date()
      });
      processed += 1;
    } catch (error) {
      updateTurnInboxRow_(row.__rowNumber, {
        validation_status: 'ERROR',
        error_code: String(error && error.message ? error.message : error),
        processed_at: new Date()
      });
    }
  });
  return { processed: processed };
}

function commitTurn_(event, options) {
  options = options || {};
  validateEventShape_(event);

  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var eventLogSheet = getSheet_(ECHO_CONFIG.sheets.eventLog);
    var sceneFeedSheet = getSheet_(ECHO_CONFIG.sheets.sceneFeed);
    validateRelationshipTargets_(event.relationship_updates || {});
    var uiFeedId = event.scene.feed_id || ('SCENE-' + event.event_id);
    var existingFeed = findRow_(sceneFeedSheet, 'feed_id', uiFeedId);
    if (existingFeed && String(existingFeed.event_id || '') !== String(event.event_id)) {
      throw new Error('feed_id is already bound to another event: ' + uiFeedId);
    }

    var existing = findRow_(eventLogSheet, 'event_id', event.event_id);
    if (existing) {
      return { ok: true, duplicate: true, event_id: event.event_id, ui_feed_id: findSceneFeedId_(event.event_id) };
    }

    var now = new Date();
    var sequence = nextSequence_(eventLogSheet, 'sequence');
    var eventRow = {
      event_id: event.event_id,
      run_id: event.run_id || 'PROTO-SAVE-001',
      sequence: sequence,
      timestamp: now,
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
      intimacy_mode: event.intimacy_mode || ''
    };
    appendObject_(eventLogSheet, eventRow);

    if (event.scene) {
      var sceneRow = {
        feed_id: uiFeedId,
        run_id: event.scene.run_id || event.run_id || 'PROTO-SAVE-001',
        sequence: event.scene.sequence === undefined ? sequence : event.scene.sequence,
        event_id: event.event_id,
        scene_type: event.scene.scene_type || 'narrative',
        title: event.scene.title || 'Neue Szene',
        location_id: event.scene.location_id || stateValue_(getStateMap_(), 'player.location_id') || 'PRISON_CITY',
        narrative_text: event.scene.narrative_text || event.narrative_summary,
        scene_blocks_json: jsonString_(event.scene.scene_blocks_json || event.scene.blocks_json || event.scene.blocks || []),
        mood: event.scene.mood || 'mysteriös / wandelnd',
        visible_changes_json: jsonString_(event.scene.visible_changes_json || {}),
        available_actions_json: jsonString_(event.scene.available_actions_json || []),
        portraits_json: jsonString_(event.scene.portraits_json || {}),
        map_delta_json: jsonString_(event.scene.map_delta_json || {}),
        relationship_delta_json: jsonString_(event.scene.relationship_delta_json || {}),
        status: event.scene.status || 'PLAY',
        content_rating: event.scene.content_rating || event.content_rating || '',
        intimacy_mode: event.scene.intimacy_mode || event.intimacy_mode || ''
      };
      appendObject_(sceneFeedSheet, sceneRow);
    }

    applyStateUpdates_(event.state_updates || {}, event.event_id, now);
    applyRelationshipUpdates_(event.relationship_updates || {}, event.event_id, now);
    applyPreferenceUpdates_(event.preference_updates || null, event.event_id, now);
    applyCharacterProfileUpdates_(event.character_profile_updates || null, event.event_id, now);
    if (!options.skipInboxAppend) {
      appendObject_(getSheet_(ECHO_CONFIG.sheets.turnInbox), {
        turn_id: event.turn_id || ('TURN-' + event.event_id),
        chat_id: event.chat_id || 'ECHO-PROJECT',
        received_at: now,
        raw_input: event.raw_input || event.player_action,
        parsed_intent_json: jsonString_(event.parsed_intent || event),
        validation_status: 'COMMITTED',
        commit_event_id: event.event_id,
        ui_feed_id: uiFeedId,
        error_code: '',
        processed_at: now
      });
    }
    updateStateKey_('save.last_event_id', event.event_id, 'event_id', 'save metadata', event.event_id, now);
    return { ok: true, duplicate: false, event_id: event.event_id, ui_feed_id: uiFeedId };
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
  var row = findRow_(sheet, 'state_key', key);
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
    updated_at: now || new Date()
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

function getOverlayState_() {
  var state = getStateMap_();
  var overlayWarnings = [];
  var sceneRows = readOverlayRows_(ECHO_CONFIG.sheets.sceneFeed, overlayWarnings);
  var eventRows = readOverlayRows_(ECHO_CONFIG.sheets.eventLog, overlayWarnings);
  var relationshipRows = readOverlayRows_(ECHO_CONFIG.sheets.relationships, overlayWarnings);
  var threadRows = readOverlayRows_(ECHO_CONFIG.sheets.threads, overlayWarnings);
  var preferenceContext = getEchoPreferenceContext_({ includeAudit: false });

  var playableScenes = sceneRows.filter(isPlayableScene_);
  var scene = latestBySequence_(playableScenes) || {};
  var events = eventRows.filter(function (row) { return row.event_id; }).slice().sort(sequenceAscending_);
  var latestEvent = events.length ? events[events.length - 1] : null;

  var locationId = stateValue_(state, 'player.location_id') || scene.location_id || 'UNKNOWN_LOCATION';
  var health = numberOrBlank_(stateValue_(state, 'player.health'));
  var healthMax = numberOrBlank_(stateValue_(state, 'player.health_max'));
  if (healthMax === '' || healthMax <= 0) healthMax = 10;
  var conditions = parseList_(stateValue_(state, 'player.conditions'), []);
  var itemOwnership = itemOwnershipProjection_(state, overlayWarnings);
  var echoMastery = echoMasteryValue_(stateValue_(state, 'player.echo_mastery_profile'));
  var memoryState = localizeMemory_(stateValue_(state, 'player.memory_state') || 'NO_MEMORY');
  var currentLocation = locationLabel_(locationId);

  var currentScene = {
    chapterLabel: chapterLabel_(state),
    title: scene.title || 'Aktuelle Szene',
    moodTag: localizeMood_(scene.mood || 'unbestimmt'),
    text: sceneTextForOverlay_(scene) || 'Noch keine sichtbare Szene im persistenten Spielstand.',
    blocks: sceneBlocksForOverlay_(scene),
    sceneType: scene.scene_type || 'narrative',
    contentRating: scene.content_rating || '',
    intimacyMode: scene.intimacy_mode || '',
    location: currentLocation,
    locationLabel: currentLocation,
    locationId: locationId
  };

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
    inventory: inventoryFrom_(stateValue_(state, 'player.inventory')),
    itemOwnership: itemOwnership.items,
    relationships: echoRelationshipOverlays_(relationshipRows, preferenceContext.characters),

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
    chapters: chaptersFrom_(state)
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
    sceneEventIds[String(scene.event_id || '')] = true;
    entries.push({
      id: scene.feed_id,
      title: scene.title || 'Neue Szene',
      text: sceneTextForOverlay_(scene),
      fiction: String(scene.scene_type || '').toLowerCase() !== 'system'
    });
  });

  events.forEach(function (event) {
    if (sceneEventIds[String(event.event_id || '')]) return;
    entries.push({
      id: event.event_id,
      title: 'Ereignis ' + (event.sequence || ''),
      text: event.narrative_summary || event.player_action || '',
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
      // A future ITEM_STATE row will become authoritative. Until then the
      // first confirmed projection remains visible and the conflict is explicit.
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
    items: items
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
  return {
    ok: preference.ok,
    build: ECHO_BUILD_ID,
    state_model_version: ECHO_STATE_MODEL_VERSION,
    preference_policy_version: ECHO_PREFERENCE_POLICY_VERSION,
    preference_coverage: preference.preferenceCoverage,
    errors: preference.errors,
    warnings: preference.warnings
  };
}

// ===== Fast Turn Gateway =====

// ECHO – Fast Turn Gateway
// Public, secret-free reference implementation.
// Live spreadsheet IDs, deployment URLs and tokens belong in Script Properties.

const ECHO_FAST_GATEWAY_VERSION = '1.2.0';

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

/** Compact canonical context for resolving the next player turn. */
function echoGetRuntimeContext() {
  const ss = echoFastSpreadsheet_();
  const inbox = echoFastRequireSheet_(ss, 'TURN_INBOX');
  const snapshot = echoFastRequireSheet_(ss, 'STATE_SNAPSHOT');
  const lastTurn = echoFastReadLatestInboxRow_(inbox);
  const state = echoFastReadSnapshotMap_(snapshot);
  const compact = {};

  echoFastRuntimeKeys_().forEach(function (key) {
    if (Object.prototype.hasOwnProperty.call(state, key)) compact[key] = state[key];
  });

  const preferences = getEchoPreferenceContext_({ includeAudit: true });

  return {
    ok: true,
    version: ECHO_FAST_GATEWAY_VERSION,
    build: ECHO_BUILD_ID,
    context_version: 'phase-1',
    state_model_version: ECHO_STATE_MODEL_VERSION,
    commit_ready: !lastTurn || lastTurn.validation_status === 'COMMITTED',
    last_turn: lastTurn,
    snapshot: compact,
    authority: ECHO_AUTHORITY_ORDER_.slice(),
    chat_delivery: echoChatDeliveryPolicy_(),
    preference_policy: preferences.effectivePolicy,
    preference_coverage: preferences.preferenceCoverage,
    preferences: preferences
  };
}

/**
 * Atomically appends one new PENDING turn to TURN_INBOX.
 * Idempotent by turn_id and refuses a dependent turn while the latest turn
 * is not COMMITTED.
 */
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

  return row
    ? { ok: true, found: true, row: row, turn: echoFastReadInboxRow_(inbox, row) }
    : { ok: true, found: false, turn_id: id };
}

/** Router for an optional Web App or future custom connector. */
function echoHandleGatewayRequest(request) {
  const body = request || {};
  echoFastAssertGatewayToken_(body.token);

  switch (body.op) {
    case 'context': return echoGetRuntimeContext();
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
  const v = sheet.getRange(row, 1, 1, 10).getValues()[0];
  let parsed = null;

  if (v[4]) {
    try { parsed = typeof v[4] === 'string' ? JSON.parse(v[4]) : v[4]; }
    catch (err) { parsed = null; }
  }

  return {
    row: row,
    turn_id: echoFastJsonValue_(v[0]),
    chat_id: echoFastJsonValue_(v[1]),
    received_at: echoFastJsonValue_(v[2]),
    validation_status: echoFastJsonValue_(v[5]),
    commit_event_id: echoFastJsonValue_(v[6]),
    ui_feed_id: echoFastJsonValue_(v[7]),
    error_code: echoFastJsonValue_(v[8]),
    processed_at: echoFastJsonValue_(v[9]),
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

  const status = String(turn.validation_status || 'PENDING').trim();
  if (status !== 'PENDING') throw new Error('New turns must enter TURN_INBOX as PENDING.');

  let parsed = turn.parsed_intent_json;
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
    validation_status: 'PENDING'
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
    role: profile.groupRole || 'Rolle noch nicht festgelegt',
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

