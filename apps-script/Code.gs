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


var ECHO_BUILD_ID = 'phase-15-group-membership-2026-08-28-r1';
var ECHO_STATE_MODEL_VERSION = '3.0.0';
var ECHO_TRANSACTION_MODEL_VERSION = '1.0.0';
var ECHO_PREFERENCE_POLICY_VERSION = '1.1.0';
var ECHO_SCENE_CONTRACT_VERSION = '1.1.0';
var ECHO_RESOLUTION_CONTRACT_VERSION = '1.0.0';
var ECHO_OVERLAY_CONTRACT_VERSION = '1.0.0';
var ECHO_PROJECTION_CONTRACT_VERSION = '1.0.0';
var ECHO_CONTEXT_BINDING_VERSION = '1.0.0';
var ECHO_SCENE_READBACK_CONTRACT_VERSION = '1.0.0';
var ECHO_EVENT_IDENTITY_VERSION = '1.0.0';
var ECHO_COMMIT_RECONCILIATION_VERSION = '1.0.0';
var ECHO_HEALTH_REPORT_VERSION = '1.0.0';
var ECHO_VALIDATION_REPORT_VERSION = '1.0.0';
var ECHO_PHASE12_RUNTIME_VERSION = '1.0.0';
var ECHO_PHASE12_STATE_WAKE_PROBE_CACHE_KEY_ = 'ECHO_PHASE12_STATE_WAKE_PROBE_V1';
var ECHO_PHASE12_STATE_WAKE_PROBE_TTL_SECONDS_ = 5;
var ECHO_PHASE12_STALE_PROCESSING_AFTER_MS_ = 180000;
var ECHO_PHASE12_MAX_CLIENT_RETRY_COUNT_ = 2;
var ECHO_PHASE14_RELATIONSHIP_VERSION = '1.0.0';
var ECHO_PHASE15_GROUP_VERSION = '1.0.0';

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
  if (action === 'health-report') {
    return jsonOutput_(echoGetHealthReport_());
  }
  if (action === 'validation-report') {
    return jsonOutput_(echoGetValidationReport_());
  }
  if (action === 'validation-contract') {
    return jsonOutput_(echoGetValidationReportContract());
  }
  if (action === 'runtime-contract') {
    return jsonOutput_(echoGetRuntimeContract());
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
  if (action === 'relationship-contract') {
    return jsonOutput_(echoGetRelationshipContract());
  }
  if (action === 'group-contract') {
    return jsonOutput_(echoGetGroupContract());
  }
  if (action === 'context-binding-contract') {
    return jsonOutput_(echoGetContextBindingContract());
  }
  if (action === 'scene-readback-contract') {
    return jsonOutput_(echoGetSceneReadbackContract());
  }
  if (action === 'commit-reconciliation-contract') {
    return jsonOutput_(echoGetCommitReconciliationContract());
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
  if (action === 'preference-projection-contract') {
    return jsonOutput_(echoGetPreferenceProjectionContract());
  }
  if (action === 'state') {
    // Keep the payload read-only. A throttled wake probe only schedules the
    // processor when the newest inbox row is still waiting.
    scheduleTurnProcessorWakeFromState_();
    try {
      return jsonOutput_(getOverlayState_());
    } catch (error) {
      return jsonOutput_(echoPhase12StateReadFailure_(error));
    }
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

var ECHO_PROCESSOR_WAKE_DELAY_MS_ = 1000;
var ECHO_INLINE_PROCESSING_ENABLED_ = true;
var ECHO_PROCESSOR_WAKE_CACHE_KEY_ = 'ECHO_PROCESSOR_WAKE_SCHEDULED_V2';
var ECHO_PROCESSOR_WAKE_CACHE_TTL_SECONDS_ = 300;
var ECHO_PROCESSOR_MAX_ROWS_PER_RUN_ = 1;

function markTurnProcessorWake_() {
  try {
    CacheService.getScriptCache().put(
      ECHO_PROCESSOR_WAKE_CACHE_KEY_,
      '1',
      ECHO_PROCESSOR_WAKE_CACHE_TTL_SECONDS_
    );
    return true;
  } catch (error) {
    return false;
  }
}

function clearTurnProcessorWakeMarker_() {
  try {
    CacheService.getScriptCache().remove(ECHO_PROCESSOR_WAKE_CACHE_KEY_);
  } catch (error) {
    // Cache is only an anti-duplication guard; processing must continue.
  }
}

// Ask Apps Script to wake the processor shortly after a new turn is written.
// The recurring trigger remains the safe fallback when one-shot trigger creation
// is unavailable or the platform delays the wake. Cache throttling prevents an
// open overlay from creating a trigger every few seconds.
function scheduleTurnProcessorWake_() {
  var cache = null;
  try {
    cache = CacheService.getScriptCache();
    if (cache.get(ECHO_PROCESSOR_WAKE_CACHE_KEY_) === '1') return true;
    cache.put(
      ECHO_PROCESSOR_WAKE_CACHE_KEY_,
      '1',
      ECHO_PROCESSOR_WAKE_CACHE_TTL_SECONDS_
    );
  } catch (error) {
    cache = null;
  }

  try {
    ScriptApp.newTrigger('processTurnInbox')
      .timeBased()
      .after(ECHO_PROCESSOR_WAKE_DELAY_MS_)
      .create();
    return true;
  } catch (error) {
    if (cache) {
      try {
        cache.remove(ECHO_PROCESSOR_WAKE_CACHE_KEY_);
      } catch (cacheError) {}
    }
    return false;
  }
}

function scheduleTurnProcessorWakeFromState_() {
  if (!echoPhase12ShouldProbeStateWake_()) return false;
  try {
    var sheet = echoFastRequireSheet_(echoFastSpreadsheet_(), ECHO_CONFIG.sheets.turnInbox);
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) return false;

    var lastColumn = sheet.getLastColumn();
    var headers = sheet.getRange(1, 1, 1, lastColumn).getDisplayValues()[0].map(function (value) {
      return String(value || '').trim();
    });
    var statusIndex = headers.indexOf('validation_status');
    if (statusIndex === -1) return false;

    var values = sheet.getRange(lastRow, 1, 1, lastColumn).getValues()[0];
    var status = String(values[statusIndex] || '').trim().toUpperCase();
    if (['PENDING', 'READY', 'RECOVERY_REQUIRED'].indexOf(status) === -1) return false;
    return scheduleTurnProcessorWake_();
  } catch (error) {
    return false;
  }
}

function processTurnInline_(turnId) {
  var id = String(turnId || '').trim();
  if (!id) throw new Error('turn_id is required for inline processing.');

  markTurnProcessorWake_();
  try {
    var processor = processTurnInbox_({ turnId: id, maxRows: 1 });
    var inbox = echoFastRequireSheet_(echoFastSpreadsheet_(), ECHO_CONFIG.sheets.turnInbox);
    var row = echoFastFindTurnRow_(inbox, id);
    var turn = row ? echoFastReadInboxRow_(inbox, row) : null;
    return {
      processor: processor,
      turn: turn
    };
  } finally {
    clearTurnProcessorWakeMarker_();
  }
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
  var response = null;
  var shouldProcessInline = false;
  var turnId = '';

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
      var existingStatus = String(existingInbox.validation_status || 'PENDING').toUpperCase();
      response = {
        ok: true,
        queued: true,
        duplicate: true,
        validation_status: existingStatus,
        turn_id: existingInbox.turn_id,
        event_id: event.event_id,
        ui_feed_id: existingInbox.ui_feed_id || ''
      };
      shouldProcessInline = ['PENDING', 'READY', 'RECOVERY_REQUIRED'].indexOf(existingStatus) !== -1;
      turnId = existingInbox.turn_id;
    } else {
      var now = new Date();
      turnId = event.turn_id || ('TURN-' + event.event_id);
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
        processed_at: '',
        context_fingerprint: event.context_fingerprint || '',
        context_read_at: event.context_read_at || ''
      });

      response = {
        ok: true,
        queued: true,
        duplicate: false,
        validation_status: 'PENDING',
        turn_id: turnId,
        event_id: event.event_id,
        contract_version: ECHO_CONTRACT_VERSION
      };
      shouldProcessInline = true;
    }
  } finally {
    lock.releaseLock();
  }

  if (shouldProcessInline && ECHO_INLINE_PROCESSING_ENABLED_) {
    try {
      var inline = processTurnInline_(turnId);
      var inlineTurn = inline && inline.turn;
      if (inlineTurn) {
        response.validation_status = inlineTurn.validation_status;
        response.ui_feed_id = inlineTurn.ui_feed_id || '';
        response.ok = inlineTurn.validation_status !== 'ERROR';
      } else {
        scheduleTurnProcessorWake_();
      }
    } catch (error) {
      scheduleTurnProcessorWake_();
    }
  } else if (shouldProcessInline) {
    scheduleTurnProcessorWake_();
  }

  return response;
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

var ECHO_STATE_EXCLUDED_RECORD_STATUSES_ = {
  ARCHIVED: true,
  SUPERSEDED: true,
  DEPRECATED: true,
  LEGACY: true,
  DELTA_AUDIT: true
};

function echoStateValuesEquivalent_(left, right) {
  if (left === right) return true;
  if (left instanceof Date && right instanceof Date) {
    return left.getTime() === right.getTime();
  }
  try {
    return JSON.stringify(left) === JSON.stringify(right);
  } catch (error) {
    return String(left) === String(right);
  }
}

function echoCanonicalStateProjection_(warnings) {
  var rows = readTable_(getSheet_(ECHO_CONFIG.sheets.state)).rows;
  return echoCanonicalStateProjectionFromRows_(rows, warnings);
}

function echoCanonicalStateProjectionFromRows_(rows, warnings) {
  warnings = warnings || [];
  var latest = {};
  var legacyKeys = {};
  var excludedRows = 0;

  (rows || []).forEach(function (row) {
    var rawKey = String(row.state_key || '').trim();
    if (!rawKey) return;

    if (isLegacyStateKey_(rawKey)) {
      legacyKeys[rawKey] = true;
      return;
    }

    var key = canonicalStateKey_(rawKey);
    var recordStatus = String(row.record_status || '').trim().toUpperCase();
    if (ECHO_STATE_EXCLUDED_RECORD_STATUSES_[recordStatus]) {
      excludedRows += 1;
      return;
    }

    var candidate = Object.assign({}, row, { state_key: key });
    var current = latest[key];
    var candidateWins = !current || recordIsNewer_(candidate, current);

    if (current && !echoStateValuesEquivalent_(current.value, candidate.value)) {
      warnings.push({
        code: 'STATE_DUPLICATE_KEY',
        state_key: key,
        existing_row: Number(current.__rowNumber || 0),
        candidate_row: Number(candidate.__rowNumber || 0),
        selected_row: Number((candidateWins ? candidate : current).__rowNumber || 0),
        message: 'Mehrere aktive Zustandszeilen für denselben Schlüssel; die neueste Zeile wird verwendet.'
      });
    }

    if (candidateWins) latest[key] = candidate;
  });

  var legacyKeyList = Object.keys(legacyKeys);
  if (legacyKeyList.length) {
    warnings.push({
      code: 'STATE_LEGACY_ROWS_IGNORED',
      count: legacyKeyList.length,
      keys: legacyKeyList.slice(0, 30),
      message: 'Legacy-Zustandsaliasse werden aus dem Laufzeitkontext ausgeschlossen.'
    });
  }
  if (excludedRows) {
    warnings.push({
      code: 'STATE_NON_CURRENT_ROWS_IGNORED',
      count: excludedRows,
      message: 'Archivierte, supersedierte oder Audit-Delta-Zeilen werden nicht als aktueller Zustand verwendet.'
    });
  }

  // A player-held item is only effective when the item projection confirms
  // PLAYER ownership. This prevents a stale state row from moving an item
  // that is currently held by an NPC into the player context.
  var heldRow = latest['player.held_item'];
  if (heldRow) {
    var itemProjection = { available: false, hasRows: false, playerHeldItem: '' };
    try {
      itemProjection = echoPhase2ItemProjection_([]);
    } catch (error) {
      // ITEM_STATE is optional during the initial migration; inventory is the
      // compatibility fallback in that case.
    }

    var heldItemId = normalizedItemIdentity_(heldRow.value);
    var playerActuallyHolds = false;
    if (itemProjection.available && itemProjection.hasRows) {
      playerActuallyHolds = String(itemProjection.playerHeldItem || '') === heldItemId;
    } else {
      var inventoryRow = latest['player.inventory'];
      var inventory = parseList_(inventoryRow ? inventoryRow.value : '', []);
      playerActuallyHolds = inventoryContainsItem_(inventory, heldItemId);
    }

    if (!playerActuallyHolds) {
      delete latest['player.held_item'];
      warnings.push({
        code: 'STATE_STALE_PLAYER_HELD_ITEM_IGNORED',
        item_id: heldItemId,
        row: Number(heldRow.__rowNumber || 0),
        message: 'player.held_item wurde verworfen, weil die aktuelle Besitzprojektion keinen Spielerbesitz bestätigt.'
      });
    }
  }

  var effectiveRows = Object.keys(latest).map(function (key) {
    return latest[key];
  }).sort(function (left, right) {
    return Number(left.__rowNumber || 0) - Number(right.__rowNumber || 0);
  });

  return {
    map: latest,
    rows: effectiveRows
  };
}

// State reads are side-effect free: canonical projection never writes workbook state.
function getStateMap_(warnings) {
  return echoCanonicalStateProjection_(warnings).map;
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


function echoLegacySceneBlock_(type, text, speaker) {
  var normalized = String(text || '')
    .replace(/\r\n/g, '\n')
    .replace(/\s*\n\s*/g, ' ')
    .trim();
  if (!normalized) return null;
  return {
    type: type || 'prose',
    text: normalized,
    speaker: String(speaker || '').trim(),
    character_id: '',
    tone: '',
    emphasis: ''
  };
}

function echoLegacyDialoguePrefix_(prefix) {
  var value = String(prefix || '')
    .replace(/\r\n/g, '\n')
    .replace(/\s*\n\s*/g, ' ')
    .trim()
    .replace(/^[—–-]\s*/, '')
    .replace(/\s*[—–-]\s*$/, '')
    .trim();
  if (!value) return { speaker: '', remove: false };

  if (value.charAt(value.length - 1) === ':') {
    value = value.slice(0, -1).trim();
  }

  var token = "[A-ZÄÖÜ][A-Za-zÄÖÜäöüß0-9'’.-]*";
  var nameOnly = new RegExp('^' + token + '(?:\\s+' + token + '){0,4}$');
  if (nameOnly.test(value)) return { speaker: value, remove: true };

  var speechVerb = new RegExp(
    '^(' + token + '(?:\\s+' + token + '){0,4})\\s+' +
    '(?:sagt|fragt|antwortet|erwidert|flüstert|ruft|schreit|befiehlt|weist|meint|warnt|knurrt|lacht|seufzt)' +
    '\\s*$',
    'i'
  );
  var match = speechVerb.exec(value);
  return match
    ? { speaker: String(match[1] || '').trim(), remove: true }
    : { speaker: '', remove: false };
}

function echoLegacyDialogueText_(quoted) {
  return String(quoted || '')
    .replace(/^\s*[„“«"]/, '')
    .replace(/[“”»"]\s*$/, '')
    .trim();
}

function echoLegacyDialogueMatches_(paragraph) {
  var patterns = [
    /„[\s\S]*?“/g,
    /„[\s\S]*?”/g,
    /“[\s\S]*?”/g,
    /«[\s\S]*?»/g,
    /"[^"\n]+"/g
  ];
  var best = null;

  patterns.forEach(function (pattern) {
    var match;
    while ((match = pattern.exec(paragraph)) !== null) {
      if (!best || match.index < best.index) best = { index: match.index, text: match[0] };
      break;
    }
  });

  return best;
}

function sceneBlocksFromLegacyText_(raw) {
  var value = String(raw || '').replace(/\r\n/g, '\n').trim();
  if (!value) return [];

  var blocks = [];
  value.split(/\n\s*\n/).forEach(function (paragraph) {
    var normalizedParagraph = paragraph.replace(/\s*\n\s*/g, ' ').trim();
    if (!normalizedParagraph) return;

    if (/^[—–]\s+\S/.test(normalizedParagraph) &&
        normalizedParagraph.indexOf('„') === -1 &&
        normalizedParagraph.indexOf('“') === -1 &&
        normalizedParagraph.indexOf('«') === -1 &&
        normalizedParagraph.indexOf('"') === -1) {
      var dashBlock = echoLegacySceneBlock_('dialogue', normalizedParagraph.replace(/^[—–]\s+/, ''), '');
      if (dashBlock) blocks.push(dashBlock);
      return;
    }

    var cursor = 0;
    var firstMatch = true;
    var foundDialogue = false;
    var match;

    while ((match = echoLegacyDialogueMatches_(normalizedParagraph.slice(cursor))) !== null) {
      var absoluteIndex = cursor + match.index;
      var before = normalizedParagraph.slice(cursor, absoluteIndex);
      var prefix = firstMatch ? echoLegacyDialoguePrefix_(before) : { speaker: '', remove: false };
      if (prefix.remove) before = '';

      var proseBlock = echoLegacySceneBlock_('prose', before, '');
      if (proseBlock) blocks.push(proseBlock);

      var dialogueBlock = echoLegacySceneBlock_('dialogue', echoLegacyDialogueText_(match.text), prefix.speaker);
      if (dialogueBlock) {
        blocks.push(dialogueBlock);
        foundDialogue = true;
      } else {
        var literalBlock = echoLegacySceneBlock_('prose', match.text, '');
        if (literalBlock) blocks.push(literalBlock);
      }

      cursor = absoluteIndex + match.text.length;
      firstMatch = false;
    }

    var tail = echoLegacySceneBlock_('prose', normalizedParagraph.slice(cursor), '');
    if (tail) blocks.push(tail);

    if (!foundDialogue && !blocks.length) {
      var fallbackBlock = echoLegacySceneBlock_('prose', normalizedParagraph, '');
      if (fallbackBlock) blocks.push(fallbackBlock);
    }
  });

  return blocks;
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

function echoDialoguePresentation_() {
  return {
    key: 'dialogue-gold',
    cssClass: 'echo-dialogue',
    className: 'echo-dialogue',
    highlighted: true,
    backgroundColor: 'rgba(201, 162, 39, 0.16)',
    borderColor: 'rgba(201, 162, 39, 0.46)',
    textColor: '#6f5200'
  };
}

function echoOverlayBlockPresentation_(block) {
  var type = String(block && block.type || 'prose').toLowerCase();
  if (type === 'dialogue') return echoDialoguePresentation_();

  return {
    key: 'plain',
    cssClass: 'echo-block echo-' + type,
    className: 'echo-block echo-' + type,
    highlighted: false
  };
}

function echoDecorateOverlayBlock_(block) {
  var output = Object.assign({}, block);
  var presentation = echoOverlayBlockPresentation_(block);
  output.cssClass = presentation.cssClass;
  output.className = presentation.className;
  output.presentation = presentation;
  return output;
}

function sceneBlocksForOverlay_(scene) {
  if (!scene) return [];
  var raw = scene.scene_blocks_json || scene.blocks_json || scene.blocks;
  var blocks = sceneBlocksFrom_(raw);
  if (blocks.length) return blocks.map(echoDecorateOverlayBlock_);

  var fallback = String(scene.narrative_text || '').trim();
  return sceneBlocksFromLegacyText_(fallback).map(echoDecorateOverlayBlock_);
}

function sceneBlocksForStorage_(scene) {
  scene = scene || {};
  var raw = scene.scene_blocks_json !== undefined
    ? scene.scene_blocks_json
    : (scene.blocks_json !== undefined ? scene.blocks_json : scene.blocks);
  var blocks = normalizeSceneBlocks_(raw, { strict: true });
  if (!blocks.length && String(scene.narrative_text || '').trim()) {
    blocks = sceneBlocksFromLegacyText_(scene.narrative_text);
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


function echoPhase6SceneReadback_(row, expected) {
  row = row || {};
  expected = expected || {};
  var errors = [];

  var feedId = String(row.feed_id || '').trim();
  var expectedFeedId = String(expected.feedId || expected.feed_id || '').trim();
  if (!feedId) errors.push('feed_id missing');
  if (expectedFeedId && feedId !== expectedFeedId) errors.push('feed_id mismatch');

  var eventId = String(row.event_id || '').trim();
  var expectedEventId = String(expected.eventId || expected.event_id || '').trim();
  if (expectedEventId && eventId !== expectedEventId) errors.push('event_id mismatch');

  var revisionId = String(row.revision_id || '').trim();
  var expectedRevisionId = String(expected.revisionId || expected.revision_id || '').trim();
  if (expectedRevisionId && revisionId !== expectedRevisionId) errors.push('revision_id mismatch');

  if (String(row.scene_contract_version || '').trim() !== ECHO_SCENE_CONTRACT_VERSION) {
    errors.push('scene_contract_version mismatch');
  }

  var blocks = [];
  try {
    blocks = normalizeSceneBlocks_(row.scene_blocks_json, { strict: true });
  } catch (error) {
    errors.push(
      'scene_blocks_json invalid: ' +
      String(error && error.message ? error.message : error)
    );
  }

  if (!blocks.length) errors.push('visible scene blocks missing');

  var formatted = blocks.length ? sceneTextFromBlocks_(blocks, '') : '';
  var narrativeText = String(row.narrative_text || '')
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  if (!narrativeText) {
    errors.push('narrative_text missing');
  } else if (narrativeText !== formatted) {
    errors.push('narrative_text does not match scene blocks');
  }

  return {
    ok: errors.length === 0,
    status: errors.length ? 'SCENE_READBACK_FAILED' : 'VERIFIED',
    errors: errors,
    feedId: feedId || null,
    eventId: eventId || null,
    sceneId: row.scene_id || row.feed_id || null,
    revisionId: revisionId || null,
    revisionNumber: Number(row.revision_number || 0),
    blockCount: blocks.length,
    formattedTextPresent: !!formatted
  };
}

function echoPhase6AssertSceneReadback_(result, expected) {
  result = result || {};
  expected = expected || {};
  var feedId = String(result.feed_id || result.ui_feed_id || '').trim();
  if (!feedId) {
    throw new Error('SCENE_READBACK_FAILED: ui_feed_id is missing.');
  }

  var row = findRow_(
    getSheet_(ECHO_CONFIG.sheets.sceneFeed),
    'feed_id',
    feedId
  );
  var readback = echoPhase6SceneReadback_(row, {
    feedId: feedId,
    eventId: expected.eventId || expected.event_id || '',
    revisionId: expected.revisionId || expected.revision_id || result.revision_id || ''
  });

  if (!readback.ok) {
    throw new Error(
      'SCENE_READBACK_FAILED: ' + readback.errors.join('; ')
    );
  }

  return readback;
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
        'dialoguePresentation', 'resolution', 'sceneType', 'status', 'locationId',
        'sceneContractVersion', 'resolutionContractVersion'
      ],
      blocks_source: 'SCENE_FEED.scene_blocks_json',
      rendering_rule: 'Render visible blocks in order; apply blocks[].cssClass/presentation. Use formattedText/text only as a legacy fallback.',
      dialogue_presentation: {
        block_type: 'dialogue',
        style_key: 'dialogue-gold',
        class_field: 'blocks[].cssClass',
        metadata_field: 'blocks[].presentation',
        highlighted: true
      }
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


function echoContextBindingContract_() {
  return {
    version: ECHO_CONTEXT_BINDING_VERSION,
    supplied_field: 'context_fingerprint',
    statuses: ['MATCHED', 'NOT_PROVIDED', 'STALE', 'UNAVAILABLE'],
    stale_policy: 'REJECT_BEFORE_COMMIT',
    legacy_policy: 'Turns without a context fingerprint remain accepted for compatibility.',
    revalidation: 'Compare the supplied fingerprint with a fresh authoritative workbook context immediately before commit.'
  };
}

function echoGetContextBindingContract() {
  return {
    ok: true,
    contract: echoContextBindingContract_()
  };
}

function echoSceneReadbackContract_() {
  return {
    version: ECHO_SCENE_READBACK_CONTRACT_VERSION,
    source: 'SCENE_FEED',
    verification: [
      'feed_id and revision identifiers match the commit result',
      'scene_blocks_json parses into at least one visible block',
      'narrative_text is present and matches formatted block output',
      'scene_contract_version matches the active scene contract'
    ],
    failure_status: 'SCENE_READBACK_FAILED',
    commit_rule: 'A transaction is not reported as committed until readback succeeds.'
  };
}

function echoGetSceneReadbackContract() {
  return {
    ok: true,
    contract: echoSceneReadbackContract_()
  };
}

function echoCommitReconciliationContract_() {
  return {
    version: ECHO_COMMIT_RECONCILIATION_VERSION,
    identity_version: ECHO_EVENT_IDENTITY_VERSION,
    artifacts: ['EVENT_LOG', 'SCENE_FEED', 'SCENE_REVISIONS', 'STATE_SNAPSHOT'],
    modes: ['NORMAL_COMMIT', 'SCENE_CORRECTION'],
    verification: [
      'event_id remains bound to one payload fingerprint',
      'EVENT_LOG, SCENE_FEED and SCENE_REVISIONS reference the same transaction and revision',
      'normal commits advance STATE_SNAPSHOT.save.last_event_id',
      'corrections preserve the original scene event and reference the correction revision'
    ],
    failure_status: 'COMMIT_RECONCILIATION_FAILED',
    commit_rule: 'A transaction is not reported as committed until all required artifacts agree.'
  };
}

function echoGetCommitReconciliationContract() {
  return {
    ok: true,
    contract: echoCommitReconciliationContract_()
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
    output_guarantee: 'Each visible dialogue segment is its own block; prose between dialogue segments is never highlighted.',
    order: ['heading', 'prose', 'dialogue', 'action', 'sensory', 'system', 'change', 'status', 'prompt'],
    visibility_rule: 'Only visible blocks may be written to SCENE_FEED.',
    legacy_rule: 'Missing blocks are derived from narrative_text; quoted and dash-led speech becomes dialogue, surrounding text remains prose.',
    legacy_detection: {
      quote_pairs: ['„…“', '“…”', '«…»', '"…"'],
      dash_led_speech: true,
      speaker_prefixes: ['Name:', 'Name sagt:'],
      false_positive_policy: 'Only unmistakable quoted or dash-led segments are highlighted.'
    }
  };
}

function echoGetSceneContract() {
  return {
    ok: true,
    contract: echoSceneContract_(),
    resolution_contract: echoResolutionContract_(),
    overlay_contract: echoOverlayContract_(),
    projection_contract: echoProjectionContract_(),
    preference_projection_contract: echoPreferenceProjectionContract_(),
    validation_contract: echoValidationReportContract_(),
    scene_readback_contract: echoSceneReadbackContract_(),
    commit_reconciliation_contract: echoCommitReconciliationContract_()
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

function processTurnInbox_(options) {
  options = options || {};
  var targetTurnId = String(options.turnId || '').trim();
  var maxRows = options.maxRows === undefined
    ? ECHO_PROCESSOR_MAX_ROWS_PER_RUN_
    : Number(options.maxRows);
  if (!isFinite(maxRows) || maxRows < 1) maxRows = 1;

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
    var candidateCount = 0;

    table.rows.forEach(function (row) {
      if (targetTurnId && String(row.turn_id || '').trim() !== targetTurnId) return;

      var status = String(row.validation_status || '').toUpperCase();
      var processingAge = stateTimestamp_(row.locked_at || row.processed_at || row.received_at);
      var staleProcessing = status === 'PROCESSING' &&
        processingAge > 0 &&
        new Date().getTime() - processingAge > ECHO_PHASE12_STALE_PROCESSING_AFTER_MS_;

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
      if (candidateCount >= maxRows) return;
      candidateCount += 1;

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
            transactionId: row.transaction_id || '',
            submittedContextFingerprint: row.context_fingerprint || ''
          });
        } else {
          validateEventShape_(event);
          result = commitTurnCore_(event, {
            skipInboxAppend: true,
            transactionId: row.transaction_id || '',
            submittedContextFingerprint: row.context_fingerprint || ''
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
    clearTurnProcessorWakeMarker_();
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
    dialoguePresentation: echoDialoguePresentation_(),
    dialogue_presentation: echoDialoguePresentation_(),
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

function echoGroupMembershipContract_() {
  return {
    version: ECHO_PHASE15_GROUP_VERSION,
    phase: 15,
    source_of_truth: 'ECHO_WORKBOOK',
    membership_source: 'GROUP_MEMBERS',
    profile_source: 'ECHO_CHARACTER_PROFILES',
    group_policy_source: 'ECHO_PREFERENCE_PROFILE',
    active_statuses: ['ACTIVE', 'OPEN', 'CURRENT', 'PLAY', 'NEGOTIATED', 'LOCKED', 'UNINITIALIZED'],
    terminal_statuses: ['LEFT', 'INACTIVE'],
    duplicate_policy: 'Latest active row by member_id, otherwise by group_id and canonical entity_id.',
    player_policy: 'The player is not synthesized as a GROUP_MEMBERS row; player inclusion and circle position are exposed only when the preference profile states them.',
    guest_policy: 'Guest eligibility and participation rules are read from the group preference profile; no guest is created from preference data alone.',
    recruitment_policy: 'A new character becomes a member only through a committed group_member_updates event and an active GROUP_MEMBERS row.',
    role_policy: 'Roles, positions and expertise are source-backed; missing role data remains unknown.',
    guarantees: [
      'No placeholder member is rendered.',
      'A member row is never duplicated by stale history.',
      'A profile, a relationship and a group membership remain separate sources.',
      'The target roster size is metadata, not proof that members already exist.'
    ]
  };
}

function echoGetGroupContract() {
  return {
    ok: true,
    contract: echoGroupMembershipContract_()
  };
}

function echoPhase15GroupPolicy_(groupPreferences) {
  groupPreferences = groupPreferences || {};
  var structure = groupPreferences.structure || {};
  var targetSize = structure.target_size || {};
  var circleModel = structure.circle_model || {};
  var joiningModel = structure.joining_model || {};
  var guestPolicy = (groupPreferences.guests || {}).guest_policy || {};

  var numeric = function (value) {
    var number = Number(value);
    return isFinite(number) && number >= 0 ? number : null;
  };
  var booleanOrNull = function (value) {
    return typeof value === 'boolean' ? value : null;
  };

  return {
    targetSize: {
      women: numeric(targetSize.women),
      totalPeople: numeric(targetSize.total_people),
      playerIncluded: booleanOrNull(targetSize.player_is_included)
    },
    circleModel: circleModel,
    joiningModel: joiningModel,
    guestPolicy: guestPolicy,
    playerCenter: booleanOrNull(circleModel.player_center_ruler),
    equalPowerCircle: booleanOrNull(circleModel.equal_power_circle)
  };
}

function echoPhase15MembershipKey_(row, profileByEntity) {
  row = row || {};
  var memberId = String(row.member_id || '').trim();
  if (memberId) return 'member:' + memberId;

  var rawEntityId = String(row.entity_id || '').trim();
  var entityId = echoPhase4CanonicalEntityId_(rawEntityId, profileByEntity);
  var groupId = String(row.group_id || '').trim();
  return entityId && groupId ? 'entity:' + groupId + '|' + entityId : '';
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

  var memberKind = String(
    traits.member_kind || traits.membership_type || traits.kind || ''
  ).trim();
  var guestFlag = traits.is_guest === true || traits.guest === true ||
    String(memberKind).toLowerCase() === 'guest';

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
    memberKind: memberKind || 'unknown',
    isGuest: guestFlag,
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
  var newest = {};

  (rows || []).forEach(function (row) {
    var key = echoPhase15MembershipKey_(row, profileByEntity);
    if (!key || !echoPhase4GroupMembershipActive_(row)) return;
    if (!newest[key] || echoPhase4RowIsLater_(row, newest[key])) {
      newest[key] = row;
    }
  });

  return Object.keys(newest)
    .map(function (key) {
      return echoPhase4NormalizeMembership_(newest[key], profileByEntity);
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

function echoPhase4ProjectGroups_(rows, profiles, groupPreferences) {
  var profileByEntity = characterProfilesByEntity_(profiles || []);
  var policy = echoPhase15GroupPolicy_(groupPreferences || {});
  var groups = {};

  echoPhase4GroupMemberships_(rows, profileByEntity).forEach(function (membership) {
    if (!groups[membership.groupId]) {
      groups[membership.groupId] = {
        groupId: membership.groupId,
        label: membership.groupId,
        active: true,
        memberCount: 0,
        activeMemberCount: 0,
        knownGuestCount: 0,
        members: [],
        rosterPolicy: policy,
        source: 'GROUP_MEMBERS'
      };
    }
    groups[membership.groupId].members.push(membership);
    groups[membership.groupId].memberCount += 1;
    groups[membership.groupId].activeMemberCount += membership.active ? 1 : 0;
    if (membership.isGuest) groups[membership.groupId].knownGuestCount += 1;
  });

  return Object.keys(groups)
    .sort(echoPhase4CompareText_)
    .map(function (groupId) {
      var group = groups[groupId];
      var target = policy.targetSize;
      var playerCount = target.playerIncluded === true ? 1 : 0;
      var projectedTotal = group.activeMemberCount + playerCount;
      var targetTotal = target.totalPeople;
      group.player = {
        includedByPolicy: target.playerIncluded,
        presentAsMemberRow: false,
        projectedOccupantCount: target.playerIncluded === null ? null : projectedTotal
      };
      group.capacity = {
        targetWomen: target.women,
        targetTotalPeople: targetTotal,
        knownActiveMemberCount: group.activeMemberCount,
        projectedOccupantCount: group.player.projectedOccupantCount,
        remainingSlots: targetTotal === null || group.player.projectedOccupantCount === null
          ? null
          : Math.max(0, targetTotal - group.player.projectedOccupantCount),
        rosterComplete: targetTotal !== null && group.player.projectedOccupantCount !== null
          ? group.player.projectedOccupantCount >= targetTotal
          : null
      };
      return group;
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
  var groups = echoPhase4ProjectGroups_(groupRows, profiles, preferenceContext.group || {});
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


/* ===== Phase 5: context binding and stale-turn protection ===== */

function echoPhase5ContextBinding_(suppliedFingerprint, currentFingerprint) {
  var supplied = String(suppliedFingerprint || '').trim();
  var current = String(currentFingerprint || '').trim();

  if (!supplied) {
    return {
      version: ECHO_CONTEXT_BINDING_VERSION,
      status: 'NOT_PROVIDED',
      accepted: true,
      supplied: false,
      suppliedFingerprint: '',
      currentFingerprint: current || null
    };
  }

  if (!current) {
    return {
      version: ECHO_CONTEXT_BINDING_VERSION,
      status: 'UNAVAILABLE',
      accepted: false,
      supplied: true,
      suppliedFingerprint: supplied,
      currentFingerprint: null
    };
  }

  if (supplied === current) {
    return {
      version: ECHO_CONTEXT_BINDING_VERSION,
      status: 'MATCHED',
      accepted: true,
      supplied: true,
      suppliedFingerprint: supplied,
      currentFingerprint: current
    };
  }

  return {
    version: ECHO_CONTEXT_BINDING_VERSION,
    status: 'STALE',
    accepted: false,
    supplied: true,
    suppliedFingerprint: supplied,
    currentFingerprint: current
  };
}


function echoPhase7EventForFingerprint_(event) {
  var source = event && typeof event === 'object' ? event : {};
  var clone;
  try {
    clone = JSON.parse(JSON.stringify(source));
  } catch (error) {
    clone = Object.assign({}, source);
  }
  delete clone.context_fingerprint;
  delete clone.context_read_at;
  return clone;
}

function echoPhase7PayloadFingerprint_(event) {
  return echoPhase2Fingerprint_(echoPhase7EventForFingerprint_(event));
}

function echoPhase7PayloadFingerprintCandidates_(event) {
  var candidates = [
    echoPhase7PayloadFingerprint_(event),
    echoPhase2Fingerprint_(event)
  ];
  return candidates.filter(function (candidate, index) {
    return candidate && candidates.indexOf(candidate) === index;
  });
}

function echoPhase7PayloadMatches_(event, transaction) {
  if (!transaction) return false;
  var plan = parseJson_(transaction.plan_json, {});
  var storedFingerprint = String(
    transaction.payload_fingerprint ||
    plan.payloadFingerprint ||
    ''
  ).trim();
  if (!storedFingerprint) return false;
  return echoPhase7PayloadFingerprintCandidates_(event).indexOf(storedFingerprint) !== -1;
}

function echoPhase7AssertEventIdentity_(event, transaction) {
  var payloadFingerprint = echoPhase7PayloadFingerprint_(event);
  if (!transaction) {
    return {
      version: ECHO_EVENT_IDENTITY_VERSION,
      status: 'NEW',
      accepted: true,
      payloadFingerprint: payloadFingerprint
    };
  }

  if (!echoPhase7PayloadMatches_(event, transaction)) {
    throw new Error(
      'EVENT_PAYLOAD_CONFLICT: event_id is already bound to a different payload.'
    );
  }

  return {
    version: ECHO_EVENT_IDENTITY_VERSION,
    status: 'MATCHED',
    accepted: true,
    payloadFingerprint: payloadFingerprint,
    storedFingerprint: String(
      transaction.payload_fingerprint ||
      parseJson_(transaction.plan_json, {}).payloadFingerprint ||
      ''
    ).trim()
  };
}

function echoPhase7ReconcileCommit_(event, transaction, sceneResult, options) {
  event = event || {};
  transaction = transaction || {};
  options = options || {};
  var correction = !!options.correction;
  var errors = [];
  var transactionId = String(transaction.transaction_id || '').trim();
  var feedId = String(sceneResult && (sceneResult.feed_id || sceneResult.ui_feed_id) || '').trim();
  var revisionId = String(sceneResult && sceneResult.revision_id || '').trim();
  var expectedSceneEventId = String(
    correction ? (options.sceneEventId || '') : (event.event_id || '')
  ).trim();

  if (!transactionId) errors.push('transaction_id missing');
  if (!feedId) errors.push('feed_id missing');
  if (!revisionId) errors.push('revision_id missing');

  var sceneRow = feedId
    ? findRow_(getSheet_(ECHO_CONFIG.sheets.sceneFeed), 'feed_id', feedId)
    : null;
  if (!sceneRow) {
    errors.push('SCENE_FEED row missing');
  } else {
    if (String(sceneRow.transaction_id || '').trim() !== transactionId) {
      errors.push('SCENE_FEED transaction_id mismatch');
    }
    if (expectedSceneEventId &&
        String(sceneRow.event_id || '').trim() !== expectedSceneEventId) {
      errors.push('SCENE_FEED event_id mismatch');
    }
    if (revisionId &&
        String(sceneRow.revision_id || '').trim() !== revisionId) {
      errors.push('SCENE_FEED revision_id mismatch');
    }
  }

  var revisionRow = revisionId
    ? findRow_(getSheet_(ECHO_CONFIG.sheets.sceneRevisions), 'revision_id', revisionId)
    : null;
  if (!revisionRow) {
    errors.push('SCENE_REVISIONS row missing');
  } else {
    if (String(revisionRow.feed_id || '').trim() !== feedId) {
      errors.push('SCENE_REVISIONS feed_id mismatch');
    }
    if (String(revisionRow.transaction_id || '').trim() !== transactionId) {
      errors.push('SCENE_REVISIONS transaction_id mismatch');
    }
    if (correction) {
      if (String(revisionRow.event_id || '').trim() !== String(event.event_id || '').trim()) {
        errors.push('SCENE_REVISIONS correction event_id mismatch');
      }
      if (expectedSceneEventId &&
          String(revisionRow.source_event_id || '').trim() !== expectedSceneEventId) {
        errors.push('SCENE_REVISIONS source_event_id mismatch');
      }
    } else {
      if (String(revisionRow.event_id || '').trim() !== String(event.event_id || '').trim()) {
        errors.push('SCENE_REVISIONS event_id mismatch');
      }
      if (String(revisionRow.source_event_id || '').trim() !== String(event.event_id || '').trim()) {
        errors.push('SCENE_REVISIONS source_event_id mismatch');
      }
    }
  }

  if (!correction) {
    var eventRow = findRow_(
      getSheet_(ECHO_CONFIG.sheets.eventLog),
      'event_id',
      event.event_id
    );
    if (!eventRow) {
      errors.push('EVENT_LOG row missing');
    } else {
      if (String(eventRow.transaction_id || '').trim() !== transactionId) {
        errors.push('EVENT_LOG transaction_id mismatch');
      }
      if (revisionId &&
          String(eventRow.revision_id || '').trim() !== revisionId) {
        errors.push('EVENT_LOG revision_id mismatch');
      }
      var eventFingerprint = String(eventRow.payload_fingerprint || '').trim();
      if (!eventFingerprint ||
          echoPhase7PayloadFingerprintCandidates_(event).indexOf(eventFingerprint) === -1) {
        errors.push('EVENT_LOG payload_fingerprint mismatch');
      }
    }

    try {
      var state = getStateMap_();
      if (String(stateValue_(state, 'save.last_event_id') || '').trim() !==
          String(event.event_id || '').trim()) {
        errors.push('STATE_SNAPSHOT.save.last_event_id mismatch');
      }
    } catch (error) {
      errors.push(
        'STATE_SNAPSHOT unavailable: ' +
        String(error && error.message ? error.message : error)
      );
    }
  }

  return {
    version: ECHO_COMMIT_RECONCILIATION_VERSION,
    ok: errors.length === 0,
    status: errors.length ? 'COMMIT_RECONCILIATION_FAILED' : 'VERIFIED',
    mode: correction ? 'SCENE_CORRECTION' : 'NORMAL_COMMIT',
    errors: errors,
    transactionId: transactionId || null,
    feedId: feedId || null,
    revisionId: revisionId || null,
    artifactCount: correction ? 3 : 4
  };
}

function echoPhase7AssertCommitReconciled_(event, transaction, sceneResult, options) {
  var reconciliation = echoPhase7ReconcileCommit_(
    event,
    transaction,
    sceneResult,
    options
  );
  if (!reconciliation.ok) {
    throw new Error(
      'COMMIT_RECONCILIATION_FAILED: ' + reconciliation.errors.join('; ')
    );
  }
  return reconciliation;
}

function echoPhase5RecoveryMayContinue_(event, transaction) {
  if (!transaction) return false;

  var status = String(transaction.status || '').trim().toUpperCase();
  if (status === 'COMMITTED') return true;
  if (['PREPARED', 'APPLYING', 'RECOVERY_REQUIRED'].indexOf(status) === -1) return false;

  var storedFingerprint = String(
    transaction.payload_fingerprint ||
    parseJson_(transaction.plan_json, {}).payloadFingerprint ||
    ''
  ).trim();
  if (!storedFingerprint) return false;

  return echoPhase7PayloadMatches_(event, transaction);
}

function echoPhase5AssertContextBinding_(event, options, currentContext) {
  event = event || {};
  options = options || {};
  var context = currentContext || getEchoAuthoritativeContext_({ includePrivate: false });
  var supplied = options.submittedContextFingerprint || event.context_fingerprint || '';
  var binding = echoPhase5ContextBinding_(supplied, context.fingerprint);
  var recoveryOverride = !binding.accepted &&
    echoPhase5RecoveryMayContinue_(event, options.existingTransaction);

  if (!binding.accepted && !recoveryOverride) {
    throw new Error(
      binding.status + ': context must be reread before this turn is committed.'
    );
  }

  binding.recoveryOverride = recoveryOverride;
  return {
    context: context,
    binding: binding
  };
}

function echoLiveDashboardProjection_(eventRows, playableScenes, relationshipRows) {
  eventRows = Array.isArray(eventRows) ? eventRows : [];
  playableScenes = Array.isArray(playableScenes) ? playableScenes : [];
  relationshipRows = Array.isArray(relationshipRows) ? relationshipRows : [];

  var latestEvent = eventRows
    .filter(function (row) { return !!row.event_id; })
    .slice()
    .sort(sequenceAscending_);
  var currentSequence = latestEvent.length
    ? Number(latestEvent[latestEvent.length - 1].sequence || 0)
    : 0;

  return {
    version: ECHO_HEALTH_REPORT_VERSION,
    source: 'LIVE_WORKBOOK',
    generated_at: new Date().toISOString(),
    counts: {
      eventLog: eventRows.filter(function (row) { return !!row.event_id; }).length,
      playableScenes: playableScenes.length,
      relationships: relationshipRows.length
    },
    currentSequence: currentSequence,
    staleSheetDashboardValuesAreNotUsed: true
  };
}

function getOverlayState_() {
  var overlayWarnings = [];
  var state = getStateMap_(overlayWarnings);
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
  var dashboardProjection = echoLiveDashboardProjection_(eventRows, playableScenes, relationshipRows);
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

    relationshipContract: echoRelationshipDirectoryContract_(),
    groupContract: echoGroupMembershipContract_(),
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
    projectionContract: echoProjectionContract_(),
    preferenceProjectionContract: echoPreferenceProjectionContract_(),
    validationContract: echoValidationReportContract_(),
    dashboardProjection: dashboardProjection,
    runtime: echoPhase12OverlayRuntime_(latestEvent, scene, overlayWarnings)
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
  var safeIntimacy = ['NEGOTIATED', 'OPEN'].indexOf(consentState) !== -1;
  var boundaryStatus = boundaries.length ? 'recorded' : 'not_recorded';

  return {
    id: row.state_id || profile.entityId || row.entity_b || 'UNKNOWN_RELATIONSHIP',
    entityId: String(profile.entityId || row.entity_b || ''),
    name: row.display_name || profile.displayName || row.entity_b || 'Unbekannte Bindung',
    role: displayRole,
    baseRole: role,
    note: [relationshipNote_(row, profile), summary].filter(function (value) {
      return !!value;
    }).join(' · '),
    summary: summary,
    axes: visibleAxes,
    source: {
      relationshipState: !!String(row.state_id || '').trim(),
      characterProfile: !!String(profile.entityId || '').trim(),
      relationshipStateId: String(row.state_id || ''),
      characterProfileId: String(profile.profileId || '')
    },
    safety: {
      consentState: consentState,
      consentLabel: consentLabel_(consentState),
      intimacyEligible: safeIntimacy,
      boundaryStatus: boundaryStatus,
      boundaryCount: boundaries.length,
      numericValuesAreSourceBacked: true,
      unknownValuesRemainUnknown: true
    },
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
      available: safeIntimacy,
      consentState: consentState,
      consentLabel: consentLabel_(consentState),
      eligible: safeIntimacy,
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
      boundaryStatus: boundaryStatus,
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



var ECHO_PHASE11_ID_FIELDS_ = {
  CANON: 'canon_id', DECISIONS: 'question_id', RULES: 'rule_id',
  ECHO_SYSTEM: 'system_id', WORLD: 'world_id', TIMELINE: 'timeline_id',
  CHARACTERS: 'character_id', SPECIES: 'species_id', FACTIONS: 'faction_id',
  RELATIONSHIPS: 'relation_id', FLAGS: 'flag_id',
  PLAYER_EXPERIENCE: 'experience_id', GAME_DESIGN: 'design_id', UI_DESIGN: 'ui_id',
  STATE_SNAPSHOT: 'state_key', EVENT_LOG: 'event_id', SCENE_FEED: 'feed_id',
  TURN_INBOX: 'turn_id', TURN_TRANSACTIONS: 'transaction_id',
  SCENE_REVISIONS: 'revision_id', ITEM_STATE: 'item_id', GROUP_MEMBERS: 'member_id',
  RELATIONSHIP_STATE: 'state_id', THREADS: 'thread_id',
  ECHO_PREFERENCE_PROFILE: 'preference_id', ECHO_CHARACTER_PROFILES: 'profile_id'
};

function echoValidationReportContract_() {
  return {
    version: ECHO_VALIDATION_REPORT_VERSION,
    source_of_truth: 'ECHO_WORKBOOK',
    mode: 'READ_ONLY',
    status_values: ['PASS', 'WARN', 'BLOCK', 'NOT_APPLICABLE'],
    checks: ['V-001','V-002','V-003','V-004','V-005','V-006','V-007','V-008','V-009','V-010','V-011','V-012','V-013','V-014','V-015'],
    block_rule: 'Only BLOCK checks make the report not ok.'
  };
}

function echoGetValidationReportContract() {
  return { ok: true, contract: echoValidationReportContract_() };
}

function echoPhase11ReadTable_(sheetName) {
  try {
    var table = readTable_(getSheet_(sheetName));
    return { present: true, headers: table.headers || [], rows: table.rows || [] };
  } catch (error) {
    return { present: false, headers: [], rows: [], error: String(error && error.message ? error.message : error) };
  }
}

function echoPhase11DuplicateIds_(table, field) {
  var seen = {};
  var duplicates = [];
  if (!table || !table.present || (table.headers || []).indexOf(field) === -1) return duplicates;
  (table.rows || []).forEach(function (row) {
    var value = String(row[field] || '').trim();
    if (!value) return;
    if (seen[value]) duplicates.push(value);
    seen[value] = true;
  });
  return duplicates;
}

function echoPhase11Ids_(table, field) {
  var ids = {};
  if (!table || !table.present || (table.headers || []).indexOf(field) === -1) return ids;
  (table.rows || []).forEach(function (row) {
    var value = String(row[field] || '').trim();
    if (value) ids[value] = true;
  });
  return ids;
}

function echoPhase11ReferenceErrors_(table, field, ids, label) {
  var errors = [];
  if (!table || !table.present || (table.headers || []).indexOf(field) === -1) return errors;
  (table.rows || []).forEach(function (row) {
    var status = String(row.status || '').trim().toUpperCase();
    if (['ARCHIVED','SUPERSEDED','DEPRECATED','LEGACY','HIDDEN'].indexOf(status) !== -1) return;
    var value = String(row[field] || '').trim();
    if (value && !ids[value]) errors.push({ sheet: label, row: Number(row.__rowNumber || 0), value: value });
  });
  return errors;
}

function echoGetValidationReport_() {
  var names = [
    'CANON','DECISIONS','RULES','ECHO_SYSTEM','WORLD','TIMELINE','CHARACTERS',
    'SPECIES','FACTIONS','RELATIONSHIPS','FLAGS','PLAYER_EXPERIENCE','GAME_DESIGN',
    'UI_DESIGN','STATE_SNAPSHOT','EVENT_LOG','SCENE_FEED','TURN_INBOX',
    'TURN_TRANSACTIONS','SCENE_REVISIONS','ITEM_STATE','GROUP_MEMBERS',
    'RELATIONSHIP_STATE','THREADS','ECHO_PREFERENCE_PROFILE','ECHO_CHARACTER_PROFILES'
  ];
  var tables = {};
  var checks = [];
  var errors = [];
  var warnings = [];
  names.forEach(function (name) { tables[name] = echoPhase11ReadTable_(name); });

  function add(id, key, severity, status, message, details) {
    var item = { check_id:id, check_key:key, severity:severity, status:status, message:message };
    if (details !== undefined) item.details = details;
    checks.push(item);
    if (status === 'BLOCK') errors.push(item);
    if (status === 'WARN') warnings.push(item);
  }
  function ids(name, field) { return echoPhase11Ids_(tables[name], field); }
  function refs(table, field, known, label) {
    return echoPhase11ReferenceErrors_(table, field, known, label);
  }

  var duplicateIds = [];
  var missingIdHeaders = [];
  Object.keys(ECHO_PHASE11_ID_FIELDS_).forEach(function (name) {
    var table = tables[name], field = ECHO_PHASE11_ID_FIELDS_[name];
    if (!table || !table.present) return;
    if ((table.headers || []).indexOf(field) === -1) missingIdHeaders.push(name + '.' + field);
    else echoPhase11DuplicateIds_(table, field).forEach(function (id) {
      duplicateIds.push(name + '.' + field + '=' + id);
    });
  });
  add('V-001','unique_ids','BLOCK',
    duplicateIds.length ? 'BLOCK' : (missingIdHeaders.length ? 'WARN' : 'PASS'),
    duplicateIds.length ? 'Doppelte Primär-IDs gefunden.' : 'Primär-IDs sind eindeutig.',
    { duplicates:duplicateIds.slice(0,50), missing_headers:missingIdHeaders });

  var missingRequired = [];
  Object.keys(ECHO_PHASE2_SCHEMA_).forEach(function (name) {
    var table = tables[name];
    if (!table || !table.present) missingRequired.push(name + ' (Tabelle fehlt)');
    else ECHO_PHASE2_SCHEMA_[name].forEach(function (field) {
      if ((table.headers || []).indexOf(field) === -1) missingRequired.push(name + '.' + field);
    });
  });
  add('V-002','required_fields','BLOCK',missingRequired.length ? 'BLOCK' : 'PASS',
    missingRequired.length ? 'Pflichtspalten fehlen.' : 'Pflichtspalten des Runtime-Schemas sind vorhanden.',
    { missing:missingRequired.slice(0,100) });

  var eventTable = tables.EVENT_LOG, sceneTable = tables.SCENE_FEED;
  var inboxTable = tables.TURN_INBOX, transactionTable = tables.TURN_TRANSACTIONS;
  var revisionTable = tables.SCENE_REVISIONS, stateTable = tables.STATE_SNAPSHOT;
  var itemTable = tables.ITEM_STATE, groupTable = tables.GROUP_MEMBERS;
  var relationshipTable = tables.RELATIONSHIP_STATE;
  var eventIds = ids('EVENT_LOG','event_id'), feedIds = ids('SCENE_FEED','feed_id');
  var turnIds = ids('TURN_INBOX','turn_id'), revisionIds = ids('SCENE_REVISIONS','revision_id');

  var referenceErrors = [];
  referenceErrors = referenceErrors.concat(refs(sceneTable,'event_id',eventIds,'SCENE_FEED.event_id'));
  referenceErrors = referenceErrors.concat(refs(inboxTable,'commit_event_id',eventIds,'TURN_INBOX.commit_event_id'));
  referenceErrors = referenceErrors.concat(refs(inboxTable,'ui_feed_id',feedIds,'TURN_INBOX.ui_feed_id'));
  referenceErrors = referenceErrors.concat(refs(transactionTable,'event_id',eventIds,'TURN_TRANSACTIONS.event_id'));
  referenceErrors = referenceErrors.concat(refs(transactionTable,'turn_id',turnIds,'TURN_TRANSACTIONS.turn_id'));
  referenceErrors = referenceErrors.concat(refs(transactionTable,'ui_feed_id',feedIds,'TURN_TRANSACTIONS.ui_feed_id'));
  referenceErrors = referenceErrors.concat(refs(transactionTable,'revision_id',revisionIds,'TURN_TRANSACTIONS.revision_id'));
  referenceErrors = referenceErrors.concat(refs(revisionTable,'event_id',eventIds,'SCENE_REVISIONS.event_id'));
  referenceErrors = referenceErrors.concat(refs(revisionTable,'source_event_id',eventIds,'SCENE_REVISIONS.source_event_id'));
  referenceErrors = referenceErrors.concat(refs(revisionTable,'feed_id',feedIds,'SCENE_REVISIONS.feed_id'));
  referenceErrors = referenceErrors.concat(refs(revisionTable,'supersedes_feed_id',feedIds,'SCENE_REVISIONS.supersedes_feed_id'));
  referenceErrors = referenceErrors.concat(refs(itemTable,'last_event_id',eventIds,'ITEM_STATE.last_event_id'));
  referenceErrors = referenceErrors.concat(refs(groupTable,'last_event_id',eventIds,'GROUP_MEMBERS.last_event_id'));
  referenceErrors = referenceErrors.concat(refs(relationshipTable,'last_event_id',eventIds,'RELATIONSHIP_STATE.last_event_id'));
  add('V-003','reference_integrity','BLOCK',referenceErrors.length ? 'BLOCK' : 'PASS',
    referenceErrors.length ? 'Nicht auflösbare Referenzen gefunden.' : 'Aktive Referenzen sind auflösbar.',
    referenceErrors.slice(0,100));

  var duplicateEvents = echoPhase11DuplicateIds_(eventTable,'event_id');
  var duplicateTurns = echoPhase11DuplicateIds_(inboxTable,'turn_id');
  var duplicateTransactions = echoPhase11DuplicateIds_(transactionTable,'transaction_id');
  var idempotencyErrors = duplicateEvents.concat(duplicateTurns, duplicateTransactions);
  add('V-004','event_idempotency','BLOCK',idempotencyErrors.length ? 'BLOCK' : 'PASS',
    idempotencyErrors.length ? 'Event-, Zug- oder Transaktions-IDs sind doppelt.' : 'Event-, Zug- und Transaktions-IDs sind eindeutig.',
    { event_ids:duplicateEvents, turn_ids:duplicateTurns, transaction_ids:duplicateTransactions });

  var orderErrors = [], lastByRun = {};
  (eventTable.rows || []).slice().sort(function (a,b) {
    return Number(a.__rowNumber || 0) - Number(b.__rowNumber || 0);
  }).forEach(function (row) {
    var run = String(row.run_id || '__NO_RUN__'), seq = Number(row.sequence);
    if (!isFinite(seq) || (lastByRun[run] !== undefined && seq < lastByRun[run])) {
      orderErrors.push({ row:Number(row.__rowNumber || 0), run_id:run, sequence:row.sequence, previous:lastByRun[run] });
    }
    if (isFinite(seq)) lastByRun[run] = seq;
  });
  add('V-005','event_order','BLOCK',orderErrors.length ? 'BLOCK' : 'PASS',
    orderErrors.length ? 'Ereignisfolge ist je Run nicht monoton.' : 'Ereignisse sind je Run monoton geordnet.',
    orderErrors.slice(0,100));

  var stateWarnings = [], stateProjection = { map:{}, rows:[] };
  try { stateProjection = echoCanonicalStateProjection_(stateWarnings); } catch (error) {
    errors.push({ check_id:'V-006', check_key:'state_rebuild', status:'BLOCK', message:String(error && error.message ? error.message : error) });
  }
  var orderedEvents = (eventTable.rows || []).filter(function (row) { return !!row.event_id; }).slice().sort(sequenceAscending_);
  var latestEvent = orderedEvents.length ? orderedEvents[orderedEvents.length - 1] : null;
  var stateLastEvent = stateProjection.map['save.last_event_id'] ? String(stateProjection.map['save.last_event_id'].value || '') : '';
  var rebuildStatus = !latestEvent && !stateLastEvent ? 'NOT_APPLICABLE'
    : (latestEvent && stateLastEvent === String(latestEvent.event_id) ? 'PASS' : 'BLOCK');
  add('V-006','state_rebuild','BLOCK',rebuildStatus,
    rebuildStatus === 'PASS' ? 'STATE_SNAPSHOT zeigt auf das letzte Ereignis.'
      : (rebuildStatus === 'NOT_APPLICABLE' ? 'Noch keine Ereignisse vorhanden.' : 'STATE_SNAPSHOT zeigt nicht auf das letzte Ereignis.'),
    { state_last_event_id:stateLastEvent, latest_event_id:latestEvent ? latestEvent.event_id : '' });

  var openRows = 0, leakedRows = [];
  ['CANON','DECISIONS'].forEach(function (name) {
    var table = tables[name];
    if (!table || !table.present) return;
    var idField = ECHO_PHASE11_ID_FIELDS_[name], lockedIds = {};
    try { echoPhase2LockedRows_(name, []).forEach(function (row) {
      var id = String(row[idField] || '').trim(); if (id) lockedIds[id] = true;
    }); } catch (error) {}
    (table.rows || []).forEach(function (row) {
      if (['OPEN','IDEA','DRAFT'].indexOf(String(row.status || '').trim().toUpperCase()) === -1) return;
      openRows += 1;
      var id = String(row[idField] || '').trim();
      if (id && lockedIds[id]) leakedRows.push(name + '=' + id);
    });
  });
  add('V-007','open_canon','BLOCK',leakedRows.length ? 'BLOCK' : 'PASS',
    leakedRows.length ? 'Offene Kanonzeilen gelangen in die gesperrte Projektion.' : 'Offene Kanonzeilen bleiben ausgeschlossen.',
    { open_rows:openRows, leaked_rows:leakedRows });

  var storyNodes = echoPhase11ReadTable_('STORY_NODES');
  add('V-008','story_reachability','WARN',storyNodes.present ? 'WARN' : 'NOT_APPLICABLE',
    storyNodes.present ? 'STORY_NODES vorhanden; Reachability folgt später.' : 'Keine STORY_NODES-Tabelle vorhanden.',
    { sheet_present:storyNodes.present });
  var assets = echoPhase11ReadTable_('ASSETS');
  add('V-009','asset_refs','BLOCK',assets.present ? 'WARN' : 'NOT_APPLICABLE',
    assets.present ? 'ASSETS vorhanden; Auflösung folgt später.' : 'Keine ASSETS-Tabelle vorhanden.',
    { sheet_present:assets.present });

  var relationRefs = refs(relationshipTable,'last_event_id',eventIds,'RELATIONSHIP_STATE.last_event_id');
  add('V-010','relationship_consistency','WARN',relationRefs.length ? 'WARN' : 'PASS',
    relationRefs.length ? 'Beziehungsreferenzen sind nicht vollständig auflösbar.' : 'Beziehungszustände sind konsistent oder uninitialisiert.',
    relationRefs.slice(0,100));

  var requiredStateKeys = ['save.last_event_id','player.location_id','player.inventory','player.equipment_main_hand'];
  var missingStateKeys = requiredStateKeys.filter(function (key) { return !stateProjection.map[key]; });
  add('V-011','current_projection','WARN',missingStateKeys.length ? 'WARN' : 'PASS',
    missingStateKeys.length ? 'Kernfelder der Zustandsprojektion fehlen.' : 'Kernfelder der Zustandsprojektion sind vorhanden.',
    { missing:missingStateKeys });

  var timestampFields = {
    TURN_INBOX:['received_at','processed_at','locked_at'], EVENT_LOG:['timestamp','committed_at'],
    SCENE_FEED:['created_at'], SCENE_REVISIONS:['created_at'],
    TURN_TRANSACTIONS:['created_at','updated_at','event_logged_at','scene_revision_at','state_applied_at','relationships_applied_at','items_applied_at','group_members_applied_at','preferences_applied_at','profiles_applied_at','committed_at'],
    ITEM_STATE:['updated_at'], GROUP_MEMBERS:['joined_at','left_at','updated_at'],
    RELATIONSHIP_STATE:['updated_at'], ECHO_PREFERENCE_PROFILE:['updated_at'], ECHO_CHARACTER_PROFILES:['updated_at']
  };
  var badTimestamps = [];
  Object.keys(timestampFields).forEach(function (name) {
    var table = tables[name];
    if (!table || !table.present) return;
    (table.rows || []).forEach(function (row) {
      timestampFields[name].forEach(function (field) {
        if (row[field] !== undefined && String(row[field] || '').trim() && !stateTimestamp_(row[field])) {
          badTimestamps.push({ sheet:name, field:field, row:Number(row.__rowNumber || 0) });
        }
      });
    });
  });
  add('V-012','timestamp_consistency','WARN',badTimestamps.length ? 'WARN' : 'PASS',
    badTimestamps.length ? 'Nicht parsebare Zeitstempel gefunden.' : 'Vorhandene Zeitstempel sind parsebar.',
    badTimestamps.slice(0,100));

  var feedErrors = [];
  (inboxTable.rows || []).forEach(function (row) {
    if (String(row.validation_status || '').trim().toUpperCase() !== 'COMMITTED') return;
    var eventId = String(row.commit_event_id || '').trim(), feedId = String(row.ui_feed_id || '').trim();
    var eventRow = (eventTable.rows || []).filter(function (candidate) { return String(candidate.event_id || '').trim() === eventId; })[0];
    var feedRow = (sceneTable.rows || []).filter(function (candidate) { return String(candidate.feed_id || '').trim() === feedId; })[0];
    if (!eventRow) feedErrors.push({ row:Number(row.__rowNumber || 0), missing:'event', id:eventId });
    if (!feedRow) feedErrors.push({ row:Number(row.__rowNumber || 0), missing:'feed', id:feedId });
    if (eventRow && feedRow && String(feedRow.event_id || '').trim() !== eventId) {
      feedErrors.push({ row:Number(row.__rowNumber || 0), mismatch:true, event_id:eventId, feed_event_id:feedRow.event_id });
    }
  });
  add('V-013','feed_link_integrity','WARN',feedErrors.length ? 'WARN' : 'PASS',
    feedErrors.length ? 'COMMITTED-Züge sind nicht vollständig verknüpft.' : 'COMMITTED-Züge besitzen passende Event- und Feed-Zeilen.',
    feedErrors.slice(0,100));

  var legacyRows = [], selectedLegacy = Object.keys(stateProjection.map).filter(isLegacyStateKey_);
  (stateTable.rows || []).forEach(function (row) {
    var key = String(row.state_key || '').trim();
    if (key && isLegacyStateKey_(key)) legacyRows.push({ row:Number(row.__rowNumber || 0), key:key });
  });
  add('V-014','legacy_seed_isolation','WARN',selectedLegacy.length ? 'BLOCK' : 'PASS',
    selectedLegacy.length ? 'Ein Legacy-State-Key ist noch aktiv.' : 'Legacy-State-Zeilen können die aktive Projektion nicht gewinnen.',
    { legacy_rows:legacyRows.slice(0,100), selected_legacy_keys:selectedLegacy });

  var delivery = echoChatDeliveryPolicy_();
  var narrationOk = delivery.mode === 'OVERLAY_ONLY' &&
    delivery.narrative_destination === 'SCENE_FEED' &&
    delivery.include_narrative_in_chat === false &&
    delivery.completion_rule === 'ACK_ONLY_AFTER_COMMIT_AND_READBACK';
  add('V-015','narration_controls','WARN',narrationOk ? 'PASS' : 'WARN',
    narrationOk ? 'Narration bleibt im Overlay; Chat erhält nur Commit-Bestätigung.' : 'Narrationskontrollen sind unvollständig.',
    { policy:delivery });

  var summary = {
    pass:checks.filter(function (x) { return x.status === 'PASS'; }).length,
    warn:checks.filter(function (x) { return x.status === 'WARN'; }).length,
    block:checks.filter(function (x) { return x.status === 'BLOCK'; }).length,
    notApplicable:checks.filter(function (x) { return x.status === 'NOT_APPLICABLE'; }).length
  };
  return {
    ok: errors.length === 0 && summary.block === 0,
    version:ECHO_VALIDATION_REPORT_VERSION,
    build:ECHO_BUILD_ID,
    checked_at:new Date().toISOString(),
    source:'ECHO_WORKBOOK',
    mode:'READ_ONLY',
    summary:summary,
    checks:checks,
    errors:errors,
    warnings:warnings,
    state_projection_warnings:stateWarnings,
    contract:echoValidationReportContract_()
  };
}

function echoGetHealthReport_() {
  var warnings = [];
  var errors = [];
  var schema = null;
  var stateProjection = { rows: [], map: {} };
  var eventRows = [];
  var sceneRows = [];
  var inboxRows = [];
  var validationReport = null;
  var preferenceContext = null;
  var preferenceHealth = {
    ok: false,
    available: false,
    complete: false,
    presentQuestions: 0,
    totalQuestions: ECHO_PREFERENCE_COVERAGE_.length,
    missingQuestionIds: []
  };

  try {
    schema = echoPhase2SchemaStatus_();
    if (!schema.ready) {
      errors.push({
        code: 'SCHEMA_NOT_READY',
        message: 'Das Phase-2-Schema ist noch nicht vollständig vorhanden.'
      });
    }
  } catch (error) {
    errors.push({
      code: 'SCHEMA_CHECK_FAILED',
      message: String(error && error.message ? error.message : error)
    });
  }

  try {
    stateProjection = echoCanonicalStateProjection_(warnings);
  } catch (error) {
    errors.push({
      code: 'STATE_PROJECTION_FAILED',
      message: String(error && error.message ? error.message : error)
    });
  }

  try {
    preferenceContext = getEchoPreferenceContext_({ includeAudit: false });
    var coverage = preferenceContext.preferenceCoverage || {};
    var preferenceValidation = preferenceContext.validation || {};
    preferenceHealth = {
      ok: preferenceValidation.ok === true && coverage.complete === true,
      available: preferenceContext.available === true,
      complete: coverage.complete === true,
      presentQuestions: Number(coverage.presentQuestions || 0),
      totalQuestions: Number(coverage.totalQuestions || ECHO_PREFERENCE_COVERAGE_.length),
      missingQuestionIds: Array.isArray(coverage.missingQuestionIds)
        ? coverage.missingQuestionIds.slice()
        : []
    };
    if (Array.isArray(preferenceValidation.warnings)) {
      warnings = warnings.concat(preferenceValidation.warnings);
    }
    if (!preferenceHealth.ok) {
      errors.push({
        code: 'PREFERENCE_PROJECTION_FAILED',
        message: 'Die effektive Präferenzprojektion oder die PREF-026-Fragenabdeckung ist nicht vollständig.',
        coverage: preferenceHealth
      });
    }
  } catch (error) {
    errors.push({
      code: 'PREFERENCE_PROJECTION_FAILED',
      message: String(error && error.message ? error.message : error)
    });
  }

  function readRows(sheetName) {
    try {
      return readTable_(getSheet_(sheetName)).rows;
    } catch (error) {
      errors.push({
        code: 'SHEET_READ_FAILED',
        sheet: sheetName,
        message: String(error && error.message ? error.message : error)
      });
      return [];
    }
  }

  eventRows = readRows(ECHO_CONFIG.sheets.eventLog).filter(function (row) {
    return !!row.event_id;
  });
  sceneRows = readRows(ECHO_CONFIG.sheets.sceneFeed);
  inboxRows = readRows(ECHO_CONFIG.sheets.turnInbox);

  var playableScenes = echoPhase2EffectiveSceneRows_(
    sceneRows.filter(isPlayableScene_)
  );
  var latestEventRows = eventRows.slice().sort(sequenceAscending_);
  var latestEvent = latestEventRows.length
    ? latestEventRows[latestEventRows.length - 1]
    : null;
  var latestScene = latestBySequence_(playableScenes) || null;
  var latestInboxRows = inboxRows.slice().sort(function (left, right) {
    var timeDiff = stateTimestamp_(left.received_at) - stateTimestamp_(right.received_at);
    return timeDiff || (Number(left.__rowNumber || 0) - Number(right.__rowNumber || 0));
  });
  var latestInbox = latestInboxRows.length
    ? latestInboxRows[latestInboxRows.length - 1]
    : null;

  var feedLinkOk = !!(
    latestInbox &&
    String(latestInbox.validation_status || '').toUpperCase() === 'COMMITTED' &&
    latestInbox.commit_event_id &&
    latestInbox.ui_feed_id &&
    latestEvent &&
    latestScene &&
    String(latestInbox.commit_event_id) === String(latestEvent.event_id) &&
    String(latestInbox.ui_feed_id) === String(latestScene.feed_id) &&
    String(latestScene.event_id) === String(latestEvent.event_id)
  );
  if (!feedLinkOk) {
    errors.push({
      code: 'INBOX_FEED_LINK_FAILED',
      message: 'Der letzte bestätigte Eingang, das letzte Ereignis und die aktuelle Szene sind nicht vollständig verknüpft.'
    });
  }

  var stateLastEvent = stateProjection.map['save.last_event_id'];
  var stateLastEventId = stateLastEvent ? String(stateLastEvent.value || '') : '';
  var stateProjectionOk = !!(stateLastEventId && latestEvent &&
    stateLastEventId === String(latestEvent.event_id));
  if (!stateProjectionOk) {
    errors.push({
      code: 'STATE_LAST_EVENT_MISMATCH',
      message: 'STATE_SNAPSHOT zeigt nicht auf das letzte EVENT_LOG-Ereignis.'
    });
  }

  var latestBlocks = latestScene ? sceneBlocksForOverlay_(latestScene) : [];
  var dialogueBlocks = latestBlocks.filter(function (block) {
    return String(block.type || '').toLowerCase() === 'dialogue';
  });
  var dialoguePresentationOk = latestBlocks.every(function (block) {
    var isDialogue = String(block.type || '').toLowerCase() === 'dialogue';
    var presentation = block.presentation || {};
    if (isDialogue) {
      return presentation.key === 'dialogue-gold' &&
        presentation.highlighted === true &&
        presentation.cssClass === 'echo-dialogue';
    }
    return presentation.highlighted !== true;
  });
  var sceneReadbackOk = !!(
    latestScene &&
    String(latestScene.narrative_text || '').trim() &&
    latestBlocks.length &&
    String(latestScene.status || '').toUpperCase() === 'PLAY' &&
    dialoguePresentationOk
  );
  if (!sceneReadbackOk) {
    errors.push({
      code: 'SCENE_READBACK_FAILED',
      message: 'Die aktuelle Szene ist leer, nicht PLAY oder nicht korrekt blockbasiert lesbar.'
    });
  }

  var seenEventIds = {};
  var duplicateEventIds = [];
  eventRows.forEach(function (row) {
    var id = String(row.event_id || '').trim();
    if (!id) return;
    if (seenEventIds[id]) duplicateEventIds.push(id);
    seenEventIds[id] = true;
  });
  if (duplicateEventIds.length) {
    errors.push({
      code: 'DUPLICATE_EVENT_ID',
      ids: duplicateEventIds.slice(0, 20),
      message: 'EVENT_LOG enthält doppelte event_id-Werte.'
    });
  }

  var dashboardProjection = echoLiveDashboardProjection_(
    eventRows,
    playableScenes,
    readRows(ECHO_CONFIG.sheets.relationships)
  );

  try {
    validationReport = echoGetValidationReport_();
    if (!validationReport.ok) {
      errors.push({
        code: 'VALIDATION_REPORT_FAILED',
        message: 'Mindestens eine BLOCK-Prüfung des Live-Validators ist fehlgeschlagen.'
      });
    }
  } catch (error) {
    errors.push({
      code: 'VALIDATION_REPORT_FAILED',
      message: String(error && error.message ? error.message : error)
    });
  }

  return {
    ok: errors.length === 0,
    version: ECHO_HEALTH_REPORT_VERSION,
    build: ECHO_BUILD_ID,
    checked_at: new Date().toISOString(),
    latest: {
      event_id: latestEvent ? latestEvent.event_id : '',
      sequence: latestEvent ? Number(latestEvent.sequence || 0) : 0,
      feed_id: latestScene ? latestScene.feed_id : '',
      inbox_status: latestInbox ? String(latestInbox.validation_status || '') : 'NOT_FOUND'
    },
    counts: dashboardProjection.counts,
    checks: {
      schema: { ok: !!(schema && schema.ready) },
      inboxFeedLink: { ok: feedLinkOk },
      stateProjection: { ok: stateProjectionOk },
      sceneReadback: { ok: sceneReadbackOk },
      dialoguePresentation: {
        ok: dialoguePresentationOk,
        dialogueBlocks: dialogueBlocks.length
      },
      uniqueEventIds: { ok: duplicateEventIds.length === 0 },
      preferenceProjection: preferenceHealth
    },
    dashboardProjection: dashboardProjection,
    validation: validationReport,
    validationContract: echoValidationReportContract_(),
    preferenceProjection: preferenceHealth,
    preferenceProjectionContract: echoPreferenceProjectionContract_(),
    errors: errors,
    warnings: warnings,
    runtime: echoPhase12RuntimeContract_(),
    last_runtime_failure: echoPhase12LastRuntimeFailure_()
  };
}

function echoGetDiagnostics_() {
  var preference = validateEchoPreferenceStorage_({ repair: false });
  var schema = echoPhase2SchemaStatus_();
  var integrity = echoGetHealthReport_();
  return {
    ok: preference.ok && schema.ready && integrity.ok,
    build: ECHO_BUILD_ID,
    state_model_version: ECHO_STATE_MODEL_VERSION,
    transaction_model_version: ECHO_TRANSACTION_MODEL_VERSION,
    preference_policy_version: ECHO_PREFERENCE_POLICY_VERSION,
    phase2_schema: schema,
    preference_coverage: preference.preferenceCoverage,
    errors: preference.errors.concat(integrity.errors || []),
    warnings: preference.warnings.concat(schema.warnings || [], integrity.warnings || []),
    integrity: integrity,
    runtime: echoPhase12RuntimeContract_(),
    last_runtime_failure: echoPhase12LastRuntimeFailure_()
  };
}

// ===== Fast Turn Gateway =====

// ECHO – Fast Turn Gateway
// Public, secret-free reference implementation.
// Live spreadsheet IDs, deployment URLs and tokens belong in Script Properties.

const ECHO_FAST_GATEWAY_VERSION = '1.4.0';

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
  'player_rune_glow_color',
  'mireth.held_item',
  'mireth.held_item_label',
  'mireth.held_item_status',
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
    preference_projection_contract: echoPreferenceProjectionContract_(),
    validation_contract: echoValidationReportContract_(),
    context_binding_contract: echoContextBindingContract_(),
    scene_readback_contract: echoSceneReadbackContract_(),
    commit_reconciliation_contract: echoCommitReconciliationContract_(),
    runtime_contract: echoPhase12RuntimeContract_(),
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
      : '',
    retryable: ['PENDING', 'READY', 'PROCESSING', 'RECOVERY_REQUIRED'].indexOf(status) !== -1,
    retry_after_ms: processing ? 5000 : 0,
    stale_state_should_be_retained: processing || status === 'ERROR'
  };
}

function echoSubmitTurn(turn) {
  const normalized = echoFastNormalizeTurn_(turn);
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);

  var response = null;
  var shouldProcessInline = false;

  try {
    const ss = echoFastSpreadsheet_();
    const inbox = echoFastRequireSheet_(ss, 'TURN_INBOX');

    // Idempotent retry: return the already-existing turn instead of duplicating it.
    const existingRow = echoFastFindTurnRow_(inbox, normalized.turn_id);
    if (existingRow) {
      const existing = echoFastReadInboxRow_(inbox, existingRow);
      response = {
        ok: existing.validation_status !== 'ERROR',
        accepted: true,
        duplicate: true,
        row: existingRow,
        turn: existing,
        delivery: echoTurnDelivery_(existing),
        chat_delivery: echoChatDeliveryPolicy_()
      };
      shouldProcessInline = ['PENDING', 'READY', 'RECOVERY_REQUIRED'].indexOf(existing.validation_status) !== -1;
    } else {
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

      response = {
        ok: written.validation_status !== 'ERROR',
        accepted: true,
        duplicate: false,
        row: targetRow,
        turn: written,
        delivery: echoTurnDelivery_(written),
        chat_delivery: echoChatDeliveryPolicy_()
      };
      shouldProcessInline = written.validation_status === 'PENDING';
    }
  } finally {
    lock.releaseLock();
  }

  if (shouldProcessInline && ECHO_INLINE_PROCESSING_ENABLED_) {
    try {
      var inline = processTurnInline_(normalized.turn_id);
      var inlineTurn = inline && inline.turn;
      if (inlineTurn) {
        response.turn = inlineTurn;
        response.delivery = echoTurnDelivery_(inlineTurn);
        response.ok = inlineTurn.validation_status !== 'ERROR';
      } else {
        scheduleTurnProcessorWake_();
      }
    } catch (error) {
      scheduleTurnProcessorWake_();
    }
  } else if (shouldProcessInline) {
    scheduleTurnProcessorWake_();
  }

  return response;
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
    case 'context-binding-contract':
      return echoGetContextBindingContract();
    case 'scene-readback-contract':
      return echoGetSceneReadbackContract();
    case 'commit-reconciliation-contract':
      return echoGetCommitReconciliationContract();
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

  // Read headers and all inbox rows once. The old implementation reread the
  // complete row and header range for every candidate row.
  const lastColumn = sheet.getLastColumn();
  const headers = sheet.getRange(1, 1, 1, lastColumn).getDisplayValues()[0].map(function (value) {
    return String(value || '').trim();
  });
  const indexes = echoFastInboxHeaderIndexes_(headers);
  const values = sheet.getRange(2, 1, lastRow - 1, lastColumn).getValues();
  let latest = null;

  values.forEach(function (rowValues, index) {
    const candidate = echoFastInboxRowFromValues_(indexes, rowValues, index + 2);
    if (!candidate.turn_id) return;
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

function echoFastInboxHeaderIndexes_(headers) {
  var indexes = {};
  headers.forEach(function (header, index) {
    if (header && indexes[header] === undefined) indexes[header] = index;
  });
  return indexes;
}

function echoFastInboxRowFromValues_(indexes, values, row) {
  var field = function (name) {
    var index = indexes[name];
    return index === undefined ? '' : values[index];
  };
  var parsed = null;

  var raw = field('parsed_intent_json');
  if (raw) {
    try {
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

function echoFastReadInboxRow_(sheet, row) {
  var lastColumn = sheet.getLastColumn();
  var headers = sheet.getRange(1, 1, 1, lastColumn).getDisplayValues()[0].map(function (value) {
    return String(value || '').trim();
  });
  var values = sheet.getRange(row, 1, 1, lastColumn).getValues()[0];
  return echoFastInboxRowFromValues_(
    echoFastInboxHeaderIndexes_(headers),
    values,
    row
  );
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
  const statusIndex = headers.indexOf('record_status');
  if (keyIndex === -1 || valueIndex === -1) return {};

  const rows = [];
  for (let index = 1; index < values.length; index++) {
    const row = values[index];
    const rawKey = String(row[keyIndex] || '').trim();
    if (!rawKey) continue;
    rows.push({
      state_key: rawKey,
      value: row[valueIndex],
      value_type: typeIndex === -1 ? '' : row[typeIndex],
      updated_at: updatedIndex === -1 ? '' : row[updatedIndex],
      record_status: statusIndex === -1 ? '' : row[statusIndex],
      __rowNumber: index + 1
    });
  }

  const projection = echoCanonicalStateProjectionFromRows_(rows, []);
  const out = {};
  Object.keys(projection.map).forEach(function (key) {
    var record = projection.map[key];
    out[key] = echoFastSnapshotValue_(
      record.value,
      record.value_type
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
var ECHO_PREFERENCE_PROJECTION_VERSION = '1.0.0';

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


function echoPreferenceProjectionContract_() {
  return {
    version: ECHO_PREFERENCE_PROJECTION_VERSION,
    source_of_truth: 'ECHO_PREFERENCE_PROFILE',
    active_statuses: Object.keys(ECHO_PROFILE_ACTIVE_STATUSES_),
    identity: ['scope', 'subject_id', 'category', 'preference_key'],
    duplicate_policy: 'Newest active row by updated_at, then sheet row number.',
    invalid_rows: 'Rows without a complete identity are excluded from the effective projection and remain validation errors.',
    read_rule: 'Build the effective preference projection before every turn; never rely on sheet order.',
    questionnaire_policy: 'PREF-026 answers remain mapped to their question IDs and are checked for complete coverage.'
  };
}

function echoGetPreferenceProjectionContract() {
  return {
    ok: true,
    contract: echoPreferenceProjectionContract_()
  };
}

function echoPreferenceIdentity_(row) {
  row = row || {};
  var scope = String(row.scope || '').trim().toUpperCase();
  var subjectId = String(row.subject_id || '').trim();
  var category = String(row.category || '').trim();
  var key = String(row.preference_key || '').trim();
  if (!scope || !subjectId || !category || !key) return '';
  return [scope, subjectId, category, key].join('|');
}

function echoNewestActivePreferenceRows_(rows, warnings) {
  warnings = warnings || [];
  var newest = {};
  var duplicateCounts = {};

  (rows || []).forEach(function (row) {
    if (!echoProfileStatusIsActive_(row.status)) return;

    var identity = echoPreferenceIdentity_(row);
    if (!identity) return;

    if (newest[identity]) {
      duplicateCounts[identity] = (duplicateCounts[identity] || 0) + 1;
    }
    if (!newest[identity] || recordIsNewer_(row, newest[identity])) {
      newest[identity] = row;
    }
  });

  Object.keys(duplicateCounts).forEach(function (identity) {
    warnings.push({
      code: 'PREFERENCE_DUPLICATE_ACTIVE',
      identity: identity,
      ignored_rows: duplicateCounts[identity],
      selected_row: Number(newest[identity].__rowNumber || 0),
      message: 'Mehrere aktive Präferenzzeilen gefunden; die neueste Zeile wird verwendet.'
    });
  });

  return Object.keys(newest)
    .map(function (identity) { return newest[identity]; })
    .sort(function (left, right) {
      return Number(left.__rowNumber || 0) - Number(right.__rowNumber || 0);
    });
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

    // Validation still inspects every active row, but questionnaire answers are
    // taken from the same deterministic effective projection used at runtime.
    var projectedPreferenceRows = echoNewestActivePreferenceRows_(preferenceTable.rows, warnings);
    questionnaireAnswers = null;
    projectedPreferenceRows.forEach(function (row) {
      if (String(row.category || '').trim() === 'audit' &&
          String(row.preference_key || '').trim() === 'questionnaire_answers') {
        questionnaireAnswers = profileValue_(row.value_json, row.value_type);
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

  // Sheet order is not authoritative. Resolve the newest active row for each
  // preference identity before building the effective policy.
  preferenceRows = echoNewestActivePreferenceRows_(preferenceRows);

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

function echoRelationshipDirectoryContract_() {
  return {
    version: ECHO_PHASE14_RELATIONSHIP_VERSION,
    phase: 14,
    source_of_truth: 'ECHO_WORKBOOK',
    profile_source: 'ECHO_CHARACTER_PROFILES',
    relationship_source: 'RELATIONSHIP_STATE',
    duplicate_policy: 'Latest active relationship row by updated_at, then sheet row number; one visible card per entity.',
    unknown_policy: 'Unknown numeric axes remain unknown until an event establishes them; no numeric value is inferred from narrative preference data.',
    consent_policy: 'UNKNOWN, PAUSED and REVOKED never authorize intimacy; NEGOTIATED and OPEN are the only active consent states.',
    boundary_policy: 'Only boundaries_json from RELATIONSHIP_STATE or ECHO_CHARACTER_PROFILES are shown; an empty list means no boundary was recorded, not that no boundary exists.',
    autonomy_policy: 'Character profiles describe tendencies and boundaries; major story decisions remain with the player.',
    projection_guarantees: [
      'Technical placeholder relationships are excluded.',
      'Relationship and profile rows are deduplicated by canonical entity.',
      'Numerical stats are shown only when the source contains a numeric value.',
      'Consent and boundary state are exposed separately from attraction or tension.'
    ]
  };
}

function echoGetRelationshipContract() {
  return {
    ok: true,
    contract: echoRelationshipDirectoryContract_()
  };
}

function echoRelationshipOverlayEntityId_(row, profileByEntity) {
  row = row || {};
  var raw = String(row.entity_b || row.character_id || row.entity_id || '').trim();
  if (!raw) return '';
  var profile = profileByEntity && profileByEntity[raw];
  return String(profile && profile.entityId ? profile.entityId : raw);
}

function echoRelationshipOverlayRowIsLater_(candidate, current) {
  if (!current) return true;
  var candidateTime = stateTimestamp_(candidate.updated_at || candidate.timestamp || candidate.created_at);
  var currentTime = stateTimestamp_(current.updated_at || current.timestamp || current.created_at);
  if (candidateTime !== currentTime) return candidateTime > currentTime;
  return Number(candidate.__rowNumber || 0) > Number(current.__rowNumber || 0);
}

function echoRelationshipOverlays_(rows, profiles) {
  var profileByEntity = characterProfilesByEntity_(profiles || []);
  var latestByEntity = {};

  (rows || []).forEach(function (row) {
    var entityId = echoRelationshipOverlayEntityId_(row, profileByEntity);
    if (!entityId || isTechnicalRelationshipPlaceholder_({ entity_b: entityId })) return;

    if (!latestByEntity[entityId] ||
        echoRelationshipOverlayRowIsLater_(row, latestByEntity[entityId])) {
      latestByEntity[entityId] = row;
    }
  });

  var linkedProfiles = {};
  var result = Object.keys(latestByEntity)
    .sort(function (left, right) {
      var leftProfile = profileByEntity[left];
      var rightProfile = profileByEntity[right];
      return echoPhase4CompareText_(
        leftProfile && leftProfile.displayName || left,
        rightProfile && rightProfile.displayName || right
      );
    })
    .map(function (entityId) {
      var row = latestByEntity[entityId];
      var profile = profileByEntity[entityId] || profileByEntity[row.entity_b] || null;
      if (profile) linkedProfiles[profile.entityId] = true;
      return relationshipToOverlay_(row, profile);
    });

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
  var stateProjection = { rows: [], map: {} };
  try {
    stateProjection = echoCanonicalStateProjection_(warnings);
  } catch (error) {
    warnings.push({
      code: 'CONTEXT_STATE_UNAVAILABLE',
      message: String(error && error.message ? error.message : error)
    });
  }
  var stateRows = stateProjection.rows;
  var state = stateProjection.map;

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
    preference_projection_contract: echoPreferenceProjectionContract_(),
    validation_contract: echoValidationReportContract_(),
    scene_readback_contract: echoSceneReadbackContract_(),
    commit_reconciliation_contract: echoCommitReconciliationContract_(),
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
    payloadFingerprint: echoPhase7PayloadFingerprint_(event)
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
      payload_fingerprint: plan.payloadFingerprint || echoPhase7PayloadFingerprint_(event),
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
      payload_fingerprint: options.payloadFingerprint || echoPhase7PayloadFingerprint_(event)
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
  var existingTransaction = echoPhase2TransactionForEvent_(event.event_id);
  var eventIdentity = echoPhase7AssertEventIdentity_(event, existingTransaction);
  var bindingOptions = Object.assign({}, options, {
    existingTransaction: existingTransaction
  });
  var contextBinding = echoPhase5AssertContextBinding_(event, bindingOptions, context);
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
    var sceneReadback = echoPhase6AssertSceneReadback_(sceneResult, {
      eventId: event.event_id,
      revisionId: sceneResult.revision_id || transaction.revision_id || ''
    });
    var commitReconciliation = echoPhase7AssertCommitReconciled_(
      event,
      transaction,
      sceneResult,
      { correction: false }
    );
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
      revision_id: sceneResult ? sceneResult.revision_id : (transaction.revision_id || ''),
      readback: sceneReadback,
      reconciliation: commitReconciliation
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
  var existingCorrectionTransaction = echoPhase2TransactionForEvent_(event.event_id);
  var correctionIdentity = echoPhase7AssertEventIdentity_(event, existingCorrectionTransaction);
  var correctionBindingOptions = Object.assign({}, options, {
    existingTransaction: existingCorrectionTransaction
  });
  var correctionContextBinding = echoPhase5AssertContextBinding_(event, correctionBindingOptions, null);

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
    var correctionReadback = echoPhase6AssertSceneReadback_(result, {
      eventId: originalEventId,
      revisionId: result.revision_id
    });
    var correctionReconciliation = echoPhase7AssertCommitReconciled_(
      event,
      transaction,
      result,
      {
        correction: true,
        sceneEventId: originalEventId
      }
    );
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
      revision_id: result.revision_id,
      readback: correctionReadback,
      reconciliation: correctionReconciliation
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



/* ===== Phase 12: runtime stability and failure-safe delivery =====
 *
 * This layer contains only technical runtime behavior. It never stores or
 * hardcodes canon, private workbook identifiers, story prose, preferences, or
 * live game state.
 */

function echoPhase12RuntimeContract_() {
  return {
    version: ECHO_PHASE12_RUNTIME_VERSION,
    phase: 12,
    mode: 'READ_ONLY_PROJECTION_WITH_IDEMPOTENT_PROCESSING',
    state_source: 'ECHO_WORKBOOK',
    private_state_in_repository: false,
    overlay: {
      stale_snapshot_guard: true,
      retain_last_valid_snapshot_on_error: true,
      no_store_reads: true,
      single_flight_client_sync: true,
      dialogue_rendering_source: 'SCENE_BLOCK_TYPE',
      dialogue_highlight_only_for_type: 'dialogue'
    },
    processor: {
      inline_processing_enabled: ECHO_INLINE_PROCESSING_ENABLED_,
      max_rows_per_run: ECHO_PROCESSOR_MAX_ROWS_PER_RUN_,
      stale_processing_after_ms: ECHO_PHASE12_STALE_PROCESSING_AFTER_MS_,
      state_wake_probe_ttl_seconds: ECHO_PHASE12_STATE_WAKE_PROBE_TTL_SECONDS_,
      duplicate_turns_are_idempotent: true
    },
    retry: {
      max_client_retry_count: ECHO_PHASE12_MAX_CLIENT_RETRY_COUNT_,
      retryable_statuses: ['PENDING', 'READY', 'PROCESSING', 'RECOVERY_REQUIRED'],
      never_duplicate_event_or_transaction: true
    },
    timing: {
      backend_measurement_scope: 'Apps Script reads, writes, locks and processor',
      model_generation_outside_scope: true,
      preferred_quality_window: '2–3 minutes when a full consistency pass is required'
    }
  };
}

function echoGetRuntimeContract() {
  return {
    ok: true,
    contract: echoPhase12RuntimeContract_()
  };
}

function echoPhase12ShouldProbeStateWake_() {
  try {
    var cache = CacheService.getScriptCache();
    if (cache.get(ECHO_PHASE12_STATE_WAKE_PROBE_CACHE_KEY_) === '1') return false;
    cache.put(
      ECHO_PHASE12_STATE_WAKE_PROBE_CACHE_KEY_,
      '1',
      ECHO_PHASE12_STATE_WAKE_PROBE_TTL_SECONDS_
    );
    return true;
  } catch (error) {
    // Cache is an optimization only. A failed cache must never suppress a
    // processor wake check.
    return true;
  }
}

function echoPhase12RememberRuntimeFailure_(scope, error) {
  var message = String(error && error.message ? error.message : error);
  var payload = {
    scope: String(scope || 'runtime'),
    message: message.slice(0, 500),
    recorded_at: new Date().toISOString(),
    build: ECHO_BUILD_ID
  };
  try {
    CacheService.getScriptCache().put(
      'ECHO_PHASE12_LAST_RUNTIME_FAILURE_V1',
      JSON.stringify(payload),
      600
    );
  } catch (cacheError) {
    // Failure telemetry is best effort and never blocks the read path.
  }
  return payload;
}

function echoPhase12LastRuntimeFailure_() {
  try {
    var raw = CacheService.getScriptCache().get('ECHO_PHASE12_LAST_RUNTIME_FAILURE_V1');
    return raw ? parseJson_(raw, null) : null;
  } catch (error) {
    return null;
  }
}

function echoPhase12StateReadFailure_(error) {
  var failure = echoPhase12RememberRuntimeFailure_('overlay_state_read', error);
  return {
    ok: false,
    source: 'google-apps-script',
    build: ECHO_BUILD_ID,
    error: {
      code: 'STATE_READ_FAILED',
      message: failure.message
    },
    runtime: {
      phase: 12,
      retryable: true,
      retry_after_ms: 5000,
      retain_last_valid_snapshot: true,
      no_narrative_in_error_response: true
    },
    chatDelivery: echoChatDeliveryPolicy_()
  };
}

function echoPhase12OverlayRuntime_(latestEvent, scene, warnings) {
  return {
    phase: 12,
    version: ECHO_PHASE12_RUNTIME_VERSION,
    read_only: true,
    generated_at: new Date().toISOString(),
    latest_sequence: latestEvent ? Number(latestEvent.sequence || 0) : 0,
    latest_event_id: latestEvent ? String(latestEvent.event_id || '') : '',
    latest_feed_id: scene ? String(scene.feed_id || '') : '',
    warning_count: Array.isArray(warnings) ? warnings.length : 0,
    stale_snapshot_guard: true,
    server_projection_status: 'OK'
  };
}
