// ECHO turn processing and persistence commit layer.

function processTurnInbox_() {
  var sheet = getSheet_(ECHO_CONFIG.sheets.turnInbox);
  var table = readTable_(sheet);
  if (!table.rows.length) return { processed: 0 };

  var processed = 0;
  table.rows.forEach(function(row) {
    var status = String(row.validation_status || '').toUpperCase();
    if (['PENDING', 'READY'].indexOf(status) === -1) return;

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
      validateEventShape_(event);

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
  validateEventShape_(event);

  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var existing = findRow_(getSheet_(ECHO_CONFIG.sheets.eventLog), 'event_id', event.event_id);
    if (existing) {
      return { ok: true, duplicate: true, event_id: event.event_id, ui_feed_id: findSceneFeedId_(event.event_id) };
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
      notes: event.notes || '',
      content_rating: event.content_rating || '',
      intimacy_mode: event.intimacy_mode || ''
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
        status: event.scene.status || 'PLAY',
        content_rating: event.scene.content_rating || event.content_rating || '',
        intimacy_mode: event.scene.intimacy_mode || event.intimacy_mode || ''
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