// ECHO – Fast Turn Gateway
// Public, secret-free reference implementation.
// Live spreadsheet IDs, deployment URLs and tokens belong in Script Properties,
// never in this repository.

const ECHO_FAST_GATEWAY_VERSION = '1.0.0';

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

/**
 * Returns the compact canonical runtime state needed before resolving a turn.
 * Duplicate STATE_SNAPSHOT keys are resolved with newest-row-wins semantics.
 */
function echoGetRuntimeContext() {
  const ss = echoFastSpreadsheet_();
  const inbox = echoFastRequireSheet_(ss, 'TURN_INBOX');
  const snapshot = echoFastRequireSheet_(ss, 'STATE_SNAPSHOT');

  const lastTurn = echoFastReadLatestInboxRow_(inbox);
  const state = echoFastReadSnapshotMap_(snapshot);
  const keys = echoFastRuntimeKeys_();
  const compactState = {};

  keys.forEach(function (key) {
    if (Object.prototype.hasOwnProperty.call(state, key)) {
      compactState[key] = state[key];
    }
  });

  return {
    ok: true,
    version: ECHO_FAST_GATEWAY_VERSION,
    commit_ready: !lastTurn || lastTurn.validation_status === 'COMMITTED',
    last_turn: lastTurn,
    snapshot: compactState
  };
}

/**
 * Atomically appends one PENDING turn to TURN_INBOX.
 *
 * Expected payload:
 * {
 *   turn_id,
 *   chat_id,
 *   received_at,
 *   raw_input,
 *   parsed_intent_json: object|string,
 *   validation_status: 'PENDING'
 * }
 *
 * Idempotent by turn_id: a repeated request returns the existing row instead
 * of creating a second turn.
 */
function echoSubmitTurn(turn) {
  const normalized = echoFastNormalizeTurn_(turn);
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);

  try {
    const ss = echoFastSpreadsheet_();
    const inbox = echoFastRequireSheet_(ss, 'TURN_INBOX');

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

    const lastRow = inbox.getLastRow();
    const targetRow = Math.max(2, lastRow + 1);
    const target = inbox.getRange(targetRow, 1, 1, 10);

    // Preserve visual structure only. Never copy prior commit/status content.
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

    // The processor may commit very quickly. PENDING, COMMITTED and ERROR all
    // prove that the row was accepted by TURN_INBOX; ERROR is surfaced below.
    const written = echoFastReadInboxRow_(inbox, targetRow);
    const acceptedStatuses = ['PENDING', 'COMMITTED', 'ERROR'];
    const verified =
      written.turn_id === normalized.turn_id &&
      acceptedStatuses.indexOf(written.validation_status) !== -1;

    if (!verified) {
      throw new Error('TURN_INBOX verification failed after write.');
    }

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

/** Returns one existing TURN_INBOX status without scanning unrelated columns. */
function echoGetTurnStatus(turnId) {
  const id = echoFastRequiredString_(turnId, 'turn_id');
  const ss = echoFastSpreadsheet_();
  const inbox = echoFastRequireSheet_(ss, 'TURN_INBOX');
  const row = echoFastFindTurnRow_(inbox, id);

  return row
    ? { ok: true, found: true, row: row, turn: echoFastReadInboxRow_(inbox, row) }
    : { ok: true, found: false, turn_id: id };
}

/**
 * Request router for an optional Web App or future custom connector.
 * Keep the token in Script Properties under ECHO_GATEWAY_TOKEN.
 */
function echoHandleGatewayRequest(request) {
  const body = request || {};
  echoFastAssertGatewayToken_(body.token);

  switch (body.op) {
    case 'context':
      return echoGetRuntimeContext();
    case 'submit':
      return echoSubmitTurn(body.turn);
    case 'status':
      return echoGetTurnStatus(body.turn_id);
    default:
      throw new Error('Unsupported gateway operation.');
  }
}

function echoFastSpreadsheet_() {
  const props = PropertiesService.getScriptProperties();
  const configuredId = String(props.getProperty('ECHO_SPREADSHEET_ID') || '').trim();

  if (configuredId) {
    return SpreadsheetApp.openById(configuredId);
  }

  const active = SpreadsheetApp.getActiveSpreadsheet();
  if (active) {
    return active;
  }

  throw new Error(
    'No spreadsheet configured. Bind the script to the ECHO sheet or set ECHO_SPREADSHEET_ID in Script Properties.'
  );
}

function echoFastRequireSheet_(ss, name) {
  const sheet = ss.getSheetByName(name);
  if (!sheet) {
    throw new Error('Required sheet missing: ' + name);
  }
  return sheet;
}

function echoFastReadLatestInboxRow_(sheet) {
  const lastRow = sheet.getLastRow();
  return lastRow >= 2 ? echoFastReadInboxRow_(sheet, lastRow) : null;
}

function echoFastReadInboxRow_(sheet, row) {
  const values = sheet.getRange(row, 1, 1, 10).getValues()[0];
  let parsed = null;

  if (values[4]) {
    try {
      parsed = typeof values[4] === 'string' ? JSON.parse(values[4]) : values[4];
    } catch (err) {
      parsed = null;
    }
  }

  return {
    turn_id: echoFastJsonValue_(values[0]),
    chat_id: echoFastJsonValue_(values[1]),
    received_at: echoFastJsonValue_(values[2]),
    validation_status: echoFastJsonValue_(values[5]),
    commit_event_id: echoFastJsonValue_(values[6]),
    ui_feed_id: echoFastJsonValue_(values[7]),
    error_code: echoFastJsonValue_(values[8]),
    processed_at: echoFastJsonValue_(values[9]),
    event_id: parsed && parsed.event_id ? parsed.event_id : null,
    scene_feed_id:
      parsed && parsed.scene && parsed.scene.feed_id ? parsed.scene.feed_id : null
  };
}

function echoFastReadSnapshotMap_(sheet) {
  const lastRow = sheet.getLastRow();
  const out = {};

  if (lastRow < 2) {
    return out;
  }

  const rows = sheet.getRange(2, 1, lastRow - 1, 2).getValues();
  rows.forEach(function (row) {
    const key = String(row[0] || '').trim();
    if (key) {
      // Later rows overwrite earlier duplicates by design.
      out[key] = echoFastJsonValue_(row[1]);
    }
  });

  return out;
}

function echoFastRuntimeKeys_() {
  const raw = PropertiesService.getScriptProperties().getProperty('ECHO_RUNTIME_KEYS_JSON');
  if (!raw) {
    return ECHO_FAST_DEFAULT_RUNTIME_KEYS.slice();
  }

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || !parsed.length) {
      throw new Error('not a non-empty array');
    }
    return parsed.map(function (value) { return String(value); });
  } catch (err) {
    throw new Error('ECHO_RUNTIME_KEYS_JSON must be a JSON array of state keys.');
  }
}

function echoFastFindTurnRow_(sheet, turnId) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    return 0;
  }

  const match = sheet
    .getRange(2, 1, lastRow - 1, 1)
    .createTextFinder(turnId)
    .matchEntireCell(true)
    .findNext();

  return match ? match.getRow() : 0;
}

function echoFastNormalizeTurn_(turn) {
  if (!turn || typeof turn !== 'object') {
    throw new Error('turn must be an object.');
  }

  const status = String(turn.validation_status || 'PENDING').trim();
  if (status !== 'PENDING') {
    throw new Error('New turns must enter TURN_INBOX as PENDING.');
  }

  let parsed = turn.parsed_intent_json;
  if (typeof parsed === 'string') {
    try {
      parsed = JSON.parse(parsed);
    } catch (err) {
      throw new Error('parsed_intent_json is not valid JSON.');
    }
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
}

function echoFastRequiredString_(value, field) {
  const out = String(value == null ? '' : value).trim();
  if (!out) {
    throw new Error(field + ' is required.');
  }
  return out;
}

function echoFastAssertGatewayToken_(suppliedToken) {
  const expected = String(
    PropertiesService.getScriptProperties().getProperty('ECHO_GATEWAY_TOKEN') || ''
  );

  if (!expected) {
    throw new Error('ECHO_GATEWAY_TOKEN is not configured.');
  }
  if (String(suppliedToken || '') !== expected) {
    throw new Error('Unauthorized gateway request.');
  }
}

function echoFastJsonValue_(value) {
  return value instanceof Date ? value.toISOString() : value;
}
