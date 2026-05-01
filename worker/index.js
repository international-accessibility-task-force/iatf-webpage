const REQUIRED_FIELDS = [
  "contactRoute",
  "contactDetails",
  "problem",
  "affectedUsers",
  "openSourceConsent"
];
const CANONICAL_HOST = "iatf.cc";
const REDIRECT_HOSTS = new Set([
  "www.iatf.cc",
  "internationalaccessibilitytaskforce.com",
  "www.internationalaccessibilitytaskforce.com"
]);

const ISSUE_FIELDS = [
  ["Requester", "requester"],
  ["Preferred contact route", "contactRoute"],
  ["Follow-up contact", "contactDetails"],
  ["Language", "language"],
  ["Problem", "problem"],
  ["Who is affected", "affectedUsers"],
  ["Extra context", "extraContext"],
  ["Public open source comfort", "openSourceConsent"]
];

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (REDIRECT_HOSTS.has(url.hostname)) {
      url.hostname = CANONICAL_HOST;
      return Response.redirect(url.toString(), 308);
    }

    if (url.pathname === "/api/request-config") {
      return handleRequestConfig(request, env);
    }

    if (url.pathname === "/api/request") {
      return handleRequestSubmission(request, env, ctx);
    }

    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }

    return jsonResponse({ error: "Not found" }, 404);
  }
};

async function handleRequestConfig(request, env) {
  if (request.method !== "GET") {
    return methodNotAllowed(["GET"]);
  }

  return jsonResponse({
    submissionMode: isApiSubmissionConfigured(env) ? "api" : "mailto",
    turnstileSiteKey: env.TURNSTILE_SITE_KEY || "",
    requiredFields: REQUIRED_FIELDS
  });
}

async function handleRequestSubmission(request, env, ctx) {
  if (request.method !== "POST") {
    return methodNotAllowed(["POST"]);
  }

  if (!isApiSubmissionConfigured(env)) {
    return jsonResponse(
      {
        error:
          "Live request submission is not configured in this environment."
      },
      503
    );
  }

  let rawPayload;
  try {
    rawPayload = await parseRequestPayload(request);
  } catch {
    return jsonResponse({ error: "Invalid request payload." }, 400);
  }

  const data = normalizePayload(rawPayload);

  const missingFields = REQUIRED_FIELDS.filter((field) => !data[field]);
  if (missingFields.length > 0) {
    return jsonResponse(
      {
        error:
          "Please complete the required fields before sending the request."
      },
      400
    );
  }

  if (!data.turnstileToken) {
    return jsonResponse(
      { error: "Missing spam protection token." },
      400
    );
  }

  const verification = await validateTurnstileToken(request, env, data.turnstileToken);
  if (!verification.success) {
    return jsonResponse(
      {
        error:
          "Spam protection validation failed. Please try again."
      },
      403
    );
  }

  const issue = await createGitHubIssue(env, data, request);
  if (!issue.ok) {
    return jsonResponse(
      {
        error:
          "The request could not be recorded right now. Please try again or use email instead."
      },
      502
    );
  }

  if (env.DISCORD_WEBHOOK_URL) {
    ctx.waitUntil(sendDiscordNotification(env.DISCORD_WEBHOOK_URL, issue.issue));
  }

  return jsonResponse({
    ok: true,
    message: "Thanks. Your request was received and will be reviewed.",
    requestNumber: issue.issue.number,
    issueUrl: shouldShowIssueLink(env) ? issue.issue.html_url || "" : ""
  });
}

async function parseRequestPayload(request) {
  const contentType = request.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    return request.json();
  }

  if (
    contentType.includes("multipart/form-data") ||
    contentType.includes("application/x-www-form-urlencoded")
  ) {
    const formData = await request.formData();
    return Object.fromEntries(formData.entries());
  }

  return {};
}

function normalizePayload(input) {
  return {
    requester: normalizeText(input.requester),
    contactRoute: normalizeText(input.contactRoute),
    contactDetails: normalizeText(input.contactDetails),
    language: normalizeText(input.language),
    problem: normalizeText(input.problem),
    affectedUsers: normalizeText(input.affectedUsers),
    extraContext: normalizeText(input.extraContext),
    openSourceConsent: normalizeText(input.openSourceConsent),
    pageUrl: normalizeText(input.pageUrl),
    turnstileToken: normalizeText(
      input.turnstileToken || input["cf-turnstile-response"]
    )
  };
}

function normalizeText(value) {
  return String(value ?? "").trim().replace(/\r\n/g, "\n");
}

async function validateTurnstileToken(request, env, token) {
  const body = new FormData();
  body.append("secret", env.TURNSTILE_SECRET_KEY);
  body.append("response", token);
  body.append(
    "idempotency_key",
    crypto.randomUUID()
  );

  const remoteIp = request.headers.get("CF-Connecting-IP");
  if (remoteIp) {
    body.append("remoteip", remoteIp);
  }

  const response = await fetch(
    "https://challenges.cloudflare.com/turnstile/v0/siteverify",
    {
      method: "POST",
      body
    }
  );

  if (!response.ok) {
    return { success: false };
  }

  const result = await response.json();
  if (!result.success) {
    return result;
  }

  const expectedHostname = normalizeExpectedHostname(env.TURNSTILE_EXPECTED_HOSTNAME);
  if (
    expectedHostname &&
    result.hostname &&
    result.hostname !== expectedHostname
  ) {
    return { success: false };
  }

  return result;
}

async function createGitHubIssue(env, data, request) {
  const repo = parseRepo(env.GITHUB_INTAKE_REPO);
  if (!repo) {
    return { ok: false };
  }

  const payload = {
    title: buildIssueTitle(data),
    body: buildIssueBody(data, request),
    labels: parseLabels(env.GITHUB_INTAKE_LABELS)
  };

  const response = await fetch(
    `https://api.github.com/repos/${repo.owner}/${repo.name}/issues`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.GITHUB_TOKEN}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
        "User-Agent": "iatf-request-form"
      },
      body: JSON.stringify(payload)
    }
  );

  if (!response.ok) {
    console.error("GitHub issue creation failed", response.status, await response.text());
    return { ok: false };
  }

  return {
    ok: true,
    issue: await response.json()
  };
}

function buildIssueTitle(data) {
  const source = data.problem || "Untitled accessibility project request";
  return `[Request] ${truncateLine(source, 96)}`;
}

function buildIssueBody(data, request) {
  const sections = ISSUE_FIELDS.map(
    ([label, key]) => `## ${label}\n\n${toMarkdownValue(data[key])}`
  );

  const sourcePage = data.pageUrl || new URL("/propose/", request.url).toString();

  return [
    "# Accessibility project request",
    "",
    ...sections,
    "",
    "## Submission context",
    "",
    `- Submitted at: ${new Date().toISOString()}`,
    `- Source page: ${sourcePage}`,
    "",
    "---",
    "",
    "Submitted through the IATF request form.",
    "",
    "Personal contact details should be removed before making this request public."
  ].join("\n");
}

function toMarkdownValue(value) {
  const text = String(value || "").trim();
  return text ? text : "_";
}

function truncateLine(value, maxLength) {
  const singleLine = String(value || "").replace(/\s+/g, " ").trim();
  if (singleLine.length <= maxLength) return singleLine;
  return `${singleLine.slice(0, maxLength - 1).trimEnd()}…`;
}

function parseRepo(value) {
  const match = /^([^/\s]+)\/([^/\s]+)$/.exec(String(value || "").trim());
  if (!match) return null;
  return { owner: match[1], name: match[2] };
}

function parseLabels(value) {
  return String(value || "request,status: received")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function shouldShowIssueLink(env) {
  return isTruthyEnvValue(env.GITHUB_INTAKE_SHOW_ISSUE_LINK);
}

function isTruthyEnvValue(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
}

function normalizeExpectedHostname(value) {
  const text = String(value || "").trim().toLowerCase();
  if (!text) return "";

  try {
    return new URL(text.includes("://") ? text : `https://${text}`).hostname.toLowerCase();
  } catch {
    return text.split("/")[0].split(":")[0];
  }
}

async function sendDiscordNotification(webhookUrl, issue) {
  const title = issue?.title || "New IATF request";
  const number = issue?.number ? ` #${issue.number}` : "";

  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      content: `New intake request${number}: ${title}`
    })
  });

  if (!response.ok) {
    console.error("Discord notification failed", response.status, await response.text());
  }
}

function isApiSubmissionConfigured(env) {
  return Boolean(
    env.TURNSTILE_SITE_KEY &&
      env.TURNSTILE_SECRET_KEY &&
      env.GITHUB_TOKEN &&
      env.GITHUB_INTAKE_REPO
  );
}

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}

function methodNotAllowed(allowedMethods) {
  return new Response("Method not allowed", {
    status: 405,
    headers: {
      Allow: allowedMethods.join(", ")
    }
  });
}
