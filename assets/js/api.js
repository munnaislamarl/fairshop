/* ============================================================
 *  Fai Shop Dashboard — API transport
 *  - Reads  : JSONP  (no CORS issues with Google Apps Script)
 *  - Writes : POST text/plain (simple request), JSONP fallback
 * ============================================================ */
window.Api = (function () {
  var seq = 0;

  var WRITE_ACTIONS = {
    saveItem: 1, deleteItem: 1,
    saveCustomer: 1, deleteCustomer: 1,
    createSale: 1, deleteSale: 1,
    addPayment: 1, deletePayment: 1,
    saveSettings: 1,
    login: 1, saveUser: 1, deleteUser: 1,
    requestAccess: 1, approveRequest: 1, deleteRequest: 1
  };

  function isHttp(url) { return (url || "").indexOf("http") === 0; }

  function jsonp(baseUrl, action, payload) {
    return new Promise(function (resolve, reject) {
      if (!isHttp(baseUrl)) {
        reject(new Error("API URL সেট করা হয়নি — assets/js/config.js দেখুন।"));
        return;
      }
      var cb = "fai_cb_" + (++seq) + "_" + Date.now();
      var script = document.createElement("script");
      var timer = setTimeout(function () { cleanup(); reject(new Error("Request timeout")); }, 30000);

      function cleanup() {
        clearTimeout(timer);
        try { delete window[cb]; } catch (e) { window[cb] = undefined; }
        if (script.parentNode) script.parentNode.removeChild(script);
      }
      window[cb] = function (res) { cleanup(); resolve(res); };
      script.onerror = function () { cleanup(); reject(new Error("Network error — Apps Script URL বা access চেক করুন।")); };

      var params =
        "action=" + encodeURIComponent(action) +
        "&data=" + encodeURIComponent(JSON.stringify(payload || {})) +
        "&callback=" + encodeURIComponent(cb) +
        "&_=" + Date.now();
      script.src = baseUrl + (baseUrl.indexOf("?") >= 0 ? "&" : "?") + params;
      document.body.appendChild(script);
    });
  }

  function post(baseUrl, action, payload) {
    return fetch(baseUrl, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ action: action, payload: payload || {} }),
      redirect: "follow"
    }).then(function (res) {
      return res.text();
    }).then(function (text) {
      var data;
      try { data = JSON.parse(text); } catch (e) { throw new Error("Invalid response from server"); }
      return data;
    });
  }

  function run(baseUrl, action, payload) {
    if (!isHttp(baseUrl)) {
      return Promise.reject(new Error("API URL সেট করা হয়নি — assets/js/config.js দেখুন।"));
    }
    if (WRITE_ACTIONS[action]) {
      return post(baseUrl, action, payload).catch(function () { return jsonp(baseUrl, action, payload); });
    }
    return jsonp(baseUrl, action, payload);
  }

  return {
    call: function (action, payload) { return run(window.SHOP_CONFIG.API_URL, action, payload); },
    callAt: function (baseUrl, action, payload) { return run(baseUrl, action, payload); },
    configured: function () { return isHttp(window.SHOP_CONFIG.API_URL); },
    isHttp: isHttp
  };
})();
