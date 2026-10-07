/* ============================================================
 *  Fai Shop Dashboard — Configuration (Multi-shop + Login)
 *  * Each shop has its OWN Google Sheet + Apps Script /exec URL.
 *  * Users are managed inside the dashboard (Users page, admin).
 * ============================================================ */
window.SHOP_CONFIG = {
  SHOPS: [
    {
      id: "shop1",
      name: "Rakib Store",
      // Shop 1 Apps Script Web App /exec URL
      apiUrl: "https://script.google.com/macros/s/AKfycbzXRSrHKavk1Ayiz_mmrWNuYU5AdR94MCC3z_5nxIz7U0c30hYCByUXGwHlNJawPpuR/exec"
    },
    {
      id: "shop2",
      name: "Anis Store",
      // Shop 2 Apps Script Web App /exec URL
      apiUrl: "https://script.google.com/macros/s/AKfycby-QXlEmiou2wcLDKiRGTNwajdVwLDVjdWzWT08gEyPU3CxH2NawnDJuWDHNZ9S96QG/exec"
    }
  ],

  // Login + user management uses this shop's Apps Script as the control server.
  AUTH: { enabled: true, controlShopId: "shop1" },

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
