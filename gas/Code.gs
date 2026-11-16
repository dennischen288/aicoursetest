/**
 * 炙餃｜線上訂單接收（綁定在 Google 試算表「鍋貼店預約」的 Apps Script）
 *
 * 安裝方式：試算表 → 擴充功能 → Apps Script → 貼上本檔 → 執行 setup() → 部署為網頁應用程式。
 * 詳細步驟見 gas/README.md。
 *
 * 安全原則：
 * - 價格一律以「商品」工作表為準，前端送來的金額只用來比對，不直接寫入。
 * - 此端點只接收訂單，不提供任何顧客資料查詢。
 * - 寫入儲存格前會跳脫 = + - @ 開頭的文字，避免試算表公式注入。
 */

const SHEET_ORDERS = '訂單';
const SHEET_PRODUCTS = '商品';
const ORDER_HEADERS = ['訂單編號', '建立時間', '狀態', '取餐方式', '姓名', '電話', '地址', '備註', '品項', '總數量', '總金額', '品項JSON', '請求ID'];
const COL = { id: 1, status: 3, requestId: 13 };
const STATUSES = ['待確認', '已確認', '製作中', '可取餐', '已完成', '已取消'];
const FULFILLMENTS = ['外帶', '內用', '宅配'];
const PRODUCT_HEADERS = ['商品代碼', '商品名稱', '單價', '上架'];
const DEFAULT_PRODUCTS = [
  ['p01', '經典鮮肉鍋貼', 85, true], ['p02', '香辣椒麻鍋貼', 95, true], ['p03', '韭香鮮肉鍋貼', 90, true],
  ['d01', '鮮肉高麗菜水餃', 90, true], ['d02', '韭菜鮮肉水餃', 95, true],
  ['s01', '酸辣湯', 45, true], ['s02', '玉米濃湯', 45, true], ['s03', '古早味紅茶', 30, true],
  ['a01', '涼拌小黃瓜', 45, true], ['a02', '秘製滷豆干', 40, true],
  ['gift01', '招財鍋貼禮盒 50 入', 599, true]
];
const TZ = 'Asia/Taipei';

/* ---------------- 試算表選單 ---------------- */

function onOpen() {
  SpreadsheetApp.getUi().createMenu('🥟 炙餃訂單')
    .addItem('初始化工作表', 'setup')
    .addItem('今日訂單統計', 'showTodaySummary')
    .addSeparator()
    .addItem('開始接單', 'enableOrders')
    .addItem('暫停接單', 'disableOrders')
    .addItem('設定新訂單通知 Email', 'promptNotifyEmail')
    .addToUi();
}

function book_() {
  const book = SpreadsheetApp.getActiveSpreadsheet();
  if (!book) throw new Error('請從試算表的「擴充功能 → Apps Script」開啟並執行本程式。');
  return book;
}

function props_() { return PropertiesService.getScriptProperties(); }

/** 建立「訂單」「商品」工作表與格式；重複執行不會覆蓋既有資料。 */
function setup() {
  const book = book_();
  book.setSpreadsheetTimeZone(TZ);

  let orders = book.getSheetByName(SHEET_ORDERS);
  if (!orders) {
    // 新建立的試算表只有一張空白工作表時，直接改名使用。
    const first = book.getSheets()[0];
    orders = (book.getSheets().length === 1 && first.getLastRow() === 0) ? first.setName(SHEET_ORDERS) : book.insertSheet(SHEET_ORDERS, 0);
  }
  if (orders.getLastRow() === 0) {
    orders.appendRow(ORDER_HEADERS);
    orders.setFrozenRows(1);
    orders.getRange(1, 1, 1, ORDER_HEADERS.length).setFontWeight('bold').setBackground('#39271f').setFontColor('#ffffff');
    orders.getRange('B:B').setNumberFormat('yyyy-mm-dd hh:mm:ss');
    orders.getRange('F:F').setNumberFormat('@');
    orders.getRange('K:K').setNumberFormat('"NT$ "#,##0');
    orders.getRange('C2:C').setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(STATUSES, true).build());
    orders.setColumnWidths(1, 1, 190); orders.setColumnWidth(9, 280);
    orders.hideColumns(12, 2); // 品項JSON、請求ID 供系統使用
    const status = orders.getRange('C2:C');
    const colors = { '待確認': '#fde8d7', '已確認': '#e3eefc', '製作中': '#fff4c2', '可取餐': '#dff3e4', '已完成': '#e8e8e8', '已取消': '#f6d6d6' };
    orders.setConditionalFormatRules(Object.keys(colors).map(function (s) {
      return SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo(s).setBackground(colors[s]).setRanges([status]).build();
    }));
  }

  let products = book.getSheetByName(SHEET_PRODUCTS);
  if (!products) products = book.insertSheet(SHEET_PRODUCTS);
  if (products.getLastRow() === 0) {
    products.appendRow(PRODUCT_HEADERS);
    products.setFrozenRows(1);
    products.getRange(1, 1, 1, PRODUCT_HEADERS.length).setFontWeight('bold');
    products.getRange(2, 1, DEFAULT_PRODUCTS.length, 4).setValues(DEFAULT_PRODUCTS);
    products.getRange(2, 4, DEFAULT_PRODUCTS.length, 1).insertCheckboxes();
    products.getRange(2, 4, DEFAULT_PRODUCTS.length, 1).setValues(DEFAULT_PRODUCTS.map(function (p) { return [p[3]]; }));
  }

  props_().setProperty('ORDERS_ENABLED', 'true'); // 初始化即開始接單（覆蓋舊版程式留下的設定）
  SpreadsheetApp.flush();
  toast_('工作表已就緒並已開始接單，接下來請部署新版本。');
}

function enableOrders() { props_().setProperty('ORDERS_ENABLED', 'true'); toast_('已開始接單'); }
function disableOrders() { props_().setProperty('ORDERS_ENABLED', 'false'); toast_('已暫停接單，網站送單會顯示暫停訊息'); }

function promptNotifyEmail() {
  const ui = SpreadsheetApp.getUi();
  const current = props_().getProperty('NOTIFY_EMAIL') || '（未設定）';
  const res = ui.prompt('新訂單通知', '目前：' + current + '\n輸入要收到新訂單通知的 Email（留空則關閉通知）：', ui.ButtonSet.OK_CANCEL);
  if (res.getSelectedButton() !== ui.Button.OK) return;
  const email = res.getResponseText().trim();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { ui.alert('Email 格式不正確'); return; }
  if (email) props_().setProperty('NOTIFY_EMAIL', email); else props_().deleteProperty('NOTIFY_EMAIL');
  toast_(email ? '已設定通知：' + email : '已關閉 Email 通知');
}

function showTodaySummary() {
  const sheet = book_().getSheetByName(SHEET_ORDERS);
  const today = Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd');
  let count = 0, revenue = 0, pending = 0;
  if (sheet && sheet.getLastRow() > 1) {
    sheet.getRange(2, 1, sheet.getLastRow() - 1, 11).getValues().forEach(function (r) {
      if (!(r[1] instanceof Date) || Utilities.formatDate(r[1], TZ, 'yyyy-MM-dd') !== today || r[2] === '已取消') return;
      count++; revenue += Number(r[10]) || 0; if (r[2] === '待確認') pending++;
    });
  }
  SpreadsheetApp.getUi().alert('今日訂單統計（' + today + '）', '有效訂單：' + count + ' 筆\n待確認：' + pending + ' 筆\n營業額：NT$ ' + revenue.toLocaleString(), SpreadsheetApp.getUi().ButtonSet.OK);
}

function toast_(msg) { try { book_().toast(msg, '炙餃訂單', 5); } catch (e) { console.log(msg); } }

/* ---------------- 網頁應用程式端點 ---------------- */

function doGet() {
  return json_({ service: 'zhijiao-orders', version: 2, acceptingOrders: props_().getProperty('ORDERS_ENABLED') === 'true' });
}

function doPost(e) {
  try {
    check_(e && e.postData && typeof e.postData.contents === 'string' && e.postData.contents.length <= 20000, '訂單資料不正確。');
    let raw;
    try { raw = JSON.parse(e.postData.contents); } catch (err) { fail_('訂單資料不正確。'); }
    return json_(recordOrder_(raw));
  } catch (error) {
    const known = !!error.code;
    // 不記錄顧客個資、不回傳內部錯誤細節。
    if (!known) console.error('order failed: ' + (error && error.stack));
    return json_({ ok: false, code: known ? error.code : 'SERVER_ERROR', message: known ? error.message : '系統暫時無法建立訂單，請稍後再試。' });
  }
}

function json_(obj) { return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON); }

function fail_(message, code) { const err = new Error(message); err.code = code || 'INVALID_ORDER'; throw err; }
function check_(cond, message, code) { if (!cond) fail_(message, code); }

function text_(value, max, required) {
  if (value == null) value = '';
  check_(typeof value === 'string', '表單資料格式不正確。');
  const v = value.trim();
  check_(v.length <= max, '欄位字數超過上限。');
  check_(!required || v.length > 0, '請填寫必填欄位。');
  check_(!/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(v), '資料含有不支援的字元。');
  return v;
}

/** 防止試算表公式注入。 */
function safeCell_(v) { return /^[\s]*[=+\-@]/.test(v) ? "'" + v : v; }

function loadCatalog_(book) {
  const sheet = book.getSheetByName(SHEET_PRODUCTS);
  check_(sheet && sheet.getLastRow() > 1, '商品設定尚未完成。', 'NOT_READY');
  const catalog = {};
  sheet.getRange(2, 1, sheet.getLastRow() - 1, 4).getValues().forEach(function (r) {
    const price = Number(r[2]);
    if ((r[3] === true || r[3] === 'TRUE') && r[0] && Number.isSafeInteger(price) && price > 0) catalog[String(r[0]).trim()] = { name: String(r[1]), price: price };
  });
  return catalog;
}

/** 純函式：驗證訂單並以商品表重新計價。 */
function validateOrder_(raw, catalog) {
  check_(raw && typeof raw === 'object' && raw.version === 2, '訂單版本不正確，請重新整理頁面。');
  check_(typeof raw.requestId === 'string' && /^[a-f0-9]{32}$/.test(raw.requestId), '訂單識別碼不正確。');
  check_(FULFILLMENTS.indexOf(raw.fulfillment) >= 0, '請選擇取餐方式。');
  const c = raw.customer || {};
  const name = text_(c.name, 60, true);
  const phone = text_(c.phone, 20, true);
  check_(/^[0-9+() -]{8,20}$/.test(phone), '請填寫有效的聯絡電話。');
  const address = text_(c.address, 200, raw.fulfillment === '宅配');
  const note = text_(c.note, 300, false);

  check_(Array.isArray(raw.items) && raw.items.length > 0 && raw.items.length <= 30, '購物車是空的。');
  const seen = {};
  let total = 0, quantity = 0;
  const items = raw.items.map(function (it) {
    check_(it && typeof it.id === 'string' && /^[a-z0-9]{1,20}$/.test(it.id) && !seen[it.id], '商品資料不正確。');
    seen[it.id] = true;
    const p = catalog[it.id];
    check_(p, '部分商品已下架，請重新整理後再送出。', 'PRODUCT_CHANGED');
    check_(Number.isInteger(it.quantity) && it.quantity >= 1 && it.quantity <= 99, '每項商品數量須為 1 至 99。');
    total += p.price * it.quantity; quantity += it.quantity;
    return { id: it.id, name: p.name, quantity: it.quantity, unitPrice: p.price, subtotal: p.price * it.quantity };
  });
  check_(total <= 50000 && quantity <= 300, '單筆訂單超過上限，請直接聯絡店家。');
  check_(raw.expectedTotal === total, '商品價格已更新，請重新整理頁面確認金額後再送出。', 'PRICE_CHANGED');
  return { requestId: raw.requestId, fulfillment: raw.fulfillment, name: name, phone: phone, address: raw.fulfillment === '宅配' ? address : '', note: note, items: items, total: total, quantity: quantity };
}

function recordOrder_(raw) {
  const p = props_();
  check_(p.getProperty('ORDERS_ENABLED') === 'true', '店家目前暫停線上接單，請稍後再試或來電訂購。', 'CLOSED');
  const book = book_();
  const sheet = book.getSheetByName(SHEET_ORDERS);
  check_(sheet && sheet.getLastRow() >= 1, '訂單系統尚未設定完成。', 'NOT_READY');

  const lock = LockService.getScriptLock();
  check_(lock.tryLock(15000), '目前訂單較多，請稍後再送出一次。', 'BUSY');
  try {
    // 同一筆請求重送（例如網路逾時）時，回傳原本的訂單，不重複建立。
    if (raw && typeof raw.requestId === 'string' && /^[a-f0-9]{32}$/.test(raw.requestId) && sheet.getLastRow() > 1) {
      const hit = sheet.getRange(2, COL.requestId, sheet.getLastRow() - 1, 1).createTextFinder(raw.requestId).matchEntireCell(true).findNext();
      if (hit) {
        const row = sheet.getRange(hit.getRow(), 1, 1, 11).getValues()[0];
        return { ok: true, duplicate: true, orderId: String(row[0]), total: Number(row[10]) };
      }
    }

    const order = validateOrder_(raw, loadCatalog_(book));

    // 簡易流量控制：每分鐘最多 30 筆。
    const cache = CacheService.getScriptCache();
    const key = 'orders-' + Math.floor(Date.now() / 60000);
    const n = Number(cache.get(key) || 0);
    check_(n < 30, '目前訂單較多，請稍後再試。', 'RATE_LIMIT');
    cache.put(key, String(n + 1), 120);

    const now = new Date();
    const orderId = 'ZJ-' + Utilities.formatDate(now, TZ, 'yyyyMMdd-HHmm') + '-' + Utilities.getUuid().replace(/-/g, '').slice(0, 4).toUpperCase();
    const summary = order.items.map(function (i) { return i.name + ' × ' + i.quantity; }).join('、');
    sheet.appendRow([orderId, now, '待確認', order.fulfillment, safeCell_(order.name), safeCell_(order.phone), safeCell_(order.address), safeCell_(order.note), summary, order.quantity, order.total, JSON.stringify(order.items), order.requestId]);
    SpreadsheetApp.flush();

    notify_(orderId, order, summary);
    return { ok: true, orderId: orderId, total: order.total };
  } finally {
    lock.releaseLock();
  }
}

function notify_(orderId, order, summary) {
  const to = props_().getProperty('NOTIFY_EMAIL');
  if (!to) return;
  try {
    MailApp.sendEmail({
      to: to,
      subject: '【炙餃】新訂單 ' + orderId + '｜' + order.fulfillment + '｜NT$ ' + order.total,
      body: ['訂單編號：' + orderId, '取餐方式：' + order.fulfillment, '姓名：' + order.name, '電話：' + order.phone,
        order.address ? '地址：' + order.address : '', '品項：' + summary, '總金額：NT$ ' + order.total,
        order.note ? '備註：' + order.note : '', '', '試算表：' + book_().getUrl()].filter(Boolean).join('\n')
    });
  } catch (e) {
    console.error('notify failed: ' + e.message); // 通知失敗不影響訂單成立
  }
}
