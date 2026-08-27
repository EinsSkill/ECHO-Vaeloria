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
    threads: 'THREADS'
  }
};

/** Web-app entry point. GET is read-only except for processing queued turns. */

function doGet(e) {
  var action = e && e.parameter ? String(e.parameter.action || '') : '';
  if (action === 'health') {
    return jsonOutput_({ ok: true, service: 'ECHO', version: '1.1.0' });
  }
  if (action === 'state') {
    // A queued turn must not make the read-only overlay unreachable.
    try {
      processTurnInbox_();
    } catch (error) {
      console.warn('ECHO state refresh skipped: ' + String(error && error.message ? error.message : error));
    }
    return jsonOutput_(getOverlayState_());
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
      return jsonOutput_({ ok: true, service: 'ECHO', version: '1.1.0' });
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
  processTurnInbox_();
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
  if (!event.state_updates || typeof event.state_updates !== 'object' || Array.isArray(event.state_updates)) {
    throw new Error('state_updates must be an object');
  }
  if (!event.relationship_updates || typeof event.relationship_updates !== 'object' || Array.isArray(event.relationship_updates)) {
    throw new Error('relationship_updates must be an object');
  }
  if (!Array.isArray(event.new_flags)) {
    throw new Error('new_flags must be an array');
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
  ensureHeaders_(ECHO_CONFIG.sheets.relationships, [
    'respect', 'tension', 'safety', 'dominance', 'submission',
    'consent_state', 'boundaries_json', 'intimacy_phase', 'intimacy_profile_json',
    'teaching'
  ]);
  ensureHeaders_(ECHO_CONFIG.sheets.eventLog, ['content_rating', 'intimacy_mode']);
  ensureHeaders_(ECHO_CONFIG.sheets.sceneFeed, ['content_rating', 'intimacy_mode']);
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
  var values = sheet.getDataRange().getDisplayValues();
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

function getStateMap_() {
  var rows = readTable_(getSheet_(ECHO_CONFIG.sheets.state)).rows;
  var result = {};
  rows.forEach(function(row) { if (row.state_key) result[row.state_key] = row; });
  return result;
}

function stateValue_(state, key) {
  return state[key] ? state[key].value : '';
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
      'status',
      'content_rating',
      'intimacy_mode'
    ].forEach(function (key) {
      if (event.scene[key] !== undefined && event.scene[key] !== null) {
        setCellByHeader_(sceneFeedSheet, targetScene.__rowNumber, key, event.scene[key]);
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
    var value = updates[key];
    switch (key) {
      case 'world_location_id':
        updateStateKey_('player.location_id', value, 'text', 'runtime state', eventId, now);
        break;
      case 'character_known_identity':
        updateStateKey_('player.known_identity', value, 'text', 'runtime state', eventId, now);
        break;
      case 'health':
        updateStateKey_('player.health', numericHealth_(value), 'number', 'runtime state', eventId, now);
        break;
      case 'health_max':
        updateStateKey_('player.health_max', numericValue_(value, 10), 'number', 'runtime state', eventId, now);
        break;
      case 'world_clock':
        updateStateKey_('world.clock', numericValue_(value, value), 'number', 'runtime state', eventId, now);
        break;
      case 'elapsed_minutes':
        updateStateKey_('world.elapsed_minutes', numericValue_(value, value), 'number', 'runtime state', eventId, now);
        break;
      case 'resonance_stage':
        updateStateKey_('player.resonance_stage', value, 'text', 'runtime state', eventId, now);
        break;
      case 'equipment_main_hand':
        updateStateKey_('player.equipment_main_hand', value, 'text', 'runtime state', eventId, now);
        break;
      case 'held_item':
        updateStateKey_('player.held_item', value, 'text', 'runtime state', eventId, now);
        break;
      case 'player_posture':
        updateStateKey_('player.posture', value, 'text', 'runtime state', eventId, now);
        break;
      case 'inventory':
        updateStateKey_('player.inventory', value, 'json', 'runtime state', eventId, now);
        break;
      case 'known_facts':
        updateStateKey_('player.known_facts', value, 'json', 'runtime state', eventId, now);
        break;
      case 'conditions':
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

  var playableScenes = sceneRows.filter(isPlayableScene_);
  var scene = latestBySequence_(playableScenes) || {};
  var events = eventRows.filter(function (row) { return row.event_id; }).slice().sort(sequenceAscending_);
  var latestEvent = events.length ? events[events.length - 1] : null;

  var locationId = stateValue_(state, 'player.location_id') || scene.location_id || 'UNKNOWN_LOCATION';
  var health = numberOrBlank_(stateValue_(state, 'player.health'));
  var healthMax = numberOrBlank_(stateValue_(state, 'player.health_max'));
  if (healthMax === '' || healthMax <= 0) healthMax = 10;
  var conditions = parseList_(stateValue_(state, 'player.conditions'), []);
  var echoMastery = echoMasteryValue_(stateValue_(state, 'player.echo_mastery_profile'));
  var memoryState = localizeMemory_(stateValue_(state, 'player.memory_state') || 'NO_MEMORY');
  var currentLocation = locationLabel_(locationId);

  var currentScene = {
    chapterLabel: chapterLabel_(state),
    title: scene.title || 'Aktuelle Szene',
    moodTag: localizeMood_(scene.mood || 'unbestimmt'),
    text: scene.narrative_text || 'Noch keine sichtbare Szene im persistenten Spielstand.',
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
    stateModelVersion: '2.1',
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
      heldItem: stateValue_(state, 'player.held_item') || '',
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
    relationships: relationshipRows.map(relationshipToOverlay_),
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
    return Number(b.sequence || 0) - Number(a.sequence || 0);
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

function relationshipToOverlay_(row) {
  var intimacyProfile = parseJson_(row.intimacy_profile_json, {});
  var boundaries = parseJson_(row.boundaries_json, []);
  if (!Array.isArray(boundaries)) boundaries = [];
  var consentState = relationshipConsentState_(row, intimacyProfile);

  return {
    id: row.state_id || row.entity_b || 'UNKNOWN_RELATIONSHIP',
    name: row.display_name || row.entity_b || 'Unbekannte Bindung',
    role: row.role || 'Beziehung · Zustand unbekannt',
    note: row.notes || 'Die Beziehung wird durch deine Handlungen bestimmt.',
    axes: [
      { label: 'Vertrauen', value: axisValue_(row.trust) },
      { label: 'Verlangen', value: axisValue_(row.desire) },
      { label: 'Respekt', value: axisValue_(row.respect) },
      { label: 'Spannung', value: axisValue_(row.tension) },
      { label: 'Intimität', value: axisValue_(row.intimacy) },
      { label: 'Angst', value: axisValue_(row.fear) }
    ].filter(function (axis) { return axis.value !== null; }),
    intimacy: {
      available: consentState !== 'UNKNOWN' || axisValue_(row.tension) !== null || axisValue_(row.desire) !== null || axisValue_(row.intimacy) !== null,
      consentState: consentState,
      consentLabel: consentLabel_(consentState),
      tension: axisValue_(row.tension) !== null ? axisValue_(row.tension) : axisValue_(row.intimacy),
      dominance: axisValue_(row.dominance),
      submission: axisValue_(row.submission),
      boundaries: boundaries,
      phase: row.intimacy_phase || intimacyProfile.phase || ''
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
      text: scene.narrative_text || '',
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
  if (parsed && typeof parsed === 'object') {
    var candidate = parsed.percent !== undefined ? parsed.percent : (parsed.mastery !== undefined ? parsed.mastery : parsed.value);
    if (candidate !== undefined && isFinite(Number(candidate))) return Number(candidate);
  }
  return isFinite(Number(raw)) && raw !== '' ? Number(raw) : 0;
}

// ===== Fast Turn Gateway =====

// ECHO – Fast Turn Gateway
// Public, secret-free reference implementation.
// Live spreadsheet IDs, deployment URLs and tokens belong in Script Properties.

const ECHO_FAST_GATEWAY_VERSION = '1.0.1';

const ECHO_FAST_DEFAULT_RUNTIME_KEYS = [
  'save.last_event_id',
  'world_location_id',
  'character_known_identity',
  'health',
  'resonance_stage',
  'world_clock',
  'elapsed_minutes',
  'player_posture',
  'equipment_main_hand',
  'held_item',
  'clothing_state',
  'seal_threshold_state',
  'condition_added',
  'condition_duration_scenes',
  'inventory_updates',
  'player.conditions',
  'player.health_current',
  'player.health_max',
  'player.equipment_main_hand',
  'player.held_item',
  'world.elapsed_minutes'
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

  return {
    ok: true,
    version: ECHO_FAST_GATEWAY_VERSION,
    commit_ready: !lastTurn || lastTurn.validation_status === 'COMMITTED',
    last_turn: lastTurn,
    snapshot: compact
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
        turn: existing
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
        last_turn: latest
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
      turn: written
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
    case 'submit': return echoSubmitTurn(body.turn);
    case 'status': return echoGetTurnStatus(body.turn_id);
    default: throw new Error('Unsupported gateway operation.');
  }
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
  const row = sheet.getLastRow();
  return row >= 2 ? echoFastReadInboxRow_(sheet, row) : null;
}

function echoFastReadInboxRow_(sheet, row) {
  const v = sheet.getRange(row, 1, 1, 10).getValues()[0];
  let parsed = null;

  if (v[4]) {
    try { parsed = typeof v[4] === 'string' ? JSON.parse(v[4]) : v[4]; }
    catch (err) { parsed = null; }
  }

  return {
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
  const lastRow = sheet.getLastRow();
  const out = {};
  if (lastRow < 2) return out;

  sheet.getRange(2, 1, lastRow - 1, 2).getValues().forEach(function (row) {
    const key = String(row[0] || '').trim();
    if (key) out[key] = echoFastJsonValue_(row[1]); // newest duplicate wins
  });

  return out;
}

function echoFastRuntimeKeys_() {
  const raw = PropertiesService.getScriptProperties().getProperty('ECHO_RUNTIME_KEYS_JSON');
  if (!raw) return ECHO_FAST_DEFAULT_RUNTIME_KEYS.slice();

  try {
    const keys = JSON.parse(raw);
    if (!Array.isArray(keys) || !keys.length) throw new Error('invalid');
    return keys.map(function (value) { return String(value); });
  } catch (err) {
    throw new Error('ECHO_RUNTIME_KEYS_JSON must be a non-empty JSON array.');
  }
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
