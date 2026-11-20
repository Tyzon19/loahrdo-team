/**
 * Google Apps Script bridge for the LOA HRDO Late & Absences module.
 *
 * Set these Script Properties before installing the onEdit trigger:
 * WEBHOOK_URL, WEBHOOK_SECRET, NON_TEACHING_SPREADSHEET_ID,
 * COLLEGE_SPREADSHEET_ID, BASIC_ED_SPREADSHEET_ID.
 */
function onEdit(e) {
  if (!e || !e.range || e.range.getSheet().getName() !== 'STAFF') return;
  var group = staffGroupForSpreadsheet_(e.source.getId());
  if (!group) return;

  var properties = PropertiesService.getScriptProperties();
  var webhookUrl = properties.getProperty('WEBHOOK_URL');
  var secret = properties.getProperty('WEBHOOK_SECRET');
  if (!webhookUrl || !secret) throw new Error('Attendance webhook properties are not configured.');

  UrlFetchApp.fetch(webhookUrl, {
    method: 'post',
    contentType: 'application/json',
    headers: { 'x-webhook-secret': secret },
    payload: JSON.stringify({
      staffGroup: group,
      sheetName: 'STAFF',
      editedRange: e.range.getA1Notation(),
      editedAt: new Date().toISOString()
    }),
    muteHttpExceptions: true
  });
}

function staffGroupForSpreadsheet_(spreadsheetId) {
  var properties = PropertiesService.getScriptProperties();
  var groups = [
    ['NON_TEACHING', 'NON_TEACHING_SPREADSHEET_ID'],
    ['COLLEGE', 'COLLEGE_SPREADSHEET_ID'],
    ['BASIC_ED', 'BASIC_ED_SPREADSHEET_ID']
  ];
  for (var i = 0; i < groups.length; i++) {
    if (properties.getProperty(groups[i][1]) === spreadsheetId) return groups[i][0];
  }
  return null;
}

function syncAllStaffGroupsNow() {
  var properties = PropertiesService.getScriptProperties();
  var webhookUrl = properties.getProperty('WEBHOOK_URL');
  var secret = properties.getProperty('WEBHOOK_SECRET');
  if (!webhookUrl || !secret) throw new Error('Attendance webhook properties are not configured.');

  ['NON_TEACHING', 'COLLEGE', 'BASIC_ED'].forEach(function(group) {
    UrlFetchApp.fetch(webhookUrl, {
      method: 'post',
      contentType: 'application/json',
      headers: { 'x-webhook-secret': secret },
      payload: JSON.stringify({ staffGroup: group, reason: 'manual-sync' }),
      muteHttpExceptions: true
    });
  });
}
