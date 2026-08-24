// ECHO turn processing and persistence commit layer.

function processTurnInbox_() {
  var sheet = getSheet_(ECHO_CONFIG.sheets.turnInbox);
  var table = readTable_(sheet);
  if (!table.rows.length) return { processed: 0 };

  var processed = 0;
  table.rows.forEach(function(row) {
    var status = String(row.validation_status || '').toUpperCase();
    if (['PENDING', 'READY'].indexOf(status) === -1) return;
    if (!row.raw_input || !row.parsed_intent_json) return;

    try {
      var intent = parseJsonValue_(row.parsed_intent_json);
      if (!intent || typeof intent !== 'object') throw new Error('parsed_intent_json is not an object');
      var event = intent.event || intent;
      event.turn_id = event.turn_id || row.turn_id;
      event.chat_id = event.chat_id || row.chat_id;
      event.raw_input = event.raw_input || row.raw_input;
      event.event_id = event.event_id || ('EVT-' + String(row.turn_id || Utilities.getUuid()).replace(/[^A-Za-z0-9_-]/g, ''));

      var result = commitTurn_(event, { skipInboxAppend: true });
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
  if (!event || !event.event_id) throw new Error('event_id is required');
  if (!event.player_action) throw new Error('player_action is required');
  if (!event.narrative_summary) throw new Error('narrative_summary is required');

  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var existing = findRow_(getSheet_(ECHO_CONFIG.sheets.eventLog), 'event_id', event.event_id);
    if (existing) {
      return { ok: true, duplicate: true, event_id: event.event_id, ui_feed_id: existing.ui_feed_id || '' };
    }

    var now = new Date();
    var sequence = nextSequence_(getSheet_(ECHO_CONFIG.sheets.eventLog), 'sequence');
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
      notes: event.notes || ''
    };
    appendObject_(getSheet_(ECHO_CONFIG.sheets.eventLog), eventRow);

    var uiFeedId = '';
    if (event.scene) {
      uiFeedId = event.scene.feed_id || ('SCENE-' + event.event_id);
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
        status: event.scene.status || 'PLAY'
      };
      appendObject_(getSheet_(ECHO_CONFIG.sheets.sceneFeed), sceneRow);
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
  Object.keys(updates || {}).forEach(function(key) {
    var value = updates[key];
    var type = Array.isArray(value) || (value && typeof value === 'object') ? 'json' : (typeof value === 'number' ? 'number' : 'text');
    updateStateKey_(key, value, type, 'runtime state', eventId, now);
  });
}

function applyRelationshipUpdates_(updates, eventId, now) {
  if (!updates || typeof updates !== 'object') return;
  var sheet = getSheet_(ECHO_CONFIG.sheets.relationships);
  Object.keys(updates).forEach(function(stateId) {
    var row = findRow_(sheet, 'state_id', stateId);
    if (!row || !row.__rowNumber) return;
    var patch = updates[stateId] || {};
    Object.keys(patch).forEach(function(key) {
      if (key === 'state_id') return;
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
