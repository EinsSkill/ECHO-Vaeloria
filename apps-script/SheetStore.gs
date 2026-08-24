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
  var props = PropertiesService.getScriptProperties();
  var spreadsheetId = String(props.getProperty(ECHO_CONFIG.spreadsheetIdProperty) || '').trim();
  if (!spreadsheetId) {
    throw new Error('ECHO_SPREADSHEET_ID is not configured in Script Properties');
  }
  var sheet = SpreadsheetApp.openById(spreadsheetId).getSheetByName(name);
  if (!sheet) throw new Error('Missing sheet: ' + name);
  return sheet;
}

function jsonOutput_(object) {
  return ContentService.createTextOutput(JSON.stringify(object)).setMimeType(ContentService.MimeType.JSON);
}
