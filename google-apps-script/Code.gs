/**
 * IntefAI Academy — Google Apps Script
 * ------------------------------------
 * After updating this file:
 *   Deploy → Manage deployments → Edit (pencil) → New version → Deploy
 *
 * RAZORPAY WEBHOOK (required for payment status update):
 *   Razorpay Dashboard → Settings → Webhooks → Add
 *   URL: your Apps Script /exec URL (same as form)
 *   Events: payment_link.paid, payment.captured
 *   Copy webhook secret → Apps Script → Project Settings → Script properties
 *     Key: RAZORPAY_WEBHOOK_SECRET  Value: <secret>
 *   (Secret is optional but recommended)
 *
 * WHATSAPP (pick one provider — set Script properties):
 *
 * A) Meta WhatsApp Cloud API (official)
 *    WHATSAPP_PROVIDER = meta
 *    WHATSAPP_TOKEN = <permanent access token>
 *    WHATSAPP_PHONE_NUMBER_ID = <phone number id>
 *    WHATSAPP_TEMPLATE_NAME = webinar_registration_confirm   (must be approved)
 *    WHATSAPP_TEMPLATE_LANG = en
 *
 * B) UltraMsg (quick for testing / small volume)
 *    WHATSAPP_PROVIDER = ultramsg
 *    WHATSAPP_INSTANCE_ID = instanceXXXXX
 *    WHATSAPP_TOKEN = <ultramsg token>
 */

const SHEET_NAME = "Registrations";
const EVENT_NAME = "AI Video Creation Webinar";
const WEBINAR_WHEN = "23rd August 2026 at 7:00 PM";

// Column indexes (1-based)
const COL = {
  TIMESTAMP: 1,
  FIRST: 2,
  LAST: 3,
  WHATSAPP: 4,
  EMAIL: 5,
  CITY: 6,
  CONSENT: 7,
  EVENT: 8,
  AMOUNT: 9,
  STATUS: 10,
  SOURCE: 11,
  PAYMENT_ID: 12,
  PAID_AT: 13,
  WA_SENT: 14,
};

function doPost(e) {
  try {
    const raw = (e && e.postData && e.postData.contents) || "{}";
    const data = JSON.parse(raw);

    // Razorpay webhook payloads include "event"
    if (data.event) {
      return handleRazorpayWebhook_(data, e);
    }

    // Manual / success-page confirmation
    if (data.action === "payment_success") {
      return handlePaymentSuccess_(data);
    }

    // Landing page registration
    return handleRegistration_(data);
  } catch (err) {
    return json_({ success: false, error: String(err) });
  }
}

function doGet() {
  return json_({
    ok: true,
    message: "IntefAI webinar endpoint is live (form + Razorpay webhook).",
  });
}

/* ========================= Registration ========================= */

function handleRegistration_(data) {
  const sheet = getOrCreateSheet_();

  sheet.appendRow([
    new Date(),
    data.firstName || "",
    data.lastName || "",
    normalizePhone_(data.whatsapp || ""),
    String(data.email || "")
      .trim()
      .toLowerCase(),
    data.city || "",
    data.consent === true || data.consent === "on" || data.consent === "true"
      ? "Yes"
      : "No",
    data.event || EVENT_NAME,
    data.amount || "9",
    "Pending Payment",
    data.source || "Landing Page",
    "",
    "",
    "No",
  ]);

  return json_({ success: true });
}

/* ========================= Razorpay webhook ========================= */

function handleRazorpayWebhook_(data, e) {
  const secret = getProp_("RAZORPAY_WEBHOOK_SECRET");
  if (secret) {
    const signature =
      (e && e.parameter && e.parameter["X-Razorpay-Signature"]) ||
      getHeader_(e, "X-Razorpay-Signature");
    // Apps Script web apps don't always expose headers reliably.
    // If signature header is present, verify; otherwise continue when hosted via /exec.
    if (signature) {
      const expected = Utilities.computeHmacSha256Signature(
        e.postData.contents,
        secret
      );
      const expectedHex = expected
        .map(function (b) {
          const v = (b < 0 ? b + 256 : b).toString(16);
          return v.length === 1 ? "0" + v : v;
        })
        .join("");
      if (expectedHex !== signature) {
        return json_({ success: false, error: "Invalid webhook signature" });
      }
    }
  }

  const event = data.event || "";
  if (
    event !== "payment_link.paid" &&
    event !== "payment.captured" &&
    event !== "order.paid"
  ) {
    return json_({ success: true, ignored: event });
  }

  const extracted = extractPaymentDetails_(data);
  const result = markPaidAndNotify_(extracted);
  return json_({ success: true, ...result });
}

function handlePaymentSuccess_(data) {
  const result = markPaidAndNotify_({
    email: data.email,
    phone: data.whatsapp || data.phone,
    name: data.name,
    paymentId: data.paymentId || data.razorpay_payment_id || "",
  });
  return json_({ success: true, ...result });
}

function extractPaymentDetails_(data) {
  const payload = data.payload || {};
  let email = "";
  let phone = "";
  let name = "";
  let paymentId = "";

  const paymentEntity =
    (payload.payment && payload.payment.entity) || payload.payment || null;
  const linkEntity =
    (payload.payment_link && payload.payment_link.entity) ||
    payload.payment_link ||
    null;

  if (paymentEntity) {
    paymentId = paymentEntity.id || paymentId;
    email = paymentEntity.email || email;
    phone = paymentEntity.contact || phone;
  }

  if (linkEntity) {
    const customer = linkEntity.customer || {};
    email = customer.email || email;
    phone = customer.contact || phone;
    name = customer.name || name;
    if (!paymentId && linkEntity.order_id) paymentId = String(linkEntity.order_id);
  }

  // Some payloads nest differently
  if (!email && payload.payment && payload.payment.entity) {
    email = payload.payment.entity.email || email;
  }

  return {
    email: String(email || "")
      .trim()
      .toLowerCase(),
    phone: normalizePhone_(phone || ""),
    name: name || "",
    paymentId: paymentId || "",
  };
}

function markPaidAndNotify_(info) {
  const sheet = getOrCreateSheet_();
  const row = findRegistrationRow_(sheet, info.email, info.phone);

  if (!row) {
    return {
      updated: false,
      whatsappSent: false,
      reason: "No matching Pending Payment row for email/phone",
      email: info.email,
      phone: info.phone,
    };
  }

  const firstName = String(sheet.getRange(row, COL.FIRST).getValue() || "");
  const lastName = String(sheet.getRange(row, COL.LAST).getValue() || "");
  const phone =
    normalizePhone_(info.phone) ||
    normalizePhone_(sheet.getRange(row, COL.WHATSAPP).getValue());
  const displayName =
    info.name || [firstName, lastName].filter(Boolean).join(" ").trim() || "there";

  sheet.getRange(row, COL.STATUS).setValue("Paid");
  if (info.paymentId) {
    sheet.getRange(row, COL.PAYMENT_ID).setValue(info.paymentId);
  }
  sheet.getRange(row, COL.PAID_AT).setValue(new Date());

  const wa = sendWhatsAppConfirmation_(phone, displayName);
  sheet.getRange(row, COL.WA_SENT).setValue(wa.sent ? "Yes" : "No: " + (wa.error || "failed"));

  return {
    updated: true,
    row: row,
    whatsappSent: wa.sent,
    whatsappError: wa.error || "",
  };
}

function findRegistrationRow_(sheet, email, phone) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return null;

  const values = sheet.getRange(2, 1, lastRow, COL.WA_SENT).getValues();
  const emailNorm = String(email || "")
    .trim()
    .toLowerCase();
  const phoneNorm = normalizePhone_(phone || "");

  // Prefer latest matching Pending row (scan from bottom)
  for (let i = values.length - 1; i >= 0; i--) {
    const rowEmail = String(values[i][COL.EMAIL - 1] || "")
      .trim()
      .toLowerCase();
    const rowPhone = normalizePhone_(values[i][COL.WHATSAPP - 1]);
    const status = String(values[i][COL.STATUS - 1] || "").trim();

    const emailMatch = emailNorm && rowEmail === emailNorm;
    const phoneMatch = phoneNorm && rowPhone && phonesMatch_(rowPhone, phoneNorm);

    if ((emailMatch || phoneMatch) && status.toLowerCase() !== "paid") {
      return i + 2;
    }
  }

  // Fallback: latest match even if already paid (idempotent update)
  for (let i = values.length - 1; i >= 0; i--) {
    const rowEmail = String(values[i][COL.EMAIL - 1] || "")
      .trim()
      .toLowerCase();
    const rowPhone = normalizePhone_(values[i][COL.WHATSAPP - 1]);
    const emailMatch = emailNorm && rowEmail === emailNorm;
    const phoneMatch = phoneNorm && rowPhone && phonesMatch_(rowPhone, phoneNorm);
    if (emailMatch || phoneMatch) return i + 2;
  }

  return null;
}

/* ========================= WhatsApp ========================= */

function sendWhatsAppConfirmation_(phone, name) {
  const provider = (getProp_("WHATSAPP_PROVIDER") || "").toLowerCase();
  if (!provider || provider === "none") {
    return {
      sent: false,
      error: "WhatsApp not configured (set WHATSAPP_PROVIDER in Script properties)",
    };
  }

  const to = toWhatsAppNumber_(phone);
  if (!to) return { sent: false, error: "Missing/invalid phone" };

  const message =
    "Hi " +
    name +
    "! ✅ Your payment of ₹9 is confirmed for *" +
    EVENT_NAME +
    "*.\n\n" +
    "📅 " +
    WEBINAR_WHEN +
    "\n💻 Live Online\n\n" +
    "Thank you for registering with IntefAI Academy. We will share the joining link before the session.";

  try {
    if (provider === "meta") {
      return sendWhatsAppMeta_(to, name, message);
    }
    if (provider === "ultramsg") {
      return sendWhatsAppUltramsg_(to, message);
    }
    return { sent: false, error: "Unknown WHATSAPP_PROVIDER: " + provider };
  } catch (err) {
    return { sent: false, error: String(err) };
  }
}

function sendWhatsAppMeta_(to, name, fallbackText) {
  const token = getProp_("WHATSAPP_TOKEN");
  const phoneNumberId = getProp_("WHATSAPP_PHONE_NUMBER_ID");
  const template = getProp_("WHATSAPP_TEMPLATE_NAME");
  const lang = getProp_("WHATSAPP_TEMPLATE_LANG") || "en";

  if (!token || !phoneNumberId) {
    return { sent: false, error: "Missing WHATSAPP_TOKEN or WHATSAPP_PHONE_NUMBER_ID" };
  }

  const url =
    "https://graph.facebook.com/v19.0/" + phoneNumberId + "/messages";

  let payload;
  if (template) {
    // Template must be approved in Meta Business Manager.
    // Expected body vars: {{1}}=name {{2}}=event {{3}}=when
    payload = {
      messaging_product: "whatsapp",
      to: to,
      type: "template",
      template: {
        name: template,
        language: { code: lang },
        components: [
          {
            type: "body",
            parameters: [
              { type: "text", text: name || "there" },
              { type: "text", text: EVENT_NAME },
              { type: "text", text: WEBINAR_WHEN },
            ],
          },
        ],
      },
    };
  } else {
    // Works only inside 24h customer-care window
    payload = {
      messaging_product: "whatsapp",
      to: to,
      type: "text",
      text: { body: fallbackText },
    };
  }

  const res = UrlFetchApp.fetch(url, {
    method: "post",
    contentType: "application/json",
    headers: { Authorization: "Bearer " + token },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  });

  const code = res.getResponseCode();
  if (code >= 200 && code < 300) return { sent: true };

  return { sent: false, error: "Meta API " + code + ": " + res.getContentText() };
}

function sendWhatsAppUltramsg_(to, message) {
  const instanceId = getProp_("WHATSAPP_INSTANCE_ID");
  const token = getProp_("WHATSAPP_TOKEN");
  if (!instanceId || !token) {
    return { sent: false, error: "Missing WHATSAPP_INSTANCE_ID or WHATSAPP_TOKEN" };
  }

  const url = "https://api.ultramsg.com/" + instanceId + "/messages/chat";
  const res = UrlFetchApp.fetch(url, {
    method: "post",
    contentType: "application/x-www-form-urlencoded",
    payload: {
      token: token,
      to: to,
      body: message,
    },
    muteHttpExceptions: true,
  });

  const code = res.getResponseCode();
  if (code >= 200 && code < 300) return { sent: true };
  return { sent: false, error: "UltraMsg " + code + ": " + res.getContentText() };
}

/* ========================= Sheet helpers ========================= */

function getOrCreateSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);

  if (!sheet) sheet = ss.insertSheet(SHEET_NAME);

  const headers = [
    "Timestamp",
    "First Name",
    "Last Name",
    "WhatsApp",
    "Email",
    "City",
    "Consent",
    "Event",
    "Amount (INR)",
    "Payment Status",
    "Source",
    "Payment ID",
    "Paid At",
    "WhatsApp Sent",
  ];

  if (sheet.getLastRow() === 0) {
    sheet.appendRow(headers);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight("bold");
    sheet.setFrozenRows(1);
  } else {
    // Ensure new columns exist on older sheets
    const lastCol = sheet.getLastColumn();
    if (lastCol < headers.length) {
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      sheet.getRange(1, 1, 1, headers.length).setFontWeight("bold");
    }
  }

  return sheet;
}

function normalizePhone_(value) {
  let digits = String(value || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.length === 10) digits = "91" + digits;
  if (digits.length === 11 && digits.charAt(0) === "0") {
    digits = "91" + digits.slice(1);
  }
  return digits;
}

function phonesMatch_(a, b) {
  if (!a || !b) return false;
  return a === b || a.slice(-10) === b.slice(-10);
}

function toWhatsAppNumber_(phone) {
  const n = normalizePhone_(phone);
  return n || "";
}

function getProp_(key) {
  return PropertiesService.getScriptProperties().getProperty(key) || "";
}

function getHeader_(e, name) {
  try {
    if (!e || !e.headers) return "";
    // headers may be case-sensitive depending on runtime
    return (
      e.headers[name] ||
      e.headers[name.toLowerCase()] ||
      e.headers[String(name).toUpperCase()] ||
      ""
    );
  } catch (err) {
    return "";
  }
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON
  );
}

/**
 * Manual test from Apps Script editor:
 *   testMarkPaid()
 * Edit email/phone to match a Pending row in your sheet.
 */
function testMarkPaid() {
  const result = markPaidAndNotify_({
    email: "test@example.com",
    phone: "9999999999",
    name: "Test User",
    paymentId: "pay_test_123",
  });
  Logger.log(result);
}
