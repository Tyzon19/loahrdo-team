/**
 * Leave approval sync for the LOA Leave & Attendance app.
 *
 * Add this as a separate Apps Script file when the project already has the
 * attendance-only HrdoAttendanceSync.gs. It reuses hrdoAttendanceConfig_(),
 * so the existing HRDO_WEBHOOK_URL, HRDO_WEBHOOK_SECRET, tracker ID and
 * department group remain unchanged.
 *
 * Run installLeaveApprovalTrigger once, then run syncApprovedLeaves manually.
 */

function installLeaveApprovalTrigger() {
  ScriptApp.getProjectTriggers().forEach(function(trigger) {
    if (trigger.getHandlerFunction() === 'syncApprovedLeaves') ScriptApp.deleteTrigger(trigger);
  });
  ScriptApp.newTrigger('syncApprovedLeaves').timeBased().everyMinutes(1).create();
}

function leaveConfig_() {
  var attendance = hrdoAttendanceConfig_();
  if (!attendance || !attendance.id || !attendance.group) {
    throw new Error('hrdoAttendanceConfig_() must return the tracker id and department group.');
  }
  return {
    url: attendance.url,
    secret: attendance.secret,
    source: { id: attendance.id, group: attendance.group }
  };
}

function leaveEndpoint_(url) {
  var endpoint = String(url).replace(/\/api\/(?:webhooks\/sheets-sync|sheets\/webhook)\/?$/, '/api/webhooks/leave-tracker');
  if (endpoint === url) throw new Error('HRDO_WEBHOOK_URL must end in /api/webhooks/sheets-sync.');
  return endpoint;
}

function leaveJobsRequest_(config, payload) {
  var options = {
    method: payload ? 'post' : 'get',
    headers: { 'x-hrdo-webhook-secret': config.secret },
    muteHttpExceptions: true,
    followRedirects: false
  };
  if (payload) {
    options.contentType = 'application/json';
    options.payload = JSON.stringify(payload);
  }
  var response = UrlFetchApp.fetch(leaveEndpoint_(config.url), options);
  var body;
  try {
    body = JSON.parse(response.getContentText());
  } catch (_) {
    throw new Error('Leave tracker endpoint did not return JSON.');
  }
  if (response.getResponseCode() !== 200 || !body.ok) {
    throw new Error(body.error || 'Leave tracker endpoint failed.');
  }
  return body;
}

function leavePushTracker_(config) {
  var sheet = SpreadsheetApp.openById(config.source.id).getSheetByName('STAFF');
  if (!sheet) throw new Error('STAFF tab was not found.');
  SpreadsheetApp.flush();
  var lastRow = Math.max(8, sheet.getLastRow());
  if (lastRow > 5000 || sheet.getLastColumn() > 410) {
    throw new Error('STAFF exceeds the supported 5000-row / 410-column snapshot size.');
  }
  var values = sheet.getRange(1, 1, lastRow, Math.max(389, sheet.getLastColumn())).getValues();
  var payload = JSON.stringify({
    snapshotId: Utilities.getUuid(),
    departmentGroup: config.source.group,
    spreadsheetId: config.source.id,
    sheetName: 'STAFF',
    capturedAt: new Date().toISOString(),
    values: values
  });
  if (Utilities.newBlob(payload).getBytes().length > 8 * 1024 * 1024) {
    throw new Error('Snapshot exceeds the 8 MiB webhook limit.');
  }
  for (var attempt = 0; attempt < 3; attempt++) {
    var response;
    try {
      response = UrlFetchApp.fetch(config.url, {
        method: 'post',
        contentType: 'application/json',
        headers: { 'x-hrdo-webhook-secret': config.secret },
        payload: payload,
        muteHttpExceptions: true,
        followRedirects: false
      });
    } catch (error) {
      if (attempt === 2) throw new Error('Webhook could not be reached. Check the public HTTPS host.');
      Utilities.sleep((attempt + 1) * 1000);
      continue;
    }
    var status = response.getResponseCode();
    if (status >= 200 && status < 300) {
      var body;
      try {
        body = JSON.parse(response.getContentText());
      } catch (_) {
        throw new Error('Webhook did not return JSON. Check HRDO_WEBHOOK_URL.');
      }
      if (!body.ok) throw new Error('Webhook did not confirm the snapshot.');
      return;
    }
    if (status < 500 && status !== 429) {
      throw new Error('Webhook rejected snapshot (HTTP ' + status + '): ' + response.getContentText().slice(0, 500));
    }
    if (attempt < 2) Utilities.sleep((attempt + 1) * 1000);
  }
  throw new Error('Webhook failed after three attempts. Check HRDO sync audit logs.');
}

function syncApprovedLeaves() {
  var config = leaveConfig_();
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var jobs = leaveJobsRequest_(config).jobs;
    jobs.forEach(function(job) {
      try {
        if (job.department_group !== config.source.group || job.spreadsheet_id !== config.source.id) {
          throw new Error('This script is not configured for the job tracker.');
        }
        // Not-credited leave is final in the application; never write it to a paid-leave cell.
        if (!job.credited) {
          throw new Error('Not-credited leave does not use a tracker write; paid-leave cells were not changed.');
        }
        var sheet = SpreadsheetApp.openById(config.source.id).getSheetByName('STAFF');
        if (!sheet) throw new Error('STAFF tab is missing.');
        var name = String(sheet.getRange(job.sheet_row_number, 1).getValue()).trim();
        if (name !== job.full_name.trim()) {
          throw new Error('Employee row changed. HR must verify the tracker mapping.');
        }
        var startMonth = Number(sheet.getRange('A1').getValue());
        var year = Number(sheet.getRange('A2').getValue());
        var cycle = year + '-' + ('0' + startMonth).slice(-2) + '-01';
        if (cycle !== job.cycle_start) {
          throw new Error('Tracker cycle changed. Sync and review before writing.');
        }
        var cells = job.dates.map(function(date) {
          var parts = date.split('-').map(Number);
          var offset = (parts[0] - year) * 12 + parts[1] - startMonth;
          if (offset < 0 || offset > 11) throw new Error('Leave date is outside this tracker cycle.');
          var cell = sheet.getRange(job.sheet_row_number, 2 + offset * 31 + parts[2] - 1);
          var existing = String(cell.getValue()).trim();
          if (cell.getNote() && cell.getNote() !== 'LOA leave application ' + job.id) {
            throw new Error('An HR note already exists on ' + date + '. Review it before updating.');
          }
          if (cell.getFormula() || (existing && existing !== job.code)) {
            throw new Error('An attendance entry already exists on ' + date + '. No cells were overwritten.');
          }
          if (existing === job.code && cell.getNote() !== 'LOA leave application ' + job.id) {
            throw new Error('A manually recorded leave already exists on ' + date + '. HR must reconcile it.');
          }
          return cell;
        });
        // Validate every date before writing; notes make retries safe after partial execution.
        cells.forEach(function(cell) {
          cell.setNote('LOA leave application ' + job.id);
          cell.setValue(job.code);
        });
        SpreadsheetApp.flush();
        leavePushTracker_(config);
        var usedSl = Number(sheet.getRange(job.sheet_row_number, 375).getValue()) +
          Number(sheet.getRange(job.sheet_row_number, 385).getValue()) / 2;
        var usedVl = Number(sheet.getRange(job.sheet_row_number, 376).getValue()) +
          Number(sheet.getRange(job.sheet_row_number, 384).getValue()) / 2;
        if (!isFinite(usedSl) || !isFinite(usedVl)) {
          throw new Error('Tracker utilized-leave formulas are invalid.');
        }
        leaveJobsRequest_(config, { id: job.id, utilized: { sl: usedSl, vl: usedVl } });
      } catch (error) {
        leaveJobsRequest_(config, { id: job.id, error: String(error.message).slice(0, 500) });
      }
    });
  } finally {
    lock.releaseLock();
  }
}
