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
    processTurnInbox_();
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
