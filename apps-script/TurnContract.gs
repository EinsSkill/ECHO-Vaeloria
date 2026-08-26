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
  submission: true
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
    'consent_state', 'boundaries_json', 'intimacy_phase', 'intimacy_profile_json'
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
