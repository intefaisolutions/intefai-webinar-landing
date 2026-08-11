(function () {
  const form = document.getElementById("lead-form");
  const statusEl = document.getElementById("form-status");
  const submitBtn = document.getElementById("register-btn");
  const STORAGE_KEY = "intefai_lead_form";

  if (!form || !submitBtn) {
    console.error("Form or register button not found");
    return;
  }

  // Stop native submit/reload (this was clearing filled details)
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

  // Keep typed details even if page reloads
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
        if (form.elements[name] && data[name]) form.elements[name].value = data[name];
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

    // Fallback: don't block UI
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

  function openCheckoutOrLink(data) {
    const conf = cfg();
    const amount = Number(conf.RAZORPAY_AMOUNT_PAISE || 900);
    const name = [data.firstName, data.lastName].filter(Boolean).join(" ").trim();
    const contact = normalizeContact(data.whatsapp);

    // Prefer Checkout if SDK + key are available
    if (typeof Razorpay !== "undefined" && conf.RAZORPAY_KEY_ID) {
      try {
        return new Promise(function (resolve, reject) {
          const options = {
            key: conf.RAZORPAY_KEY_ID,
            amount: amount,
            currency: "INR",
            name: "IntefAI Academy",
            description: "AI Video Creation Webinar",
            prefill: {
              name: name,
              email: data.email || "",
              contact: contact,
            },
            notes: {
              event: "AI Video Creation Webinar",
              email: data.email || "",
              whatsapp: data.whatsapp || "",
              firstName: data.firstName || "",
              lastName: data.lastName || "",
              city: data.city || "",
            },
            theme: { color: "#e11d8a" },
            modal: {
              ondismiss: function () {
                reject(new Error("Payment window closed. Your details are saved — click Register again."));
              },
            },
            handler: function (response) {
              saveLeadBeacon({
                action: "payment_success",
                email: data.email || "",
                whatsapp: data.whatsapp || "",
                name: name,
                paymentId: response.razorpay_payment_id || "",
                orderId: response.razorpay_order_id || "",
                skipOrder: true,
              });
              resolve(response);
            },
          };

          const rzp = new Razorpay(options);
          rzp.on("payment.failed", function (resp) {
            reject(
              new Error(
                (resp && resp.error && resp.error.description) ||
                  "Payment failed. Please try again."
              )
            );
          });
          rzp.open();
        });
      } catch (err) {
        console.warn("Checkout failed, falling back to payment link", err);
      }
    }

    // Reliable fallback: Payment Link (supports many payers if enabled in Razorpay)
    if (conf.RAZORPAY_PAYMENT_LINK) {
      const link = buildPaymentLinkUrl(conf.RAZORPAY_PAYMENT_LINK, data);
      window.location.href = link;
      return Promise.resolve({ redirected: true });
    }

    return Promise.reject(
      new Error("Payment is not configured. Please contact IntefAI Academy.")
    );
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
    if (!conf.RAZORPAY_KEY_ID && !conf.RAZORPAY_PAYMENT_LINK) {
      setStatus("Razorpay is not configured.", true);
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
    setStatus("Opening secure payment…");

    // Save lead without waiting (Apps Script is slow)
    saveLeadBeacon(payload);

    try {
      const result = await openCheckoutOrLink(data);
      if (result && result.redirected) return; // navigated to payment link

      setStatus("Payment successful! Redirecting…");
      window.location.href =
        conf.PAYMENT_SUCCESS_URL || "payment-success.html";
    } catch (err) {
      console.error(err);
      // If Checkout fails, try Payment Link once
      if (conf.RAZORPAY_PAYMENT_LINK) {
        setStatus("Opening Razorpay payment link…");
        window.location.href = buildPaymentLinkUrl(conf.RAZORPAY_PAYMENT_LINK, data);
        return;
      }
      setStatus(err.message || "Something went wrong. Please try again.", true);
      setLoading(false);
    }
  }
})();
