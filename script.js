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

  // Warm Apps Script in background (helps only for slow/dynamic mode)
  try {
    const conf = window.INTEFAI_CONFIG || {};
    if (conf.GOOGLE_SCRIPT_URL && conf.USE_FAST_PAYMENT === false) {
      fetch(conf.GOOGLE_SCRIPT_URL, { method: "GET", mode: "no-cors" }).catch(
        function () {}
      );
    }
  } catch (err) {}

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

  function buildPaymentLinkUrl(baseUrl, data) {
    const url = new URL(baseUrl);
    if (data.email) url.searchParams.set("prefill[email]", data.email);
    const contact = normalizeContact(data.whatsapp);
    if (contact) url.searchParams.set("prefill[contact]", contact);
    const name = [data.firstName, data.lastName].filter(Boolean).join(" ").trim();
    if (name) url.searchParams.set("prefill[name]", name);
    return url.toString();
  }

  function saveLeadFast(payload) {
    const url = cfg().GOOGLE_SCRIPT_URL;
    if (!url) return;
    const body = JSON.stringify(payload);
    try {
      if (navigator.sendBeacon) {
        navigator.sendBeacon(url, new Blob([body], { type: "text/plain;charset=utf-8" }));
        return;
      }
    } catch (err) {}
    fetch(url, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: body,
      keepalive: true,
      mode: "no-cors",
    }).catch(function () {});
  }

  async function createRegistration(payload) {
    const response = await fetch(cfg().GOOGLE_SCRIPT_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(payload),
    });
    const text = await response.text();
    let result;
    try {
      result = JSON.parse(text);
    } catch (err) {
      throw new Error(
        "Server response invalid. Redeploy Apps Script as Web app (Anyone)."
      );
    }
    if (!result || result.success === false) {
      throw new Error((result && result.error) || "Registration failed.");
    }
    return result;
  }

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

    const data = Object.fromEntries(new FormData(form).entries());
    persistForm();

    const payload = {
      ...data,
      consent: Boolean(form.consent && form.consent.checked),
      eventName: "AI Video Creation Webinar",
      amount: "9",
      source: "Landing Page",
      submittedAt: new Date().toISOString(),
    };

    setLoading(true);

    // FAST MODE (default): save lead in background + open master payment link instantly
    const useFast = conf.USE_FAST_PAYMENT !== false;
    if (useFast && conf.RAZORPAY_PAYMENT_LINK) {
      setStatus("Redirecting to Razorpay…");
      saveLeadFast(Object.assign({}, payload, { fastSave: true, skipPaymentLink: true }));
      await new Promise(function (r) {
        setTimeout(r, 200);
      });
      window.location.href = buildPaymentLinkUrl(conf.RAZORPAY_PAYMENT_LINK, data);
      return;
    }

    // SLOW MODE: create a fresh Payment Link via Apps Script (15–40s)
    setStatus(
      "Creating your secure payment link… please wait (may take 15–40 seconds)."
    );

    try {
      const result = await createRegistration(payload);
      if (!result.paymentLink) {
        throw new Error(
          "Payment link missing in response. Redeploy latest Code.gs or enable USE_FAST_PAYMENT with RAZORPAY_PAYMENT_LINK."
        );
      }
      setStatus("Redirecting to Razorpay…");
      window.location.href = result.paymentLink;
    } catch (err) {
      console.error(err);
      setStatus(err.message || "Something went wrong. Please try again.", true);
      setLoading(false);
    }
  }
})();
