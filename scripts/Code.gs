/**
 * LOA HRDO STAFF tracker push. No Google Cloud service account is used.
 * Set Script Properties (Project Settings):
 * WEBHOOK_URL = https://YOUR-EXISTING-HRDO-HOST/api/webhooks/sheets-sync
 * WEBHOOK_SECRET = same random 32+ character value as HRDO_SHEETS_WEBHOOK_SECRET
 * Configure at least one of NON_TEACHING_SPREADSHEET_ID, COLLEGE_SPREADSHEET_ID,
 * BASIC_ED_SPREADSHEET_ID. Existing HRDO_WEBHOOK_URL/SECRET properties also work.
 * Run installRealtimeTriggers once. Each manual edit pushes its tracker immediately.
 */
function installRealtimeTriggers() {
  var config = configuration_();
  var owned = ['syncAllStaffGroupsNow', 'hrdoSyncAttendanceNow', 'syncStaffEdit', 'syncStaffChange'];
  ScriptApp.getProjectTriggers().forEach(function(trigger) {
    if (owned.indexOf(trigger.getHandlerFunction()) !== -1) ScriptApp.deleteTrigger(trigger);
  });
  config.sources.forEach(function(source) {
    ScriptApp.newTrigger('syncStaffEdit').forSpreadsheet(source.id).onEdit().create();
    ScriptApp.newTrigger('syncStaffChange').forSpreadsheet(source.id).onChange().create();
  });
}

function syncStaffEdit(event) {
  if (!event || !event.source) return;
  var config = configuration_();
  var id = event.source.getId();
  var source = config.sources.filter(function(item) { return item.id === id; })[0];
  if (source) syncSources_(config, [source]);
}

function syncStaffChange(event) {
  if (!event || event.changeType === 'EDIT' || event.changeType === 'FORMAT') return;
  syncStaffEdit(event);
}

function configuration_() {
  var properties = PropertiesService.getScriptProperties();
  var url = properties.getProperty('WEBHOOK_URL') || properties.getProperty('HRDO_WEBHOOK_URL');
  var secret = properties.getProperty('WEBHOOK_SECRET') || properties.getProperty('HRDO_WEBHOOK_SECRET');
  if (!url || !/^https:\/\//i.test(url) || !secret || secret.length < 32) {
    throw new Error('Set an HTTPS WEBHOOK_URL and a 32+ character WEBHOOK_SECRET in Script Properties.');
  }
  var sources = [
    ['NON_TEACHING', 'NON_TEACHING_SPREADSHEET_ID'],
    ['COLLEGE', 'COLLEGE_SPREADSHEET_ID'],
    ['BASIC_ED', 'BASIC_ED_SPREADSHEET_ID']
  ].map(function(source) {
    var id = properties.getProperty(source[1]);
    return id ? { group: source[0], id: id } : null;
  }).filter(function(source) { return source !== null; });
  if (!sources.length) throw new Error('Configure at least one tracker spreadsheet ID in Script Properties.');
  var ids = sources.map(function(source) { return source.id; });
  if (ids.some(function(id, index) { return ids.indexOf(id) !== index; })) {
    throw new Error('Each department must use its own tracker spreadsheet ID.');
  }
  return { url: url, secret: secret, sources: sources };
}

function syncAllStaffGroupsNow() {
  var config = configuration_();
  syncSources_(config, config.sources);
}

function syncSources_(config, sources) {
  var lock = LockService.getScriptLock();
  // Queue edits so the last change is not silently dropped while another push is running.
  lock.waitLock(30000);
  try {
    var failures = [];
    sources.forEach(function(source) {
      try { pushTracker_(config, source); }
      catch (error) { failures.push(source.group + ': ' + error.message); }
    });
    if (failures.length) throw new Error(failures.join('\n'));
  } finally { lock.releaseLock(); }
}

function pushTracker_(config, source) {
  var sheet = SpreadsheetApp.openById(source.id).getSheetByName('STAFF');
  if (!sheet) throw new Error('STAFF tab was not found.');
  SpreadsheetApp.flush();
  var lastRow = Math.max(8, sheet.getLastRow());
  if (lastRow > 5000 || sheet.getLastColumn() > 410) throw new Error('STAFF exceeds the supported 5000-row / 410-column snapshot size.');
  // A:NY contains identity, all 372 daily cells and balances. NZ+ preserves remarks.
  // Keep blank rows: the server links identities to the original sheet row number.
  var values = sheet.getRange(1, 1, lastRow, Math.max(389, sheet.getLastColumn())).getValues();
  var payload = JSON.stringify({
    snapshotId: Utilities.getUuid(), departmentGroup: source.group,
    spreadsheetId: source.id, sheetName: 'STAFF', capturedAt: new Date().toISOString(), values: values
  });
  if (Utilities.newBlob(payload).getBytes().length > 8 * 1024 * 1024) throw new Error('Snapshot exceeds the 8 MiB webhook limit.');
  // Retrying uses the exact same UUID and payload; the endpoint is idempotent.
  for (var attempt = 0; attempt < 3; attempt++) {
    var response;
    try {
      response = UrlFetchApp.fetch(config.url, {
        method: 'post', contentType: 'application/json',
        headers: { 'x-hrdo-webhook-secret': config.secret },
        payload: payload, muteHttpExceptions: true, followRedirects: false
      });
    } catch (error) {
      if (attempt === 2) throw new Error('Webhook could not be reached. Check the public HTTPS host.');
      Utilities.sleep((attempt + 1) * 1000);
      continue;
    }
    var status = response.getResponseCode();
    if (status >= 200 && status < 300) {
      var body;
      try { body = JSON.parse(response.getContentText()); } catch (_) { throw new Error('Webhook did not return JSON. Check WEBHOOK_URL.'); }
      if (!body.ok) throw new Error('Webhook did not confirm the snapshot.');
      return;
    }
    if (status < 500 && status !== 429) throw new Error('Webhook rejected snapshot (HTTP ' + status + '): ' + response.getContentText().slice(0, 500));
    if (attempt < 2) Utilities.sleep((attempt + 1) * 1000);
  }
  throw new Error('Webhook failed after three attempts. Check HRDO sync audit logs.');
}
