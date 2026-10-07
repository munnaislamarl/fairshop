/* ============================================================
 *  Fai Shop Dashboard — Configuration
 *  1) Put your Google Apps Script Web App /exec URL in API_URL
 *     (Apps Script > Deploy > New deployment > Web app > /exec)
 *  2) You can change SHOP_NAME / CURRENCY any time
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
