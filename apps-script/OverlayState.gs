// ECHO read-only overlay state projection helpers.

function getOverlayState_() {
  var state = getStateMap_();
  var sceneRows = readTable_(getSheet_(ECHO_CONFIG.sheets.sceneFeed)).rows;
  var eventRows = readTable_(getSheet_(ECHO_CONFIG.sheets.eventLog)).rows;
  var relationshipRows = readTable_(getSheet_(ECHO_CONFIG.sheets.relationships)).rows;
  var threadRows = readTable_(getSheet_(ECHO_CONFIG.sheets.threads)).rows;

  var scene = latestBySequence_(sceneRows) || {};
  var events = eventRows.filter(function(row) { return row.event_id; }).sort(sequenceAscending_);
  var latestEvent = events.length ? events[events.length - 1] : null;
  var locationId = stateValue_(state, 'player.location_id') || scene.location_id || 'PRISON_CITY';
  var locationName = locationLabel_(locationId);
  var memoryState = localizeMemory_(stateValue_(state, 'player.memory_state') || 'NO_MEMORY');
  var health = stateValue_(state, 'player.health');
  var echoMastery = echoMasteryValue_(stateValue_(state, 'player.echo_mastery_profile'));
  var clock = stateValue_(state, 'world.clock');

  var currentScene = {
    chapterLabel: stateValue_(state, 'story.chapter_label') || 'Kapitel I',
    title: localizeSceneTitle_(scene.title || 'Die Gefängnisstadt'),
    moodTag: localizeMood_(scene.mood || 'bedrückend / geheimnisvoll / erwachend'),
    text: localizeNarrative_(scene.narrative_text || 'Eine versiegelte Kammer unter einer zerstörten heiligen Stadt. Du hast keine Erinnerung.')
  };

  var playerName = stateValue_(state, 'player.name') || 'Namenlos';
  var species = stateValue_(state, 'player.species') || 'unbekannt';
  var condition = health === '' || health === null ? 'unbestimmt' : (Number(health) <= 0 ? 'bewusstlos' : 'lebensfähig');

  return {
    source: 'google-apps-script',
    generated_at: new Date().toISOString(),
    currentScene: currentScene,
    sceneActions: actionsFromScene_(scene.available_actions_json),
    chronicle: chronicleFrom_(scene, events),
    lastConsequence: latestEvent ? (latestEvent.narrative_summary || null) : null,
    echoMastery: echoMastery,
    player: {
      name: playerName,
      species: species,
      tags: playerTags_(state, echoMastery),
      health: health === '' || health === null ? null : Number(health),
      healthDescription: health === '' || health === null ? 'Spürbar, aber unklar — Zustand unbestimmt.' : String(health) + ' von 100 Lebensenergie.'
    },
    stateSummary: {
      memory: memoryState,
      location: locationName,
      condition: condition,
      clockLabel: 'Weltuhr: ' + (clock === '' || clock === null ? 'unbekannt' : clock) + ' · pausiert zwischen Zügen.'
    },
    knownFacts: parseList_(stateValue_(state, 'player.known_facts'), [
      'Du erwachst ohne Erinnerung.',
      'Du befindest dich in einer versiegelten Kammer unter einer Ruinenstadt.',
      'Etwas jenseits des Steins hat dein Erwachen bemerkt.'
    ]),
    inventory: inventoryFrom_(stateValue_(state, 'player.inventory')),
    relationships: relationshipRows.map(relationshipToOverlay_),
    threads: threadRows.map(threadToOverlay_),
    mapRegions: mapRegions_(locationId),
    selectedMapRegion: locationId,
    chapters: [
      { id: 1, label: 'Kapitel I — Das Erwachen', locked: false },
      { id: 2, label: 'Kapitel II', locked: true }
    ]
  };
}

function latestBySequence_(rows) {
  return rows.filter(function(row) { return row.sequence !== undefined; }).sort(function(a, b) { return Number(b.sequence || 0) - Number(a.sequence || 0); })[0] || null;
}

function sequenceAscending_(a, b) {
  return Number(a.sequence || 0) - Number(b.sequence || 0);
}

function relationshipToOverlay_(row) {
  var names = { MAGICAL_WOMAN: 'Die Gefangene', WISE_GUIDE: 'Der Weise' };
  var roles = { MAGICAL_WOMAN: 'Zentrale Bindung · Identität unbekannt', WISE_GUIDE: 'Mentor · Name unbekannt' };
  return {
    id: row.state_id || row.entity_b,
    name: names[row.entity_b] || row.entity_b || 'Unbekannte Bindung',
    role: roles[row.entity_b] || 'Beziehung · Zustand unbekannt',
    note: row.notes || 'Die Beziehung wird durch deine Handlungen bestimmt.',
    axes: [
      { label: 'Vertrauen', value: axisValue_(row.trust) },
      { label: 'Verlangen', value: axisValue_(row.desire) },
      { label: 'Angst', value: axisValue_(row.fear) }
    ]
  };
}

function threadToOverlay_(row) {
  return {
    id: row.thread_id,
    label: row.question || row.thread_key || 'Offener Faden',
    priority: String(row.priority || '').toLowerCase() === 'high' ? 'hoch' : 'mittel',
    flag: row.status === 'OPEN' ? 'offen' : ''
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
  var labels = { ACT_OBSERVE: 'Sich umsehen', ACT_CALL: 'In die Dunkelheit rufen', ACT_FREE: 'Freie Handlung im Chat', 'ACT-OBSERVE': 'Sich umsehen', 'ACT-CALL': 'In die Dunkelheit rufen', 'ACT-FREE': 'Freie Handlung im Chat' };
  return actions.map(function(action) {
    return { id: action.id || 'ACT', label: labels[action.id] || action.label || 'Möglicher Ansatz', kind: 'suggestion' };
  }).filter(function(action) { return action.id !== 'ACT_FREE' && action.id !== 'ACT-FREE'; });
}

function chronicleFrom_(scene, events) {
  var entries = [];
  if (scene && scene.title) entries.push({ id: scene.feed_id || 'SCENE-START-001', title: localizeSceneTitle_(scene.title), text: localizeNarrative_(scene.narrative_text || ''), fiction: false });
  events.forEach(function(event) {
    entries.push({ id: event.event_id, title: 'Ereignis ' + event.sequence, text: event.narrative_summary || event.player_action || '', fiction: true });
  });
  return entries;
}

function inventoryFrom_(raw) {
  var list = parseJson_(raw, []);
  if (!Array.isArray(list)) return [];
  return list.map(function(item, index) {
    if (typeof item === 'string') return { id: 'I' + index, name: item, desc: '' };
    return { id: item.id || 'I' + index, name: item.name || item.label || 'Unbekannter Gegenstand', desc: item.desc || item.description || '' };
  });
}

function playerTags_(state, echoMastery) {
  var tags = [];
  if ((stateValue_(state, 'player.memory_state') || 'NO_MEMORY') === 'NO_MEMORY') tags.push('Keine Erinnerung');
  if (stateValue_(state, 'player.health') === '') tags.push('Erschöpft');
  tags.push(echoMastery < 25 ? 'ECHO instabil' : 'ECHO erwacht');
  return tags;
}

function mapRegions_(locationId) {
  return [
    { id: 'PRISON_CITY', name: 'Die Gefängnisstadt', state: locationId === 'PRISON_CITY' ? 'current' : 'rumor', x: 50, y: 55, note: 'Zugleich Gefängnis und Heiligtum.' },
    { id: 'ASHFEN', name: 'Aschfenn (Platzhalter)', state: 'unknown', x: 24, y: 32, note: 'Unerforscht.' },
    { id: 'GRAUKUESTE', name: 'Graue Küste (Platzhalter)', state: 'unknown', x: 76, y: 28, note: 'Unerforscht.' },
    { id: 'RUINENWALD', name: 'Ruinenwald (Platzhalter)', state: 'rumor', x: 66, y: 78, note: 'Nur aus Gerüchten bekannt.' }
  ];
}

function locationLabel_(id) {
  return { PRISON_CITY: 'Die Gefängnisstadt', ASHFEN: 'Aschfenn', GRAUKUESTE: 'Graue Küste', RUINENWALD: 'Ruinenwald' }[id] || id;
}

function localizeSceneTitle_(title) {
  return title === 'The Prison-City' ? 'Die Gefängnisstadt' : title;
}

function localizeNarrative_(text) {
  if (text === 'A sealed chamber beneath a ruined holy city. The player has no memories. Somewhere beyond the stone, something impossibly alive has noticed the awakening.') {
    return 'Eine versiegelte Kammer unter einer zerstörten heiligen Stadt. Du hast keine Erinnerung. Irgendwo jenseits des Steins hat etwas unmöglich Lebendiges dein Erwachen bemerkt.';
  }
  return text;
}

function localizeMood_(mood) {
  return String(mood || '').replace('oppressive', 'bedrückend').replace('mysterious', 'geheimnisvoll').replace('awakening', 'erwachend').replace(/\s*\/\s*/g, ' · ');
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
  return isFinite(Number(raw)) && raw !== '' ? Number(raw) : 12;
}
