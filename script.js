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
        "Server response invalid. Redeploy Apps Script as Web app (Anyone). Raw: " +
          String(text).slice(0, 120)
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
      event: "AI Video Creation Webinar",
      amount: "9",
      source: "Landing Page",
      submittedAt: new Date().toISOString(),
    };

    setLoading(true);
    setStatus(
      "Creating your secure payment link… please wait (may take 15–40 seconds)."
    );

    try {
      const result = await createRegistration(payload);

      if (!result.paymentLink) {
        throw new Error(
          "Old Apps Script still deployed (no paymentLink in response). " +
            "Open Apps Script → paste latest Code.gs from the project → Save → " +
            "Deploy → Manage deployments → Edit → New version → Deploy. " +
            "Also set Script properties: RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET."
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
