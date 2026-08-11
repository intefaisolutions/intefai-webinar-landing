(function () {
  const form = document.getElementById("lead-form");
  const statusEl = document.getElementById("form-status");
  const submitBtn = document.getElementById("register-btn");
  const STORAGE_KEY = "intefai_lead_form";

  if (!form || !submitBtn) {
    console.error("Form or register button not found");
    return;
  }

  form.setAttribute("action", "javascript:void(0)");
  form.addEventListener("submit", function (e) {
    e.preventDefault();
    e.stopPropagation();
    startRegistration();
  });

  submitBtn.addEventListener("click", function (e) {
    e.preventDefault();
    e.stopPropagation();
    startRegistration();
  });

  restoreForm();
  form.addEventListener("input", persistForm);

  function cfg() {
    return window.INTEFAI_CONFIG || {};
  }

  function setStatus(message, isError) {
    if (!statusEl) return;
    statusEl.hidden = false;
    statusEl.textContent = message;
    statusEl.style.color = isError ? "#c62828" : "#1a365d";
  }

  function setLoading(loading) {
    submitBtn.disabled = loading;
    submitBtn.textContent = loading ? "Please wait…" : "Register now for ₹9";
  }

  function persistForm() {
    const data = Object.fromEntries(new FormData(form).entries());
    data.consent = Boolean(form.consent && form.consent.checked);
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      sessionStorage.setItem(
        "intefai_lead",
        JSON.stringify({
          firstName: data.firstName || "",
          lastName: data.lastName || "",
          email: data.email || "",
          whatsapp: data.whatsapp || "",
        })
      );
    } catch (err) {
      console.warn(err);
    }
  }

  function restoreForm() {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const data = JSON.parse(raw);
      ["firstName", "lastName", "whatsapp", "email", "city"].forEach(function (name) {
        if (form.elements[name] && data[name]) {
          form.elements[name].value = data[name];
        }
      });
      if (form.consent) form.consent.checked = Boolean(data.consent);
    } catch (err) {
      console.warn(err);
    }
  }

  function normalizeContact(value) {
    const digits = String(value || "").replace(/\D/g, "");
    if (!digits) return "";
    if (digits.length === 10) return digits;
    if (digits.length === 12 && digits.indexOf("91") === 0) return digits.slice(2);
    return digits;
  }

  function saveLeadBeacon(payload) {
    const url = cfg().GOOGLE_SCRIPT_URL;
    if (!url) return;

    const body = JSON.stringify(payload);
    try {
      if (navigator.sendBeacon) {
        const blob = new Blob([body], { type: "text/plain;charset=utf-8" });
        navigator.sendBeacon(url, blob);
        return;
      }
    } catch (err) {
      console.warn(err);
    }

    fetch(url, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: body,
      keepalive: true,
      mode: "no-cors",
    }).catch(function () {});
  }

  function buildPaymentLinkUrl(baseUrl, data) {
    const url = new URL(baseUrl);
    if (data.email) url.searchParams.set("prefill[email]", data.email);
    const contact = normalizeContact(data.whatsapp);
    if (contact) url.searchParams.set("prefill[contact]", contact);
    const name = [data.firstName, data.lastName].filter(Boolean).join(" ").trim();
    if (name) url.searchParams.set("prefill[name]", name);
    return url.toString();
  }

  /**
   * IMPORTANT:
   * Do NOT open Razorpay Checkout without order_id.
   * UPI QR can charge the customer but the modal stays stuck
   * and success callback never fires (double-pay risk).
   * Payment Link redirect is reliable; after pay Razorpay can
   * send user to PAYMENT_SUCCESS_URL if configured on the link.
   */
  async function startRegistration() {
    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }

    const conf = cfg();
    if (!conf.GOOGLE_SCRIPT_URL) {
      setStatus("Registration server URL missing.", true);
      return;
    }
    if (!conf.RAZORPAY_PAYMENT_LINK) {
      setStatus("Razorpay payment link missing in config.js", true);
      return;
    }

    const data = Object.fromEntries(new FormData(form).entries());
    persistForm();

    const payload = {
      ...data,
      consent: Boolean(form.consent && form.consent.checked),
      event: "AI Video Creation Webinar",
      amount: "9",
      source: "Landing Page",
      submittedAt: new Date().toISOString(),
      skipOrder: true,
    };

    setLoading(true);
    setStatus("Saving details & redirecting to Razorpay…");

    saveLeadBeacon(payload);

    // Small delay so beacon can leave before navigation
    await new Promise(function (r) {
      setTimeout(r, 250);
    });

    window.location.href = buildPaymentLinkUrl(conf.RAZORPAY_PAYMENT_LINK, data);
  }
})();
