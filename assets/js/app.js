/* ============================================================
 *  Fai Shop Dashboard — Application logic
 * ============================================================ */
(function () {
  "use strict";

  /* ---------------- State ---------------- */
  var S = {
    items: [],
    customers: [],
    sales: [],
    payments: [],
    settings: {},
    page: "dashboard",
    cart: [],
    payType: "Cash",
    charts: {},
    loaded: false,
    user: null,
    token: null
  };

  /* ---------------- Helpers ---------------- */
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function num(v) { var n = Number(v); return isNaN(n) ? 0 : n; }
  function pad2(n) { n = String(n); return n.length < 2 ? "0" + n : n; }
  function esc(v) {
    return String(v === undefined || v === null ? "" : v).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function cfg() { return window.SHOP_CONFIG || {}; }
  function allShops() {
    var list = cfg().SHOPS;
    if (!list || !list.length) return [{ id: "default", name: cfg().SHOP_NAME || "Fair Shop", apiUrl: cfg().API_URL || "" }];
    return list;
  }
  function getShops() {
    var all = allShops();
    if (!S.user || !S.user.shops || !S.user.shops.length) return all;
    var allowed = all.filter(function (s) { return S.user.shops.indexOf(s.id) >= 0; });
    return allowed.length ? allowed : all;
  }
  function authEnabled() { return !!(cfg().AUTH && cfg().AUTH.enabled !== false); }
  function controlUrl() {
    var id = (cfg().AUTH && cfg().AUTH.controlShopId) || "";
    var all = allShops();
    for (var i = 0; i < all.length; i++) if (all[i].id === id) return all[i].apiUrl;
    return all[0] ? all[0].apiUrl : "";
  }
  function getSession() { try { return JSON.parse(localStorage.getItem("fai_session") || "null"); } catch (e) { return null; } }
  function setSession(s) { try { localStorage.setItem("fai_session", JSON.stringify(s)); } catch (e) {} }
  function clearSession() { try { localStorage.removeItem("fai_session"); } catch (e) {} }
  function getActiveShopId() {
    var list = getShops();
    var id = null;
    try { id = localStorage.getItem("fai_active_shop"); } catch (e) {}
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return id;
    return list.length ? list[0].id : "default";
  }
  function getActiveShop() {
    var id = getActiveShopId(), list = getShops();
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return list[0] || null;
  }
  function applyActiveShop() {
    var s = getActiveShop();
    window.SHOP_CONFIG.API_URL = (s && s.apiUrl) ? s.apiUrl : "";
    return s;
  }
  function currency() { return S.settings.Currency || cfg().CURRENCY || "৳"; }
  function money(v) {
    return currency() + " " + num(v).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function money0(v) {
    return currency() + " " + num(v).toLocaleString("en-IN", { maximumFractionDigits: 0 });
  }
  function toDate(v) { if (!v) return null; if (v instanceof Date) return v; var d = new Date(v); return isNaN(d.getTime()) ? null : d; }
  function dayKey(v) { var d = toDate(v); return d ? d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate()) : ""; }
  function todayKey() { return dayKey(new Date()); }
  function fmtDate(v) { var d = toDate(v); return d ? pad2(d.getDate()) + "/" + pad2(d.getMonth() + 1) + "/" + d.getFullYear() : "-"; }
  function fmtDateTime(v) { var d = toDate(v); return d ? fmtDate(d) + " " + pad2(d.getHours()) + ":" + pad2(d.getMinutes()) : "-"; }
  function lowStockDefault() { return num(S.settings.LowStockDefault) || num(cfg().LOW_STOCK_DEFAULT) || 5; }
  function findItem(id) { for (var i = 0; i < S.items.length; i++) if (String(S.items[i].ID) === String(id)) return S.items[i]; return null; }
  function findCustomer(id) { for (var i = 0; i < S.customers.length; i++) if (String(S.customers[i].ID) === String(id)) return S.customers[i]; return null; }

  function normPhone(v) {
    var s = String(v === undefined || v === null ? "" : v).trim();
    if (!s) return "";
    var digits = s.replace(/[^\d]/g, "");
    if (digits.length === 10 && digits.charAt(0) !== "0") digits = "0" + digits;
    return digits || s;
  }
  function fmtPhone(v) {
    var s = String(v === undefined || v === null ? "" : v).trim();
    if (/^\d{10}$/.test(s) && s.charAt(0) !== "0") return "0" + s;
    return s;
  }
  function findCustomerByPhone(phone) {
    var p = normPhone(phone);
    if (!p) return null;
    for (var i = 0; i < S.customers.length; i++) if (normPhone(S.customers[i].Phone) === p) return S.customers[i];
    return null;
  }

  /* ---------------- API wrapper ---------------- */
  function api(action, payload) {
    return Api.call(action, payload || {}).then(function (res) {
      if (!res) throw new Error("সার্ভার থেকে কোনো উত্তর আসেনি।");
      if (res.ok === false) throw new Error(res.error || "Unknown error");
      return res;
    });
  }

  /* ---------------- Toast ---------------- */
  function toast(msg, type) {
    var root = $("#toastRoot");
    var el = document.createElement("div");
    el.className = "toast " + (type || "info");
    el.textContent = msg;
    root.appendChild(el);
    setTimeout(function () {
      el.style.opacity = "0";
      el.style.transition = "opacity .3s";
      setTimeout(function () { el.remove(); }, 300);
    }, 3200);
  }

  /* ---------------- Modal ---------------- */
  var modalOnClose = null;
  function openModal(title, body, opts) {
    opts = opts || {};
    $("#modalTitle").textContent = title;
    $("#modalBody").innerHTML = body;
    $("#modalFoot").innerHTML = opts.footer || '<button class="btn" data-close>Close</button>';
    $("#modalBox").className = "modal" + (opts.wide ? " wide" : "");
    $("#modalMask").hidden = false;
    modalOnClose = opts.onClose || null;
    if (opts.onOpen) opts.onOpen($("#modalBody"));
  }
  function closeModal() {
    $("#modalMask").hidden = true;
    $("#modalBody").innerHTML = "";
    $("#modalFoot").innerHTML = "";
    if (modalOnClose) { try { modalOnClose(); } catch (e) {} modalOnClose = null; }
  }
  function confirmDialog(msg, onYes) {
    openModal("নিশ্চিত করুন / Confirm", "<p>" + esc(msg) + "</p>", {
      footer: '<button class="btn" data-close>বাতিল / Cancel</button><button class="btn red" id="cfmYes">হ্যাঁ / Yes</button>',
      onOpen: function () {
        $("#cfmYes").onclick = function () { closeModal(); onYes(); };
      }
    });
  }

  /* ---------------- Connection ---------------- */
  function setConnected(ok) {
    $("#connDot").className = "dot " + (ok ? "ok" : "bad");
    $("#connText").textContent = ok ? "Connected / সংযুক্ত" : "Not connected";
  }

  /* ---------------- Load ---------------- */
  function applyData(res) {
    S.settings = res.settings || {};
    S.items = res.items || [];
    S.customers = res.customers || [];
    S.sales = res.sales || [];
    S.payments = res.payments || [];
  }
  function cacheKey() { var s = getActiveShop(); return "fai_cache_" + (s ? s.id : "default"); }

  function loadAll(silent) {
    if (!Api.configured()) {
      $("#configWarning").hidden = false;
      setConnected(false);
      renderConfigError();
      return Promise.resolve();
    }
    // instant paint from cache (makes it feel fast)
    if (!S.loaded) {
      try {
        var cached = JSON.parse(localStorage.getItem(cacheKey()) || "null");
        if (cached && cached.ok !== false) {
          applyData(cached);
          S.loaded = true;
          setConnected(true);
          applyBranding();
          render();
        }
      } catch (e) {}
    }
    return Api.call("bootstrap", {}).then(function (res) {
      if (!res || res.ok === false) throw new Error(res && res.error ? res.error : "Bad response");
      applyData(res);
      S.loaded = true;
      setConnected(true);
      applyBranding();
      try {
        var json = JSON.stringify(res);
        if (json.length < 1500000) localStorage.setItem(cacheKey(), json);
      } catch (e) {}
      render();
    }).catch(function (e) {
      setConnected(false);
      if (!S.loaded) renderError(e.message);
      if (!silent) toast(e.message, "err");
    });
  }

  function applyBranding() {
    var name = S.settings.ShopName || cfg().SHOP_NAME || "Fai Shop";
    $("#brandName").textContent = name;
    document.title = name + " — Dashboard";
  }

  /* ---------------- Router ---------------- */
  function setPage(p) {
    S.page = p;
    if (location.hash !== "#" + p) location.hash = "#" + p;
    $$(".nav a").forEach(function (a) { a.classList.toggle("active", a.getAttribute("data-nav") === p); });
    closeSidebar();
    render();
  }

  function render() {
    if (!S.loaded) return;
    var titles = {
      dashboard: "Dashboard / ড্যাশবোর্ড",
      newsale: "New Sale / নতুন বিক্রয় ও বিল",
      items: "Items / পণ্যের তালিকা",
      sales: "Sales / বিক্রয় তালিকা",
      customers: "Customers / ক্রেতা",
      payments: "Payments / পেমেন্ট ও বাকি",
      reports: "Reports / রিপোর্ট",
      settings: "Settings / সেটিংস",
      users: "Users / ইউজার ম্যানেজমেন্ট"
    };
    $("#pageTitle").textContent = titles[S.page] || "Dashboard";
    var view = $("#view");
    destroyCharts();
    switch (S.page) {
      case "dashboard": renderDashboard(view); break;
      case "newsale": renderNewSale(view); break;
      case "items": renderItems(view); break;
      case "sales": renderSales(view); break;
      case "customers": renderCustomers(view); break;
      case "payments": renderPayments(view); break;
      case "reports": renderReports(view); break;
      case "settings": renderSettings(view); break;
      case "users": renderUsers(view); break;
      default: renderDashboard(view);
    }
  }

  function renderError(msg) {
    $("#view").innerHTML =
      '<div class="panel"><div class="panel-body"><h2>সংযোগ সমস্যা / Connection problem</h2>' +
      '<p style="color:var(--muted)">' + esc(msg || "") + "</p>" +
      '<p style="color:var(--muted)">Google Apps Script URL, deployment access (Anyone), ও ইন্টারনেট সংযোগ চেক করুন।</p>' +
      '<button class="btn primary" id="retryBtn">আবার চেষ্টা / Retry</button></div></div>';
    $("#retryBtn").onclick = function () { S.loaded = false; loadAll(); };
  }

  function renderConfigError() {
    $("#view").innerHTML =
      '<div class="panel"><div class="panel-body">' +
      "<h2>⚙ Setup দরকার / Setup required</h2>" +
      "<p>এই dashboard এখনো Google Sheet-এর সাথে যুক্ত হয়নি।</p>" +
      "<ol style='line-height:1.9;color:var(--muted)'>" +
      "<li>একটি Google Sheet খুলুন → <b>Extensions ▸ Apps Script</b></li>" +
      "<li><code>apps-script/Code.gs</code> এর পুরো কোড পেস্ট করুন, <b>Save</b> করুন।</li>" +
      "<li><b>Run ▸ setup</b> একবার চালান (সব sheet তৈরি হবে)।</li>" +
      "<li><b>Deploy ▸ New deployment ▸ Web app</b> — Execute as: <b>Me</b>, Who has access: <b>Anyone</b>।</li>" +
      "<li>প্রাপ্ত <code>/exec</code> URL কপি করে <code>assets/js/config.js</code> এর <code>API_URL</code> এ বসান।</li>" +
      "<li>পেজ reload করুন।</li>" +
      "</ol>" +
      '<button class="btn primary" id="retryBtn2">সম্পন্ন, এখন reload করুন</button>' +
      "</div></div>";
    $("#retryBtn2").onclick = function () { location.reload(); };
  }

  /* ---------------- Charts ---------------- */
  function destroyCharts() {
    Object.keys(S.charts).forEach(function (k) {
      try { S.charts[k].destroy(); } catch (e) {}
    });
    S.charts = {};
  }
  function makeChart(id, config) {
    var el = document.getElementById(id);
    if (!el || !window.Chart) return;
    if (S.charts[id]) { try { S.charts[id].destroy(); } catch (e) {} }
    S.charts[id] = new window.Chart(el.getContext("2d"), config);
  }

  /* ============================================================
   *  DASHBOARD
   * ============================================================ */
  function renderDashboard(view) {
    var tk = todayKey();
    var todaySales = S.sales.filter(function (s) { return dayKey(s.DateTime) === tk; });
    var todayTotal = todaySales.reduce(function (a, s) { return a + num(s.Total); }, 0);
    var todayCash = todaySales.filter(function (s) { return s.PaymentType === "Cash"; }).reduce(function (a, s) { return a + num(s.Total); }, 0);
    var todayCredit = todaySales.filter(function (s) { return s.PaymentType === "Credit"; }).reduce(function (a, s) { return a + num(s.Total); }, 0);
    var totalDue = S.customers.reduce(function (a, c) { return a + num(c.Due); }, 0);
    var lowItems = S.items.filter(function (i) { var th = num(i.LowStock) || lowStockDefault(); return num(i.Stock) <= th; });

    var recent = S.sales.slice(0, 8);
    var recentRows = recent.length ? recent.map(function (s) {
      return "<tr>" +
        "<td>" + esc(s.InvoiceNo) + "</td>" +
        "<td>" + esc(s.CustomerName || "-") + "</td>" +
        "<td>" + fmtDateTime(s.DateTime) + "</td>" +
        '<td class="num">' + money(s.Total) + "</td>" +
        "<td>" + payBadge(s.PaymentType) + "</td>" +
        "</tr>";
    }).join("") : '<tr><td colspan="5" class="empty">এখনো কোনো বিক্রয় হয়নি / No sales yet</td></tr>';

    var lowRows = lowItems.length ? lowItems.map(function (i) {
      var st = num(i.Stock);
      return "<tr><td>" + esc(i.Name) + "</td><td>" + esc(i.Category || "-") + '</td><td class="num">' + st +
        "</td><td>" + stockBadge(i) + "</td></tr>";
    }).join("") : '<tr><td colspan="4" class="empty">সব পণ্যের স্টক ঠিক আছে / All stock OK</td></tr>';

    view.innerHTML =
      '<div class="grid cards" style="margin-bottom:18px">' +
      statCard("আজকের বিক্রয় / Today's Sales", money(todayTotal), todaySales.length + " bills", "blue") +
      statCard("নগদ / Cash", money(todayCash), "today", "green") +
      statCard("বাকি বিক্রয় / Credit", money(todayCredit), "today", "amber") +
      statCard("মোট বাকি / Total Due", money(totalDue), S.customers.length + " customers", "red") +
      statCard("পণ্য / Items", String(S.items.length), lowItems.length + " low stock", lowItems.length ? "amber" : "green") +
      "</div>" +
      '<div class="two-col">' +
      '<div class="panel"><div class="panel-head"><h2>বিক্রয় ট্রেন্ড / Sales trend (last 7 days)</h2></div><div class="panel-body"><canvas id="chartTrend" height="150"></canvas></div></div>' +
      '<div class="panel"><div class="panel-head"><h2>পেমেন্ট ধরন / Payment type</h2></div><div class="panel-body"><canvas id="chartPay" height="150"></canvas></div></div>' +
      "</div>" +
      '<div class="panel"><div class="panel-head"><h2>সাম্প্রতিক বিক্রয় / Recent Sales</h2><button class="btn sm" data-nav="sales">সব দেখুন →</button></div>' +
      '<div class="table-wrap"><table><thead><tr><th>Invoice</th><th>Customer</th><th>Date</th><th class="num">Total</th><th>Type</th></tr></thead><tbody>' + recentRows + "</tbody></table></div></div>" +
      '<div class="panel"><div class="panel-head"><h2>কম স্টক / Low Stock</h2><button class="btn sm" data-nav="items">Items →</button></div>' +
      '<div class="table-wrap"><table><thead><tr><th>Item</th><th>Category</th><th class="num">Stock</th><th>Status</th></tr></thead><tbody>' + lowRows + "</tbody></table></div></div>";

    // charts
    var days = [];
    var totals = [];
    for (var d = 6; d >= 0; d--) {
      var dt = new Date();
      dt.setDate(dt.getDate() - d);
      var k = dayKey(dt);
      days.push(pad2(dt.getDate()) + "/" + pad2(dt.getMonth() + 1));
      totals.push(S.sales.filter(function (s) { return dayKey(s.DateTime) === k; }).reduce(function (a, s) { return a + num(s.Total); }, 0));
    }
    makeChart("chartTrend", {
      type: "bar",
      data: { labels: days, datasets: [{ label: "Sales", data: totals, backgroundColor: "#2563eb", borderRadius: 6 }] },
      options: { plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } }, maintainAspectRatio: false }
    });

    var allCash = S.sales.filter(function (s) { return s.PaymentType === "Cash"; }).reduce(function (a, s) { return a + num(s.Total); }, 0);
    var allCredit = S.sales.filter(function (s) { return s.PaymentType === "Credit"; }).reduce(function (a, s) { return a + num(s.Total); }, 0);
    makeChart("chartPay", {
      type: "doughnut",
      data: { labels: ["Cash / নগদ", "Credit / বাকি"], datasets: [{ data: [allCash, allCredit], backgroundColor: ["#16a34a", "#d97706"] }] },
      options: { plugins: { legend: { position: "bottom" } }, maintainAspectRatio: false }
    });
  }

  function statCard(label, value, sub, accent) {
    return '<div class="card stat accent-' + (accent || "blue") + '"><div class="label">' + esc(label) +
      '</div><div class="value">' + esc(value) + '</div><div class="sub">' + esc(sub) + "</div></div>";
  }
  function payBadge(t) {
    return t === "Credit" ? '<span class="badge credit">Credit</span>' : '<span class="badge cash">Cash</span>';
  }
  function stockBadge(i) {
    var st = num(i.Stock), th = num(i.LowStock) || lowStockDefault();
    if (st <= 0) return '<span class="badge out">Out / শেষ</span>';
    if (st <= th) return '<span class="badge low">Low</span>';
    return '<span class="badge ok">OK</span>';
  }

  /* ============================================================
   *  NEW SALE
   * ============================================================ */
  function renderNewSale(view) {
    view.innerHTML =
      '<div class="pos">' +
      '<div class="panel"><div class="panel-head"><h2>পণ্য নির্বাচন / Select items</h2></div><div class="panel-body">' +
      '<div class="search" style="margin-bottom:12px"><input id="saleSearch" placeholder="নাম / কোড দিয়ে খুঁজুন..." autocomplete="off"></div>' +
      '<div class="item-grid" id="itemGrid"></div>' +
      "</div></div>" +
      "<div>" +
      '<div class="panel"><div class="panel-head"><h2>বিল / Cart</h2><button class="btn sm ghost" id="clearCart">পরিষ্কার</button></div><div class="panel-body" id="cartBox"></div></div>' +
      '<div class="panel"><div class="panel-head"><h2>চেকআউট / Checkout</h2></div><div class="panel-body">' +
      '<div class="form-grid"><div class="field"><label>ফোন নম্বর / Phone *</label><input id="salePhone" inputmode="numeric" autocomplete="off" placeholder="01XXXXXXXXX"></div>' +
      '<div class="field"><label>নাম / Name (ঐচ্ছিক)</label><input id="saleName" autocomplete="off" placeholder="ক্রেতার নাম"></div></div>' +
      '<div id="phoneHint" class="cust-hint"></div>' +
      '<div class="field"><label>পেমেন্ট / Payment</label><div class="pay-toggle"><button id="payCash" class="active">নগদ Cash</button><button id="payCredit" class="credit">বাকি Credit</button></div></div>' +
      '<div class="form-grid"><div class="field"><label>ডিসকাউন্ট / Discount</label><input type="number" id="saleDiscount" min="0" step="0.01" value="0"></div>' +
      '<div class="field" id="paidWrap" style="display:none"><label>পরিশোধ / Paid</label><input type="number" id="salePaid" min="0" step="0.01" value="0"></div></div>' +
      '<div class="field full"><label>নোট / Note</label><input id="saleNote" placeholder="ঐচ্ছিক / optional"></div>' +
      '<div id="totalsBox"></div>' +
      '<div class="toolbar" style="margin-top:14px">' +
      '<button class="btn primary" id="saveSale" style="flex:1">সংরক্ষণ / Save</button>' +
      '<button class="btn green" id="savePrint" style="flex:1">Save + Print</button>' +
      "</div></div></div></div></div>";

    // customer info (phone mandatory, name optional, auto-fill from phone)
    $("#salePhone").addEventListener("input", onSalePhoneInput);
    $("#salePhone").addEventListener("change", onSalePhoneInput);

    renderItemGrid("");
    $("#saleSearch").addEventListener("input", function () { renderItemGrid(this.value); });
    $("#clearCart").onclick = function () { S.cart = []; renderCart(); };

    $("#payCash").onclick = function () { S.payType = "Cash"; updatePayUI(); };
    $("#payCredit").onclick = function () { S.payType = "Credit"; updatePayUI(); };
    $("#saleDiscount").addEventListener("input", updateTotals);
    $("#salePaid").addEventListener("input", updateTotals);

    $("#saveSale").onclick = function () { saveSale(false); };
    $("#savePrint").onclick = function () { saveSale(true); };

    updatePayUI();
    renderCart();
  }

  function onSalePhoneInput() {
    var phoneEl = $("#salePhone"), hint = $("#phoneHint"), nameEl = $("#saleName");
    if (!phoneEl) return;
    var phone = normPhone(phoneEl.value);
    if (!phone) {
      if (hint) { hint.textContent = ""; hint.className = "cust-hint"; }
      return;
    }
    var c = findCustomerByPhone(phone);
    if (c) {
      if (nameEl && c.Name) nameEl.value = c.Name;
      if (hint) {
        hint.textContent = "পুরনো ক্রেতা / Existing: " + (c.Name || "(নাম নেই)") + (num(c.Due) > 0 ? " • বাকি " + money(c.Due) : "");
        hint.className = "cust-hint";
      }
    } else {
      if (hint) { hint.textContent = "নতুন ক্রেতা — সংরক্ষণে স্বয়ংক্রিয়ভাবে যুক্ত হবে"; hint.className = "cust-hint new"; }
    }
  }

  function renderItemGrid(query) {
    var q = (query || "").trim().toLowerCase();
    var list = S.items.filter(function (i) {
      if (!q) return true;
      return (String(i.Name) + " " + String(i.Code) + " " + String(i.Category)).toLowerCase().indexOf(q) >= 0;
    });
    var html = list.length ? list.map(function (i) {
      var st = num(i.Stock);
      return '<div class="item-card' + (st <= 0 ? " out" : "") + '" data-add="' + esc(i.ID) + '">' +
        '<div class="nm">' + esc(i.Name) + "</div>" +
        '<div class="meta"><span>' + esc(i.Code || i.Category || "") + '</span><span>Stock: ' + st + "</span></div>" +
        '<div class="meta"><span class="price">' + money(i.SalePrice) + "</span><span>" + esc(i.Unit || "") + "</span></div>" +
        "</div>";
    }).join("") : '<div class="empty">কোনো পণ্য পাওয়া যায়নি / No items found</div>';
    var grid = $("#itemGrid");
    if (!grid) return;
    grid.innerHTML = html;
    $$("[data-add]", grid).forEach(function (card) {
      card.onclick = function () { addToCart(card.getAttribute("data-add")); };
    });
  }

  function addToCart(id) {
    var item = findItem(id);
    if (!item) return;
    for (var i = 0; i < S.cart.length; i++) {
      if (String(S.cart[i].itemId) === String(id)) { S.cart[i].qty += 1; renderCart(); return; }
    }
    S.cart.push({ itemId: item.ID, itemName: item.Name, qty: 1, unitPrice: num(item.SalePrice), unit: item.Unit || "" });
    renderCart();
  }

  function renderCart() {
    var box = $("#cartBox");
    if (!box) return;
    if (!S.cart.length) {
      box.innerHTML = '<div class="empty">বাম দিক থেকে পণ্য নির্বাচন করুন<br><small>Select items from the left</small></div>';
      updateTotals();
      return;
    }
    var rows = S.cart.map(function (l, idx) {
      return "<tr>" +
        "<td>" + esc(l.itemName) + "</td>" +
        '<td><input class="qty-inline" type="number" min="1" step="1" value="' + num(l.qty) + '" data-qty="' + idx + '"></td>' +
        '<td class="num">' + money(l.unitPrice) + "</td>" +
        '<td class="num">' + money(num(l.qty) * num(l.unitPrice)) + "</td>" +
        '<td><button class="icon-btn" data-del="' + idx + '" title="Remove">✕</button></td>' +
        "</tr>";
    }).join("");
    box.innerHTML = '<div class="table-wrap" style="max-height:none"><table><thead><tr><th>Item</th><th>Qty</th><th>Rate</th><th class="num">Total</th><th></th></tr></thead><tbody>' + rows + "</tbody></table></div>";

    $$("[data-qty]", box).forEach(function (inp) {
      inp.onchange = function () { var i = num(this.getAttribute("data-qty")); S.cart[i].qty = Math.max(num(this.value), 1); renderCart(); };
    });
    $$("[data-del]", box).forEach(function (btn) {
      btn.onclick = function () { S.cart.splice(num(this.getAttribute("data-del")), 1); renderCart(); };
    });
    updateTotals();
  }

  function cartSubtotal() { return S.cart.reduce(function (a, l) { return a + num(l.qty) * num(l.unitPrice); }, 0); }

  function updateTotals() {
    var box = $("#totalsBox");
    if (!box) return;
    var sub = cartSubtotal();
    var disc = num($("#saleDiscount") ? $("#saleDiscount").value : 0);
    var total = Math.max(sub - disc, 0);
    var paid = S.payType === "Cash" ? total : num($("#salePaid") ? $("#salePaid").value : 0);
    if (paid > total) paid = total;
    var due = total - paid;
    box.innerHTML =
      '<div class="cart-total"><span>Subtotal / উপমোট</span><b>' + money(sub) + "</b></div>" +
      '<div class="cart-total"><span>Discount / ডিসকাউন্ট</span><b>− ' + money(disc) + "</b></div>" +
      '<div class="cart-total grand"><span>Total / সর্বমোট</span><b>' + money(total) + "</b></div>" +
      (S.payType === "Credit" ? '<div class="cart-total"><span>Due / বাকি থাকবে</span><b style="color:var(--red)">' + money(due) + "</b></div>" : "");
  }

  function updatePayUI() {
    var cash = $("#payCash"), credit = $("#payCredit");
    if (!cash) return;
    cash.classList.toggle("active", S.payType === "Cash");
    credit.classList.toggle("active", S.payType === "Credit");
    var wrap = $("#paidWrap");
    if (wrap) wrap.style.display = S.payType === "Credit" ? "" : "none";
    if (S.payType === "Credit" && $("#salePaid")) {
      var sub = cartSubtotal();
      var disc = num($("#saleDiscount").value);
      $("#salePaid").value = Math.max(sub - disc, 0);
    }
    updateTotals();
  }

  function saveSale(doPrint) {
    if (!S.cart.length) { toast("বিল খালি — পণ্য যোগ করুন।", "err"); return; }
    var phone = normPhone($("#salePhone").value);
    if (!phone) { toast("ফোন নম্বর দিতে হবে / Phone number is required", "err"); $("#salePhone").focus(); return; }
    var name = $("#saleName").value.trim();

    var payloadItems = S.cart.map(function (l) { return { itemId: l.itemId, itemName: l.itemName, qty: num(l.qty), unitPrice: num(l.unitPrice) }; });
    var discount = num($("#saleDiscount").value);
    var payType = S.payType;
    var paidAmount = S.payType === "Credit" ? num($("#salePaid").value) : 0;
    var notes = $("#saleNote").value;

    var btns = $$("#saveSale, #savePrint");
    btns.forEach(function (b) { b.disabled = true; });

    var existing = findCustomerByPhone(phone);
    var prep;
    if (existing) {
      if (name && name !== existing.Name) {
        prep = api("saveCustomer", { ID: existing.ID, Name: name, Phone: phone, Address: existing.Address || "", Notes: existing.Notes || "" })
          .then(function () { return existing.ID; });
      } else {
        prep = Promise.resolve(existing.ID);
      }
    } else {
      prep = api("saveCustomer", { Name: name, Phone: phone }).then(function (res) { return res.id; });
    }

    prep.then(function (customerId) {
      return api("createSale", {
        customerId: customerId,
        customerName: name || (existing ? existing.Name : "") || phone,
        items: payloadItems,
        discount: discount,
        paymentType: payType,
        paidAmount: paidAmount,
        notes: notes
      });
    }).then(function (res) {
      toast("বিক্রয় সংরক্ষিত — Invoice " + res.invoiceNo, "ok");
      S.cart = [];
      S.payType = "Cash";
      return loadAll(true).then(function () {
        setPage("newsale");
        if (doPrint) {
          var sale = S.sales.filter(function (s) { return String(s.ID) === String(res.saleId); })[0];
          if (sale) printInvoice(sale);
        }
      });
    }).catch(function (e) {
      toast(e.message, "err");
    }).then(function () {
      btns.forEach(function (b) { b.disabled = false; });
    });
  }

  /* ============================================================
   *  ITEMS
   * ============================================================ */
  var itemFilter = { q: "", cat: "" };
  function renderItems(view) {
    var cats = {};
    S.items.forEach(function (i) { if (i.Category) cats[i.Category] = 1; });
    view.innerHTML =
      '<div class="panel"><div class="panel-head">' +
      '<div class="search grow"><input id="itemSearch" placeholder="খুঁজুন / Search name, code" value="' + esc(itemFilter.q) + '" autocomplete="off"></div>' +
      '<select id="itemCat" style="max-width:200px"><option value="">সব ক্যাটাগরি / All</option>' +
      Object.keys(cats).map(function (c) { return '<option' + (itemFilter.cat === c ? " selected" : "") + ">" + esc(c) + "</option>"; }).join("") +
      "</select>" +
      '<button class="btn primary" id="addItemBtn">＋ নতুন পণ্য / Add Item</button></div>' +
      '<div class="table-wrap"><table><thead><tr><th>Name</th><th>Code</th><th>Category</th><th class="num">Purchase</th><th class="num">Sale</th><th class="num">Stock</th><th>Status</th><th></th></tr></thead><tbody id="itemsBody"></tbody></table></div></div>';

    $("#itemSearch").addEventListener("input", function () { itemFilter.q = this.value; drawItemRows(); });
    $("#itemCat").addEventListener("change", function () { itemFilter.cat = this.value; drawItemRows(); });
    $("#addItemBtn").onclick = function () { itemForm(null); };
    drawItemRows();
  }

  function filteredItems() {
    var q = itemFilter.q.trim().toLowerCase();
    return S.items.filter(function (i) {
      if (itemFilter.cat && i.Category !== itemFilter.cat) return false;
      if (!q) return true;
      return (String(i.Name) + " " + String(i.Code) + " " + String(i.Category)).toLowerCase().indexOf(q) >= 0;
    });
  }

  function drawItemRows() {
    var tbody = $("#itemsBody");
    if (!tbody) return;
    var list = filteredItems();
    if (!list.length) { tbody.innerHTML = '<tr><td colspan="8" class="empty">কোনো পণ্য নেই / No items</td></tr>'; return; }
    tbody.innerHTML = list.map(function (i) {
      return "<tr>" +
        "<td><b>" + esc(i.Name) + "</b></td>" +
        "<td>" + esc(i.Code || "-") + "</td>" +
        "<td>" + esc(i.Category || "-") + "</td>" +
        '<td class="num">' + money(i.PurchasePrice) + "</td>" +
        '<td class="num">' + money(i.SalePrice) + "</td>" +
        '<td class="num">' + num(i.Stock) + " " + esc(i.Unit || "") + "</td>" +
        "<td>" + stockBadge(i) + "</td>" +
        '<td style="white-space:nowrap"><button class="btn sm" data-edit="' + esc(i.ID) + '" title="Edit">Edit</button> ' +
        '<button class="btn sm red" data-del="' + esc(i.ID) + '" title="Delete">Del</button></td>' +
        "</tr>";
    }).join("");
    $$("[data-edit]", tbody).forEach(function (b) { b.onclick = function () { itemForm(findItem(this.getAttribute("data-edit"))); }; });
    $$("[data-del]", tbody).forEach(function (b) {
      b.onclick = function () {
        var it = findItem(this.getAttribute("data-del"));
        confirmDialog("পণ্য মুছে ফেলবেন? / Delete item \"" + it.Name + "\"?", function () {
          api("deleteItem", { id: it.ID }).then(function () { toast("মুছে ফেলা হয়েছে", "ok"); return loadAll(true); }).then(render).catch(function (e) { toast(e.message, "err"); });
        });
      };
    });
  }

  function itemForm(item) {
    var i = item || {};
    var body = '<div class="form-grid">' +
      '<div class="field full"><label>নাম / Name *</label><input id="fName" value="' + esc(i.Name || "") + '"></div>' +
      '<div class="field"><label>কোড / Code</label><input id="fCode" value="' + esc(i.Code || "") + '"></div>' +
      '<div class="field"><label>ক্যাটাগরি / Category</label><input id="fCat" value="' + esc(i.Category || "") + '"></div>' +
      '<div class="field"><label>একক / Unit</label><input id="fUnit" value="' + esc(i.Unit || "pcs") + '"></div>' +
      '<div class="field"><label>কম স্টক সীমা / Low stock</label><input type="number" id="fLow" value="' + (i.LowStock !== undefined && i.LowStock !== "" ? num(i.LowStock) : lowStockDefault()) + '"></div>' +
      '<div class="field"><label>ক্রয়মূল্য / Purchase price</label><input type="number" step="0.01" id="fPur" value="' + num(i.PurchasePrice) + '"></div>' +
      '<div class="field"><label>বিক্রয়মূল্য / Sale price</label><input type="number" step="0.01" id="fSale" value="' + num(i.SalePrice) + '"></div>' +
      '<div class="field"><label>স্টক / Stock qty</label><input type="number" step="1" id="fStock" value="' + num(i.Stock) + '"></div>' +
      '<div class="field full"><label>নোট / Notes</label><input id="fNotes" value="' + esc(i.Notes || "") + '"></div>' +
      "</div>";
    openModal(item ? "পণ্য সম্পাদনা / Edit Item" : "নতুন পণ্য / Add Item", body, {
      footer: '<button class="btn" data-close>বাতিল</button><button class="btn primary" id="saveItemBtn">সংরক্ষণ / Save</button>',
      onOpen: function () {
        $("#saveItemBtn").onclick = function () {
          var name = $("#fName").value.trim();
          if (!name) { toast("নাম দিতে হবে", "err"); return; }
          var payload = {
            ID: i.ID || "",
            Name: name,
            Code: $("#fCode").value.trim(),
            Category: $("#fCat").value.trim(),
            Unit: $("#fUnit").value.trim() || "pcs",
            LowStock: num($("#fLow").value),
            PurchasePrice: num($("#fPur").value),
            SalePrice: num($("#fSale").value),
            Stock: num($("#fStock").value),
            Notes: $("#fNotes").value.trim()
          };
          api("saveItem", payload).then(function () {
            closeModal(); toast("সংরক্ষিত হয়েছে", "ok"); return loadAll(true);
          }).then(render).catch(function (e) { toast(e.message, "err"); });
        };
      }
    });
  }

  /* ============================================================
   *  SALES
   * ============================================================ */
  var saleFilter = { from: "", to: "", type: "", q: "" };
  function renderSales(view) {
    view.innerHTML =
      '<div class="panel"><div class="panel-head">' +
      '<input type="date" id="saleFrom" value="' + esc(saleFilter.from) + '" style="max-width:160px">' +
      '<input type="date" id="saleTo" value="' + esc(saleFilter.to) + '" style="max-width:160px">' +
      '<select id="saleType" style="max-width:150px"><option value="">সব ধরন / All</option><option value="Cash"' + (saleFilter.type === "Cash" ? " selected" : "") + ">Cash</option><option value=\"Credit\"" + (saleFilter.type === "Credit" ? " selected" : "") + ">Credit</option></select>" +
      '<div class="search grow"><input id="saleQ" placeholder="Invoice / ক্রেতা খুঁজুন" value="' + esc(saleFilter.q) + '"></div>' +
      '<button class="btn" id="expSales">Export CSV</button></div>' +
      '<div class="table-wrap"><table><thead><tr><th>Invoice</th><th>Date</th><th>Customer</th><th class="num">Items</th><th class="num">Total</th><th>Type</th><th class="num">Due</th><th></th></tr></thead><tbody id="salesBody"></tbody></table></div></div>';

    $("#saleFrom").onchange = function () { saleFilter.from = this.value; drawSalesRows(); };
    $("#saleTo").onchange = function () { saleFilter.to = this.value; drawSalesRows(); };
    $("#saleType").onchange = function () { saleFilter.type = this.value; drawSalesRows(); };
    $("#saleQ").oninput = function () { saleFilter.q = this.value; drawSalesRows(); };
    $("#expSales").onclick = exportSalesCSV;
    drawSalesRows();
  }

  function filteredSales() {
    var q = saleFilter.q.trim().toLowerCase();
    return S.sales.filter(function (s) {
      var k = dayKey(s.DateTime);
      if (saleFilter.from && k < saleFilter.from) return false;
      if (saleFilter.to && k > saleFilter.to) return false;
      if (saleFilter.type && s.PaymentType !== saleFilter.type) return false;
      if (q && (String(s.InvoiceNo) + " " + String(s.CustomerName)).toLowerCase().indexOf(q) < 0) return false;
      return true;
    });
  }

  function drawSalesRows() {
    var tbody = $("#salesBody");
    if (!tbody) return;
    var list = filteredSales();
    if (!list.length) { tbody.innerHTML = '<tr><td colspan="8" class="empty">কোনো বিক্রয় নেই / No sales</td></tr>'; return; }
    tbody.innerHTML = list.map(function (s) {
      return "<tr>" +
        "<td><b>" + esc(s.InvoiceNo) + "</b></td>" +
        "<td>" + fmtDateTime(s.DateTime) + "</td>" +
        "<td>" + esc(s.CustomerName || "-") + "</td>" +
        '<td class="num">' + (s.items ? s.items.length : 0) + "</td>" +
        '<td class="num"><b>' + money(s.Total) + "</b></td>" +
        "<td>" + payBadge(s.PaymentType) + "</td>" +
        '<td class="num">' + (num(s.DueAmount) > 0 ? '<span class="badge due">' + money(s.DueAmount) + "</span>" : "—") + "</td>" +
        '<td style="white-space:nowrap"><button class="btn sm" data-view="' + esc(s.ID) + '" title="View">View</button> ' +
        '<button class="btn sm" data-print="' + esc(s.ID) + '" title="Print">Print</button> ' +
        '<button class="btn sm red" data-delsale="' + esc(s.ID) + '" title="Delete">Del</button></td>' +
        "</tr>";
    }).join("");
    $$("[data-view]", tbody).forEach(function (b) { b.onclick = function () { viewSale(this.getAttribute("data-view")); }; });
    $$("[data-print]", tbody).forEach(function (b) { b.onclick = function () { var s = saleById(this.getAttribute("data-print")); if (s) printInvoice(s); }; });
    $$("[data-delsale]", tbody).forEach(function (b) {
      b.onclick = function () {
        var s = saleById(this.getAttribute("data-delsale"));
        confirmDialog("বিক্রয়টি মুছে ফেলবেন? স্টক ফেরত যাবে। / Delete sale " + s.InvoiceNo + "?", function () {
          api("deleteSale", { id: s.ID }).then(function () { toast("মুছে ফেলা হয়েছে", "ok"); return loadAll(true); }).then(render).catch(function (e) { toast(e.message, "err"); });
        });
      };
    });
  }

  function saleById(id) { return S.sales.filter(function (s) { return String(s.ID) === String(id); })[0]; }

  function viewSale(id) {
    var s = saleById(id);
    if (!s) return;
    var cust = s.CustomerID ? findCustomer(s.CustomerID) : null;
    var rows = (s.items || []).map(function (it) {
      return "<tr><td>" + esc(it.ItemName) + '</td><td class="num">' + num(it.Qty) + '</td><td class="num">' + money(it.UnitPrice) + '</td><td class="num">' + money(it.LineTotal) + "</td></tr>";
    }).join("");
    var body =
      '<div class="form-grid"><div><b>Invoice:</b> ' + esc(s.InvoiceNo) + "</div><div><b>Date:</b> " + fmtDateTime(s.DateTime) + "</div>" +
      "<div><b>Customer:</b> " + esc(s.CustomerName || "-") + "</div><div><b>Phone:</b> " + esc(cust && cust.Phone ? fmtPhone(cust.Phone) : "-") + "</div>" +
      "<div><b>Payment:</b> " + payBadge(s.PaymentType) + "</div></div>" +
      '<div class="table-wrap" style="margin-top:12px"><table><thead><tr><th>Item</th><th class="num">Qty</th><th class="num">Rate</th><th class="num">Total</th></tr></thead><tbody>' + rows + "</tbody></table></div>" +
      '<div class="cart-total" style="margin-top:12px"><span>Subtotal</span><b>' + money(s.SubTotal) + "</b></div>" +
      '<div class="cart-total"><span>Discount</span><b>− ' + money(s.Discount) + "</b></div>" +
      '<div class="cart-total grand"><span>Total</span><b>' + money(s.Total) + "</b></div>" +
      '<div class="cart-total"><span>Paid</span><b>' + money(s.PaidAmount) + "</b></div>" +
      '<div class="cart-total"><span>Due</span><b style="color:var(--red)">' + money(s.DueAmount) + "</b></div>" +
      (s.Notes ? '<p style="margin-top:10px;color:var(--muted)"><b>Note:</b> ' + esc(s.Notes) + "</p>" : "");
    openModal("বিক্রয় বিবরণ / Sale Details", body, {
      wide: true,
      footer: '<button class="btn" data-close>বন্ধ</button><button class="btn primary" id="printThis">Print</button>',
      onOpen: function () { $("#printThis").onclick = function () { printInvoice(s); }; }
    });
  }

  function exportSalesCSV() {
    var list = filteredSales();
    var csv = "Invoice,DateTime,Customer,Subtotal,Discount,Total,Type,Paid,Due\n";
    list.forEach(function (s) {
      csv += [s.InvoiceNo, fmtDateTime(s.DateTime), '"' + (s.CustomerName || "") + '"', num(s.SubTotal), num(s.Discount), num(s.Total), s.PaymentType, num(s.PaidAmount), num(s.DueAmount)].join(",") + "\n";
    });
    downloadFile("sales.csv", csv);
  }

  function downloadFile(name, content) {
    var blob = new Blob(["\ufeff" + content], { type: "text/csv;charset=utf-8" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  /* ============================================================
   *  CUSTOMERS
   * ============================================================ */
  function renderCustomers(view) {
    view.innerHTML =
      '<div class="panel"><div class="panel-head">' +
      '<div class="search grow"><input id="custSearch" placeholder="নাম / ফোন খুঁজুন" autocomplete="off"></div>' +
      '<button class="btn primary" id="addCustBtn">＋ নতুন ক্রেতা / Add Customer</button></div>' +
      '<div class="table-wrap"><table><thead><tr><th>Name</th><th>Phone</th><th>Address</th><th class="num">Due</th><th></th></tr></thead><tbody id="custBody"></tbody></table></div></div>';
    $("#custSearch").oninput = function () { drawCustomerRows(this.value); };
    $("#addCustBtn").onclick = function () { customerForm(null); };
    drawCustomerRows("");
  }

  function drawCustomerRows(q) {
    q = (q || "").trim().toLowerCase();
    var tbody = $("#custBody");
    if (!tbody) return;
    var list = S.customers.filter(function (c) {
      if (!q) return true;
      return (String(c.Name) + " " + String(c.Phone) + " " + normPhone(c.Phone)).toLowerCase().indexOf(q) >= 0;
    });
    if (!list.length) { tbody.innerHTML = '<tr><td colspan="5" class="empty">কোনো ক্রেতা নেই / No customers</td></tr>'; return; }
    tbody.innerHTML = list.map(function (c) {
      var due = num(c.Due);
      return "<tr>" +
        "<td><b>" + esc(c.Name || "(নাম নেই)") + "</b></td>" +
        "<td>" + esc(c.Phone ? fmtPhone(c.Phone) : "-") + "</td>" +
        "<td>" + esc(c.Address || "-") + "</td>" +
        '<td class="num">' + (due > 0 ? '<span class="badge due">' + money(due) + "</span>" : "—") + "</td>" +
        '<td style="white-space:nowrap">' +
        (due > 0 ? '<button class="btn sm green" data-pay="' + esc(c.ID) + '">৳ পেমেন্ট</button> ' : "") +
        '<button class="btn sm" data-editc="' + esc(c.ID) + '">Edit</button> ' +
        '<button class="btn sm red" data-delc="' + esc(c.ID) + '">Del</button></td>' +
        "</tr>";
    }).join("");
    $$("[data-pay]", tbody).forEach(function (b) { b.onclick = function () { collectPayment(findCustomer(this.getAttribute("data-pay"))); }; });
    $$("[data-editc]", tbody).forEach(function (b) { b.onclick = function () { customerForm(findCustomer(this.getAttribute("data-editc"))); }; });
    $$("[data-delc]", tbody).forEach(function (b) {
      b.onclick = function () {
        var c = findCustomer(this.getAttribute("data-delc"));
        confirmDialog("ক্রেতা মুছবেন? / Delete \"" + c.Name + "\"?", function () {
          api("deleteCustomer", { id: c.ID }).then(function () { toast("মুছে ফেলা হয়েছে", "ok"); return loadAll(true); }).then(render).catch(function (e) { toast(e.message, "err"); });
        });
      };
    });
  }

  function customerForm(c) {
    c = c || {};
    var body = '<div class="form-grid">' +
      '<div class="field"><label>ফোন / Phone *</label><input id="cPhone" inputmode="numeric" value="' + esc(c.Phone ? fmtPhone(c.Phone) : "") + '"></div>' +
      '<div class="field"><label>নাম / Name (ঐচ্ছিক)</label><input id="cName" value="' + esc(c.Name || "") + '"></div>' +
      '<div class="field"><label>ঠিকানা / Address</label><input id="cAddr" value="' + esc(c.Address || "") + '"></div>' +
      (c.ID ? "" : '<div class="field"><label>প্রাথমিক বাকি / Opening due</label><input type="number" step="0.01" id="cDue" value="0"></div>') +
      '<div class="field full"><label>নোট / Notes</label><input id="cNotes" value="' + esc(c.Notes || "") + '"></div></div>';
    openModal(c.ID ? "ক্রেতা সম্পাদনা / Edit Customer" : "নতুন ক্রেতা / Add Customer", body, {
      footer: '<button class="btn" data-close>বাতিল</button><button class="btn primary" id="saveCustBtn">সংরক্ষণ</button>',
      onOpen: function () {
        $("#saveCustBtn").onclick = function () {
          var phone = normPhone($("#cPhone").value);
          if (!phone) { toast("ফোন নম্বর দিতে হবে / Phone required", "err"); return; }
          var payload = { ID: c.ID || "", Name: $("#cName").value.trim(), Phone: phone, Address: $("#cAddr").value.trim(), Notes: $("#cNotes").value.trim() };
          if (!c.ID) payload.Due = num($("#cDue").value);
          api("saveCustomer", payload).then(function () { closeModal(); toast("সংরক্ষিত", "ok"); return loadAll(true); }).then(render).catch(function (e) { toast(e.message, "err"); });
        };
      }
    });
  }

  function collectPayment(c) {
    if (!c) return;
    var body = '<div class="field"><label>ক্রেতা / Customer</label><input value="' + esc(c.Name) + '" disabled></div>' +
      '<div class="field"><label>বর্তমান বাকি / Current due</label><input value="' + money(c.Due) + '" disabled></div>' +
      '<div class="form-grid"><div class="field"><label>পরিমাণ / Amount *</label><input type="number" step="0.01" id="pAmt" value="' + num(c.Due) + '"></div>' +
      '<div class="field"><label>মাধ্যম / Method</label><select id="pMethod"><option>Cash</option><option>bkash</option><option>Nagad</option><option>Bank</option><option>Other</option></select></div></div>' +
      '<div class="field"><label>নোট / Note</label><input id="pNote"></div>';
    openModal("পেমেন্ট গ্রহণ / Collect Payment", body, {
      footer: '<button class="btn" data-close>বাতিল</button><button class="btn green" id="savePayBtn">৳ জমা করুন</button>',
      onOpen: function () {
        $("#savePayBtn").onclick = function () {
          var amt = num($("#pAmt").value);
          if (amt <= 0) { toast("সঠিক পরিমাণ দিন", "err"); return; }
          api("addPayment", { CustomerID: c.ID, CustomerName: c.Name, Amount: amt, Method: $("#pMethod").value, Note: $("#pNote").value.trim() })
            .then(function () { closeModal(); toast("পেমেন্ট জমা হয়েছে", "ok"); return loadAll(true); }).then(render).catch(function (e) { toast(e.message, "err"); });
        };
      }
    });
  }

  /* ============================================================
   *  PAYMENTS
   * ============================================================ */
  function renderPayments(view) {
    var list = S.payments.slice().sort(function (a, b) { return new Date(b.DateTime) - new Date(a.DateTime); });
    var totalToday = list.filter(function (p) { return dayKey(p.DateTime) === todayKey(); }).reduce(function (a, p) { return a + num(p.Amount); }, 0);
    var rows = list.length ? list.map(function (p) {
      return "<tr><td>" + fmtDateTime(p.DateTime) + "</td><td>" + esc(p.CustomerName || "-") + '</td><td class="num"><b>' + money(p.Amount) + "</b></td><td>" + esc(p.Method || "-") + "</td><td>" + esc(p.Note || "-") + '</td><td><button class="btn sm red" data-delp="' + esc(p.ID) + '">Del</button></td></tr>';
    }).join("") : '<tr><td colspan="6" class="empty">কোনো পেমেন্ট নেই / No payments</td></tr>';

    view.innerHTML =
      '<div class="grid cards" style="margin-bottom:18px">' +
      statCard("আজকের আদায় / Collected today", money0(totalToday), "", "green") +
      statCard("মোট বাকি / Total due", money0(S.customers.reduce(function (a, c) { return a + num(c.Due); }, 0)), S.customers.filter(function (c) { return num(c.Due) > 0; }).length + " customers", "red") +
      "</div>" +
      '<div class="panel"><div class="panel-head"><h2>পেমেন্ট তালিকা / Payments</h2><button class="btn primary" id="addPayBtn">＋ পেমেন্ট / Add Payment</button></div>' +
      '<div class="table-wrap"><table><thead><tr><th>Date</th><th>Customer</th><th class="num">Amount</th><th>Method</th><th>Note</th><th></th></tr></thead><tbody>' + rows + "</tbody></table></div></div>";

    $("#addPayBtn").onclick = function () { addPaymentPrompt(); };
    $$("[data-delp]", view).forEach(function (b) {
      b.onclick = function () {
        var id = this.getAttribute("data-delp");
        confirmDialog("পেমেন্টটি মুছে ফেলবেন? বাকি বেড়ে যাবে।", function () {
          api("deletePayment", { id: id }).then(function () { toast("মুছে ফেলা হয়েছে", "ok"); return loadAll(true); }).then(render).catch(function (e) { toast(e.message, "err"); });
        });
      };
    });
  }

  function addPaymentPrompt() {
    var opts = S.customers.map(function (c) { return '<option value="' + esc(c.ID) + '">' + esc(c.Name) + " (due " + money0(c.Due) + ")</option>"; }).join("");
    var body = '<div class="field"><label>ক্রেতা / Customer *</label><select id="npCust"><option value="">— নির্বাচন করুন —</option>' + opts + "</select></div>" +
      '<div class="form-grid"><div class="field"><label>পরিমাণ / Amount *</label><input type="number" step="0.01" id="npAmt" value="0"></div>' +
      '<div class="field"><label>মাধ্যম / Method</label><select id="npMethod"><option>Cash</option><option>bkash</option><option>Nagad</option><option>Bank</option><option>Other</option></select></div></div>' +
      '<div class="field"><label>নোট / Note</label><input id="npNote"></div>';
    openModal("পেমেন্ট যোগ করুন / Add Payment", body, {
      footer: '<button class="btn" data-close>বাতিল</button><button class="btn green" id="npSave">জমা করুন</button>',
      onOpen: function () {
        $("#npCust").onchange = function () { var c = findCustomer(this.value); $("#npAmt").value = c ? num(c.Due) : 0; };
        $("#npSave").onclick = function () {
          var c = findCustomer($("#npCust").value);
          if (!c) { toast("ক্রেতা নির্বাচন করুন", "err"); return; }
          var amt = num($("#npAmt").value);
          if (amt <= 0) { toast("সঠিক পরিমাণ দিন", "err"); return; }
          api("addPayment", { CustomerID: c.ID, CustomerName: c.Name, Amount: amt, Method: $("#npMethod").value, Note: $("#npNote").value.trim() })
            .then(function () { closeModal(); toast("জমা হয়েছে", "ok"); return loadAll(true); }).then(render).catch(function (e) { toast(e.message, "err"); });
        };
      }
    });
  }

  /* ============================================================
   *  REPORTS
   * ============================================================ */
  var reportRange = { from: "", to: "" };
  function renderReports(view) {
    if (!reportRange.from) {
      var d = new Date(); d.setDate(1);
      reportRange.from = dayKey(d);
      reportRange.to = todayKey();
    }
    view.innerHTML =
      '<div class="panel"><div class="panel-head">' +
      "<span>থেকে / From</span>" +
      '<input type="date" id="repFrom" value="' + reportRange.from + '" style="max-width:160px">' +
      "<span>পর্যন্ত / To</span>" +
      '<input type="date" id="repTo" value="' + reportRange.to + '" style="max-width:160px">' +
      '<button class="btn sm" data-quick="today">আজ</button><button class="btn sm" data-quick="7">৭ দিন</button><button class="btn sm" data-quick="30">৩০ দিন</button>' +
      '<div class="grow"></div><button class="btn" id="repCsv">Export CSV</button></div><div class="panel-body" id="repBody"></div></div>';

    $("#repFrom").onchange = function () { reportRange.from = this.value; drawReport(); };
    $("#repTo").onchange = function () { reportRange.to = this.value; drawReport(); };
    $$("[data-quick]", view).forEach(function (b) {
      b.onclick = function () {
        var q = this.getAttribute("data-quick");
        var to = new Date(); var from = new Date();
        if (q === "today") { from = to; }
        else if (q === "7") from.setDate(from.getDate() - 6);
        else from.setDate(from.getDate() - 29);
        reportRange.from = dayKey(from); reportRange.to = dayKey(to);
        $("#repFrom").value = reportRange.from; $("#repTo").value = reportRange.to;
        drawReport();
      };
    });
    $("#repCsv").onclick = function () {
      var list = rangeSales();
      var csv = "Invoice,DateTime,Customer,Total,Type,Paid,Due,Discount\n";
      list.forEach(function (s) { csv += [s.InvoiceNo, fmtDateTime(s.DateTime), '"' + (s.CustomerName || "") + '"', num(s.Total), s.PaymentType, num(s.PaidAmount), num(s.DueAmount), num(s.Discount)].join(",") + "\n"; });
      downloadFile("report.csv", csv);
    };
    drawReport();
  }

  function rangeSales() {
    return S.sales.filter(function (s) {
      var k = dayKey(s.DateTime);
      return (!reportRange.from || k >= reportRange.from) && (!reportRange.to || k <= reportRange.to);
    });
  }

  function drawReport() {
    var body = $("#repBody");
    if (!body) return;
    var list = rangeSales();
    var total = list.reduce(function (a, s) { return a + num(s.Total); }, 0);
    var cash = list.filter(function (s) { return s.PaymentType === "Cash"; }).reduce(function (a, s) { return a + num(s.Total); }, 0);
    var credit = total - cash;
    var collected = list.reduce(function (a, s) { return a + num(s.PaidAmount); }, 0);
    var dueAdded = list.reduce(function (a, s) { return a + num(s.DueAmount); }, 0);

    // per-item aggregation
    var itemMap = {};
    list.forEach(function (s) {
      (s.items || []).forEach(function (it) {
        var k = it.ItemName || "-";
        if (!itemMap[k]) itemMap[k] = { qty: 0, amount: 0 };
        itemMap[k].qty += num(it.Qty);
        itemMap[k].amount += num(it.LineTotal);
      });
    });
    var topItems = Object.keys(itemMap).map(function (k) { return { name: k, qty: itemMap[k].qty, amount: itemMap[k].amount }; })
      .sort(function (a, b) { return b.amount - a.amount; }).slice(0, 10);

    var topRows = topItems.length ? topItems.map(function (t, i) {
      return "<tr><td>" + (i + 1) + "</td><td>" + esc(t.name) + '</td><td class="num">' + t.qty + '</td><td class="num">' + money(t.amount) + "</td></tr>";
    }).join("") : '<tr><td colspan="4" class="empty">ডেটা নেই / No data</td></tr>';

    body.innerHTML =
      '<div class="grid cards" style="margin-bottom:16px">' +
      statCard("মোট বিক্রয় / Total sales", money(total), list.length + " bills", "blue") +
      statCard("নগদ / Cash", money(cash), "", "green") +
      statCard("বাকি / Credit", money(credit), "", "amber") +
      statCard("আদায় / Collected", money(collected), "", "green") +
      statCard("নতুন বাকি / Due added", money(dueAdded), "", "red") +
      "</div>" +
      '<div class="two-col">' +
      '<div><canvas id="repTrend" height="200"></canvas></div>' +
      '<div><table><thead><tr><th>#</th><th>Item</th><th class="num">Qty</th><th class="num">Amount</th></tr></thead><tbody>' + topRows + "</tbody></table></div>" +
      "</div>";

    // daily trend within range
    var byDay = {};
    list.forEach(function (s) { var k = dayKey(s.DateTime); byDay[k] = (byDay[k] || 0) + num(s.Total); });
    var labels = Object.keys(byDay).sort();
    makeChart("repTrend", {
      type: "line",
      data: { labels: labels.map(function (k) { var p = k.split("-"); return p[2] + "/" + p[1]; }), datasets: [{ label: "Sales", data: labels.map(function (k) { return byDay[k]; }), borderColor: "#2563eb", backgroundColor: "rgba(37,99,235,.12)", fill: true, tension: .3, pointRadius: 3 }] },
      options: { plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } }, maintainAspectRatio: false }
    });
  }

  /* ============================================================
   *  SETTINGS
   * ============================================================ */
  function renderSettings(view) {
    var s = S.settings;
    view.innerHTML =
      '<div class="panel" style="max-width:720px"><div class="panel-head"><h2>দোকানের তথ্য / Shop Settings</h2></div><div class="panel-body">' +
      '<div class="form-grid">' +
      '<div class="field full"><label>দোকানের নাম / Shop name</label><input id="stName" value="' + esc(s.ShopName || cfg().SHOP_NAME || "") + '"></div>' +
      '<div class="field"><label>ফোন / Phone</label><input id="stPhone" value="' + esc(s.Phone || "") + '"></div>' +
      '<div class="field"><label>ইমেইল / Email</label><input id="stEmail" value="' + esc(s.Email || "") + '"></div>' +
      '<div class="field full"><label>ঠিকানা / Address</label><input id="stAddr" value="' + esc(s.Address || "") + '"></div>' +
      '<div class="field"><label>মুদ্রা / Currency symbol</label><input id="stCur" value="' + esc(s.Currency || cfg().CURRENCY || "৳") + '"></div>' +
      '<div class="field"><label>ইনভয়েস প্রিফিক্স / Invoice prefix</label><input id="stPrefix" value="' + esc(s.InvoicePrefix || cfg().INVOICE_PREFIX || "INV") + '"></div>' +
      '<div class="field"><label>ডিফল্ট কম স্টক / Low stock default</label><input type="number" id="stLow" value="' + esc(s.LowStockDefault || lowStockDefault()) + '"></div>' +
      "</div>" +
      '<button class="btn primary" id="saveSettingsBtn">সংরক্ষণ / Save Settings</button>' +
      '<hr style="margin:22px 0;border:none;border-top:1px solid var(--line)">' +
      '<div style="color:var(--muted);font-size:13px">API URL: <code>' + esc(cfg().API_URL || "(not set)") + "</code><br>Sheet backend: Google Apps Script</div>" +
      "</div></div>";
    $("#saveSettingsBtn").onclick = function () {
      var payload = {
        ShopName: $("#stName").value.trim(),
        Phone: $("#stPhone").value.trim(),
        Email: $("#stEmail").value.trim(),
        Address: $("#stAddr").value.trim(),
        Currency: $("#stCur").value.trim() || "৳",
        InvoicePrefix: $("#stPrefix").value.trim() || "INV",
        LowStockDefault: String(num($("#stLow").value) || 5)
      };
      api("saveSettings", payload).then(function () {
        toast("সেটিংস সংরক্ষিত", "ok");
        S.settings = Object.assign({}, S.settings, payload);
        applyBranding();
        render();
      }).catch(function (e) { toast(e.message, "err"); });
    };
  }

  /* ============================================================
   *  USERS (admin only)
   * ============================================================ */
  var usersCache = [];
  function renderUsers(view) {
    if (!(S.user && S.user.role === "admin")) {
      view.innerHTML = '<div class="panel"><div class="panel-body"><h2>Admin only</h2><p style="color:var(--muted)">শুধু admin ইউজার ম্যানেজ করতে পারবে।</p></div></div>';
      return;
    }
    view.innerHTML =
      '<div class="panel"><div class="panel-head"><h2>ইউজার তালিকা / Users</h2><div class="grow"></div>' +
      '<button class="btn primary" id="addUserBtn">＋ নতুন ইউজার / Add User</button></div>' +
      '<div class="table-wrap"><table><thead><tr><th>Username</th><th>Name</th><th>Role</th><th>Shops</th><th>Status</th><th></th></tr></thead><tbody id="usersBody"><tr><td colspan="6" class="empty">লোড হচ্ছে…</td></tr></tbody></table></div></div>' +
      '<div class="panel"><div class="panel-body" style="color:var(--muted);font-size:13px">' +
      "admin = সব দোকান দেখবে ও ইউজার বানাতে পারবে। user = শুধু বাছাই করা দোকান দেখবে, ইউজার পেজ দেখবে না।" +
      "</div></div>";
    $("#addUserBtn").onclick = function () { userForm(null); };
    loadUsers();
  }

  function loadUsers() {
    Api.callAt(controlUrl(), "listUsers", { token: S.token }).then(function (res) {
      if (!res || res.ok === false) throw new Error((res && res.error) || "Failed");
      usersCache = res.users || [];
      drawUserRows();
    }).catch(function (e) {
      var tb = $("#usersBody"); if (tb) tb.innerHTML = '<tr><td colspan="6" class="empty">' + esc(e.message) + "</td></tr>";
    });
  }

  function shopLabel(id) { var a = allShops(); for (var i = 0; i < a.length; i++) if (a[i].id === id) return a[i].name || id; return id; }
  function findUser(id) { for (var i = 0; i < usersCache.length; i++) if (String(usersCache[i].id) === String(id)) return usersCache[i]; return null; }

  function drawUserRows() {
    var tb = $("#usersBody"); if (!tb) return;
    if (!usersCache.length) { tb.innerHTML = '<tr><td colspan="6" class="empty">কোনো ইউজার নেই</td></tr>'; return; }
    tb.innerHTML = usersCache.map(function (u) {
      var chips = (u.shops || []).map(function (s) { return '<span class="chip">' + esc(shopLabel(s)) + "</span>"; }).join(" ");
      return "<tr>" +
        "<td><b>" + esc(u.username) + "</b></td>" +
        "<td>" + esc(u.name || "-") + "</td>" +
        "<td><span class='role-tag'>" + esc(u.role) + "</span></td>" +
        "<td><div class='shop-chips'>" + (chips || "-") + "</div></td>" +
        "<td>" + (u.active ? '<span class="badge ok">Active</span>' : '<span class="badge out">Off</span>') + "</td>" +
        '<td style="white-space:nowrap"><button class="btn sm" data-edituser="' + esc(u.id) + '">Edit</button> <button class="btn sm red" data-deluser="' + esc(u.id) + '">Del</button></td>' +
        "</tr>";
    }).join("");
    $$("[data-edituser]", tb).forEach(function (b) { b.onclick = function () { userForm(findUser(this.getAttribute("data-edituser"))); }; });
    $$("[data-deluser]", tb).forEach(function (b) {
      b.onclick = function () {
        var u = findUser(this.getAttribute("data-deluser"));
        confirmDialog('ইউজার "' + u.username + '" মুছবেন?', function () {
          Api.callAt(controlUrl(), "deleteUser", { token: S.token, ID: u.id }).then(function () { toast("মুছে ফেলা হয়েছে", "ok"); loadUsers(); }).catch(function (e) { toast(e.message, "err"); });
        });
      };
    });
  }

  function userForm(u) {
    u = u || {};
    var shops = allShops();
    var chips = shops.map(function (s) {
      var checked = (u.shops || []).indexOf(s.id) >= 0;
      return '<label style="display:flex;align-items:center;gap:8px;margin:4px 0"><input type="checkbox" class="uShop" value="' + esc(s.id) + '"' + (checked ? " checked" : "") + ' style="width:auto"> ' + esc(s.name) + "</label>";
    }).join("");
    var body =
      '<div class="form-grid">' +
      '<div class="field"><label>ইউজারনেম / Username *</label><input id="uName" value="' + esc(u.username || "") + '"' + (u.id ? " disabled" : "") + "></div>" +
      '<div class="field"><label>নাম / Name</label><input id="uFull" value="' + esc(u.name || "") + '"></div>' +
      '<div class="field"><label>Role</label><select id="uRole"><option value="user"' + (u.role === "user" ? " selected" : "") + '>user</option><option value="admin"' + (u.role === "admin" ? " selected" : "") + ">admin</option></select></div>" +
      '<div class="field"><label>' + (u.id ? "নতুন Password (খালি = অপরিবর্তিত)" : "Password *") + '</label><input id="uPass" type="text" placeholder="' + (u.id ? "••••••" : "password") + '"></div>' +
      "</div>" +
      '<div class="field"><label>দোকান / Shops (কোন দোকান দেখবে)</label>' + chips + "</div>" +
      '<div class="field"><label style="display:flex;align-items:center;gap:8px"><input type="checkbox" id="uActive" ' + (u.id && u.active === false ? "" : "checked") + ' style="width:auto"> সক্রিয় / Active</label></div>';
    openModal(u.id ? "ইউজার সম্পাদনা / Edit User" : "নতুন ইউজার / Add User", body, {
      footer: '<button class="btn" data-close>বাতিল</button><button class="btn primary" id="saveUserBtn">সংরক্ষণ</button>',
      onOpen: function () {
        $("#saveUserBtn").onclick = function () {
          var uname = $("#uName").value.trim();
          if (!uname) { toast("Username দিন", "err"); return; }
          var pass = $("#uPass").value;
          if (!u.id && !pass) { toast("Password দিন", "err"); return; }
          var shopVals = $$(".uShop").filter(function (c) { return c.checked; }).map(function (c) { return c.value; });
          if (!shopVals.length) { toast("অন্তত একটা দোকান বাছুন", "err"); return; }
          Api.callAt(controlUrl(), "saveUser", {
            token: S.token, ID: u.id || "", Username: uname, Name: $("#uFull").value.trim(),
            Role: $("#uRole").value, Password: pass, Shops: shopVals, Active: $("#uActive").checked
          }).then(function () { closeModal(); toast("সংরক্ষিত", "ok"); loadUsers(); }).catch(function (e) { toast(e.message, "err"); });
        };
      }
    });
  }

  /* ============================================================
   *  INVOICE PRINT
   * ============================================================ */
  function printInvoice(s) {
    var shop = S.settings.ShopName || cfg().SHOP_NAME || "Fai Shop";
    var cust = s.CustomerID ? findCustomer(s.CustomerID) : null;
    var custPhone = cust && cust.Phone ? fmtPhone(cust.Phone) : "";
    var rows = (s.items || []).map(function (it, i) {
      return "<tr><td>" + (i + 1) + "</td><td>" + esc(it.ItemName) + '</td><td class="num">' + num(it.Qty) + '</td><td class="num">' + money(it.UnitPrice) + '</td><td class="num">' + money(it.LineTotal) + "</td></tr>";
    }).join("");
    var html =
      '<div class="invoice">' +
      '<div class="inv-head"><div>' +
      "<h2>" + esc(shop) + "</h2>" +
      (S.settings.Address ? "<div>" + esc(S.settings.Address) + "</div>" : "") +
      (S.settings.Phone ? "<div>☎ " + esc(S.settings.Phone) + "</div>" : "") +
      (S.settings.Email ? "<div>" + esc(S.settings.Email) + "</div>" : "") +
      '</div><div class="meta"><div><b>INVOICE</b></div><div>No: ' + esc(s.InvoiceNo) + "</div><div>Date: " + fmtDateTime(s.DateTime) + "</div>" +
      "<div>Customer: " + esc(s.CustomerName || "Walk-in") + "</div>" +
      (custPhone ? "<div>Phone: " + esc(custPhone) + "</div>" : "") +
      "</div></div>" +
      '<table><thead><tr><th>#</th><th>Item</th><th class="num">Qty</th><th class="num">Rate</th><th class="num">Amount</th></tr></thead><tbody>' + rows + "</tbody></table>" +
      '<div class="inv-totals">' +
      "<div><span>Subtotal</span><span>" + money(s.SubTotal) + "</span></div>" +
      "<div><span>Discount</span><span>− " + money(s.Discount) + "</span></div>" +
      '<div class="grand"><span>Total</span><span>' + money(s.Total) + "</span></div>" +
      "<div><span>Paid</span><span>" + money(s.PaidAmount) + "</span></div>" +
      "<div><span>Due</span><span>" + money(s.DueAmount) + "</span></div>" +
      "</div>" +
      '<div class="inv-foot">ধন্যবাদ! আবার আসবেন। / Thank you, please come again.<div style="margin-top:6px">Software: Fai Shop Dashboard</div></div>' +
      "</div>";
    var holder = $("#invoicePrint");
    holder.innerHTML = html;
    setTimeout(function () { window.print(); }, 50);
  }

  /* ============================================================
   *  SIDEBAR / GLOBAL
   * ============================================================ */
  function openSidebar() {
    $("#sidebar").classList.add("open");
    if (!$("#scrim")) {
      var sc = document.createElement("div");
      sc.id = "scrim"; sc.className = "scrim";
      sc.onclick = closeSidebar;
      document.body.appendChild(sc);
    }
    $("#scrim").classList.add("show");
  }
  function closeSidebar() {
    $("#sidebar").classList.remove("open");
    var sc = $("#scrim"); if (sc) sc.classList.remove("show");
  }

  function tickClock() {
    var d = new Date();
    $("#clock").textContent = fmtDate(d) + " " + pad2(d.getHours()) + ":" + pad2(d.getMinutes()) + ":" + pad2(d.getSeconds());
  }

  function setupShopSwitcher() {
    var wrap = $("#shopSwitchWrap");
    if (!wrap) return;
    var list = getShops();
    if (list.length < 2) { wrap.hidden = true; wrap.innerHTML = ""; return; }
    wrap.hidden = false;
    var sel = document.createElement("select");
    sel.id = "shopSwitch";
    sel.className = "shop-select";
    sel.title = "দোকান বাছুন / Switch shop";
    list.forEach(function (s) {
      var o = document.createElement("option");
      o.value = s.id;
      o.textContent = s.name || s.id;
      sel.appendChild(o);
    });
    sel.value = getActiveShopId();
    sel.onchange = function () {
      var chosen = this.value;
      try { localStorage.setItem("fai_active_shop", chosen); } catch (e) {}
      applyActiveShop();
      S.loaded = false;
      S.items = []; S.customers = []; S.sales = []; S.payments = []; S.settings = {};
      applyBranding();
      setConnected(false);
      $("#view").innerHTML = '<div class="spinner"></div>';
      loadAll();
    };
    wrap.innerHTML = "";
    wrap.appendChild(sel);
  }

  function showLogin() {
    var app = $("#app"); if (app) app.style.display = "none";
    var ls = $("#loginScreen"); if (ls) ls.hidden = false;
    var nameEl = $("#loginShopName");
    var title = cfg().LOGIN_TITLE || cfg().SHOP_NAME || "Fair Shop";
    if (nameEl) nameEl.textContent = title;
    document.title = title;
    startLoginFx();
    var u = $("#loginUser"); if (u) u.focus();
  }
  function hideLogin() {
    stopLoginFx();
    var ls = $("#loginScreen"); if (ls) ls.hidden = true;
    var app = $("#app"); if (app) app.style.display = "";
  }

  /* ---- login background particles ---- */
  var loginRaf = null;
  function startLoginFx() {
    var cv = $("#loginFx");
    if (!cv || !cv.getContext || loginRaf) return;
    var ctx = cv.getContext("2d");
    var w = 0, h = 0, dpr = Math.min(window.devicePixelRatio || 1, 2);
    var pts = [];
    var MAXP = 460;
    var mouse = { x: 0, y: 0, on: false };

    function addBase(count) {
      for (var i = 0; i < count; i++) {
        var ang = Math.random() * Math.PI * 2;
        var spd = (0.35 + Math.random() * 0.75) * 0.24;
        pts.push({ x: Math.random() * w, y: Math.random() * h, vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd, life: Infinity, r: 1.5 });
      }
    }
    function resize() {
      w = cv.clientWidth; h = cv.clientHeight;
      cv.width = Math.floor(w * dpr); cv.height = Math.floor(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      var base = Math.max(70, Math.min(230, Math.round((w * h) / 8600)));
      pts = [];
      addBase(base);
    }
    // click on empty space -> big burst of nodes that form a glowing web
    function burst(x, y) {
      var n = 12;
      for (var i = 0; i < n; i++) {
        if (pts.length > MAXP) break;
        var a = (Math.PI * 2 * i) / n + Math.random() * .5;
        var sp = .8 + Math.random() * 3.0;
        var off = Math.random() * 12;
        pts.push({
          x: x + Math.cos(a) * off, y: y + Math.sin(a) * off,
          vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 1, r: 2.3
        });
      }
    }
    function draw() {
      ctx.clearRect(0, 0, w, h);
      var linkDist = 120;
      for (var i = pts.length - 1; i >= 0; i--) {
        var p = pts[i];
        p.x += p.vx; p.y += p.vy;
        if (p.life === Infinity) {
          if (p.x < 0 || p.x > w) p.vx *= -1;
          if (p.y < 0 || p.y > h) p.vy *= -1;
        } else {
          p.life -= 0.0038;
          p.vx *= 0.995; p.vy *= 0.995;
          if (p.life <= 0) { pts.splice(i, 1); continue; }
        }
      }
      // cursor light glow
      if (mouse.on) {
        var g = ctx.createRadialGradient(mouse.x, mouse.y, 0, mouse.x, mouse.y, 170);
        g.addColorStop(0, "rgba(120,145,255,0.22)");
        g.addColorStop(0.5, "rgba(120,145,255,0.08)");
        g.addColorStop(1, "rgba(120,145,255,0)");
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(mouse.x, mouse.y, 170, 0, Math.PI * 2); ctx.fill();
      }
      // links between particles
      for (var a = 0; a < pts.length; a++) {
        var p1 = pts[a];
        var lf1 = p1.life === Infinity ? 1 : p1.life;
        for (var b = a + 1; b < pts.length; b++) {
          var p2 = pts[b];
          var dx = p1.x - p2.x, dy = p1.y - p2.y, d = Math.sqrt(dx * dx + dy * dy);
          if (d < linkDist) {
            var lf2 = p2.life === Infinity ? 1 : p2.life;
            var alpha = 0.24 * (1 - d / linkDist) * (0.3 + 0.7 * Math.min(lf1, lf2));
            ctx.strokeStyle = "rgba(170,185,255," + alpha.toFixed(3) + ")";
            ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke();
          }
        }
      }
      // links from the cursor light to nearby nodes
      if (mouse.on) {
        var mL = 210;
        for (var m = 0; m < pts.length; m++) {
          var pm = pts[m];
          var mx = pm.x - mouse.x, my = pm.y - mouse.y, md = Math.sqrt(mx * mx + my * my);
          if (md < mL) {
            var ma = 0.5 * (1 - md / mL);
            ctx.strokeStyle = "rgba(170,190,255," + ma.toFixed(3) + ")";
            ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(mouse.x, mouse.y); ctx.lineTo(pm.x, pm.y); ctx.stroke();
          }
        }
      }
      // nodes
      for (var k = 0; k < pts.length; k++) {
        var q = pts[k];
        var lf = q.life === Infinity ? 1 : q.life;
        ctx.fillStyle = "rgba(228,234,255," + (0.5 + 0.4 * lf).toFixed(3) + ")";
        ctx.beginPath(); ctx.arc(q.x, q.y, q.r, 0, Math.PI * 2); ctx.fill();
      }
      loginRaf = requestAnimationFrame(draw);
    }
    function onDown(e) {
      var rect = cv.getBoundingClientRect();
      var pt = e.touches && e.touches[0] ? e.touches[0] : e;
      burst(pt.clientX - rect.left, pt.clientY - rect.top);
    }
    function onMove(e) {
      var rect = cv.getBoundingClientRect();
      var pt = e.touches && e.touches[0] ? e.touches[0] : e;
      mouse.x = pt.clientX - rect.left; mouse.y = pt.clientY - rect.top; mouse.on = true;
    }
    function onLeave() { mouse.on = false; }
    resize();
    window.addEventListener("resize", resize);
    var screen = $("#loginScreen");
    if (screen) {
      screen.addEventListener("mousedown", onDown);
      screen.addEventListener("touchstart", onDown, { passive: true });
      screen.addEventListener("mousemove", onMove);
      screen.addEventListener("touchmove", onMove, { passive: true });
      screen.addEventListener("mouseleave", onLeave);
    }
    cv._cleanup = function () {
      window.removeEventListener("resize", resize);
      if (screen) {
        screen.removeEventListener("mousedown", onDown);
        screen.removeEventListener("touchstart", onDown);
        screen.removeEventListener("mousemove", onMove);
        screen.removeEventListener("touchmove", onMove);
        screen.removeEventListener("mouseleave", onLeave);
      }
    };
    draw();
  }
  function stopLoginFx() {
    if (loginRaf) { cancelAnimationFrame(loginRaf); loginRaf = null; }
    var cv = $("#loginFx");
    if (cv && cv._cleanup) { cv._cleanup(); cv._cleanup = null; }
  }
  var EYE_ON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8Z"/><circle cx="12" cy="12" r="3"/></svg>';
  var EYE_OFF = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';
  function doLogin() {
    var username = $("#loginUser").value.trim();
    var password = $("#loginPass").value;
    var err = $("#loginError");
    err.textContent = "";
    if (!username || !password) { err.textContent = "ইউজারনেম ও পাসওয়ার্ড দিন"; return; }
    var btn = $("#loginBtn");
    btn.disabled = true; btn.textContent = "Signing in…";
    Api.callAt(controlUrl(), "login", { username: username, password: password }).then(function (res) {
      if (!res || res.ok === false) throw new Error((res && res.error) || "Login failed");
      S.user = res.user;
      S.token = res.token;
      setSession({ user: res.user, token: res.token, ts: Date.now() });
      hideLogin();
      startApp();
    }).catch(function (e) {
      if (/unknown action/i.test(e.message || "")) {
        // Backend not updated yet -> temporary open mode so the shop keeps working
        S.user = { name: "Admin", role: "admin", shops: allShops().map(function (s) { return s.id; }) };
        S.token = null;
        hideLogin();
        startApp();
        toast("Apps Script-এ নতুন Code.gs deploy করুন (login/users চালু করতে)", "err");
        return;
      }
      err.textContent = e.message;
    }).then(function () {
      btn.disabled = false; btn.textContent = "Sign in";
    });
  }
  function logout() {
    clearSession();
    S.user = null; S.token = null; S.loaded = false;
    location.reload();
  }
  function startApp() {
    hideLogin();
    var who = $("#whoAmI");
    if (who) who.textContent = S.user ? (S.user.name + (S.user.role === "admin" ? " • admin" : "")) : "";
    var un = $("#usersNav");
    if (un) un.hidden = !(S.user && S.user.role === "admin");
    applyActiveShop();
    setupShopSwitcher();
    var hash = (location.hash || "#dashboard").slice(1) || "dashboard";
    S.page = hash;
    $$(".nav a").forEach(function (a) { a.classList.toggle("active", a.getAttribute("data-nav") === S.page); });
    $("#view").innerHTML = '<div class="spinner"></div>';
    loadAll();
    var ars = num(cfg().AUTO_REFRESH_SECONDS);
    if (ars > 0 && !S._autoTimer) S._autoTimer = setInterval(function () { if (S.loaded) loadAll(true); }, ars * 1000);
  }
  function startup() {
    if (authEnabled()) {
      var sess = getSession();
      if (sess && sess.user && sess.token) { S.user = sess.user; S.token = sess.token; startApp(); }
      else showLogin();
    } else {
      startApp();
    }
  }

  function init() {
    $$(".nav a").forEach(function (a) {
      a.addEventListener("click", function (e) { e.preventDefault(); setPage(this.getAttribute("data-nav")); });
    });
    document.addEventListener("click", function (e) {
      var nav = e.target.closest ? e.target.closest("[data-nav]") : null;
      if (nav && !nav.closest(".nav")) { e.preventDefault(); setPage(nav.getAttribute("data-nav")); }
      if (e.target.closest && e.target.closest("[data-close]")) closeModal();
    });
    $("#modalClose").onclick = closeModal;
    $("#modalMask").addEventListener("click", function (e) { if (e.target === this) closeModal(); });
    $("#refreshBtn").onclick = function () { toast("আপডেট হচ্ছে…", "info"); loadAll(); };
    $("#menuBtn").onclick = openSidebar;
    $("#logoutBtn").onclick = logout;
    $("#loginBtn").onclick = doLogin;
    var eye = $("#loginEye");
    if (eye) eye.onclick = function () {
      var pw = $("#loginPass");
      var show = pw.type === "password";
      pw.type = show ? "text" : "password";
      this.innerHTML = show ? EYE_OFF : EYE_ON;
    };
    $("#loginPass").addEventListener("keydown", function (e) { if (e.key === "Enter") doLogin(); });
    $("#loginUser").addEventListener("keydown", function (e) { if (e.key === "Enter") $("#loginPass").focus(); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeModal(); });

    tickClock();
    setInterval(tickClock, 1000);

    window.addEventListener("hashchange", function () {
      var p = (location.hash || "#dashboard").slice(1);
      if (p && p !== S.page && S.loaded) {
        S.page = p;
        $$(".nav a").forEach(function (a) { a.classList.toggle("active", a.getAttribute("data-nav") === p); });
        closeSidebar();
        render();
      }
    });

    startup();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
