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

/** Install once after updating this script. Uses the existing webhook URL and secret. */
function installLeaveApprovalTrigger() {
  ScriptApp.getProjectTriggers().forEach(function(trigger) {
    if (trigger.getHandlerFunction() === 'syncApprovedLeaves') ScriptApp.deleteTrigger(trigger);
  });
  ScriptApp.newTrigger('syncApprovedLeaves').timeBased().everyMinutes(1).create();
}

function leaveJobsRequest_(config, payload) {
  var url = config.url.replace(/\/api\/(?:webhooks\/sheets-sync|sheets\/webhook)\/?$/, '/api/webhooks/leave-tracker');
  if (url === config.url) throw new Error('WEBHOOK_URL must end in /api/webhooks/sheets-sync.');
  var options = { method: payload ? 'post' : 'get', headers: { 'x-hrdo-webhook-secret': config.secret }, muteHttpExceptions: true, followRedirects: false };
  if (payload) { options.contentType = 'application/json'; options.payload = JSON.stringify(payload); }
  var response = UrlFetchApp.fetch(url, options);
  var body = JSON.parse(response.getContentText());
  if (response.getResponseCode() !== 200 || !body.ok) throw new Error(body.error || 'Leave tracker endpoint failed.');
  return body;
}

function syncApprovedLeaves() {
  var config = configuration_();
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var jobs = leaveJobsRequest_(config).jobs;
    jobs.forEach(function(job) {
      try {
        var source = config.sources.filter(function(item) { return item.group === job.department_group && item.id === job.spreadsheet_id; })[0];
        if (!source) throw new Error('Configure the matching tracker in Script Properties.');
        // Not-credited leave is final in the application; never write it to a paid-leave cell.
        if (!job.credited) throw new Error('Not-credited leave does not use a tracker write; paid-leave cells were not changed.');
        var sheet = SpreadsheetApp.openById(source.id).getSheetByName('STAFF');
        if (!sheet) throw new Error('STAFF tab is missing.');
        var name = String(sheet.getRange(job.sheet_row_number, 1).getValue()).trim();
        if (name !== job.full_name.trim()) throw new Error('Employee row changed. HR must verify the tracker mapping.');
        var year = Number(sheet.getRange('A2').getValue());
        var calendarStart = year + '-01-01';
        if (calendarStart !== job.cycle_start) throw new Error('Tracker calendar year changed. Sync and review before writing.');
        var expectedColumns = [];
        var cells = job.dates.map(function(date) {
          var parts = date.split('-').map(Number);
          if (parts[0] !== year) throw new Error('Leave date is outside this tracker calendar year.');
          var column = 2 + (parts[1] - 1) * 31 + parts[2] - 1;
          if (sheet.getRange(3, column).getValue() !== true) {
            throw new Error('Leave date ' + date + ' is not a working day in the tracker.');
          }
          var cell = sheet.getRange(job.sheet_row_number, column);
          var existing = String(cell.getValue()).trim();
          if (cell.getNote() && cell.getNote() !== 'LOA leave application ' + job.id) throw new Error('An HR note already exists on ' + date + '. Review it before updating.');
          if (cell.getFormula() || (existing && existing !== job.code)) throw new Error('An attendance entry already exists on ' + date + '. No cells were overwritten.');
          if (existing === job.code && cell.getNote() !== 'LOA leave application ' + job.id) throw new Error('A manually recorded leave already exists on ' + date + '. HR must reconcile it.');
          expectedColumns.push(cell.getColumn());
          return cell;
        });
        var leaveNote = 'LOA leave application ' + job.id;
        var existingCells = sheet.getRange(job.sheet_row_number, 2, 1, 372);
        var existingNotes = existingCells.getNotes()[0];
        existingNotes.forEach(function(note, index) {
          if (note === leaveNote && expectedColumns.indexOf(index + 2) === -1) {
            var staleCell = sheet.getRange(job.sheet_row_number, index + 2);
            staleCell.clearContent();
            staleCell.clearNote();
          }
        });
        // Validate every date before writing; notes make retries safe after partial execution.
        cells.forEach(function(cell) { cell.setNote(leaveNote); cell.setValue(job.code); });
        SpreadsheetApp.flush();
        pushTracker_(config, source);
        var usedSl = Number(sheet.getRange(job.sheet_row_number, 375).getValue()) + Number(sheet.getRange(job.sheet_row_number, 385).getValue()) / 2;
        var usedVl = Number(sheet.getRange(job.sheet_row_number, 376).getValue()) + Number(sheet.getRange(job.sheet_row_number, 384).getValue()) / 2;
        if (!isFinite(usedSl) || !isFinite(usedVl)) throw new Error('Tracker utilized-leave formulas are invalid.');
        leaveJobsRequest_(config, { id: job.id, utilized: { sl: usedSl, vl: usedVl } });
      } catch (error) {
        leaveJobsRequest_(config, { id: job.id, error: String(error.message).slice(0, 500) });
      }
    });
  } finally { lock.releaseLock(); }
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
  if (lastRow > 5000) throw new Error('STAFF exceeds the supported 5000-row snapshot size.');
  // A:NY contains identity, all 372 daily cells and balances; NZ:OT preserves supported remarks.
  // Keep blank rows: the server links identities to the original sheet row number.
  var lastColumn = 441;
  var values = sheet.getRange(1, 1, lastRow, lastColumn).getValues();
  var shifted = String(values[4] && values[4][404] || "")
    .trim()
    .toLowerCase() === "leaves this month";
  values = values.map(function (row) {
    if (!shifted) return row.slice(0, 410);
    var normalized = row.slice(0, 389).concat(row.slice(420, 441));
    normalized[373] = row[404];
    normalized[379] = row[410];
    normalized[386] = row[417];
    normalized[387] = row[418];
    normalized[388] = row[419];
    return normalized;
  });
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
