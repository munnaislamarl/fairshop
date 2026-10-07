/* ============================================================
 *  Fai Shop Dashboard — Configuration
 *  ১) নিচের API_URL এ আপনার Google Apps Script Web App URL বসান
 *     (Apps Script > Deploy > New deployment > Web app > /exec URL)
 *  ২) SHOP_NAME / CURRENCY ইচ্ছেমতো বদলাতে পারেন
 * ============================================================ */
window.SHOP_CONFIG = {
  // Example: "https://script.google.com/macros/s/AKfycb....../exec"
  API_URL: "https://script.google.com/macros/s/AKfycbzXRSrHKavk1Ayiz_mmrWNuYU5AdR94MCC3z_5nxIz7U0c30hYCByUXGwHlNJawPpuR/exec",

  SHOP_NAME: "Fai Shop",
  CURRENCY: "৳",
  CURRENCY_CODE: "BDT",

  // Fallback low-stock threshold (used before settings load)
  LOW_STOCK_DEFAULT: 5,
  INVOICE_PREFIX: "INV",

  // Refresh all data automatically every N seconds (0 = off)
  AUTO_REFRESH_SECONDS: 0
};
