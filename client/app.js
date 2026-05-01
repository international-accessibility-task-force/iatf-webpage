document.querySelectorAll("[data-lang-switcher]").forEach((switcher) => {
  const input = switcher.querySelector("[data-lang-search-input]");
  const items = switcher.querySelectorAll("[data-lang-search]");
  const empty = switcher.querySelector("[data-lang-empty]");
  if (!input || !items.length) return;

  const filter = () => {
    const q = input.value.trim().toLowerCase();
    let visible = 0;
    items.forEach((li) => {
      const match = !q || li.dataset.langSearch.includes(q);
      li.hidden = !match;
      if (match) visible++;
    });
    if (empty) empty.hidden = visible !== 0;
  };

  input.addEventListener("input", filter);
  switcher.addEventListener("toggle", () => {
    if (switcher.open) {
      input.value = "";
      filter();
      input.focus();
    }
  });
});

let turnstileScriptPromise;
const form = document.querySelector("[data-proposal-form]");

if (form) {
  const fieldOrder = [
    "requester",
    "contactRoute",
    "language",
    "projectTitle",
    "problem",
    "affectedUsers",
    "whyItMatters",
    "softwareIdea",
    "references",
    "urgency",
    "openSourceConsent"
  ];
  const submitButton = form.querySelector('button[type="submit"]');
  const turnstileRoot = form.querySelector("[data-turnstile-root]");
  const formNote = form.querySelector("[data-form-note]");
  const formStatus = form.querySelector("[data-form-status]");
  const submitLabel = submitButton?.textContent?.trim() || "Send request";
  const loadingProtectionMessage =
    form.dataset.formLoadingProtection || "Loading spam protection...";
  const runtimeUnavailableMessage =
    form.dataset.formRuntimeUnavailable ||
    "Live submission is not configured in this environment. This form will open your email client instead.";
  const turnstileRequiredMessage =
    form.dataset.formTurnstileRequired ||
    "Please complete the spam protection check before sending.";
  const requiredMessage =
    form.dataset.formRequiredMessage ||
    "Please complete the required fields before sending.";
  const successMessage =
    form.dataset.formSuccess ||
    "Thanks. Your request was received and will be reviewed.";
  const genericErrorMessage =
    form.dataset.formErrorGeneric ||
    "Something went wrong while sending the request. You can try again or use email instead.";
  const submittingMessage =
    form.dataset.formSubmitting || "Sending request...";
  let mode = "initializing";
  let requiredFields = [];
  let turnstileToken = "";
  let widgetId = null;

  const getFieldLabel = (fieldName) =>
    form.querySelector(`label[for="${fieldName}"]`)?.textContent?.trim() || fieldName;

  const buildMarkdown = () => {
    const data = new FormData(form);
    const sections = fieldOrder.map((fieldName) => [
      getFieldLabel(fieldName),
      data.get(fieldName)
    ]);

    return sections
      .map(([label, value]) => `## ${label}\n\n${String(value || "").trim() || "_"}`)
      .join("\n\n");
  };

  const clearStatus = () => {
    if (!formStatus) return;
    formStatus.hidden = true;
    formStatus.textContent = "";
    formStatus.className = "form-status";
    formStatus.setAttribute("role", "status");
  };

  const setStatus = (kind, message) => {
    if (!formStatus) return;
    formStatus.hidden = !message;
    formStatus.textContent = message || "";
    formStatus.className = kind ? `form-status form-status--${kind}` : "form-status";
    formStatus.setAttribute("role", kind === "error" ? "alert" : "status");
  };

  const setNote = (message) => {
    if (!formNote) return;
    formNote.hidden = !message;
    formNote.textContent = message || "";
  };

  const setSubmitting = (isSubmitting) => {
    if (!submitButton) return;
    submitButton.disabled = isSubmitting || mode === "initializing";
    submitButton.textContent = isSubmitting ? submittingMessage : submitLabel;
  };

  const buildMailtoUrl = () => {
    const data = new FormData(form);
    const requestsEmail =
      form.dataset.requestsEmail || form.dataset.projectsEmail;
    const subjectPrefix = form.dataset.proposalSubjectPrefix || "IATF request";
    const untitledLabel =
      form.dataset.proposalSubjectUntitled || "Untitled request";
    const projectTitle =
      String(data.get("projectTitle") || untitledLabel).trim() || untitledLabel;
    const subject = encodeURIComponent(
      `[${subjectPrefix}] ${projectTitle}`
    );
    const body = encodeURIComponent(buildMarkdown());
    return `mailto:${requestsEmail}?subject=${subject}&body=${body}`;
  };

  const collectPayload = () => {
    const data = new FormData(form);
    return {
      requester: String(data.get("requester") || "").trim(),
      contactRoute: String(data.get("contactRoute") || "").trim(),
      language: String(data.get("language") || "").trim(),
      projectTitle: String(data.get("projectTitle") || "").trim(),
      problem: String(data.get("problem") || "").trim(),
      affectedUsers: String(data.get("affectedUsers") || "").trim(),
      whyItMatters: String(data.get("whyItMatters") || "").trim(),
      softwareIdea: String(data.get("softwareIdea") || "").trim(),
      references: String(data.get("references") || "").trim(),
      urgency: String(data.get("urgency") || "").trim(),
      openSourceConsent: String(data.get("openSourceConsent") || "").trim(),
      pageUrl: window.location.href,
      turnstileToken
    };
  };

  const fallbackToMailto = (message = runtimeUnavailableMessage) => {
    mode = "mailto";
    requiredFields = [];
    turnstileToken = "";
    if (turnstileRoot) {
      turnstileRoot.hidden = true;
      turnstileRoot.innerHTML = "";
    }
    setNote(message);
    clearStatus();
    setSubmitting(false);
  };

  const enableApiMode = async (config) => {
    mode = "api";
    requiredFields = Array.isArray(config.requiredFields)
      ? config.requiredFields
      : [];
    setNote("");

    if (!turnstileRoot || !config.turnstileSiteKey) {
      fallbackToMailto();
      return;
    }

    turnstileRoot.hidden = false;
    const turnstile = await loadTurnstileScript();
    widgetId = turnstile.render(turnstileRoot, {
      sitekey: config.turnstileSiteKey,
      callback(token) {
        turnstileToken = token;
        clearStatus();
      },
      "expired-callback"() {
        turnstileToken = "";
      },
      "error-callback"() {
        turnstileToken = "";
        setStatus("error", genericErrorMessage);
      }
    });

    setSubmitting(false);
  };

  const initializeForm = async () => {
    setNote(loadingProtectionMessage);
    setSubmitting(true);

    try {
      const response = await fetch(
        form.dataset.formConfigEndpoint || "/api/request-config",
        {
          headers: {
            Accept: "application/json"
          }
        }
      );

      if (!response.ok) {
        throw new Error("Config unavailable");
      }

      const config = await response.json();
      if (config.submissionMode === "api" && config.turnstileSiteKey) {
        await enableApiMode(config);
        return;
      }

      fallbackToMailto();
    } catch {
      fallbackToMailto();
    }
  };

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearStatus();

    if (mode === "initializing") return;

    if (mode === "mailto") {
      window.location.href = buildMailtoUrl();
      return;
    }

    const payload = collectPayload();
    const missingFields = requiredFields.filter(
      (fieldName) => !String(payload[fieldName] || "").trim()
    );

    if (missingFields.length > 0) {
      setStatus("error", requiredMessage);
      return;
    }

    if (!turnstileToken) {
      setStatus("error", turnstileRequiredMessage);
      return;
    }

    setSubmitting(true);

    try {
      const response = await fetch(
        form.dataset.formSubmitEndpoint || "/api/request",
        {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json"
          },
          body: JSON.stringify(payload)
        }
      );

      const result = await response
        .json()
        .catch(() => ({ error: genericErrorMessage }));

      if (!response.ok) {
        throw new Error(result.error || genericErrorMessage);
      }

      form.reset();
      turnstileToken = "";
      if (window.turnstile && widgetId !== null) {
        window.turnstile.reset(widgetId);
      }
      setStatus("success", result.message || successMessage);
    } catch (error) {
      setStatus("error", error.message || genericErrorMessage);
    } finally {
      setSubmitting(false);
    }
  });

  initializeForm();
}

function loadTurnstileScript() {
  if (window.turnstile) {
    return Promise.resolve(window.turnstile);
  }

  if (turnstileScriptPromise) {
    return turnstileScriptPromise;
  }

  turnstileScriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector(
      'script[src^="https://challenges.cloudflare.com/turnstile/v0/api.js"]'
    );

    if (existing) {
      existing.addEventListener("load", () => resolve(window.turnstile), {
        once: true
      });
      existing.addEventListener(
        "error",
        () => reject(new Error("Turnstile script failed to load.")),
        { once: true }
      );
      return;
    }

    const script = document.createElement("script");
    script.src =
      "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    script.async = true;
    script.defer = true;
    script.onload = () => resolve(window.turnstile);
    script.onerror = () =>
      reject(new Error("Turnstile script failed to load."));
    document.head.appendChild(script);
  });

  return turnstileScriptPromise;
}
