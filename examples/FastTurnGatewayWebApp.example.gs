// Optional Web-App wrapper for FastTurnGateway.gs.
//
// IMPORTANT:
// - Only add this doPost() if the live Apps Script project does NOT already
//   define doPost().
// - If a doPost() already exists, route the relevant request body to
//   echoHandleGatewayRequest(body) from that existing handler instead.
// - Keep ECHO_GATEWAY_TOKEN in Script Properties. Never commit it.

function doPost(e) {
  try {
    const raw = e && e.postData && e.postData.contents ? e.postData.contents : '{}';
    const request = JSON.parse(raw);
    const result = echoHandleGatewayRequest(request);
    return echoFastWebJson_(200, result);
  } catch (err) {
    const message = err && err.message ? String(err.message) : 'Gateway request failed.';
    const unauthorized = message === 'Unauthorized gateway request.';
    return echoFastWebJson_(unauthorized ? 401 : 400, {
      ok: false,
      error: unauthorized ? 'UNAUTHORIZED' : 'BAD_REQUEST',
      message: message
    });
  }
}

function echoFastWebJson_(statusCode, payload) {
  // ContentService does not allow setting the HTTP status code directly in a
  // normal Apps Script Web App response. Include it in the JSON contract so a
  // connector can still distinguish outcome classes deterministically.
  const body = Object.assign({ status_code: statusCode }, payload || {});
  return ContentService
    .createTextOutput(JSON.stringify(body))
    .setMimeType(ContentService.MimeType.JSON);
}
