document.querySelectorAll("[data-lang-switcher]").forEach((switcher) => {
  const input = switcher.querySelector("[data-lang-search-input]");
  const resultItems = switcher.querySelectorAll("[data-lang-search-result]");
  const empty = switcher.querySelector("[data-lang-empty]");
  const defaultView = switcher.querySelector("[data-lang-default-view]");
  const resultsView = switcher.querySelector("[data-lang-results]");
  if (!input || !resultItems.length) return;

  const filter = () => {
    const q = input.value.trim().toLowerCase();
    if (!q) {
      resultItems.forEach((li) => {
        li.hidden = false;
      });
      if (defaultView) defaultView.hidden = false;
      if (resultsView) resultsView.hidden = true;
      if (empty) empty.hidden = true;
      return;
    }

    let visible = 0;
    resultItems.forEach((li) => {
      const match = li.dataset.langSearch.includes(q);
      li.hidden = !match;
      if (match) visible += 1;
    });
    if (defaultView) defaultView.hidden = true;
    if (resultsView) resultsView.hidden = false;
    if (empty) empty.hidden = visible !== 0;
  };

  input.addEventListener("input", filter);
  switcher.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", () => {
      switcher.open = false;
    });
  });
  switcher.addEventListener("toggle", () => {
    if (switcher.open) {
      input.value = "";
      filter();
      input.focus();
    }
  });
});

document.querySelectorAll("[data-language-browser]").forEach((browser) => {
  const input = browser.querySelector("[data-language-browser-input]");
  const groups = browser.querySelectorAll("[data-language-browser-group]");
  const items = browser.querySelectorAll("[data-language-browser-item]");
  const empty = browser.querySelector("[data-language-browser-empty]");
  if (!input || !groups.length || !items.length) return;

  const updateGroupVisibility = () => {
    groups.forEach((group) => {
      const groupItems = group.querySelectorAll("[data-language-browser-item]");
      if (!groupItems.length) return;
      const hasVisibleItem = Array.from(groupItems).some((item) => !item.hidden);
      group.hidden = !hasVisibleItem;
    });
  };

  const filter = () => {
    const q = input.value.trim().toLowerCase();
    let visible = 0;
    items.forEach((item) => {
      const match = !q || item.dataset.langSearch.includes(q);
      item.hidden = !match;
      if (match) visible += 1;
    });
    updateGroupVisibility();
    if (empty) empty.hidden = visible !== 0;
  };

  input.addEventListener("input", filter);
  filter();
});

let turnstileScriptPromise;
const form = document.querySelector("[data-proposal-form]");

if (form) {
  const fieldOrder = [
    "requester",
    "contactRoute",
    "contactDetails",
    "language",
    "problem",
    "affectedUsers",
    "extraContext",
    "openSourceConsent"
  ];
  const submitButton = form.querySelector('button[type="submit"]');
  const formContent = form.querySelector("[data-form-content]");
  const turnstileRoot = form.querySelector("[data-turnstile-root]");
  const formNote = form.querySelector("[data-form-note]");
  const formStatus = form.querySelector("[data-form-status]");
  const formResult = form.querySelector("[data-form-result]");
  const submitLabel = submitButton?.textContent?.trim() || "Send request";
  const loadingProtectionMessage =
    form.dataset.formLoadingProtection || "Loading spam protection...";
  const readyMessage =
    form.dataset.formReady ||
    "Secure submission is ready. When you send the request, IATF will create an intake record.";
  const runtimeUnavailableMessage =
    form.dataset.formRuntimeUnavailable ||
    "Live submission is not configured in this environment. This form will open your email client instead.";
  const turnstileRequiredMessage =
    form.dataset.formTurnstileRequired ||
    "Please complete the spam protection check before sending.";
  const turnstileExpiredMessage =
    form.dataset.formTurnstileExpired ||
    "Spam protection expired. Please complete the check again before sending.";
  const turnstileErrorMessage =
    form.dataset.formTurnstileError ||
    "Spam protection could not be verified right now. Please try again.";
  const turnstileTimeoutMessage =
    form.dataset.formTurnstileTimeout ||
    "Spam protection timed out. Please try the check again.";
  const requiredMessage =
    form.dataset.formRequiredMessage ||
    "Please complete the required fields before sending.";
  const successTitle =
    form.dataset.formSuccessTitle || "Request received";
  const successMessage =
    form.dataset.formSuccess ||
    "Thanks. Your request was received and will be reviewed.";
  const successFollowUpMessage =
    form.dataset.formSuccessFollowup ||
    "If you contact IATF again about this request, include the reference below.";
  const successReferenceLabel =
    form.dataset.formSuccessReferenceLabel || "Reference";
  const successRecordLabel =
    form.dataset.formSuccessRecordLabel || "Intake record";
  const successLinkLabel =
    form.dataset.formSuccessLinkLabel || "View intake record";
  const successSummaryTitle =
    form.dataset.formSuccessSummaryTitle || "What was sent";
  const resetLabel =
    form.dataset.formResetLabel || "Send another request";
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
    form
      .querySelector(
        `[data-field-name="${fieldName}"] [data-field-label-text]`
      )
      ?.textContent?.trim() || fieldName;

  const getRequiredFieldNames = () =>
    Array.from(form.querySelectorAll("[name][required]"))
      .map((field) => field.getAttribute("name"))
      .filter(Boolean);

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

  const clearResult = () => {
    if (!formResult) return;
    formResult.hidden = true;
    formResult.innerHTML = "";
    formResult.className = "form-result";
  };

  const showFormContent = () => {
    if (!formContent) return;
    formContent.hidden = false;
  };

  const hideFormContent = () => {
    if (!formContent) return;
    formContent.hidden = true;
  };

  const setStatus = (kind, message) => {
    if (!formStatus) return;
    formStatus.hidden = !message;
    formStatus.textContent = message || "";
    formStatus.className = kind ? `form-status form-status--${kind}` : "form-status";
    formStatus.setAttribute("role", kind === "error" ? "alert" : "status");
  };

  const resetProposalForm = () => {
    clearResult();
    clearStatus();
    showFormContent();
    form.reset();
    turnstileToken = "";

    if (mode === "api") {
      if (window.turnstile && widgetId !== null) {
        window.turnstile.reset(widgetId);
      }
      setNote(readyMessage);
    } else {
      setNote(runtimeUnavailableMessage);
    }

    setSubmitting(false);
    form.querySelector("#requester")?.focus();
  };

  const setResult = (result, payload) => {
    if (!formResult) return;

    clearResult();
    hideFormContent();
    formResult.hidden = false;
    formResult.className = "form-result form-result--success";

    const title = document.createElement("h4");
    title.className = "form-result__title";
    title.textContent = successTitle;
    formResult.appendChild(title);

    const body = document.createElement("p");
    body.className = "form-result__body";
    body.textContent = result?.message || successMessage;
    formResult.appendChild(body);

    if (result?.requestNumber) {
      const meta = document.createElement("dl");
      meta.className = "form-result__meta";

      const reference = document.createElement("div");
      const referenceLabel = document.createElement("dt");
      const referenceValue = document.createElement("dd");
      referenceLabel.textContent = successReferenceLabel;
      referenceValue.textContent = `#${result.requestNumber}`;
      referenceValue.dir = "ltr";
      reference.append(referenceLabel, referenceValue);
      meta.appendChild(reference);

      formResult.appendChild(meta);
    }

    const followUp = document.createElement("p");
    followUp.className = "form-result__followup";
    followUp.textContent = successFollowUpMessage;
    formResult.appendChild(followUp);

    const summaryHeading = document.createElement("h5");
    summaryHeading.className = "form-result__summary-title";
    summaryHeading.textContent = successSummaryTitle;
    formResult.appendChild(summaryHeading);

    const summary = document.createElement("dl");
    summary.className = "form-result__summary";
    fieldOrder.forEach((fieldName) => {
      const value = String(payload?.[fieldName] || "").trim();
      if (!value) return;

      const item = document.createElement("div");
      const term = document.createElement("dt");
      const description = document.createElement("dd");
      term.textContent = getFieldLabel(fieldName);
      description.textContent = value;
      description.dir = "auto";
      item.append(term, description);
      summary.appendChild(item);
    });
    formResult.appendChild(summary);

    const actions = document.createElement("div");
    actions.className = "cluster form-result__actions";

    if (result?.issueUrl) {
      const issueLink = document.createElement("a");
      issueLink.className = "button";
      issueLink.href = result.issueUrl;
      issueLink.target = "_blank";
      issueLink.rel = "noopener noreferrer";
      issueLink.textContent = `${successRecordLabel}: ${successLinkLabel}`;
      actions.appendChild(issueLink);
    }

    const resetButton = document.createElement("button");
    resetButton.type = "button";
    resetButton.className = "button button--plain";
    resetButton.textContent = resetLabel;
    resetButton.addEventListener("click", resetProposalForm);
    actions.appendChild(resetButton);

    formResult.appendChild(actions);
    formResult.focus();
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
    const subjectSource =
      String(data.get("problem") || untitledLabel).trim() || untitledLabel;
    const subject = encodeURIComponent(
      `[${subjectPrefix}] ${subjectSource}`
    );
    const body = encodeURIComponent(buildMarkdown());
    return `mailto:${requestsEmail}?subject=${subject}&body=${body}`;
  };

  const collectPayload = () => {
    const data = new FormData(form);
    return {
      requester: String(data.get("requester") || "").trim(),
      contactRoute: String(data.get("contactRoute") || "").trim(),
      contactDetails: String(data.get("contactDetails") || "").trim(),
      language: String(data.get("language") || "").trim(),
      problem: String(data.get("problem") || "").trim(),
      affectedUsers: String(data.get("affectedUsers") || "").trim(),
      extraContext: String(data.get("extraContext") || "").trim(),
      openSourceConsent: String(data.get("openSourceConsent") || "").trim(),
      pageUrl: window.location.href,
      turnstileToken
    };
  };

  const fallbackToMailto = (message = runtimeUnavailableMessage) => {
    mode = "mailto";
    requiredFields = [];
    turnstileToken = "";
    showFormContent();
    clearResult();
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
      size: "flexible",
      appearance: "always",
      theme: "auto",
      callback(token) {
        turnstileToken = token;
        setNote(readyMessage);
        clearStatus();
      },
      "expired-callback"() {
        turnstileToken = "";
        if (window.turnstile && widgetId !== null) {
          window.turnstile.reset(widgetId);
        }
        setStatus("error", turnstileExpiredMessage);
      },
      "error-callback"() {
        turnstileToken = "";
        setStatus("error", turnstileErrorMessage);
      },
      "timeout-callback"() {
        turnstileToken = "";
        if (window.turnstile && widgetId !== null) {
          window.turnstile.reset(widgetId);
        }
        setStatus("error", turnstileTimeoutMessage);
      }
    });

    showFormContent();
    clearStatus();
    setNote(readyMessage);
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
    clearResult();
    showFormContent();

    if (mode === "initializing") return;

    const payload = collectPayload();
    const fieldsToCheck =
      mode === "api" && requiredFields.length > 0
        ? requiredFields
        : getRequiredFieldNames();
    const missingFields = fieldsToCheck.filter(
      (fieldName) => !String(payload[fieldName] || "").trim()
    );

    if (missingFields.length > 0) {
      setStatus("error", requiredMessage);
      return;
    }

    if (mode === "mailto") {
      window.location.href = buildMailtoUrl();
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

      turnstileToken = "";
      setNote("");
      clearStatus();
      setResult(result, payload);
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
