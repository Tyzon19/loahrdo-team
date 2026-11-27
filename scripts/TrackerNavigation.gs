// Keep the bound tracker's month buttons in sync: setValue does not fire onEdit.
function PreviousMonth() {
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  var cell = spreadsheet.getSheetByName("STAFF").getRange("A3");
  var current = Number(cell.getValue()) || 1;
  cell.setValue(current > 1 ? current - 1 : 12);
  syncStaffEdit({ source: spreadsheet });
}

function NextMonth() {
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  var cell = spreadsheet.getSheetByName("STAFF").getRange("A3");
  var current = Number(cell.getValue()) || 1;
  cell.setValue(current < 12 ? current + 1 : 1);
  syncStaffEdit({ source: spreadsheet });
}

function pinMonthNavigationButtons() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("STAFF");
  if (!sheet) throw new Error("STAFF sheet was not found.");

  var positions = {
    PreviousMonth: { offsetX: 8, offsetY: 5 },
    NextMonth: { offsetX: 207, offsetY: 5 },
  };
  var buttons = {};
  sheet.getImages().forEach(function (image) {
    var action = image.getScript();
    if (positions[action]) buttons[action] = image;
  });

  var missing = Object.keys(positions).filter(function (action) {
    return !buttons[action];
  });
  if (missing.length) {
    throw new Error("Month navigation drawings not found: " + missing.join(", "));
  }

  Object.keys(positions).forEach(function (action) {
    var button = buttons[action];
    var position = positions[action];
    button.setAnchorCell(sheet.getRange("A3"));
    button.setAnchorCellXOffset(position.offsetX);
    button.setAnchorCellYOffset(position.offsetY);
    button.setWidth(30);
    button.setHeight(18);
  });
}
