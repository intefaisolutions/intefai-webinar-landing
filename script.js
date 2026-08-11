const form = document.getElementById("lead-form");
const statusEl = document.getElementById("form-status");
const submitBtn = form?.querySelector('button[type="submit"]');

function isConfigured() {
  const cfg = window.INTEFAI_CONFIG || {};
  const scriptOk =
    cfg.GOOGLE_SCRIPT_URL &&
    !cfg.GOOGLE_SCRIPT_URL.includes("PASTE_YOUR_");
  const payOk =
    cfg.RAZORPAY_PAYMENT_LINK &&
    !cfg.RAZORPAY_PAYMENT_LINK.includes("PASTE_YOUR_");
  return { scriptOk, payOk, cfg };
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

async function saveToGoogleSheet(payload, scriptUrl) {
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
    throw new Error("Could not save registration. Please try again.");
  }

  if (result && result.success === false) {
    throw new Error(result.error || "Could not save registration.");
  }

  return result || { success: true };
}

function buildRazorpayUrl(baseUrl, data) {
  const url = new URL(baseUrl);
  if (data.email) url.searchParams.set("prefill[email]", data.email);
  if (data.whatsapp) url.searchParams.set("prefill[contact]", data.whatsapp);
  const name = [data.firstName, data.lastName].filter(Boolean).join(" ").trim();
  if (name) url.searchParams.set("prefill[name]", name);
  return url.toString();
}

form?.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!form.checkValidity()) {
    form.reportValidity();
    return;
  }

  const { scriptOk, payOk, cfg } = isConfigured();

  if (!scriptOk || !payOk) {
    setStatus(
      "Setup incomplete: add your Google Apps Script URL and Razorpay Payment Link in config.js",
      true
    );
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
  setStatus("Saving your details…");

  try {
    await saveToGoogleSheet(payload, cfg.GOOGLE_SCRIPT_URL);

    // Used by payment-success.html after Razorpay redirect
    sessionStorage.setItem(
      "intefai_lead",
      JSON.stringify({
        firstName: formData.firstName || "",
        lastName: formData.lastName || "",
        email: formData.email || "",
        whatsapp: formData.whatsapp || "",
      })
    );

    setStatus("Details saved. Redirecting to secure payment…");
    const paymentUrl = buildRazorpayUrl(cfg.RAZORPAY_PAYMENT_LINK, formData);
    window.location.href = paymentUrl;
  } catch (err) {
    console.error(err);
    setStatus(
      err.message || "Something went wrong. Please try again.",
      true
    );
    setLoading(false);
  }
});
