import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const outDir = path.join(root, "dist");
const noindex = process.env.NOINDEX === "1" || process.env.NOINDEX === "true";

const site = await readJson(path.join(root, "content", "site.json"));
const defaultLang = site.defaultLanguage;
const languages = await readJson(
  path.join(root, "content", "languages.json")
);
const projects = await readJson(
  path.join(root, "data", "projects.json")
);
const languageCodes = Object.keys(languages);
const enabledLanguages = languageCodes.filter((code) => languages[code]?.enabled);

if (!enabledLanguages.includes(defaultLang)) {
  enabledLanguages.unshift(defaultLang);
}

const INDEXABLE_TRANSLATION_STATUSES = new Set(["source", "human-reviewed"]);

function getTranslationStatus(code) {
  return languages[code]?.translation?.status || "machine-assisted";
}

function isIndexableLocale(code) {
  return INDEXABLE_TRANSLATION_STATUSES.has(getTranslationStatus(code));
}

const indexableLanguages = enabledLanguages.filter(isIndexableLocale);

let lang = defaultLang;
let strings = await loadStrings(lang);
let content = await loadContent(lang);
const publicDiscordUrl = site.contact.discordUrl || site.contact.discordInviteUrl;

const rawTokens = {
  "contact.accessibilityEmail":
    site.contact.accessibilityEmail || site.contact.generalEmail,
  "contact.requestsEmail": site.contact.requestsEmail || site.contact.projectsEmail,
  "contact.projectsEmail": site.contact.projectsEmail,
  "contact.generalEmail": site.contact.generalEmail,
  "contact.discordUrl": publicDiscordUrl,
  "contact.discordInviteUrl": publicDiscordUrl,
  "contact.githubOrgUrl": site.contact.githubOrgUrl,
  "site.title": site.siteTitle,
  "site.short": site.siteName
};

const richTokens = {
  "contact.accessibilityEmail": `<a href="mailto:${rawTokens["contact.accessibilityEmail"]}">${rawTokens["contact.accessibilityEmail"]}</a>`,
  "contact.requestsEmail": `<a href="mailto:${rawTokens["contact.requestsEmail"]}">${rawTokens["contact.requestsEmail"]}</a>`,
  "contact.projectsEmail": `<a href="mailto:${rawTokens["contact.projectsEmail"]}">${rawTokens["contact.projectsEmail"]}</a>`,
  "contact.generalEmail": `<a href="mailto:${rawTokens["contact.generalEmail"]}">${rawTokens["contact.generalEmail"]}</a>`,
  "contact.discordUrl": `<a href="${rawTokens["contact.discordUrl"]}" rel="external">${rawTokens["contact.discordUrl"]}</a>`,
  "contact.discordInviteUrl": `<a href="${rawTokens["contact.discordInviteUrl"]}" rel="external">${rawTokens["contact.discordInviteUrl"]}</a>`,
  "contact.githubOrgUrl": `<a href="${rawTokens["contact.githubOrgUrl"]}" rel="external">${rawTokens["contact.githubOrgUrl"]}</a>`
};

const routes = [
  { slug: "", render: () => renderHomePage() },
  { slug: "projects", render: () => renderProjectsPage() },
  { slug: "propose", render: () => renderProposePage() },
  { slug: "governance", render: () => renderGovernancePage() },
  { slug: "join", render: () => renderJoinPage() },
  { slug: "accessibility", render: () => renderAccessibilityPage() },
  { slug: "transparency", render: () => renderTransparencyPage() },
  { slug: "projects/template", render: () => renderProjectTemplatePage() }
];

await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });

for (const [source, target] of [
  ["client/css/base.css", "base.css"],
  ["client/css/layout.css", "layout.css"],
  ["client/css/components.css", "components.css"],
  ["client/css/utilities.css", "utilities.css"],
  ["client/app.js", "app.js"],
  ["assets/icons/favicon.svg", "favicon.svg"],
  ["assets/icons/favicon.ico", "favicon.ico"],
  ["assets/icons/favicon-16x16.png", "favicon-16x16.png"],
  ["assets/icons/favicon-32x32.png", "favicon-32x32.png"],
  ["assets/icons/apple-touch-icon.png", "apple-touch-icon.png"],
  ["assets/site.webmanifest", "site.webmanifest"],
  ["assets/icons/language-icon.svg", "language-icon.svg"]
]) {
  await cp(path.join(root, source), path.join(outDir, target));
}

for (const code of enabledLanguages) {
  lang = code;
  strings = await loadStrings(code);
  content = await loadContent(code);

  const localeOutDir = getLocaleOutDir(code);
  await mkdir(localeOutDir, { recursive: true });
  await mkdir(path.join(localeOutDir, "projects"), { recursive: true });

  for (const route of routes) {
    const pageDir = route.slug ? path.join(localeOutDir, route.slug) : localeOutDir;
    await mkdir(pageDir, { recursive: true });
    await writeFile(path.join(pageDir, "index.html"), route.render());
  }

  for (const project of projects) {
    const projectDir = path.join(localeOutDir, "projects", project.slug);
    await mkdir(projectDir, { recursive: true });
    await writeFile(
      path.join(projectDir, "index.html"),
      renderProjectPage(project)
    );
  }

  await writeFile(path.join(localeOutDir, "404.html"), renderNotFoundPage());
}
await writeFile(
  path.join(outDir, "robots.txt"),
  noindex
    ? `User-agent: *\nDisallow: /\n`
    : `User-agent: *\nAllow: /\nSitemap: ${site.siteUrl}/sitemap.xml\n`
);
await writeFile(
  path.join(outDir, "site-config.json"),
  JSON.stringify(
    {
      contact: {
        discordInviteUrl: site.contact.discordInviteUrl || publicDiscordUrl
      }
    },
    null,
    2
  ) + "\n"
);
if (!noindex) {
  await writeFile(path.join(outDir, "sitemap.xml"), renderSitemap());
}
await writeFile(path.join(outDir, "_headers"), renderHeaders());

// ── Page renderers ──────────────────────────────────────────────────────────

function renderHomePage() {
  const c = content.home;
  return renderDocument({
    pageData: c,
    body: `
      ${renderHero(c.hero)}
      ${renderModelSection(c.model)}
      ${renderProcessSection(c.process)}
      ${renderRegistrySection(c.registry, true)}
      ${renderClosingSection(c.closing)}
    `
  });
}

function renderProjectsPage() {
  const c = content.projects;
  return renderDocument({
    pageData: c,
    body: `
      ${renderHero(c.hero)}
      ${renderRegistrySection(c.registry, false, c.emptyState)}
      ${renderClosingSection(c.cta)}
    `
  });
}

function renderProposePage() {
  const c = content.propose;
  return renderDocument({
    pageData: c,
    body: `
      ${renderHero(c.hero)}
      ${renderChannelsSection(c.channels)}
      ${renderTwoPanelSection(c.guidance, c.review)}
      ${renderFormSection(c.form)}
      ${renderSinglePanelSection(c.accepted, "propose-accepted-heading")}
      ${renderClosingSection(c.closing)}
    `
  });
}

function renderGovernancePage() {
  const c = content.governance;
  return renderDocument({
    pageData: c,
    body: `
      ${renderHero(c.hero)}
      ${renderBaselineSection(c.baseline)}
      ${renderTwoPanelSection(c.operations.maintainer, c.operations.publicDevelopment)}
      ${renderSinglePanelSection(c.requestRecords, "governance-request-records-heading")}
      ${renderChairSection(c.chair)}
      ${renderTwoPanelSection(
        c.continuity.states,
        c.continuity.reassignment,
        { firstListClass: "token-list" }
      )}
      ${renderSinglePanelSection(c.boundaries, "governance-boundaries-heading")}
    `
  });
}

function renderJoinPage() {
  const c = content.join;
  return renderDocument({
    pageData: c,
    body: `
      ${renderHero(c.hero)}
      ${renderSinglePanelSection(c.ways, "join-ways-heading")}
      ${renderSinglePanelSection(c.channels, "join-channels-heading")}
      ${renderClosingSection(c.closing)}
    `
  });
}

function renderAccessibilityPage() {
  const c = content.accessibility;
  return renderDocument({
    pageData: c,
    body: `
      ${renderHero(c.hero)}
      ${renderSinglePanelSection(c.report, "accessibility-report-heading")}
      ${renderSinglePanelSection(
        c.publicIssueHandling,
        "accessibility-public-issue-handling-heading"
      )}
      ${renderSinglePanelSection(
        c.knownLimitations,
        "accessibility-known-limitations-heading"
      )}
    `
  });
}

function renderTransparencyPage() {
  const c = content.transparency;
  return renderDocument({
    pageData: c,
    body: `
      ${renderHero(c.hero)}
      ${renderSinglePanelSection(c.records, "transparency-records-heading")}
      ${renderCostRecordSection(c.operatingCosts, "transparency-operating-costs-heading")}
      ${renderSinglePanelSection(c.notPublic, "transparency-not-public-heading")}
      ${renderClosingSection(c.closing)}
    `
  });
}

function renderProjectTemplatePage() {
  const c = content.template;
  return renderDocument({
    pageData: c,
    body: `
      ${renderHero(c.hero)}
      ${renderTemplateRecord(c.record)}
      ${renderTwoPanelSection(
        c.problemAndWhy.problem,
        c.problemAndWhy.why
      )}
      ${renderScopeAndStatus(c.scopeAndStatus)}
      ${renderTwoPanelSection(
        c.repositoryAndLanguage.repository,
        c.repositoryAndLanguage.language
      )}
      ${renderTwoPanelSection(c.useAndValue.use, c.useAndValue.value)}
      ${renderContributingAndContact(c.contributingAndContact)}
    `
  });
}

function renderProjectPage(project) {
  const meta = [
    [strings["project.detail.field.status"] || "Status", project.status],
    [
      strings["project.detail.field.maintainer"] || "Maintainer",
      project.maintainerUrl
        ? renderLink(project.maintainerUrl, project.maintainer)
        : project.maintainer
    ],
    [
      strings["project.detail.field.requestedBy"] || "Requested by",
      project.requestedBy
    ],
    [strings["project.detail.field.license"] || "License", project.license || "AGPL-3.0"],
    [
      strings["project.detail.field.repository"] || "Repository",
      project.repository
        ? renderLink(
            project.repository,
            strings["project.detail.viewRepository"] || "View repository"
          )
        : ""
    ],
    [
      strings["project.detail.field.demo"] || "Demo",
      project.demo
        ? renderLink(project.demo, strings["project.detail.viewDemo"] || "View demo")
        : ""
    ],
    [
      strings["project.detail.field.primaryLanguage"] || "Primary language",
      project.primaryLanguage ||
        strings["project.detail.defaultLanguage"] ||
        "English"
    ],
    [
      strings["project.detail.field.languageNotes"] || "Language notes",
      project.languageNotes ||
        strings["project.detail.defaultLanguageNotes"] ||
        "Plain English source, translations may be added later"
    ],
    [strings["project.detail.field.lastUpdated"] || "Last updated", project.updatedAt]
  ].filter(([, value]) => value);

  const pageData = {
    meta: {
      currentPath: `/projects/${project.slug}/`,
      title: project.title
    }
  };

  return renderDocument({
    pageData,
    description: project.summary || site.description,
    body: `
      ${renderHero({
        eyebrow: strings["project.detail.eyebrow"] || "Public project entry",
        title: project.title,
        lead: project.summary || site.description,
        support: [],
        actions: [
          project.repository
            ? {
                label: strings["project.detail.field.repository"] || "Repository",
                href: project.repository,
                variant: "primary"
              }
            : null,
          project.demo
            ? {
                label: strings["project.detail.field.demo"] || "Demo",
                href: project.demo,
                variant: "secondary"
              }
            : null
        ].filter(Boolean)
      })}
      <section class="section" aria-labelledby="project-record-heading">
        <header class="section-header">
          <p class="section-header__kicker">${escapeHtml(strings["project.detail.recordKicker"] || "Project record")}</p>
          <h2 id="project-record-heading">${escapeHtml(strings["project.detail.metadataTitle"] || "Metadata")}</h2>
        </header>
        <div class="detail-record">
          <dl class="detail-record__meta">
            ${meta
              .map(
                ([label, value]) =>
                  `<div><dt>${escapeHtml(label)}</dt><dd>${value}</dd></div>`
              )
              .join("")}
          </dl>
        </div>
      </section>
      <section class="section">
        <div class="split">
          <article class="panel">
            <h2>${escapeHtml(strings["project.detail.problemTitle"] || "What problem this project solves")}</h2>
            <p>${escapeHtml(project.problem || "")}</p>
          </article>
          <article class="panel">
            <h2>${escapeHtml(strings["project.detail.whyTitle"] || "Why this project exists")}</h2>
            <p>${escapeHtml(project.why || "")}</p>
          </article>
        </div>
      </section>
      ${
        (project.scopeIn?.length || project.scopeOut?.length)
          ? `<section class="section">
        <div class="split">
          ${
            project.scopeIn?.length
              ? `<article class="panel">
            <h2>${escapeHtml(strings["project.detail.scopeInTitle"] || "In scope")}</h2>
            ${renderList(project.scopeIn, "doc-list")}
          </article>`
              : ""
          }
          ${
            project.scopeOut?.length
              ? `<article class="panel">
            <h2>${escapeHtml(strings["project.detail.scopeOutTitle"] || "Out of scope")}</h2>
            ${renderList(project.scopeOut, "doc-list")}
          </article>`
              : ""
          }
        </div>
      </section>`
          : ""
      }
    `
  });
}

function renderNotFoundPage() {
  const c = content.notFound;
  return renderDocument({
    pageData: c,
    description: site.description,
    body: `
      ${renderHero(c.hero)}
      <section class="section">
        <article class="panel">
          ${renderParagraphs(c.body.paragraphs)}
          ${renderLinkList(c.body.items)}
        </article>
      </section>
    `
  });
}

// ── Section renderers ───────────────────────────────────────────────────────

function renderHero(hero) {
  if (!hero) return "";
  const eyebrow = hero.eyebrow || (hero.eyebrowKey ? strings[hero.eyebrowKey] : "");
  const support = (hero.support || [])
    .map((paragraph) => `<p class="hero__support">${expand(paragraph)}</p>`)
    .join("");
  const actions = (hero.actions || []).map(renderAction).filter(Boolean).join("");

  return `
    <section class="hero" aria-labelledby="page-heading">
      ${eyebrow ? `<p class="hero__eyebrow">${escapeHtml(eyebrow)}</p>` : ""}
      <h1 id="page-heading">${escapeHtml(hero.title)}</h1>
      ${hero.lead ? `<p class="hero__lead">${expand(hero.lead)}</p>` : ""}
      ${support}
      ${actions ? `<div class="cluster">${actions}</div>` : ""}
    </section>
  `;
}

function renderModelSection(model) {
  return `
    <section class="section section--intro" aria-labelledby="home-model-heading">
      ${renderSectionHeader(model.header, "home-model-heading")}
      <div class="split">
        <article class="flow">
          ${renderParagraphs(model.paragraphs)}
        </article>
        <aside class="spec-card" aria-label="${escapeHtml(model.specCard.title)}">
          <h3>${escapeHtml(model.specCard.title)}</h3>
          <dl class="term-grid">
            ${model.specCard.terms
              .map(
                (item) =>
                  `<div><dt>${escapeHtml(item.term)}</dt><dd>${escapeHtml(item.definition)}</dd></div>`
              )
              .join("")}
          </dl>
        </aside>
      </div>
    </section>
  `;
}

function renderProcessSection(process) {
  return `
    <section class="section" aria-labelledby="home-process-heading">
      ${renderSectionHeader(process.header, "home-process-heading")}
      <ol class="step-grid">
        ${process.steps
          .map(
            (step) => `<li class="step-card">
              <p class="step-card__index" aria-hidden="true">${escapeHtml(step.index)}</p>
              <h3>${escapeHtml(step.title)}</h3>
              ${renderParagraphs(step.paragraphs)}
            </li>`
          )
          .join("")}
      </ol>
    </section>
  `;
}

function renderScopeSection(scope) {
  return `
    <section class="section" aria-labelledby="home-scope-heading">
      ${renderSectionHeader(scope.header, "home-scope-heading")}
      <div class="split">
        <article class="panel">
          ${renderParagraphs(scope.paragraphs)}
        </article>
        <article class="panel">
          <h3>${escapeHtml(scope.examplesTitle)}</h3>
          ${renderList(scope.examples, "doc-list")}
        </article>
      </div>
    </section>
  `;
}

function renderEditorialSection(editorial) {
  return `
    <section class="section" aria-labelledby="home-editorial-heading">
      ${renderSectionHeader(editorial.header, "home-editorial-heading")}
      <div class="split">
        <article class="panel">
          ${renderParagraphs(editorial.translation)}
        </article>
        <article class="panel">
          <h3>${escapeHtml(editorial.channelsTitle)}</h3>
          <p>${expand(editorial.channelsLead)}</p>
          <ul class="link-list">
            ${editorial.channels
              .map(
                (channel) =>
                  `<li><strong>${escapeHtml(channel.label)}:</strong> ${expand(channel.body)}</li>`
              )
              .join("")}
          </ul>
        </article>
      </div>
    </section>
  `;
}

function renderRegistrySection(registry, isHome, emptyState = null) {
  const headingId = isHome ? "home-registry-heading" : "projects-registry-heading";
  return `
    <section class="section" aria-labelledby="${headingId}">
      ${renderSectionHeader(registry.header, headingId)}
      ${
        !isHome && registry.intro
          ? `<div class="flow registry-intro">${renderParagraphs(registry.intro)}${
              registry.fieldList
                ? renderList(registry.fieldList, "doc-list")
                : ""
            }${
              registry.footnote ? `<p class="note">${expand(registry.footnote)}</p>` : ""
            }</div>`
          : ""
      }
      ${renderRegistry(emptyState, isHome)}
    </section>
  `;
}

function renderRegistry(emptyState, isHome) {
  const head = `
    <div class="registry-head" aria-hidden="true">
      <span>${escapeHtml(strings["registry.col.project"])}</span>
      <span>${escapeHtml(strings["registry.col.status"])}</span>
      <span>${escapeHtml(strings["registry.col.maintainer"])}</span>
      <span>${escapeHtml(strings["registry.col.repository"])}</span>
      <span>${escapeHtml(strings["registry.col.demo"])}</span>
    </div>
  `;

  if (projects.length === 0) {
    return `
      <div class="registry">
        ${head}
        <article class="registry-empty">
          <h3>${escapeHtml(emptyState?.title || strings["registry.empty.title"])}</h3>
          ${
            emptyState?.paragraphs
              ? renderParagraphs(emptyState.paragraphs)
              : `<p>${expand(strings["registry.empty.body"])}</p>`
          }
          <div class="cluster">
            ${renderAction({
              labelKey: "actions.proposeProject",
              href: "/propose/",
              variant: "primary"
            })}
          </div>
        </article>
      </div>
    `;
  }

  return `
    <div class="registry">
      ${head}
      ${projects
        .map(
          (project) => `<article class="registry-row">
            <div>
              <h3><a href="${escapeHtml(localizePathname(`/projects/${project.slug}/`))}">${escapeHtml(project.title)}</a></h3>
              <p>${escapeHtml(project.summary || "")}</p>
            </div>
            <p>${escapeHtml(project.status || "")}</p>
            <p>${
              project.maintainerUrl
                ? renderLink(project.maintainerUrl, project.maintainer || "")
                : escapeHtml(project.maintainer || "")
            }</p>
            <p>${
              project.repository
                ? renderLink(project.repository, strings["registry.repositoryLabel"])
                : strings["registry.demoEmpty"]
            }</p>
            <p>${
              project.demo
                ? renderLink(project.demo, strings["registry.demoLabel"])
                : strings["registry.demoEmpty"]
            }</p>
          </article>`
        )
        .join("")}
    </div>
  `;
}

function renderFiltersSection(filters) {
  return `
    <section class="section" aria-labelledby="projects-filters-heading">
      ${renderSectionHeader(filters.header, "projects-filters-heading")}
      <div class="split">
        <article class="panel">
          <h3>${escapeHtml(filters.main.title)}</h3>
          ${renderList(filters.main.items, "token-list")}
        </article>
        <article class="panel">
          <h3>${escapeHtml(filters.categories.title)}</h3>
          ${renderList(filters.categories.items, "token-list")}
          ${filters.categories.note ? `<p class="note">${expand(filters.categories.note)}</p>` : ""}
        </article>
      </div>
    </section>
  `;
}

function renderRegistryStructureSection(structure) {
  const specimen = structure.specimen;
  return `
    <section class="section" aria-labelledby="projects-structure-heading">
      ${renderSectionHeader(structure.header, "projects-structure-heading")}
      <div class="split">
        <article class="panel">
          <h3>${escapeHtml(structure.fieldsTitle)}</h3>
          ${renderList(structure.fields, "doc-list")}
        </article>
        <article class="panel">
          <h3>${escapeHtml(structure.specimenTitle)}</h3>
          <article class="registry-card registry-card--specimen">
            <h4>${escapeHtml(specimen.title)}</h4>
            <p>${expand(specimen.summary)}</p>
            <ul class="meta-list">
              ${specimen.meta
                .map(
                  (item) =>
                    `<li><strong>${escapeHtml(item.label)}:</strong> ${escapeHtml(item.value)}</li>`
                )
                .join("")}
            </ul>
            <p>${renderLink(specimen.templateLink.href, specimen.templateLink.label)}</p>
          </article>
        </article>
      </div>
    </section>
  `;
}

function renderChannelsSection(channels) {
  return `
    <section class="section" aria-labelledby="propose-channels-heading">
      ${renderSectionHeader(channels.header, "propose-channels-heading")}
      <div class="split split--3">
        ${channels.items
          .map(
            (item) => `<article class="panel">
              <h3>${escapeHtml(item.label)}</h3>
              <p>${expand(item.body)}</p>
            </article>`
          )
          .join("")}
      </div>
      <aside class="panel panel--inset">
        ${renderParagraphs(channels.intro)}
      </aside>
    </section>
  `;
}

function renderTwoPanelSection(left, right, options = {}) {
  const headerHtml = options.header ? renderSectionHeader(options.header) : "";
  return `
    <section class="section">
      ${headerHtml}
      <div class="split">
        ${renderPanel(left, options.firstListClass || "doc-list")}
        ${renderPanel(right, options.secondListClass || "doc-list")}
      </div>
    </section>
  `;
}

function renderPanel(panel, listClass = "doc-list") {
  if (!panel) return "";
  return `<article class="panel">
    <h2>${escapeHtml(panel.title)}</h2>
    ${renderParagraphs(panel.paragraphs)}
    ${renderList(panel.items, listClass)}
    ${panel.footnote ? `<p class="note">${expand(panel.footnote)}</p>` : ""}
  </article>`;
}

function renderChairSection(chair) {
  if (!chair) return "";
  const panel = (p) => `<article class="panel panel--chair">
    <h3>${escapeHtml(p.title)}</h3>
    ${renderParagraphs(p.paragraphs)}
    ${renderList(p.items, "doc-list")}
    ${p.footnote ? `<p class="note">${expand(p.footnote)}</p>` : ""}
  </article>`;
  const meta = `<article class="panel panel--chair panel--chair-meta">
    <h3>${escapeHtml(chair.current.title)}</h3>
    <dl class="detail-record__meta detail-record__meta--chair">
      ${chair.current.fields
        .map(
          (f) =>
            `<div><dt>${escapeHtml(f.label)}</dt><dd>${
              f.href ? renderLink(f.href, f.value) : escapeHtml(f.value)
            }</dd></div>`
        )
        .join("")}
    </dl>
  </article>`;
  const intro = chair.lead
    ? `<p class="section-header__intro">${expand(chair.lead)}</p>`
    : "";
  return `
    <section class="section section--governance-chair" aria-labelledby="governance-chair-heading">
      ${renderSectionHeader(chair.header, "governance-chair-heading", intro)}
      <div class="split split--chair">
        ${panel(chair.duties)}
        ${panel(chair.election)}
      </div>
      <div class="split split--chair">
        ${panel(chair.continuity)}
        ${meta}
      </div>
      ${chair.footnote ? `<p class="note note--section">${expand(chair.footnote)}</p>` : ""}
    </section>
  `;
}

function renderSinglePanelSection(section, headingId, listClass = "doc-list") {
  if (!section) return "";
  return `
    <section class="section" aria-labelledby="${headingId}">
      ${section.header ? renderSectionHeader(section.header, headingId) : ""}
      <article class="panel">
        ${section.title ? `<h2>${escapeHtml(section.title)}</h2>` : ""}
        ${renderParagraphs(section.paragraphs)}
        ${renderList(section.items, listClass)}
        ${section.footnote ? `<p class="note">${expand(section.footnote)}</p>` : ""}
      </article>
    </section>
  `;
}

function renderCostRecordSection(section, headingId) {
  if (!section) return "";
  const intro =
    section.paragraphs?.length || section.footnote
      ? `<article class="panel">
        ${renderParagraphs(section.paragraphs)}
        ${section.footnote ? `<p class="note">${expand(section.footnote)}</p>` : ""}
      </article>`
      : "";
  const entries = (section.entries || [])
    .map(
      (entry) => `<article class="panel panel--cost-entry">
        <h3>${escapeHtml(entry.year)}</h3>
        ${(entry.items || [])
          .map(
            (item) =>
              `<p><strong>${escapeHtml(item.label)}:</strong> ${expand(item.value)}</p>`
          )
          .join("")}
      </article>`
    )
    .join("");

  return `
    <section class="section" aria-labelledby="${headingId}">
      ${section.header ? renderSectionHeader(section.header, headingId) : ""}
      ${intro}
      ${entries ? `<div class="spec-grid spec-grid--costs">${entries}</div>` : ""}
    </section>
  `;
}

function renderFormSection(form) {
  return `
    <section class="section" id="request-form" aria-labelledby="propose-form-heading">
      ${renderSectionHeader(form.header, "propose-form-heading")}
      <article class="panel panel--form">
        <h3>${escapeHtml(strings["proposal.form.title"])}</h3>
        <p>${escapeHtml(strings["proposal.form.body"])}</p>
        <form
          class="stack"
          data-proposal-form
          data-form-config-endpoint="/api/request-config"
          data-form-submit-endpoint="/api/request"
          data-requests-email="${escapeHtml(site.contact.requestsEmail || site.contact.projectsEmail)}"
          data-proposal-subject-prefix="${escapeHtml(strings["proposal.subjectPrefix"] || "IATF request")}"
          data-proposal-subject-untitled="${escapeHtml(strings["proposal.subjectUntitled"] || "Untitled request")}"
          data-form-runtime-unavailable="${escapeHtml(strings["proposal.form.runtimeUnavailable"] || "Live submission is not configured in this environment. This form will open your email client instead.")}"
          data-form-loading-protection="${escapeHtml(strings["proposal.form.loadingProtection"] || "Loading spam protection...")}"
          data-form-ready="${escapeHtml(strings["proposal.form.ready"] || "Secure submission is ready. When you send the request, IATF will create an intake record.")}"
          data-form-turnstile-required="${escapeHtml(strings["proposal.form.turnstileRequired"] || "Please complete the spam protection check before sending.")}"
          data-form-turnstile-expired="${escapeHtml(strings["proposal.form.turnstileExpired"] || "Spam protection expired. Please complete the check again before sending.")}"
          data-form-turnstile-error="${escapeHtml(strings["proposal.form.turnstileError"] || "Spam protection could not be verified right now. Please try again.")}"
          data-form-turnstile-timeout="${escapeHtml(strings["proposal.form.turnstileTimeout"] || "Spam protection timed out. Please try the check again.")}"
          data-form-required-message="${escapeHtml(strings["proposal.form.requiredMessage"] || "Please complete the required fields before sending.")}"
          data-form-submitting="${escapeHtml(strings["proposal.form.submitting"] || "Sending request...")}"
          data-form-success-title="${escapeHtml(strings["proposal.form.successTitle"] || "Request received")}"
          data-form-success="${escapeHtml(strings["proposal.form.success"] || "Thanks. Your request was received and will be reviewed.")}"
          data-form-success-followup="${escapeHtml(strings["proposal.form.successFollowUp"] || "If you contact IATF again about this request, include the reference below.")}"
          data-form-success-reference-label="${escapeHtml(strings["proposal.form.successReferenceLabel"] || "Reference")}"
          data-form-success-record-label="${escapeHtml(strings["proposal.form.successRecordLabel"] || "Intake record")}"
          data-form-success-link-label="${escapeHtml(strings["proposal.form.successLinkLabel"] || "View intake record")}"
          data-form-success-summary-title="${escapeHtml(strings["proposal.form.successSummaryTitle"] || "What was sent")}"
          data-form-reset-label="${escapeHtml(strings["proposal.form.reset"] || "Send another request")}"
          data-form-error-generic="${escapeHtml(strings["proposal.form.errorGeneric"] || "Something went wrong while sending the request. You can try again or use email instead.")}"
        >
          <div class="proposal-form__content" data-form-content>
            <div class="form-grid">
              ${form.fields.map(renderFormField).join("")}
            </div>
            <div class="proposal-form__service">
              <div class="proposal-form__turnstile" data-turnstile-root hidden></div>
              <p class="form-status form-status--info" data-form-note hidden></p>
              <p class="form-status" data-form-status role="status" aria-live="polite" hidden></p>
            </div>
            <div class="cluster proposal-form__actions">
              <button class="button button--full" type="submit" disabled>${escapeHtml(strings["proposal.form.submit"])}</button>
            </div>
          </div>
          <div class="form-result" data-form-result hidden tabindex="-1"></div>
          <noscript>
            <p class="note">${escapeHtml(strings["proposal.form.noscript"])}</p>
          </noscript>
        </form>
      </article>
    </section>
  `;
}

function renderFormField(field) {
  const requirement = getFieldRequirement(field);
  const fieldClass = field.fullWidth ? "field field--full" : "field";
  const textareaClass =
    field.fullWidth === false ? "field" : "field field--full";
  const requiredAttr =
    field.required === true ? ` required aria-required="true"` : "";
  switch (field.kind) {
    case "textarea":
      return `<div class="${textareaClass}" data-field-name="${escapeHtml(field.name)}">
        ${renderFieldLabel(field, requirement)}
        ${renderFieldHelper(field)}
        <textarea id="${field.name}" name="${field.name}"${
          field.placeholder
            ? ` placeholder="${escapeHtml(field.placeholder)}"`
            : ""
        }${requiredAttr}></textarea>
      </div>`;
    case "select":
      return `<div class="${fieldClass}" data-field-name="${escapeHtml(field.name)}">
        ${renderFieldLabel(field, requirement)}
        ${renderFieldHelper(field)}
        <select id="${field.name}" name="${field.name}"${requiredAttr}>
          ${field.options
            .map((option) => `<option>${escapeHtml(option)}</option>`)
            .join("")}
        </select>
      </div>`;
    default:
      return `<div class="${fieldClass}" data-field-name="${escapeHtml(field.name)}">
        ${renderFieldLabel(field, requirement)}
        ${renderFieldHelper(field)}
        <input id="${field.name}" name="${field.name}" value="${escapeHtml(field.value || "")}"${
          field.placeholder
            ? ` placeholder="${escapeHtml(field.placeholder)}"`
            : ""
        }${requiredAttr} />
      </div>`;
  }
}

function getFieldRequirement(field) {
  if (field.required === true) return "required";
  if (field.required === "conditional") return "conditional";
  return "optional";
}

function getFieldRequirementLabel(requirement) {
  switch (requirement) {
    case "required":
      return strings["proposal.field.required"] || "Required";
    case "conditional":
      return strings["proposal.field.conditional"] || "Conditional";
    default:
      return strings["proposal.field.optional"] || "Optional";
  }
}

function renderFieldLabel(field, requirement) {
  return `<label class="field__label" for="${field.name}">
    <span class="field__label-text" data-field-label-text>${escapeHtml(field.label)}</span>
    <span class="field__badge field__badge--${requirement}" data-field-badge>${escapeHtml(getFieldRequirementLabel(requirement))}</span>
  </label>`;
}

function renderFieldHelper(field) {
  return field.helper ? `<p class="note" data-field-helper>${expand(field.helper)}</p>` : "";
}

function renderBaselineSection(baseline) {
  return `
    <section class="section" aria-labelledby="governance-baseline-heading">
      ${renderSectionHeader(baseline.header, "governance-baseline-heading")}
      <div class="spec-grid">
        ${baseline.cards
          .map(
            (card) => `<article class="spec-card">
              <h3>${escapeHtml(card.title)}</h3>
              ${renderParagraphs(card.paragraphs)}
              ${renderList(card.items, "doc-list")}
            </article>`
          )
          .join("")}
      </div>
    </section>
  `;
}

function renderClosingSection(closing) {
  if (!closing) return "";
  return `
    <section class="section section--cta" aria-labelledby="closing-heading">
      ${renderSectionHeader(closing.header, "closing-heading")}
      <div class="cta-strip">
        <div class="flow">
          ${renderParagraphs(closing.paragraphs)}
        </div>
        <div class="cluster">
          ${(closing.actions || []).map(renderAction).join("")}
        </div>
      </div>
    </section>
  `;
}

function renderPublicAndGovernance(block) {
  return `
    <section class="section">
      <div class="split">
        <article class="panel">
          <h2>${escapeHtml(block.publicTitle)}</h2>
          ${renderParagraphs(block.publicParagraphs)}
        </article>
        <article class="panel">
          <h2>${escapeHtml(block.governanceTitle)}</h2>
          ${renderParagraphs(block.governanceParagraphs)}
          <div class="cluster">
            ${renderAction(block.governanceAction)}
          </div>
        </article>
      </div>
    </section>
  `;
}

function renderTemplateRecord(record) {
  return `
    <section class="section" aria-labelledby="template-record-heading">
      ${renderSectionHeader(record.header, "template-record-heading")}
      <div class="detail-record">
        <p class="detail-record__summary">${expand(record.summary)}</p>
        <dl class="detail-record__meta">
          ${record.meta
            .map(
              (item) =>
                `<div><dt>${escapeHtml(item.label)}</dt><dd>${expand(item.value)}</dd></div>`
            )
            .join("")}
        </dl>
      </div>
    </section>
  `;
}

function renderScopeAndStatus(block) {
  return `
    <section class="section">
      <div class="split">
        <article class="panel">
          <h2>${escapeHtml(block.scope.title)}</h2>
          ${renderParagraphs(block.scope.paragraphs)}
          ${renderList(block.scope.in, "doc-list")}
          <h3>${escapeHtml(block.scope.outTitle)}</h3>
          ${renderList(block.scope.out, "doc-list")}
        </article>
        <article class="panel">
          <h2>${escapeHtml(block.status.title)}</h2>
          ${renderParagraphs(block.status.paragraphs)}
          ${renderList(block.status.items, "doc-list")}
        </article>
      </div>
    </section>
  `;
}

function renderContributingAndContact(block) {
  return `
    <section class="section">
      <div class="split">
        <article class="panel">
          <h2>${escapeHtml(block.contributing.title)}</h2>
          ${renderParagraphs(block.contributing.paragraphs)}
        </article>
        <article class="panel">
          <h2>${escapeHtml(block.contact.title)}</h2>
          ${renderLinkList(block.contact.items)}
        </article>
      </div>
    </section>
  `;
}

// ── Layout shell ────────────────────────────────────────────────────────────

function renderFooterMeta() {
  return ["footer.blurb", "footer.source"]
    .map((key) => strings[key])
    .filter(Boolean)
    .map((item) => `<p>${expand(item)}</p>`)
    .join("");
}

function renderDocument({ pageData, body, documentTitle, description }) {
  const meta = pageData?.meta || {};
  const titlePrefix = "IATF.CC";
  const currentPath = localizePathname(meta.currentPath || "/");
  const titleSource =
    documentTitle ||
    getPageTitle(meta, currentPath, titlePrefix);
  const descriptionSource =
    description ||
    (meta.descriptionKey ? strings[meta.descriptionKey] : site.description);
  const canonical = `${site.siteUrl}${currentPath === "/404.html" ? "/" : currentPath}`;
  const htmlLang = languages[lang]?.ietfBcp47 || lang;
  const pagePathForAlternates = currentPath === "/404.html" ? null : currentPath;
  const robotsTag = renderRobotsTag(lang);
  const alternateTags = renderAlternateLinkTags(pagePathForAlternates);

  return `<!doctype html>
<html lang="${escapeHtml(htmlLang)}" dir="ltr">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(titleSource)}</title>
    <meta name="description" content="${escapeHtml(descriptionSource)}" />
    ${robotsTag}
    <link rel="icon" href="/favicon-32x32.png" type="image/png" sizes="32x32" />
    <link rel="icon" href="/favicon-16x16.png" type="image/png" sizes="16x16" />
    <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
    <link rel="manifest" href="/site.webmanifest" />
    <link rel="canonical" href="${escapeHtml(canonical)}" />
    ${alternateTags}
    <meta property="og:title" content="${escapeHtml(titleSource)}" />
    <meta property="og:description" content="${escapeHtml(descriptionSource)}" />
    <meta property="og:type" content="website" />
    <meta property="og:url" content="${escapeHtml(canonical)}" />
    <meta name="theme-color" content="#663399" />
    <link rel="stylesheet" href="/base.css" />
    <link rel="stylesheet" href="/layout.css" />
    <link rel="stylesheet" href="/components.css" />
    <link rel="stylesheet" href="/utilities.css" />
  </head>
  <body>
    <a class="skip-link" href="#content">${escapeHtml(strings["skip.toContent"])}</a>
    <div class="site-shell">
      <header class="site-header" role="banner">
        <a class="brand" href="${escapeHtml(localizePathname("/"))}" aria-label="${escapeHtml(strings["site.title"])}">
          <span class="brand__mark">${escapeHtml(strings["site.short"])}.cc</span>
          <span class="brand__meta">${escapeHtml(strings["site.title"])}</span>
        </a>
        <nav class="site-nav" aria-label="${escapeHtml(strings["nav.label"])}">
          <ul class="site-nav__list">
            ${renderNav(currentPath)}
            ${renderLanguageSwitcher(currentPath)}
          </ul>
        </nav>
      </header>

      <main id="content" class="site-main" tabindex="-1">
        ${renderTranslationStatus(lang)}
        ${body}
      </main>

      <footer class="site-footer" role="contentinfo" aria-label="${escapeHtml(strings["footer.label"])}">
        <div class="site-footer__top">
          <div class="site-footer__meta">
            ${renderFooterMeta()}
          </div>
          <address class="site-footer__contact" aria-label="${escapeHtml(strings["contact.label"])}">
            <ul class="site-footer__links">
              <li><a href="${escapeHtml(site.contact.githubOrgUrl)}" rel="external">${escapeHtml(strings["contact.github"])}</a></li>
              <li><a href="${escapeHtml(publicDiscordUrl)}" rel="external">${escapeHtml(strings["contact.discord"])}</a></li>
            </ul>
          </address>
        </div>
        <p class="site-footer__legal">
          <span>${escapeHtml(`© ${new Date().getFullYear()} ${site.organization.shortName}`)}</span>
          <span aria-hidden="true">·</span>
          <a href="${escapeHtml(localizePathname("/join/"))}">${escapeHtml(strings["footer.howToContribute"] || strings["nav.join"])}</a>
          <span aria-hidden="true">·</span>
          <a href="${escapeHtml(localizePathname("/accessibility/"))}">${escapeHtml(strings["footer.accessibility"] || "Accessibility")}</a>
          <span aria-hidden="true">·</span>
          <a href="${escapeHtml(localizePathname("/transparency/"))}">${escapeHtml(strings["nav.transparency"])}</a>
          <span aria-hidden="true">·</span>
          <span>${escapeHtml(strings["footer.licenseContent"] || "Content CC BY-SA 4.0")}</span>
          <span aria-hidden="true">·</span>
          <span>${escapeHtml(strings["footer.licenseCode"] || "Code AGPL-3.0")}</span>
        </p>
      </footer>
    </div>
    <script src="/app.js" defer></script>
  </body>
</html>`;
}

function renderTranslationStatus(code) {
  const status = getTranslationStatus(code);
  const stringKey = {
    "source": "translation.source",
    "human-reviewed": "translation.humanReviewed",
    "machine-assisted": "translation.machineAssisted",
    "needs-update": "translation.needsUpdate"
  }[status];
  if (!stringKey) return "";
  const message = strings[stringKey];
  if (!message) return "";
  const label = strings["translation.label"] || "Translation status";
  const tone = status === "human-reviewed" ? "info" : "warning";
  const role = tone === "warning" ? "status" : "note";
  return `<aside class="translation-status translation-status--${escapeHtml(status)} translation-status--${escapeHtml(tone)}" role="${role}" aria-label="${escapeHtml(label)}">
    <p><strong>${escapeHtml(label)}:</strong> ${expand(message)}</p>
  </aside>`;
}

function renderRobotsTag(code) {
  const indexable = !noindex && isIndexableLocale(code);
  if (indexable) return "";
  if (noindex) return `<meta name="robots" content="noindex,nofollow,noarchive" />`;
  return `<meta name="robots" content="noindex,follow" />`;
}

function renderAlternateLinkTags(pathname) {
  if (!pathname) return "";
  const indexable = indexableLanguages;
  if (indexable.length < 2) return "";
  const lines = indexable.map((code) => {
    const href = `${site.siteUrl}${localizePathname(pathname, code)}`;
    const hreflang = languages[code]?.ietfBcp47 || code;
    return `<link rel="alternate" hreflang="${escapeHtml(hreflang)}" href="${escapeHtml(href)}" />`;
  });
  const defaultHref = `${site.siteUrl}${localizePathname(pathname, defaultLang)}`;
  lines.push(
    `<link rel="alternate" hreflang="x-default" href="${escapeHtml(defaultHref)}" />`
  );
  return lines.join("\n    ");
}

function getPageTitle(meta, currentPath, titlePrefix) {
  const pageTitle = meta.title || (meta.titleKey ? strings[meta.titleKey] : "");
  if (!pageTitle) return titlePrefix;
  if (stripLangPrefix(currentPath, languageCodes) === "/") {
    return `${titlePrefix} | ${strings["site.title"] || "International Accessibility Task Force"}`;
  }
  return `${titlePrefix} | ${pageTitle}`;
}

function renderNav(currentPath) {
  const navItems = [
    ["/projects/", strings["nav.projects"]],
    ["/propose/", strings["nav.request"]],
    ["/governance/", strings["nav.governance"]]
  ];

  return navItems
    .map(([href, label]) => {
      const localizedHref = localizePathname(href);
      const current = localizedHref === currentPath ? ' aria-current="page"' : "";
      return `<li><a href="${localizedHref}"${current}>${escapeHtml(label)}</a></li>`;
    })
    .join("");
}

function renderLanguageSwitcher(currentPath) {
  const enabled = Object.entries(languages).filter(([, l]) => l.enabled);
  if (enabled.length < 2) return "";

  const stripped = stripLangPrefix(currentPath, languageCodes);

  const items = enabled
    .map(([code, l]) => {
      const href = localizePathname(stripped, code);
      const current = code === lang ? ' aria-current="true"' : "";
      const native = escapeHtml(l.nativeName || l.displayLabel || code);
      const searchKey = escapeHtml(
        `${l.nativeName || ""} ${l.englishName || ""} ${code}`.toLowerCase()
      );
      return `<li data-lang-search="${searchKey}"><a href="${href}" lang="${escapeHtml(l.ietfBcp47)}"${current}>${native}</a></li>`;
    })
    .join("");

  const menuLabel = strings["nav.language"] || "Language";
  const countWord =
    enabled.length === 1
      ? strings["nav.languageSingular"] || "language"
      : strings["nav.languagePlural"] || "languages";
  const countLabel = `${enabled.length} ${countWord}`;
  const searchLabel = strings["nav.languageSearch"] || "Search languages";
  const noMatchLabel = strings["nav.languageNoMatch"] || "No matches";

  return `<li class="lang-switcher-item"><details class="lang-switcher" data-lang-switcher>
    <summary aria-label="${escapeHtml(menuLabel)}: ${escapeHtml(countLabel)}">
      <img class="lang-switcher__icon" src="/language-icon.svg" alt="" width="24" height="24" />
      <span class="lang-switcher__label">${escapeHtml(countLabel)}</span>
    </summary>
    <div class="lang-switcher__panel" role="dialog" aria-label="${escapeHtml(menuLabel)}">
      <label class="lang-switcher__search">
        <span class="visually-hidden">${escapeHtml(searchLabel)}</span>
        <input type="search" placeholder="${escapeHtml(searchLabel)}" data-lang-search-input autocomplete="off" spellcheck="false" />
      </label>
      <ul class="lang-switcher__list">${items}</ul>
      <p class="lang-switcher__empty" data-lang-empty hidden>${escapeHtml(noMatchLabel)}</p>
    </div>
  </details></li>`;
}

function stripLangPrefix(pathname, codes) {
  for (const code of codes) {
    if (code === defaultLang) continue;
    if (pathname === `/${code}` || pathname === `/${code}/`) return "/";
    if (pathname.startsWith(`/${code}/`)) return pathname.slice(code.length + 1);
  }
  return pathname;
}

function localizePathname(pathname, code = lang) {
  if (!pathname || !pathname.startsWith("/") || pathname.startsWith("//")) {
    return pathname;
  }

  if (pathname === "/404.html") {
    return code === defaultLang ? pathname : `/${code}/404.html`;
  }

  const stripped = stripLangPrefix(pathname, languageCodes);
  if (code === defaultLang) return stripped;
  return stripped === "/" ? `/${code}/` : `/${code}${stripped}`;
}

function renderSectionHeader(header, headingId, extraContent = "") {
  if (!header) return "";
  const idAttr = headingId ? ` id="${headingId}"` : "";
  return `<header class="section-header">
    ${header.kicker ? `<p class="section-header__kicker">${escapeHtml(header.kicker)}</p>` : ""}
    <h2${idAttr}>${escapeHtml(header.title)}</h2>
    ${header.intro ? `<p class="section-header__intro">${expand(header.intro)}</p>` : ""}
    ${extraContent}
  </header>`;
}

function renderParagraphs(items) {
  if (!items?.length) return "";
  return items.map((item) => `<p>${expand(item)}</p>`).join("");
}

function renderList(items, className = "doc-list") {
  if (!items?.length) return "";
  return `<ul class="${className}">
    ${items.map((item) => `<li>${expand(item)}</li>`).join("")}
  </ul>`;
}

function renderLinkList(items) {
  if (!items?.length) return "";
  return `<ul class="link-list">
    ${items
      .map((item) => {
        const href = escapeHtml(localizeHref(item.href));
        const label = escapeHtml(expandTokens(item.label));
        return `<li><a href="${href}">${label}</a></li>`;
      })
      .join("")}
  </ul>`;
}

function renderAction(action) {
  if (!action) return "";
  const label = action.label || (action.labelKey ? strings[action.labelKey] : "");
  if (!label) return "";
  const href = localizeHref(action.href || "#");
  const className =
    action.variant === "secondary"
      ? "button button--secondary"
      : action.variant === "plain"
        ? "button button--plain"
        : "button";
  return `<a class="${className}" href="${escapeHtml(href)}">${escapeHtml(label)}</a>`;
}

function renderLink(href, label) {
  return `<a href="${escapeHtml(localizeHref(href))}">${escapeHtml(label)}</a>`;
}

function localizeHref(href, code = lang) {
  const expanded = expandTokens(href);
  if (
    !expanded ||
    expanded.startsWith("#") ||
    expanded.startsWith("mailto:") ||
    expanded.startsWith("http://") ||
    expanded.startsWith("https://") ||
    expanded.startsWith("//")
  ) {
    return expanded;
  }

  const [pathname, suffix = ""] = splitHref(expanded);
  return `${localizePathname(pathname, code)}${suffix}`;
}

function splitHref(href) {
  const match = /^([^?#]*)(.*)$/.exec(href);
  return [match?.[1] || href, match?.[2] || ""];
}

// ── Token + text helpers ────────────────────────────────────────────────────
//
// Two expansion modes:
//   expandTokens(value)  raw substitution for attribute or label context.
//                        Caller must run escapeHtml afterwards.
//   expand(value)        rich substitution for body text. Trusts inline
//                        HTML authored in JSON (small set: <strong>, <em>,
//                        <a>, <code>), supports markdown links, and turns
//                        contact tokens into anchor elements directly.

function expandTokens(input) {
  if (input == null) return "";
  return String(input).replaceAll(/\{\{([\w.]+)\}\}/g, (_, key) =>
    rawTokens[key] ?? ""
  );
}

function expand(input) {
  if (input == null) return "";
  const source = String(input);
  const withRawTagTokens = source.replaceAll(/<[^>]+>/g, (tag) =>
    tag.replaceAll(/\{\{([\w.]+)\}\}/g, (_, key) => rawTokens[key] ?? "")
  );
  const withMarkdownLinks = expandMarkdownLinks(withRawTagTokens);
  return withMarkdownLinks.replaceAll(/\{\{([\w.]+)\}\}/g, (_, key) =>
    richTokens[key] ?? rawTokens[key] ?? ""
  );
}

function expandMarkdownLinks(input) {
  return input.replaceAll(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, href) => {
    const resolvedHref = localizeHref(expandTokens(href.trim()));
    const rel =
      resolvedHref.startsWith("http://") || resolvedHref.startsWith("https://")
        ? ' rel="external"'
        : "";
    return `<a href="${escapeHtml(resolvedHref)}"${rel}>${escapeHtml(label)}</a>`;
  });
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

// ── File outputs ────────────────────────────────────────────────────────────

function renderSitemap() {
  const baseUrls = [
    "/",
    "/projects/",
    "/projects/template/",
    "/propose/",
    "/governance/",
    "/join/",
    "/accessibility/",
    "/transparency/",
    ...projects.map((project) => `/projects/${project.slug}/`)
  ];
  const urls = indexableLanguages.flatMap((code) =>
    baseUrls.map((url) => localizePathname(url, code))
  );

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${[...new Set(urls)]
  .map((url) => `  <url><loc>${site.siteUrl}${url}</loc></url>`)
  .join("\n")}
</urlset>`;
}

function renderHeaders() {
  return `/*
  X-Frame-Options: DENY
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: geolocation=(), microphone=(), camera=()
  Content-Security-Policy: default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self' https://challenges.cloudflare.com; connect-src 'self'; frame-src https://challenges.cloudflare.com; font-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self' mailto:
`;
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

async function loadStrings(code) {
  const defaultFile = path.join(root, "content", "strings", `${defaultLang}.json`);
  const defaults = await readJson(defaultFile);
  if (code === defaultLang) return defaults;

  try {
    const localized = await readJson(
      path.join(root, "content", "strings", `${code}.json`)
    );
    return { ...defaults, ...localized };
  } catch (error) {
    if (error?.code === "ENOENT") return defaults;
    throw error;
  }
}

async function loadContent(code) {
  const contentDir = path.join(root, "content", "pages", code);
  const defaultDir = path.join(root, "content", "pages", defaultLang);

  return {
    home: await readJsonWithFallback(path.join(contentDir, "home.json"), path.join(defaultDir, "home.json")),
    projects: await readJsonWithFallback(path.join(contentDir, "projects.json"), path.join(defaultDir, "projects.json")),
    propose: await readJsonWithFallback(path.join(contentDir, "propose.json"), path.join(defaultDir, "propose.json")),
    governance: await readJsonWithFallback(path.join(contentDir, "governance.json"), path.join(defaultDir, "governance.json")),
    join: await readJsonWithFallback(path.join(contentDir, "join.json"), path.join(defaultDir, "join.json")),
    accessibility: await readJsonWithFallback(path.join(contentDir, "accessibility.json"), path.join(defaultDir, "accessibility.json")),
    transparency: await readJsonWithFallback(path.join(contentDir, "transparency.json"), path.join(defaultDir, "transparency.json")),
    template: await readJsonWithFallback(
      path.join(contentDir, "project-template.json"),
      path.join(defaultDir, "project-template.json")
    ),
    notFound: await readJsonWithFallback(
      path.join(contentDir, "not-found.json"),
      path.join(defaultDir, "not-found.json")
    )
  };
}

function getLocaleOutDir(code) {
  return code === defaultLang ? outDir : path.join(outDir, code);
}

async function readJsonWithFallback(primaryPath, fallbackPath) {
  try {
    return await readJson(primaryPath);
  } catch (error) {
    if (primaryPath !== fallbackPath && error?.code === "ENOENT") {
      return readJson(fallbackPath);
    }
    throw error;
  }
}
