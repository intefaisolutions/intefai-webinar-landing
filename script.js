const form = document.getElementById("lead-form");
const statusEl = document.getElementById("form-status");
const submitBtn = form?.querySelector('button[type="submit"]');

function isConfigured() {
  const cfg = window.INTEFAI_CONFIG || {};
  const scriptOk =
    cfg.GOOGLE_SCRIPT_URL &&
    !String(cfg.GOOGLE_SCRIPT_URL).includes("PASTE_YOUR_");
  return { scriptOk, cfg };
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
  const response = await fetch(scriptUrl, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(payload),
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
}

function openRazorpayCheckout(rzp, formData, cfg) {
  return new Promise((resolve, reject) => {
    if (typeof Razorpay === "undefined") {
      reject(new Error("Razorpay SDK failed to load. Please refresh and try again."));
      return;
    }

    const name = [formData.firstName, formData.lastName]
      .filter(Boolean)
      .join(" ")
      .trim();

    const options = {
      key: rzp.keyId,
      amount: rzp.amount,
      currency: rzp.currency || "INR",
      name: rzp.name || "IntefAI Academy",
      description: rzp.description || "AI Video Creation Webinar",
      order_id: rzp.orderId,
      prefill: {
        name: name,
        email: formData.email || "",
        contact: formData.whatsapp || "",
      },
      notes: {
        event: "AI Video Creation Webinar",
        email: formData.email || "",
        whatsapp: formData.whatsapp || "",
      },
      theme: { color: "#e11d8a" },
      modal: {
        ondismiss: function () {
          reject(new Error("Payment cancelled. You can try again anytime."));
        },
      },
      handler: async function (response) {
        try {
          await postToAppsScript(
            {
              action: "payment_success",
              email: formData.email || "",
              whatsapp: formData.whatsapp || "",
              name: name,
              paymentId: response.razorpay_payment_id || "",
              orderId: response.razorpay_order_id || rzp.orderId || "",
            },
            cfg.GOOGLE_SCRIPT_URL
          );
        } catch (err) {
          console.warn("Sheet update after payment failed:", err);
        }
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

  const { scriptOk, cfg } = isConfigured();

  if (!scriptOk) {
    setStatus("Setup incomplete: Google Apps Script URL missing in config.js", true);
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
  };

  setLoading(true);
  setStatus("Saving your details and opening payment…");

  try {
    const result = await postToAppsScript(payload, cfg.GOOGLE_SCRIPT_URL);

    if (!result.razorpay || !result.razorpay.orderId || !result.razorpay.keyId) {
      throw new Error(
        "Razorpay order not created. Add RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in Apps Script properties, then redeploy."
      );
    }

    sessionStorage.setItem(
      "intefai_lead",
      JSON.stringify({
        firstName: formData.firstName || "",
        lastName: formData.lastName || "",
        email: formData.email || "",
        whatsapp: formData.whatsapp || "",
      })
    );

    setStatus("Complete your ₹9 payment in the secure Razorpay window…");
    await openRazorpayCheckout(result.razorpay, formData, cfg);

    setStatus("Payment successful! Redirecting…");
    const successUrl =
      cfg.PAYMENT_SUCCESS_URL ||
      "payment-success.html";
    window.location.href = successUrl;
  } catch (err) {
    console.error(err);
    setStatus(err.message || "Something went wrong. Please try again.", true);
    setLoading(false);
  }
});
