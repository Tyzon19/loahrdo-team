// Keep the bound tracker's month buttons in sync: setValue does not fire onEdit.
function PreviousMonth() {
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  var cell = spreadsheet.getSheetByName('STAFF').getRange('A3');
  var current = Number(cell.getValue()) || 1;
  cell.setValue(current > 1 ? current - 1 : 12);
  syncStaffEdit({ source: spreadsheet });
}

function NextMonth() {
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  var cell = spreadsheet.getSheetByName('STAFF').getRange('A3');
  var current = Number(cell.getValue()) || 1;
  cell.setValue(current < 12 ? current + 1 : 1);
  syncStaffEdit({ source: spreadsheet });
}
