/***************************************************************
 *  FAI SHOP DASHBOARD  —  Google Apps Script Backend
 *  Database : Google Sheet
 *  Deploy   : Extensions > Apps Script  (this file = Code.gs)
 *             then Deploy > New deployment > Web app
 *             Execute as: Me   |   Who has access: Anyone
 *             Copy the /exec URL into assets/js/config.js
 *
 *  First time: run the function "setup" once to create all
 *  sheets (tabs). A Sheet is auto-selected / created if the
 *  script is bound to one. If you run it standalone, create a
 *  Sheet first and paste its ID into SHEET_ID below.
 ***************************************************************/

var SHEET_ID = ''; // optional: paste a Spreadsheet ID to bind a specific sheet

var SHEETS = {
  ITEMS: 'Items',
  CUSTOMERS: 'Customers',
  SALES: 'Sales',
  SALE_ITEMS: 'SaleItems',
  PAYMENTS: 'Payments',
  SETTINGS: 'Settings'
};

var HEADERS = {
  Items:     ['ID','Code','Name','Category','Unit','PurchasePrice','SalePrice','Stock','LowStock','Notes','CreatedAt','UpdatedAt'],
  Customers: ['ID','Name','Phone','Address','Due','Notes','CreatedAt','UpdatedAt'],
  Sales:     ['ID','InvoiceNo','DateTime','CustomerID','CustomerName','SubTotal','Discount','Total','PaymentType','PaidAmount','DueAmount','Notes','CreatedBy'],
  SaleItems: ['ID','SaleID','ItemID','ItemName','Qty','UnitPrice','LineTotal'],
  Payments:  ['ID','DateTime','CustomerID','CustomerName','Amount','Method','Note'],
  Settings:  ['Key','Value']
};

var DEFAULT_SETTINGS = {
  ShopName: 'Fai Shop',
  Address: 'Shop Address',
  Phone: '01XXXXXXXXX',
  Email: '',
  Currency: '৳',
  InvoicePrefix: 'INV',
  LowStockDefault: '5'
};

/* ---------------------------------------------------------------
 *  SETUP  (run once from the editor)
 * --------------------------------------------------------------- */
function setup() {
  Object.keys(SHEETS).forEach(function (k) { getSheet(SHEETS[k]); });
  var sh = getSheet(SHEETS.SETTINGS);
  var current = readKeyVals(SHEETS.SETTINGS);
  Object.keys(DEFAULT_SETTINGS).forEach(function (key) {
    if (current[key] === undefined) sh.appendRow([key, DEFAULT_SETTINGS[key]]);
  });
  Logger.log('Setup complete. Now Deploy > New deployment > Web app.');
}

/* ---------------------------------------------------------------
 *  Spreadsheet + sheet helpers
 * --------------------------------------------------------------- */
function getSS() {
  if (SHEET_ID) return SpreadsheetApp.openById(SHEET_ID);
  var active = SpreadsheetApp.getActiveSpreadsheet();
  if (active) return active;
  throw new Error('No spreadsheet bound. Set SHEET_ID in Code.gs or run from a bound Sheet.');
}

function getSheet(name) {
  var ss = getSS();
  var sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
  }
  var headers = HEADERS[name];
  if (headers) {
    var firstRow = sh.getRange(1, 1, 1, headers.length).getValues()[0];
    var empty = firstRow.join('') === '';
    var wrong = !empty && String(firstRow[0]) !== headers[0];
    if (empty || wrong) {
      sh.getRange(1, 1, 1, headers.length).setValues([headers]);
      sh.setFrozenRows(1);
    }
  }
  return sh;
}

function readAll(name) {
  var sh = getSheet(name);
  var lastRow = sh.getLastRow();
  var lastCol = sh.getLastColumn();
  if (lastRow < 2 || lastCol < 1) return [];
  var values = sh.getRange(1, 1, lastRow, lastCol).getValues();
  var headers = values[0].map(function (h) { return String(h); });
  var out = [];
  for (var i = 1; i < values.length; i++) {
    var row = values[i];
    if (row.join('') === '') continue;
    var obj = { __row: i + 1 };
    for (var j = 0; j < headers.length; j++) obj[headers[j]] = row[j];
    out.push(obj);
  }
  return out;
}

function rowFromObject(name, obj) {
  return HEADERS[name].map(function (h) {
    return obj[h] === undefined || obj[h] === null ? '' : obj[h];
  });
}

function appendObject(name, obj) {
  var sh = getSheet(name);
  sh.appendRow(rowFromObject(name, obj));
}

function findById(name, id) {
  var rows = readAll(name);
  for (var i = 0; i < rows.length; i++) if (String(rows[i].ID) === String(id)) return rows[i];
  return null;
}

function setCell(name, rowIndex, header, value) {
  var col = HEADERS[name].indexOf(header) + 1;
  if (col < 1) return;
  getSheet(name).getRange(rowIndex, col).setValue(value);
}

function updateObject(name, id, patch) {
  var row = findById(name, id);
  if (!row) throw new Error('Record not found: ' + id);
  var sh = getSheet(name);
  var headers = HEADERS[name];
  Object.keys(patch).forEach(function (k) {
    var col = headers.indexOf(k) + 1;
    if (col > 0) sh.getRange(row.__row, col).setValue(patch[k]);
  });
  return true;
}

function deleteObject(name, id) {
  var row = findById(name, id);
  if (!row) return false;
  getSheet(name).deleteRow(row.__row);
  return true;
}

/* ---------------------------------------------------------------
 *  Small utils
 * --------------------------------------------------------------- */
function uid() { return Utilities.getUuid(); }
function pad(n, len) { n = String(n); while (n.length < len) n = '0' + n; return n; }
function num(v) { var n = Number(v); return isNaN(n) ? 0 : n; }

function readKeyVals(name) {
  var rows = readAll(name);
  var out = {};
  rows.forEach(function (r) { out[r.Key] = r.Value; });
  return out;
}

function getSetting(key) {
  var s = readKeyVals(SHEETS.SETTINGS);
  return s[key] !== undefined ? s[key] : DEFAULT_SETTINGS[key];
}

/* ---------------------------------------------------------------
 *  HTTP entry points
 * --------------------------------------------------------------- */
function doGet(e) {
  var params = e && e.parameter ? e.parameter : {};
  var action = params.action || 'ping';
  var data = {};
  if (params.data) { try { data = JSON.parse(params.data); } catch (err) { data = {}; } }
  var result;
  try {
    result = route(action, data);
  } catch (err) {
    result = { ok: false, error: String(err && err.message ? err.message : err) };
  }
  var json = JSON.stringify(result);
  if (params.callback) {
    return ContentService
      .createTextOutput(params.callback + '(' + json + ');')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(json).setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  var body = {};
  try { body = JSON.parse(e.postData.contents); } catch (err) { body = {}; }
  var result;
  try {
    result = route(body.action || 'ping', body.payload || {});
  } catch (err) {
    result = { ok: false, error: String(err && err.message ? err.message : err) };
  }
  return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
}

/* ---------------------------------------------------------------
 *  Router
 * --------------------------------------------------------------- */
function route(action, data) {
  switch (action) {
    case 'ping':          return { ok: true, message: 'Fai Shop API is running', time: new Date() };
    case 'bootstrap':     return bootstrap();
    case 'saveItem':      return saveItem(data);
    case 'deleteItem':    return { ok: deleteObject(SHEETS.ITEMS, data.id) };
    case 'saveCustomer':  return saveCustomer(data);
    case 'deleteCustomer':return { ok: deleteObject(SHEETS.CUSTOMERS, data.id) };
    case 'createSale':    return createSale(data);
    case 'deleteSale':    return deleteSale(data.id);
    case 'addPayment':    return addPayment(data);
    case 'deletePayment': return deletePayment(data.id);
    case 'saveSettings':  return saveSettings(data);
    default:              return { ok: false, error: 'Unknown action: ' + action };
  }
}

/* ---------------------------------------------------------------
 *  Reads
 * --------------------------------------------------------------- */
function bootstrap() {
  var sales = readAll(SHEETS.SALES);
  var saleItems = readAll(SHEETS.SALE_ITEMS);
  var bySale = {};
  saleItems.forEach(function (si) {
    (bySale[si.SaleID] = bySale[si.SaleID] || []).push(si);
  });
  sales.forEach(function (s) { s.items = bySale[s.ID] || []; });
  sales.sort(function (a, b) { return new Date(b.DateTime) - new Date(a.DateTime); });

  return {
    ok: true,
    settings: readKeyVals(SHEETS.SETTINGS),
    items: readAll(SHEETS.ITEMS),
    customers: readAll(SHEETS.CUSTOMERS),
    sales: sales,
    payments: readAll(SHEETS.PAYMENTS),
    serverTime: new Date()
  };
}

/* ---------------------------------------------------------------
 *  Items
 * --------------------------------------------------------------- */
function saveItem(d) {
  var now = new Date();
  var rec = {
    Code: d.Code || '',
    Name: d.Name || '',
    Category: d.Category || '',
    Unit: d.Unit || 'pcs',
    PurchasePrice: num(d.PurchasePrice),
    SalePrice: num(d.SalePrice),
    Stock: num(d.Stock),
    LowStock: num(d.LowStock),
    Notes: d.Notes || ''
  };
  if (d.ID) {
    rec.UpdatedAt = now;
    updateObject(SHEETS.ITEMS, d.ID, rec);
    return { ok: true, id: d.ID };
  }
  rec.ID = uid();
  rec.CreatedAt = now;
  rec.UpdatedAt = now;
  appendObject(SHEETS.ITEMS, rec);
  return { ok: true, id: rec.ID };
}

/* ---------------------------------------------------------------
 *  Customers
 * --------------------------------------------------------------- */
function saveCustomer(d) {
  var now = new Date();
  var rec = {
    Name: d.Name || '',
    Phone: d.Phone || '',
    Address: d.Address || '',
    Notes: d.Notes || ''
  };
  if (d.ID) {
    rec.UpdatedAt = now;
    updateObject(SHEETS.CUSTOMERS, d.ID, rec);
    return { ok: true, id: d.ID };
  }
  rec.ID = uid();
  rec.Due = num(d.Due);
  rec.CreatedAt = now;
  rec.UpdatedAt = now;
  appendObject(SHEETS.CUSTOMERS, rec);
  return { ok: true, id: rec.ID };
}

/* ---------------------------------------------------------------
 *  Sales / Bills
 * --------------------------------------------------------------- */
function createSale(d) {
  var lock = LockService.getScriptLock();
  lock.tryLock(20000);
  try {
    var lines = d.items || [];
    if (!lines.length) throw new Error('No items in the bill.');

    var subTotal = 0;
    lines.forEach(function (it) { subTotal += num(it.qty) * num(it.unitPrice); });
    var discount = num(d.discount);
    var total = Math.max(subTotal - discount, 0);
    var type = d.paymentType === 'Credit' ? 'Credit' : 'Cash';
    var paid = type === 'Cash' ? total : num(d.paidAmount);
    if (paid > total) paid = total;
    if (paid < 0) paid = 0;
    var due = total - paid;

    var saleId = uid();
    var seq = readAll(SHEETS.SALES).length + 1;
    var prefix = getSetting('InvoicePrefix') || 'INV';
    var invoiceNo = prefix + '-' + pad(seq, 4);
    var now = new Date();

    appendObject(SHEETS.SALES, {
      ID: saleId,
      InvoiceNo: invoiceNo,
      DateTime: now,
      CustomerID: d.customerId || '',
      CustomerName: d.customerName || 'Walk-in / খুচরা ক্রেতা',
      SubTotal: subTotal,
      Discount: discount,
      Total: total,
      PaymentType: type,
      PaidAmount: paid,
      DueAmount: due,
      Notes: d.notes || '',
      CreatedBy: d.createdBy || ''
    });

    lines.forEach(function (it) {
      appendObject(SHEETS.SALE_ITEMS, {
        ID: uid(),
        SaleID: saleId,
        ItemID: it.itemId || '',
        ItemName: it.itemName || '',
        Qty: num(it.qty),
        UnitPrice: num(it.unitPrice),
        LineTotal: num(it.qty) * num(it.unitPrice)
      });
      if (it.itemId) {
        var item = findById(SHEETS.ITEMS, it.itemId);
        if (item) setCell(SHEETS.ITEMS, item.__row, 'Stock', num(item.Stock) - num(it.qty));
      }
    });

    if (d.customerId && due > 0) {
      var cust = findById(SHEETS.CUSTOMERS, d.customerId);
      if (cust) setCell(SHEETS.CUSTOMERS, cust.__row, 'Due', num(cust.Due) + due);
    }

    return { ok: true, saleId: saleId, invoiceNo: invoiceNo, total: total, paid: paid, due: due };
  } finally {
    lock.releaseLock();
  }
}

function deleteSale(id) {
  var lock = LockService.getScriptLock();
  lock.tryLock(20000);
  try {
    var sale = findById(SHEETS.SALES, id);
    if (!sale) throw new Error('Sale not found');

    var lines = readAll(SHEETS.SALE_ITEMS).filter(function (si) { return String(si.SaleID) === String(id); });
    lines.forEach(function (si) {
      if (si.ItemID) {
        var item = findById(SHEETS.ITEMS, si.ItemID);
        if (item) setCell(SHEETS.ITEMS, item.__row, 'Stock', num(item.Stock) + num(si.Qty));
      }
    });

    if (sale.CustomerID && num(sale.DueAmount) > 0) {
      var cust = findById(SHEETS.CUSTOMERS, sale.CustomerID);
      if (cust) setCell(SHEETS.CUSTOMERS, cust.__row, 'Due', num(cust.Due) - num(sale.DueAmount));
    }

    for (var i = lines.length - 1; i >= 0; i--) deleteObject(SHEETS.SALE_ITEMS, lines[i].ID);
    deleteObject(SHEETS.SALES, id);
    return { ok: true };
  } finally {
    lock.releaseLock();
  }
}

/* ---------------------------------------------------------------
 *  Payments (due collection)
 * --------------------------------------------------------------- */
function addPayment(d) {
  var amount = num(d.Amount);
  if (amount <= 0) throw new Error('Amount must be greater than 0.');
  var rec = {
    ID: uid(),
    DateTime: new Date(),
    CustomerID: d.CustomerID || '',
    CustomerName: d.CustomerName || '',
    Amount: amount,
    Method: d.Method || 'Cash',
    Note: d.Note || ''
  };
  appendObject(SHEETS.PAYMENTS, rec);
  if (d.CustomerID) {
    var cust = findById(SHEETS.CUSTOMERS, d.CustomerID);
    if (cust) setCell(SHEETS.CUSTOMERS, cust.__row, 'Due', Math.max(num(cust.Due) - amount, 0));
  }
  return { ok: true, id: rec.ID };
}

function deletePayment(id) {
  var p = findById(SHEETS.PAYMENTS, id);
  if (!p) throw new Error('Payment not found');
  if (p.CustomerID) {
    var cust = findById(SHEETS.CUSTOMERS, p.CustomerID);
    if (cust) setCell(SHEETS.CUSTOMERS, cust.__row, 'Due', num(cust.Due) + num(p.Amount));
  }
  deleteObject(SHEETS.PAYMENTS, id);
  return { ok: true };
}

/* ---------------------------------------------------------------
 *  Settings
 * --------------------------------------------------------------- */
function saveSettings(d) {
  var sh = getSheet(SHEETS.SETTINGS);
  var rows = readAll(SHEETS.SETTINGS);
  var index = {};
  rows.forEach(function (r) { index[r.Key] = r; });
  Object.keys(d).forEach(function (key) {
    if (key === 'ok') return;
    if (index[key]) setCell(SHEETS.SETTINGS, index[key].__row, 'Value', d[key]);
    else sh.appendRow([key, d[key]]);
  });
  return { ok: true };
}
