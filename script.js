const form = document.getElementById("lead-form");
const statusEl = document.getElementById("form-status");
const submitBtn = form?.querySelector('button[type="submit"]');

function isConfigured() {
  const cfg = window.INTEFAI_CONFIG || {};
  const scriptOk =
    cfg.GOOGLE_SCRIPT_URL &&
    !String(cfg.GOOGLE_SCRIPT_URL).includes("PASTE_YOUR_");
  const keyOk = Boolean(cfg.RAZORPAY_KEY_ID);
  return { scriptOk, keyOk, cfg };
}

function setStatus(message, isError = false) {
  if (!statusEl) return;
  statusEl.hidden = false;
  statusEl.textContent = message;
  statusEl.style.color = isError ? "#c62828" : "";
}

function setLoading(loading) {
  if (!submitBtn) return;
  submitBtn.disabled = loading;
  submitBtn.textContent = loading
    ? "Please wait…"
    : "Register now for ₹9";
}

async function postToAppsScript(payload, scriptUrl) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 45000);

  try {
    const response = await fetch(scriptUrl, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    const text = await response.text();
    let result = null;
    try {
      result = JSON.parse(text);
    } catch {
      if (response.ok) return { success: true };
      throw new Error("Could not reach registration server. Please try again.");
    }

    if (result && result.success === false) {
      throw new Error(result.error || "Registration failed.");
    }

    return result || { success: true };
  } finally {
    clearTimeout(timer);
  }
}

function openRazorpayCheckout(cfg, formData) {
  return new Promise((resolve, reject) => {
    if (typeof Razorpay === "undefined") {
      reject(new Error("Razorpay SDK failed to load. Please refresh and try again."));
      return;
    }

    const name = [formData.firstName, formData.lastName]
      .filter(Boolean)
      .join(" ")
      .trim();
    const amount = Number(cfg.RAZORPAY_AMOUNT_PAISE || 900);

    const options = {
      key: cfg.RAZORPAY_KEY_ID,
      amount: amount,
      currency: "INR",
      name: "IntefAI Academy",
      description: "AI Video Creation Webinar — ₹" + Math.round(amount / 100),
      prefill: {
        name: name,
        email: formData.email || "",
        contact: formData.whatsapp || "",
      },
      notes: {
        event: "AI Video Creation Webinar",
        email: formData.email || "",
        whatsapp: formData.whatsapp || "",
        firstName: formData.firstName || "",
        lastName: formData.lastName || "",
        city: formData.city || "",
      },
      theme: { color: "#e11d8a" },
      modal: {
        ondismiss: function () {
          reject(new Error("Payment cancelled. You can try again anytime."));
        },
      },
      handler: function (response) {
        // Fire-and-forget sheet update (Apps Script is slow; don't block redirect)
        postToAppsScript(
          {
            action: "payment_success",
            email: formData.email || "",
            whatsapp: formData.whatsapp || "",
            name: name,
            paymentId: response.razorpay_payment_id || "",
            orderId: response.razorpay_order_id || "",
          },
          cfg.GOOGLE_SCRIPT_URL
        ).catch(function (err) {
          console.warn("Sheet update after payment failed:", err);
        });
        resolve(response);
      },
    };

    const checkout = new Razorpay(options);
    checkout.on("payment.failed", function (resp) {
      const desc =
        resp?.error?.description ||
        "Payment failed. Please try again with another method.";
      reject(new Error(desc));
    });
    checkout.open();
  });
}

form?.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!form.checkValidity()) {
    form.reportValidity();
    return;
  }

  const { scriptOk, keyOk, cfg } = isConfigured();

  if (!keyOk) {
    setStatus("Razorpay Key ID missing in config.js", true);
    return;
  }
  if (!scriptOk) {
    setStatus("Google Apps Script URL missing in config.js", true);
    return;
  }

  const formData = Object.fromEntries(new FormData(form).entries());
  const payload = {
    ...formData,
    consent: Boolean(form.consent?.checked),
    event: "AI Video Creation Webinar",
    amount: "9",
    source: "Landing Page",
    submittedAt: new Date().toISOString(),
    // Skip server-side Razorpay order (slow). Checkout uses public Key ID.
    skipOrder: true,
  };

  setLoading(true);
  setStatus("Opening secure payment…");

  sessionStorage.setItem(
    "intefai_lead",
    JSON.stringify({
      firstName: formData.firstName || "",
      lastName: formData.lastName || "",
      email: formData.email || "",
      whatsapp: formData.whatsapp || "",
    })
  );

  // Save lead in background — do not wait ~20–30s before opening Razorpay
  const savePromise = postToAppsScript(payload, cfg.GOOGLE_SCRIPT_URL).catch(
    function (err) {
      console.warn("Lead save delayed/failed:", err);
      return null;
    }
  );

  try {
    await openRazorpayCheckout(cfg, formData);
    setStatus("Payment successful! Redirecting…");
    // Give background save a brief moment, then redirect
    await Promise.race([
      savePromise,
      new Promise(function (r) {
        setTimeout(r, 1500);
      }),
    ]);
    window.location.href = cfg.PAYMENT_SUCCESS_URL || "payment-success.html";
  } catch (err) {
    console.error(err);
    setStatus(err.message || "Something went wrong. Please try again.", true);
    setLoading(false);
  }
});
