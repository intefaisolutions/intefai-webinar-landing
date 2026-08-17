// ============================================================
// IntefAI Academy — public config only
// NEVER put RAZORPAY_KEY_SECRET here (or in GitHub).
// ============================================================
window.INTEFAI_CONFIG = {
  GOOGLE_SCRIPT_URL:
    "https://script.google.com/macros/s/AKfycbxewPWNELh5A3wjK4US5WnGOlRnGB2CJTvZL8lTj9FLMJbdCpCWYwg89TG48Zg_gdDiXA/exec",

  RAZORPAY_KEY_ID: "rzp_live_TOX6Vtz63LADxm",
  RAZORPAY_AMOUNT_PAISE: 900, // ₹9

  // IMPORTANT: Keep false so EACH registration gets a NEW Payment Link.
  // A single master link becomes "Payment Completed" after the first pay
  // and will not ask new users for payment again.
  USE_FAST_PAYMENT: false,

  // Only used if USE_FAST_PAYMENT is true (not recommended for multi-user webinars)
  RAZORPAY_PAYMENT_LINK: "https://rzp.io/rzp/ixt8TfNK",

  SITE_URL: "https://intefaisolutions.github.io/intefai-webinar-landing/",
  PAYMENT_SUCCESS_URL:
    "https://intefaisolutions.github.io/intefai-webinar-landing/payment-success.html",
};
