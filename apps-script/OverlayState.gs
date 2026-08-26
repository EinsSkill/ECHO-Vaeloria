// ECHO read-only overlay state projection.
// The projection exposes only facts already present in the private state store.

function getOverlayState_() {
  var state = getStateMap_();
  var sceneRows = readTable_(getSheet_(ECHO_CONFIG.sheets.sceneFeed)).rows;
  var eventRows = readTable_(getSheet_(ECHO_CONFIG.sheets.eventLog)).rows;
  var relationshipRows = readTable_(getSheet_(ECHO_CONFIG.sheets.relationships)).rows;
  var threadRows = readTable_(getSheet_(ECHO_CONFIG.sheets.threads)).rows;

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

  var currentScene = {
    chapterLabel: stateValue_(state, 'story.chapter_label') || 'Kapitel unbekannt',
    title: scene.title || 'Aktuelle Szene',
    moodTag: localizeMood_(scene.mood || 'unbestimmt'),
    text: scene.narrative_text || 'Noch keine sichtbare Szene im persistenten Spielstand.',
    sceneType: scene.scene_type || 'narrative',
    contentRating: scene.content_rating || '',
    intimacyMode: scene.intimacy_mode || ''
  };

  var conditionNames = conditions.map(conditionName_).filter(function (name) { return !!name; });
  var currentHealth = health === '' ? null : Number(health);
  var currentLocation = locationLabel_(locationId);

  return {
    source: 'google-apps-script',
    stateModelVersion: '2.1',
    generated_at: new Date().toISOString(),
    currentScene: currentScene,
    sceneActions: actionsFromScene_(scene.available_actions_json),
    chronicle: chronicleFrom_(playableScenes, events),
    lastConsequence: latestEvent ? (latestEvent.narrative_summary || null) : null,
    lastEventId: latestEvent ? latestEvent.event_id : '',
    lastFeedId: scene.feed_id || '',
    echoMastery: echoMastery,
    player: {
      name: stateValue_(state, 'player.name') || 'Namenlos',
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
    label: stateValue_(state, 'story.chapter_label') || 'Kapitel unbekannt',
    locked: false
  }];
}

function conditionName_(value) {
  if (typeof value === 'string') return value;
  return value && typeof value === 'object' ? String(value.name || value.label || '') : '';
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

function numberOrBlank_(value) {
  if (value === undefined || value === null || value === '') return '';
  var number = Number(value);
  return isFinite(number) ? number : '';
}
