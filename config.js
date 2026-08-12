// ============================================================
// IntefAI Academy — public config only
// NEVER put RAZORPAY_KEY_SECRET here (or in GitHub).
// ============================================================
window.INTEFAI_CONFIG = {
  GOOGLE_SCRIPT_URL:
    "https://script.google.com/macros/s/AKfycbxewPWNELh5A3wjK4US5WnGOlRnGB2CJTvZL8lTj9FLMJbdCpCWYwg89TG48Zg_gdDiXA/exec",

  RAZORPAY_KEY_ID: "rzp_live_TOX6Vtz63LADxm",
  RAZORPAY_AMOUNT_PAISE: 900, // ₹9

  // FAST MODE: instant redirect to this master link (no 20–40s wait).
  // Create it once in Apps Script: Run → createMasterPaymentLink
  // Then paste the logged URL here (must include callback/success redirect).
  USE_FAST_PAYMENT: true,
  RAZORPAY_PAYMENT_LINK: "https://rzp.io/rzp/GYxXCw6",

  SITE_URL: "https://intefaisolutions.github.io/intefai-webinar-landing/",
  PAYMENT_SUCCESS_URL:
    "https://intefaisolutions.github.io/intefai-webinar-landing/payment-success.html",
};
