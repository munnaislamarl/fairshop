/* ============================================================
 *  Fai Shop Dashboard — Configuration (Multi-shop)
 *  * Each shop has its OWN Google Sheet + Apps Script /exec URL.
 *  * Add one entry per shop in the SHOPS list below.
 *  * A "shop switcher" dropdown shows on top when 2+ shops exist.
 * ============================================================ */
window.SHOP_CONFIG = {
  SHOPS: [
    {
      id: "shop1",
      name: "Fair Shop 1",
      // Shop 1 Apps Script Web App /exec URL
      apiUrl: "https://script.google.com/macros/s/AKfycbzXRSrHKavk1Ayiz_mmrWNuYU5AdR94MCC3z_5nxIz7U0c30hYCByUXGwHlNJawPpuR/exec"
    },
    {
      id: "shop2",
      name: "Fair Shop 2",
      // Shop 2 Apps Script Web App /exec URL
      apiUrl: "https://script.google.com/macros/s/AKfycby-QXlEmiou2wcLDKiRGTNwajdVwLDVjdWzWT08gEyPU3CxH2NawnDJuWDHNZ9S96QG/exec"
    }
  ],

  // Fallback single-shop URL (used only if SHOPS is empty)
  API_URL: "",

  SHOP_NAME: "Fair Shop",
  CURRENCY: "৳",
  CURRENCY_CODE: "BDT",

  LOW_STOCK_DEFAULT: 5,
  INVOICE_PREFIX: "INV",

  // Refresh all data automatically every N seconds (0 = off)
  AUTO_REFRESH_SECONDS: 0
};
