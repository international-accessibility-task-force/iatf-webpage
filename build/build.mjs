import {
  cp,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile
} from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import {
  getFeaturedDraftCodes,
  LANGUAGE_BROWSER_REGION_CODES,
  LANGUAGE_BROWSER_UI_FALLBACKS
} from "../shared/language-browser.js";
import {
  getRouteSlug,
  localizeRoutePathname,
  stripLanguagePrefix
} from "../shared/routes.js";

const root = process.cwd();
const liveOutDir = path.join(root, "dist");
const buildRunId = String(process.pid);
const stagingOutDir = path.join(root, `.dist-build-${buildRunId}`);
const previousOutDir = path.join(root, `.dist-prev-${buildRunId}`);
const outDir = stagingOutDir;
const buildMetaFile = ".build-meta.json";
const isFastDevBuild = process.argv.includes("--dev-fast");
const noindex = process.env.NOINDEX === "1" || process.env.NOINDEX === "true";

const site = await readJson(path.join(root, "content", "site.json"));
const defaultLang = site.defaultLanguage;
const defaultStringsPath = path.join(root, "content", "strings", `${defaultLang}.json`);
const currentDefaultStrings = await readJson(defaultStringsPath);
const languages = await readJson(
  path.join(root, "content", "languages.json")
);
const nllbLanguages = await readJson(
  path.join(root, "data", "languages.nllb.json")
);
const baseProjects = await readJson(
  path.join(root, "data", "projects.json")
);
let projects = baseProjects;

const TRANSLATABLE_PROJECT_FIELDS = [
  "title",
  "summary",
  "problem",
  "why",
  "scopeIn",
  "scopeOut",
  "languageNotes",
  "primaryLanguage"
];
const RETRYABLE_RM_CODES = new Set(["ENOTEMPTY", "EBUSY", "EPERM"]);
const copiedStaticOutputs = [
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
];

async function removeDirWithRetry(directory, maxRetries = 8) {
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      await rm(directory, { recursive: true, force: true });
      return;
    } catch (error) {
      const retryable =
        RETRYABLE_RM_CODES.has(error?.code) && attempt < maxRetries;
      if (!retryable) {
        throw error;
      }

      const waitMs = 40 * (attempt + 1);
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
  }
}

async function renameDirWithRetry(
  source,
  target,
  { allowMissingSource = false, maxRetries = 8 } = {}
) {
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      await rename(source, target);
      return;
    } catch (error) {
      if (allowMissingSource && error?.code === "ENOENT") {
        return;
      }

      const retryable =
        RETRYABLE_RM_CODES.has(error?.code) && attempt < maxRetries;
      if (!retryable) {
        throw error;
      }

      const waitMs = 40 * (attempt + 1);
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
  }
}

async function pathExists(targetPath) {
  try {
    await stat(targetPath);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

async function collectSignatureEntries(
  targetPath,
  entries,
  { exclude = () => false } = {}
) {
  if (exclude(targetPath)) {
    return;
  }

  let targetStat;
  try {
    targetStat = await stat(targetPath);
  } catch (error) {
    if (error?.code === "ENOENT") {
      return;
    }
    throw error;
  }

  if (targetStat.isDirectory()) {
    const children = await readdir(targetPath, { withFileTypes: true });
    children.sort((a, b) => a.name.localeCompare(b.name));
    for (const child of children) {
      await collectSignatureEntries(path.join(targetPath, child.name), entries, {
        exclude
      });
    }
    return;
  }

  if (!targetStat.isFile()) {
    return;
  }

  entries.push(
    `${path.relative(root, targetPath)}:${targetStat.size}:${Math.trunc(
      targetStat.mtimeMs
    )}`
  );
}

async function createBuildSnapshot(
  targets,
  { exclude = () => false } = {}
) {
  const entries = [];
  for (const target of targets) {
    await collectSignatureEntries(target, entries, { exclude });
  }

  const hash = createHash("sha256");
  entries.sort();
  for (const entry of entries) {
    hash.update(entry);
    hash.update("\n");
  }
  return {
    entries,
    hash: hash.digest("hex")
  };
}

async function readBuildMeta(directory) {
  try {
    return JSON.parse(await readFile(path.join(directory, buildMetaFile), "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

function diffSignatureEntries(previousEntries, currentEntries) {
  if (!Array.isArray(previousEntries) || !Array.isArray(currentEntries)) {
    return null;
  }

  const previousMap = new Map(
    previousEntries.map((entry) => {
      const firstSeparator = entry.indexOf(":");
      return [entry.slice(0, firstSeparator), entry.slice(firstSeparator + 1)];
    })
  );
  const currentMap = new Map(
    currentEntries.map((entry) => {
      const firstSeparator = entry.indexOf(":");
      return [entry.slice(0, firstSeparator), entry.slice(firstSeparator + 1)];
    })
  );
  const changed = new Set();

  for (const [relativePath, currentSignature] of currentMap) {
    if (previousMap.get(relativePath) !== currentSignature) {
      changed.add(relativePath);
    }
  }

  for (const relativePath of previousMap.keys()) {
    if (!currentMap.has(relativePath)) {
      changed.add(relativePath);
    }
  }

  return [...changed].sort();
}

function diffObjectKeys(previousObject, currentObject) {
  if (
    !previousObject ||
    !currentObject ||
    typeof previousObject !== "object" ||
    typeof currentObject !== "object"
  ) {
    return null;
  }

  const keys = new Set([
    ...Object.keys(previousObject),
    ...Object.keys(currentObject)
  ]);

  return [...keys]
    .filter((key) => previousObject[key] !== currentObject[key])
    .sort();
}

function isProcessAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) {
    return false;
  }

  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error?.code === "ESRCH") {
      return false;
    }
    return true;
  }
}

async function cleanupStaleBuildDirs() {
  const entries = await readdir(root, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const match = entry.name.match(/^\.dist-(?:build|prev)-(\d+)$/);
    if (!match) {
      continue;
    }

    const pid = Number.parseInt(match[1], 10);
    if (pid === process.pid || isProcessAlive(pid)) {
      continue;
    }

    await removeDirWithRetry(path.join(root, entry.name));
  }
}

function isPublicSignatureExcluded(targetPath) {
  const relative = path.relative(root, targetPath).replaceAll("\\", "/");
  return (
    relative === "data/languages.nllb.json" ||
    relative.startsWith("content/nllb/") ||
    relative.startsWith("data/nllb/")
  );
}

async function replaceLiveOutDir({ reusePaths = [] } = {}) {
  await removeDirWithRetry(previousOutDir);
  await renameDirWithRetry(liveOutDir, previousOutDir, {
    allowMissingSource: true
  });

  for (const relativePath of reusePaths) {
    await renameDirWithRetry(
      path.join(previousOutDir, relativePath),
      path.join(outDir, relativePath),
      { allowMissingSource: true }
    );
  }

  await renameDirWithRetry(outDir, liveOutDir);
  await removeDirWithRetry(previousOutDir);
}

async function syncLiveOutDirInPlace({ managedFiles = [] } = {}) {
  await mkdir(liveOutDir, { recursive: true });

  for (const relativePath of managedFiles) {
    const sourcePath = path.join(outDir, relativePath);
    const targetPath = path.join(liveOutDir, relativePath);

    if (await pathExists(sourcePath)) {
      await mkdir(path.dirname(targetPath), { recursive: true });
      await cp(sourcePath, targetPath, { force: true });
    } else {
      await rm(targetPath, { force: true });
    }
  }

  await removeDirWithRetry(outDir);
  await removeDirWithRetry(previousOutDir);
}

await cleanupStaleBuildDirs();

async function loadProjects(code) {
  if (code === defaultLang) return baseProjects;
  const overlayPath = path.join(root, "data", `projects.${code}.json`);
  let overlay;
  try {
    overlay = await readJson(overlayPath);
  } catch (error) {
    if (error?.code === "ENOENT") return baseProjects;
    throw error;
  }
  const overlayBySlug = Object.fromEntries(
    overlay.map((entry) => [entry.slug, entry])
  );
  return baseProjects.map((project) => {
    const entry = overlayBySlug[project.slug];
    if (!entry) return project;
    const merged = { ...project };
    for (const field of TRANSLATABLE_PROJECT_FIELDS) {
      if (Object.prototype.hasOwnProperty.call(entry, field)) {
        merged[field] = entry[field];
      }
    }
    return merged;
  });
}

function localizeProjectStatus(status) {
  if (!status) return "";
  return strings[`project.status.${status}`] || status;
}

function renderLtrInlineText(value) {
  return `<bdi dir="ltr">${escapeHtml(value)}</bdi>`;
}

const languageCodes = Object.keys(languages);
const enabledLanguages = languageCodes.filter((code) => languages[code]?.enabled);
const publicNllbCodeToLanguageCode = new Map(
  enabledLanguages
    .map((code) => [languages[code]?.nllb, code])
    .filter(([nllbCode]) => Boolean(nllbCode))
);
const longTailNllbCodes = Object.keys(nllbLanguages).filter(
  (code) => !publicNllbCodeToLanguageCode.has(code)
);

if (!enabledLanguages.includes(defaultLang)) {
  enabledLanguages.unshift(defaultLang);
}

function isEnabledPublicLocale(code) {
  return enabledLanguages.includes(code);
}

const nllbIndependentPublicSourcePaths = new Set();

function isNllbSignatureExcluded(targetPath) {
  const relative = path.relative(root, targetPath).replaceAll("\\", "/");

  if (nllbIndependentPublicSourcePaths.has(relative)) {
    return true;
  }

  const pageMatch = /^content\/pages\/([^/]+)\/[^/]+\.json$/.exec(relative);
  if (pageMatch) {
    const code = pageMatch[1];
    return code !== defaultLang && isEnabledPublicLocale(code);
  }

  const stringsMatch = /^content\/strings\/([^/]+)\.json$/.exec(relative);
  if (stringsMatch) {
    const code = stringsMatch[1];
    return code !== defaultLang && isEnabledPublicLocale(code);
  }

  const projectOverlayMatch = /^data\/projects\.([^/]+)\.json$/.exec(relative);
  if (projectOverlayMatch) {
    const code = projectOverlayMatch[1];
    return code !== defaultLang && isEnabledPublicLocale(code);
  }

  return false;
}

const INDEXABLE_TRANSLATION_STATUSES = new Set(["source", "human-reviewed"]);
const RTL_SCRIPTS = new Set(["Arab", "Hebr"]);
const NLLB_ROUTE_PREFIX = "/nllb/";
const NLLB_REGION_ORDER = [
  "worldwide",
  "europe",
  "america",
  "middle-east",
  "africa",
  "asia",
  "pacific"
];
let currentRouteMode = "public";
let currentNllbCode = "";
let currentNllbSlug = "";

function getTranslationStatus(code) {
  if (nllbLanguages[code]) return "machine-assisted";
  return languages[code]?.translation?.status || "machine-assisted";
}

function isIndexableLocale(code) {
  return INDEXABLE_TRANSLATION_STATUSES.has(getTranslationStatus(code));
}

function getLanguageDirection(code) {
  const nllbDirection = nllbLanguages[code]?.direction;
  if (nllbDirection === "rtl" || nllbDirection === "ltr") {
    return nllbDirection;
  }
  const explicitDirection = languages[code]?.direction;
  if (explicitDirection === "rtl" || explicitDirection === "ltr") {
    return explicitDirection;
  }
  const script = languages[code]?.script || nllbLanguages[code]?.script;
  return RTL_SCRIPTS.has(script) ? "rtl" : "ltr";
}

const indexableLanguages = enabledLanguages.filter(isIndexableLocale);

let lang = defaultLang;
let { values: strings, localizedKeys: localizedStringKeys } = await loadStrings(lang);
let content = await loadContent(lang);
const publicDiscordUrl = site.contact.discordUrl || site.contact.discordInviteUrl;

const rawTokens = {
  "contact.accessibilityEmail":
    site.contact.accessibilityEmail || site.contact.generalEmail,
  "contact.requestsEmail": site.contact.requestsEmail || site.contact.projectsEmail,
  "contact.projectsEmail": site.contact.projectsEmail,
  "contact.generalEmail": site.contact.generalEmail,
  "contact.i18nEmail": site.contact.i18nEmail || site.contact.generalEmail,
  "contact.discordUrl": publicDiscordUrl,
  "contact.discordInviteUrl": publicDiscordUrl,
  "contact.githubOrgUrl": site.contact.githubOrgUrl,
  "site.title": site.siteTitle,
  "site.short": site.siteName
};

const richTokens = {
  "contact.accessibilityEmail": `<a href="mailto:${escapeHtml(rawTokens["contact.accessibilityEmail"])}">${renderLtrInlineText(rawTokens["contact.accessibilityEmail"])}</a>`,
  "contact.requestsEmail": `<a href="mailto:${escapeHtml(rawTokens["contact.requestsEmail"])}">${renderLtrInlineText(rawTokens["contact.requestsEmail"])}</a>`,
  "contact.projectsEmail": `<a href="mailto:${escapeHtml(rawTokens["contact.projectsEmail"])}">${renderLtrInlineText(rawTokens["contact.projectsEmail"])}</a>`,
  "contact.generalEmail": `<a href="mailto:${escapeHtml(rawTokens["contact.generalEmail"])}">${renderLtrInlineText(rawTokens["contact.generalEmail"])}</a>`,
  "contact.i18nEmail": `<a href="mailto:${escapeHtml(rawTokens["contact.i18nEmail"])}">${renderLtrInlineText(rawTokens["contact.i18nEmail"])}</a>`,
  "contact.discordUrl": `<a href="${escapeHtml(rawTokens["contact.discordUrl"])}" rel="external">${renderLtrInlineText(rawTokens["contact.discordUrl"])}</a>`,
  "contact.discordInviteUrl": `<a href="${escapeHtml(rawTokens["contact.discordInviteUrl"])}" rel="external">${renderLtrInlineText(rawTokens["contact.discordInviteUrl"])}</a>`,
  "contact.githubOrgUrl": `<a href="${escapeHtml(rawTokens["contact.githubOrgUrl"])}" rel="external">${renderLtrInlineText(rawTokens["contact.githubOrgUrl"])}</a>`
};

function getLanguageMetadata(code) {
  return languages[code] || nllbLanguages[code] || {};
}

function isReviewedLanguageStatus(status) {
  return status === "source" || status === "human-reviewed";
}

function hasLocalizedString(key) {
  return lang === defaultLang || localizedStringKeys.has(key);
}

function getLanguageBrowserLabel(key, englishFallback = "") {
  if (hasLocalizedString(key) && strings[key]) {
    return strings[key];
  }

  const browserFallback = LANGUAGE_BROWSER_UI_FALLBACKS[lang]?.[key];
  if (browserFallback) {
    return browserFallback;
  }

  return lang === defaultLang ? strings[key] || englishFallback : englishFallback;
}

function getLanguageBrowserCopy(key, englishFallback = "") {
  if (hasLocalizedString(key) && strings[key]) {
    return strings[key];
  }

  return lang === defaultLang ? strings[key] || englishFallback : "";
}

function getLanguagePageTitle() {
  return getLanguageBrowserLabel(
    "languages.page.title",
    strings["nav.languagePlural"] || "Languages"
  );
}

function getLanguageStatusLabel(status) {
  const key = {
    source: "languages.status.source",
    "human-reviewed": "languages.status.reviewed",
    "machine-assisted": "languages.status.draft",
    "needs-update": "languages.status.needsUpdate"
  }[status];

  const fallback = {
    source: "Source",
    "human-reviewed": "Reviewed",
    "machine-assisted": "Draft",
    "needs-update": "Needs update"
  }[status] || status;

  return getLanguageBrowserLabel(key, fallback);
}

function getLanguageStatusTone(status) {
  if (status === "source" || status === "human-reviewed") return "reviewed";
  if (status === "needs-update") return "warning";
  return "draft";
}

function getLanguageEntry(code, href) {
  const language = getLanguageMetadata(code);
  return {
    code,
    href,
    nativeName: language.nativeName || language.displayLabel || code,
    englishName: language.englishName || language.displayLabel || code,
    langTag: getHtmlLangTag(code),
    direction: getLanguageDirection(code),
    status: getTranslationStatus(code),
    region: getLanguageRegion(code)
  };
}

function sortLanguageEntries(entries, preferredOrder = []) {
  const orderMap = new Map(preferredOrder.map((code, index) => [code, index]));
  return [...entries].sort((a, b) => {
    const aOrder = orderMap.has(a.code) ? orderMap.get(a.code) : Number.MAX_SAFE_INTEGER;
    const bOrder = orderMap.has(b.code) ? orderMap.get(b.code) : Number.MAX_SAFE_INTEGER;
    if (aOrder !== bOrder) return aOrder - bOrder;
    return a.nativeName.localeCompare(b.nativeName, undefined, { sensitivity: "base" });
  });
}

function getEnabledLanguageEntriesForPath(pathname) {
  return enabledLanguages.map((code) =>
    getLanguageEntry(code, localizePublicPathname(pathname, code))
  );
}

function getLongTailLanguageEntriesForPath(pathname) {
  return longTailNllbCodes.map((code) => {
    const slug = nllbLanguages[code]?.slug || String(code).toLowerCase().replaceAll("_", "-");
    const href =
      pathname === "/languages/"
        ? getNllbRootPath(code)
        : localizeNllbPathname(pathname, slug);
    return getLanguageEntry(code, href);
  });
}

function getLanguageBrowserEntriesForPage() {
  const publicEntries = enabledLanguages.map((code) =>
    getLanguageEntry(code, localizePublicPathname("/", code))
  );
  const nllbEntries = getLongTailLanguageEntriesForPath("/");
  return [...publicEntries, ...nllbEntries];
}

function getLanguageBrowserGroupsForPage(entries) {
  const entriesByRegion = new Map(
    NLLB_REGION_ORDER.map((region) => [region, []])
  );

  for (const entry of entries) {
    const region = normalizeLanguageRegion(entry.region);
    if (!entriesByRegion.has(region)) {
      entriesByRegion.set(region, []);
    }
    entriesByRegion.get(region).push(entry);
  }

  return [...entriesByRegion.entries()]
    .map(([key, groupEntries]) => ({
      key,
      title: getLanguageBrowserRegionTitle(key, key),
      entries: sortLanguageEntries(groupEntries)
    }))
    .filter((group) => group.entries.length > 0);
}

function getLanguageBrowserRegionTitle(key, fallbackTitle) {
  const stringKey = `languages.region.${key}`;
  if (hasLocalizedString(stringKey) && strings[stringKey]) {
    return strings[stringKey];
  }

  const browserFallback = LANGUAGE_BROWSER_UI_FALLBACKS[lang]?.[stringKey];
  if (browserFallback) {
    return browserFallback;
  }

  const regionCode = LANGUAGE_BROWSER_REGION_CODES[key];
  if (!regionCode) return strings[stringKey] || fallbackTitle;

  try {
    const displayNames = new Intl.DisplayNames(
      [languages[lang]?.ietfBcp47 || lang],
      { type: "region" }
    );
    return displayNames.of(regionCode) || fallbackTitle;
  } catch {
    return strings[stringKey] || fallbackTitle;
  }
}

function getLanguageRegion(code) {
  if (nllbLanguages[code]?.region) {
    return normalizeLanguageRegion(nllbLanguages[code].region);
  }

  const publicNllbCode = languages[code]?.nllb;
  if (publicNllbCode && nllbLanguages[publicNllbCode]?.region) {
    return normalizeLanguageRegion(nllbLanguages[publicNllbCode].region);
  }

  return code === defaultLang ? "worldwide" : "worldwide";
}

function normalizeLanguageRegion(region) {
  if (region === "americas") return "america";
  return region || "worldwide";
}

function getHtmlLangTag(code) {
  const explicitTag = languages[code]?.ietfBcp47;
  if (explicitTag) return explicitTag;

  const nllbLanguage = nllbLanguages[code];
  if (nllbLanguage?.iso639_3 && nllbLanguage?.script) {
    return `${nllbLanguage.iso639_3}-${nllbLanguage.script}`;
  }

  return String(code).replaceAll("_", "-");
}

const routes = [
  { key: "", render: () => renderHomePage() },
  { key: "projects", render: () => renderProjectsPage() },
  { key: "propose", render: () => renderProposePage() },
  { key: "governance", render: () => renderGovernancePage() },
  { key: "join", render: () => renderJoinPage() },
  { key: "accessibility", render: () => renderAccessibilityPage() },
  { key: "transparency", render: () => renderTransparencyPage() },
  { key: "sitemap", render: () => renderSitemapPage() },
  { key: "languages", render: () => renderLanguagesPage() }
];
const nllbRoutes = routes.filter((route) => route.key !== "languages");
const NOT_FOUND_ROUTE_KEY = "__not_found__";
const routeByKey = new Map(routes.map((route) => [route.key, route]));
const allPublicRouteKeys = routes.map((route) => route.key);
const allNllbRouteKeys = nllbRoutes.map((route) => route.key);
const projectDependentPublicRouteKeys = ["", "projects", "sitemap"];
const publicContentPageToRouteKey = new Map([
  ["home", ""],
  ["projects", "projects"],
  ["propose", "propose"],
  ["governance", "governance"],
  ["join", "join"],
  ["accessibility", "accessibility"],
  ["transparency", "transparency"],
  ["sitemap", "sitemap"],
  ["not-found", NOT_FOUND_ROUTE_KEY]
]);

function createOutputImpact() {
  return {
    allPages: false,
    routeKeys: new Set(),
    includeNotFound: false,
    includeProjectPages: false
  };
}

function markAllPagesImpact(impact) {
  impact.allPages = true;
  impact.includeNotFound = true;
  impact.includeProjectPages = true;
  return impact;
}

function mergeOutputImpact(target, source) {
  if (!source) {
    return target;
  }

  if (source.allPages) {
    markAllPagesImpact(target);
  }

  for (const routeKey of source.routeKeys || []) {
    target.routeKeys.add(routeKey);
  }

  if (source.includeNotFound) {
    target.includeNotFound = true;
  }

  if (source.includeProjectPages) {
    target.includeProjectPages = true;
  }

  return target;
}

function hasOutputImpact(impact) {
  return Boolean(
    impact?.allPages ||
      impact?.includeNotFound ||
      impact?.includeProjectPages ||
      impact?.routeKeys?.size
  );
}

function createRouteOnlyImpact(routeKey) {
  const impact = createOutputImpact();
  if (routeKey === NOT_FOUND_ROUTE_KEY) {
    impact.includeNotFound = true;
  } else {
    impact.routeKeys.add(routeKey);
  }
  return impact;
}

function collectActionLabelKeys(value, keys = new Set()) {
  if (Array.isArray(value)) {
    for (const item of value) {
      collectActionLabelKeys(item, keys);
    }
    return keys;
  }

  if (!value || typeof value !== "object") {
    return keys;
  }

  if (typeof value.labelKey === "string" && value.labelKey.startsWith("actions.")) {
    keys.add(value.labelKey);
  }

  for (const child of Object.values(value)) {
    collectActionLabelKeys(child, keys);
  }

  return keys;
}

const defaultActionRouteMap = new Map();
for (const [pageName, routeKey] of publicContentPageToRouteKey.entries()) {
  const contentKey = pageName === "not-found" ? "notFound" : pageName;
  const pageContent = content[contentKey];
  if (!pageContent) {
    continue;
  }

  for (const actionKey of collectActionLabelKeys(pageContent)) {
    if (!defaultActionRouteMap.has(actionKey)) {
      defaultActionRouteMap.set(actionKey, new Set());
    }
    defaultActionRouteMap.get(actionKey).add(routeKey);
  }
}
defaultActionRouteMap.set(
  "actions.proposeProject",
  new Set([
    ...(defaultActionRouteMap.get("actions.proposeProject") || []),
    "",
    "projects"
  ])
);

function getDefaultStringKeyImpact(key) {
  const impact = createOutputImpact();

  if (key === "site.tagline") {
    return impact;
  }

  if (
    key.startsWith("site.") ||
    key.startsWith("nav.") ||
    key === "skip.toContent" ||
    key.startsWith("footer.") ||
    key.startsWith("contact.") ||
    key.startsWith("translation.") ||
    key.startsWith("languages.switcher.") ||
    key.startsWith("languages.status.")
  ) {
    return markAllPagesImpact(impact);
  }

  const heroMatch = /^hero\.([^.]+)\./.exec(key);
  if (heroMatch) {
    const routeKey = publicContentPageToRouteKey.get(heroMatch[1]);
    return routeKey !== undefined
      ? createRouteOnlyImpact(routeKey)
      : markAllPagesImpact(impact);
  }

  const metaMatch = /^meta\.([^.]+)\.description$/.exec(key);
  if (metaMatch) {
    const routeKey = publicContentPageToRouteKey.get(metaMatch[1]);
    return routeKey !== undefined
      ? createRouteOnlyImpact(routeKey)
      : markAllPagesImpact(impact);
  }

  if (key.startsWith("registry.")) {
    impact.routeKeys.add("");
    impact.routeKeys.add("projects");
    return impact;
  }

  if (key.startsWith("proposal.")) {
    return createRouteOnlyImpact("propose");
  }

  if (key.startsWith("project.detail.")) {
    impact.includeProjectPages = true;
    return impact;
  }

  if (key.startsWith("project.status.")) {
    impact.routeKeys.add("");
    impact.routeKeys.add("projects");
    impact.includeProjectPages = true;
    return impact;
  }

  if (key.startsWith("languages.page.")) {
    impact.routeKeys.add("languages");
    impact.routeKeys.add("sitemap");
    return impact;
  }

  if (
    key.startsWith("languages.hero.") ||
    key.startsWith("languages.overview.") ||
    key.startsWith("languages.directory.") ||
    key.startsWith("languages.search.") ||
    key.startsWith("languages.region.")
  ) {
    return createRouteOnlyImpact("languages");
  }

  if (key.startsWith("actions.")) {
    const actionRoutes = defaultActionRouteMap.get(key);
    if (!actionRoutes?.size) {
      return markAllPagesImpact(impact);
    }
    for (const routeKey of actionRoutes) {
      if (routeKey === NOT_FOUND_ROUTE_KEY) {
        impact.includeNotFound = true;
      } else {
        impact.routeKeys.add(routeKey);
      }
    }
    return impact;
  }

  return markAllPagesImpact(impact);
}

function getDefaultStringImpact(changedKeys) {
  const impact = createOutputImpact();
  for (const key of changedKeys || []) {
    mergeOutputImpact(impact, getDefaultStringKeyImpact(key));
  }
  return impact;
}

const publicLocalizedStringKeysCache = new Map();
async function getPublicLocalizedStringKeys(code) {
  if (publicLocalizedStringKeysCache.has(code)) {
    return publicLocalizedStringKeysCache.get(code);
  }

  let keys = new Set();
  if (code !== defaultLang) {
    try {
      keys = new Set(
        Object.keys(
          await readJson(path.join(root, "content", "strings", `${code}.json`))
        )
      );
    } catch (error) {
      if (error?.code !== "ENOENT") {
        throw error;
      }
    }
  }

  publicLocalizedStringKeysCache.set(code, keys);
  return keys;
}

const nllbLocalizedStringKeysCache = new Map();
async function getNllbLocalizedStringKeys(code) {
  if (nllbLocalizedStringKeysCache.has(code)) {
    return nllbLocalizedStringKeysCache.get(code);
  }

  let keys = new Set();
  try {
    keys = new Set(
      Object.keys(
        await readJson(
          path.join(root, "content", "nllb", "strings", `${code}.json`)
        )
      )
    );
  } catch (error) {
    if (error?.code !== "ENOENT") {
      throw error;
    }
  }

  nllbLocalizedStringKeysCache.set(code, keys);
  return keys;
}

async function getPublicLocalesAffectedByDefaultStringKeys(changedKeys) {
  if (!changedKeys?.length) {
    return [];
  }

  const affectedCodes = [defaultLang];
  const localizedResults = await Promise.all(
    enabledLanguages
      .filter((code) => code !== defaultLang)
      .map(async (code) => {
        const localizedKeys = await getPublicLocalizedStringKeys(code);
        return changedKeys.some((key) => !localizedKeys.has(key)) ? code : null;
      })
  );

  return [...affectedCodes, ...localizedResults.filter(Boolean)];
}

async function getNllbCodesAffectedByDefaultStringKeys(changedKeys) {
  if (!changedKeys?.length) {
    return [];
  }

  const localizedResults = await Promise.all(
    longTailNllbCodes.map(async (code) => {
      const localizedKeys = await getNllbLocalizedStringKeys(code);
      return changedKeys.some((key) => !localizedKeys.has(key)) ? code : null;
    })
  );

  return localizedResults.filter(Boolean);
}

async function getSelectiveDefaultStringPlans(changedPaths, previousBuildMeta) {
  const relativeDefaultStringsPath = path
    .relative(root, defaultStringsPath)
    .replaceAll("\\", "/");

  if (
    !Array.isArray(changedPaths) ||
    changedPaths.length !== 1 ||
    changedPaths[0] !== relativeDefaultStringsPath
  ) {
    return { publicPlan: null, nllbPlan: null };
  }

  const changedKeys = diffObjectKeys(
    previousBuildMeta?.defaultStrings,
    currentDefaultStrings
  );
  if (!changedKeys) {
    return { publicPlan: null, nllbPlan: null };
  }

  const impact = getDefaultStringImpact(changedKeys);
  const [publicCodes, nllbCodes] = hasOutputImpact(impact)
    ? await Promise.all([
        getPublicLocalesAffectedByDefaultStringKeys(changedKeys),
        getNllbCodesAffectedByDefaultStringKeys(changedKeys)
      ])
    : [[], []];

  return {
    publicPlan: {
      kind: "default-strings",
      changedPath: relativeDefaultStringsPath,
      changedKeys,
      impact,
      codes: publicCodes
    },
    nllbPlan: {
      kind: "default-strings",
      changedPath: relativeDefaultStringsPath,
      changedKeys,
      impact,
      codes: nllbCodes
    }
  };
}

async function getDefaultPublicPageAffectedCodes(pageName) {
  const affectedCodes = [defaultLang];

  for (const code of enabledLanguages) {
    if (code === defaultLang) {
      continue;
    }

    const localizedPagePath = path.join(root, "content", "pages", code, `${pageName}.json`);
    if (!(await pathExists(localizedPagePath))) {
      affectedCodes.push(code);
    }
  }

  return affectedCodes;
}

for (const pageName of publicContentPageToRouteKey.keys()) {
  let allNllbPagesExist = true;

  for (const code of longTailNllbCodes) {
    const nllbPagePath = path.join(root, "content", "nllb", "pages", code, `${pageName}.json`);
    if (!(await pathExists(nllbPagePath))) {
      allNllbPagesExist = false;
      break;
    }
  }

  if (allNllbPagesExist) {
    nllbIndependentPublicSourcePaths.add(
      path.join("content", "pages", defaultLang, `${pageName}.json`).replaceAll("\\", "/")
    );
  }
}

function getPublicRouteOutputPath(code, routeKey) {
  const localePrefix = code === defaultLang ? "" : code;

  if (routeKey === NOT_FOUND_ROUTE_KEY) {
    return localePrefix ? path.join(localePrefix, "404.html") : "404.html";
  }

  if (!routeKey) {
    return localePrefix ? path.join(localePrefix, "index.html") : "index.html";
  }

  return path.join(localePrefix, getRouteSlug(routeKey, code), "index.html");
}

function getPublicProjectOutputPaths(code, projectList) {
  return projectList.map((project) =>
    path.join(
      code === defaultLang ? "" : code,
      getRouteSlug("projects", code),
      project.slug,
      "index.html"
    )
  );
}

function getAllPublicLocaleOutputPaths(code, projectList) {
  return [
    ...allPublicRouteKeys.map((routeKey) => getPublicRouteOutputPath(code, routeKey)),
    getPublicRouteOutputPath(code, NOT_FOUND_ROUTE_KEY),
    ...getPublicProjectOutputPaths(code, projectList)
  ];
}

function getProjectRelatedPublicOutputPaths(code, projectList) {
  return [
    ...projectDependentPublicRouteKeys.map((routeKey) =>
      getPublicRouteOutputPath(code, routeKey)
    ),
    ...getPublicProjectOutputPaths(code, projectList)
  ];
}

function getNllbOutputSlug(code) {
  return nllbLanguages[code]?.slug || String(code).toLowerCase().replaceAll("_", "-");
}

function getNllbRouteOutputPath(code, routeKey) {
  const localePrefix = path.join("nllb", getNllbOutputSlug(code));

  if (routeKey === NOT_FOUND_ROUTE_KEY) {
    return path.join(localePrefix, "404.html");
  }

  if (!routeKey) {
    return path.join(localePrefix, "index.html");
  }

  return path.join(localePrefix, getRouteSlug(routeKey, code), "index.html");
}

function getNllbProjectOutputPaths(code, projectList) {
  return projectList.map((project) =>
    path.join(
      "nllb",
      getNllbOutputSlug(code),
      getRouteSlug("projects", code),
      project.slug,
      "index.html"
    )
  );
}

function getRouteKeysForImpact(impact, allowedRouteKeys) {
  return impact.allPages
    ? allowedRouteKeys
    : allowedRouteKeys.filter((routeKey) => impact.routeKeys.has(routeKey));
}

function getSelectivePublicBuildPlan(changedPaths) {
  if (!Array.isArray(changedPaths) || changedPaths.length !== 1) {
    return null;
  }

  const [changedPath] = changedPaths;

  const pageMatch = /^content\/pages\/([^/]+)\/([^.]+)\.json$/.exec(changedPath);
  if (pageMatch) {
    const [, code, pageName] = pageMatch;
    const routeKey = publicContentPageToRouteKey.get(pageName);
    if (routeKey !== undefined && code === defaultLang) {
      return {
        kind: "default-page",
        pageName,
        routeKey,
        changedPath
      };
    }

    if (
      code !== defaultLang &&
      isEnabledPublicLocale(code) &&
      routeKey !== undefined
    ) {
      return {
        kind: "page",
        code,
        routeKey,
        changedPath
      };
    }
  }

  const stringsMatch = /^content\/strings\/([^/]+)\.json$/.exec(changedPath);
  if (stringsMatch) {
    const [, code] = stringsMatch;
    if (code !== defaultLang && isEnabledPublicLocale(code)) {
      return {
        kind: "locale",
        code,
        changedPath
      };
    }
  }

  const projectOverlayMatch = /^data\/projects\.([^/]+)\.json$/.exec(changedPath);
  if (projectOverlayMatch) {
    const [, code] = projectOverlayMatch;
    if (code !== defaultLang && isEnabledPublicLocale(code)) {
      return {
        kind: "projects",
        code,
        changedPath
      };
    }
  }

  return null;
}

async function loadPublicLocaleState(code) {
  currentRouteMode = "public";
  currentNllbCode = "";
  currentNllbSlug = "";
  lang = code;
  ({ values: strings, localizedKeys: localizedStringKeys } =
    await loadStrings(code));
  content = await loadContent(code);
  projects = await loadProjects(code);
}

async function loadNllbLocaleState(code) {
  currentRouteMode = "nllb";
  currentNllbCode = code;
  currentNllbSlug = getNllbOutputSlug(code);
  lang = code;
  ({ values: strings, localizedKeys: localizedStringKeys } =
    await loadNllbStrings(code));
  content = await loadNllbContent(code);
  projects = await loadNllbProjects(code);
}

async function writePublicRouteOutput(code, routeKey) {
  const localeOutDir = getLocaleOutDir(code);
  await mkdir(localeOutDir, { recursive: true });

  if (routeKey === NOT_FOUND_ROUTE_KEY) {
    await writeFile(path.join(localeOutDir, "404.html"), renderNotFoundPage());
    return;
  }

  const route = routeByKey.get(routeKey);
  if (!route) {
    throw new Error(`Unknown public route key: ${routeKey}`);
  }

  const pageDir = route.key
    ? path.join(localeOutDir, getRouteSlug(route.key, code))
    : localeOutDir;
  await mkdir(pageDir, { recursive: true });
  await writeFile(path.join(pageDir, "index.html"), route.render());
}

async function writePublicProjectOutputs(code, projectList = projects) {
  const localeOutDir = getLocaleOutDir(code);
  const projectsOutDir = path.join(localeOutDir, getRouteSlug("projects", code));
  await mkdir(projectsOutDir, { recursive: true });

  for (const project of projectList) {
    const projectDir = path.join(projectsOutDir, project.slug);
    await mkdir(projectDir, { recursive: true });
    await writeFile(path.join(projectDir, "index.html"), renderProjectPage(project));
  }
}

async function writeNllbRouteOutput(code, routeKey) {
  const localeOutDir = path.join(outDir, "nllb", getNllbOutputSlug(code));
  await mkdir(localeOutDir, { recursive: true });

  if (routeKey === NOT_FOUND_ROUTE_KEY) {
    await writeFile(path.join(localeOutDir, "404.html"), renderNotFoundPage());
    return;
  }

  const route = routeByKey.get(routeKey);
  if (!route || route.key === "languages") {
    throw new Error(`Unknown NLLB route key: ${routeKey}`);
  }

  const pageDir = route.key
    ? path.join(localeOutDir, getRouteSlug(route.key, code))
    : localeOutDir;
  await mkdir(pageDir, { recursive: true });
  await writeFile(path.join(pageDir, "index.html"), route.render());
}

async function writeNllbProjectOutputs(code, projectList = projects) {
  const localeOutDir = path.join(outDir, "nllb", getNllbOutputSlug(code));
  const projectsOutDir = path.join(localeOutDir, getRouteSlug("projects", code));
  await mkdir(projectsOutDir, { recursive: true });

  for (const project of projectList) {
    const projectDir = path.join(projectsOutDir, project.slug);
    await mkdir(projectDir, { recursive: true });
    await writeFile(path.join(projectDir, "index.html"), renderProjectPage(project));
  }
}

async function writePublicOutputsForImpact(code, impact, projectList = projects) {
  const managedPaths = [];

  for (const routeKey of getRouteKeysForImpact(impact, allPublicRouteKeys)) {
    await writePublicRouteOutput(code, routeKey);
    managedPaths.push(getPublicRouteOutputPath(code, routeKey));
  }

  if (impact.allPages || impact.includeProjectPages) {
    await writePublicProjectOutputs(code, projectList);
    managedPaths.push(...getPublicProjectOutputPaths(code, projectList));
  }

  if (impact.allPages || impact.includeNotFound) {
    await writePublicRouteOutput(code, NOT_FOUND_ROUTE_KEY);
    managedPaths.push(getPublicRouteOutputPath(code, NOT_FOUND_ROUTE_KEY));
  }

  return managedPaths;
}

async function writeNllbOutputsForImpact(code, impact, projectList = projects) {
  const managedPaths = [];

  for (const routeKey of getRouteKeysForImpact(impact, allNllbRouteKeys)) {
    await writeNllbRouteOutput(code, routeKey);
    managedPaths.push(getNllbRouteOutputPath(code, routeKey));
  }

  if (impact.allPages || impact.includeProjectPages) {
    await writeNllbProjectOutputs(code, projectList);
    managedPaths.push(...getNllbProjectOutputPaths(code, projectList));
  }

  if (impact.allPages || impact.includeNotFound) {
    await writeNllbRouteOutput(code, NOT_FOUND_ROUTE_KEY);
    managedPaths.push(getNllbRouteOutputPath(code, NOT_FOUND_ROUTE_KEY));
  }

  return managedPaths;
}

async function buildSelectivePublicOutputs(plan) {
  if (plan.kind === "default-page") {
    const affectedCodes = await getDefaultPublicPageAffectedCodes(plan.pageName);
    const managedPaths = [];

    for (const code of affectedCodes) {
      await loadPublicLocaleState(code);
      await writePublicRouteOutput(code, plan.routeKey);
      managedPaths.push(getPublicRouteOutputPath(code, plan.routeKey));
    }

    return managedPaths;
  }

  if (plan.kind === "default-strings") {
    const managedPaths = [];

    for (const code of plan.codes) {
      await loadPublicLocaleState(code);
      managedPaths.push(...(await writePublicOutputsForImpact(code, plan.impact)));
    }

    return managedPaths;
  }

  await loadPublicLocaleState(plan.code);

  if (plan.kind === "page") {
    await writePublicRouteOutput(plan.code, plan.routeKey);
    return [getPublicRouteOutputPath(plan.code, plan.routeKey)];
  }

  if (plan.kind === "locale") {
    for (const routeKey of allPublicRouteKeys) {
      await writePublicRouteOutput(plan.code, routeKey);
    }
    await writePublicProjectOutputs(plan.code, projects);
    await writePublicRouteOutput(plan.code, NOT_FOUND_ROUTE_KEY);
    return getAllPublicLocaleOutputPaths(plan.code, projects);
  }

  if (plan.kind === "projects") {
    for (const routeKey of projectDependentPublicRouteKeys) {
      await writePublicRouteOutput(plan.code, routeKey);
    }
    await writePublicProjectOutputs(plan.code, projects);
    return getProjectRelatedPublicOutputPaths(plan.code, projects);
  }

  return [];
}

async function buildSelectiveNllbOutputs(plan) {
  if (plan?.kind !== "default-strings") {
    return [];
  }

  const managedPaths = [];

  for (const code of plan.codes) {
    await loadNllbLocaleState(code);
    managedPaths.push(...(await writeNllbOutputsForImpact(code, plan.impact)));
  }

  return managedPaths;
}

const signatureInputs = [
  path.join(root, "build", "build.mjs"),
  path.join(root, "shared"),
  path.join(root, "content"),
  path.join(root, "data")
];
const previousBuildMeta = await readBuildMeta(liveOutDir);
const publicSnapshot = await createBuildSnapshot(signatureInputs, {
  exclude: isPublicSignatureExcluded
});
const nllbSnapshot = await createBuildSnapshot(signatureInputs, {
  exclude: isNllbSignatureExcluded
});
const buildMeta = {
  mode: isFastDevBuild ? "dev-fast" : "full",
  publicSignature: publicSnapshot.hash,
  publicEntries: publicSnapshot.entries,
  nllbSignature: nllbSnapshot.hash,
  nllbEntries: nllbSnapshot.entries,
  defaultStrings: currentDefaultStrings
};
const changedPublicPaths = diffSignatureEntries(
  previousBuildMeta?.publicEntries,
  publicSnapshot.entries
);
const defaultStringPlans = await getSelectiveDefaultStringPlans(
  changedPublicPaths,
  previousBuildMeta
);
const selectivePublicBuildPlan =
  getSelectivePublicBuildPlan(changedPublicPaths) || defaultStringPlans.publicPlan;
const selectiveNllbBuildPlan = defaultStringPlans.nllbPlan;
const reusablePublicOutputPaths = [
  "index.html",
  "404.html",
  ...routes
    .filter((route) => route.key)
    .map((route) => getRouteSlug(route.key, defaultLang)),
  ...enabledLanguages.filter((code) => code !== defaultLang)
];
const hasLivePublicOutput = await pathExists(path.join(liveOutDir, "index.html"));
const hasLiveNllbOutput = await pathExists(path.join(liveOutDir, "nllb"));
const reuseExistingPublic =
  isFastDevBuild &&
  previousBuildMeta?.publicSignature === buildMeta.publicSignature &&
  hasLivePublicOutput;
const reuseExistingNllb =
  isFastDevBuild &&
  previousBuildMeta?.nllbSignature === buildMeta.nllbSignature &&
  hasLiveNllbOutput;
const canSelectivelyBuildNllb =
  isFastDevBuild && Boolean(selectiveNllbBuildPlan) && hasLiveNllbOutput;
const canSelectivelyBuildPublic =
  isFastDevBuild &&
  Boolean(selectivePublicBuildPlan) &&
  hasLivePublicOutput &&
  (reuseExistingNllb || canSelectivelyBuildNllb);
let selectivePublicManagedPaths = [];
let selectiveNllbManagedPaths = [];
const canUpdateLiveOutDirInPlace =
  (reuseExistingPublic || canSelectivelyBuildPublic) &&
  (reuseExistingNllb || canSelectivelyBuildNllb);
const liveManagedFiles = [
  ...copiedStaticOutputs.map(([, target]) => target),
  "robots.txt",
  "site-config.json",
  "sitemap.xml",
  "_headers",
  buildMetaFile
];

await removeDirWithRetry(outDir);
await removeDirWithRetry(previousOutDir);
await mkdir(outDir, { recursive: true });

for (const [source, target] of copiedStaticOutputs) {
  await cp(path.join(root, source), path.join(outDir, target));
}

if (canSelectivelyBuildPublic) {
  selectivePublicManagedPaths = await buildSelectivePublicOutputs(
    selectivePublicBuildPlan
  );
}

if (canSelectivelyBuildNllb) {
  selectiveNllbManagedPaths = await buildSelectiveNllbOutputs(
    selectiveNllbBuildPlan
  );
}

if (!reuseExistingPublic && !canSelectivelyBuildPublic) {
  for (const code of enabledLanguages) {
    await loadPublicLocaleState(code);

    for (const routeKey of allPublicRouteKeys) {
      await writePublicRouteOutput(code, routeKey);
    }
    await writePublicProjectOutputs(code, projects);
    await writePublicRouteOutput(code, NOT_FOUND_ROUTE_KEY);
  }
}

if (!reuseExistingNllb && !canSelectivelyBuildNllb) {
  const nllbOutDir = path.join(outDir, "nllb");
  await mkdir(nllbOutDir, { recursive: true });

  for (const code of longTailNllbCodes) {
    currentRouteMode = "nllb";
    currentNllbCode = code;
    currentNllbSlug =
      nllbLanguages[code]?.slug || code.toLowerCase().replaceAll("_", "-");
    lang = code;
    ({ values: strings, localizedKeys: localizedStringKeys } =
      await loadNllbStrings(code));
    content = await loadNllbContent(code);
    projects = await loadNllbProjects(code);

    const localeOutDir = path.join(nllbOutDir, currentNllbSlug);
    await mkdir(localeOutDir, { recursive: true });
    await mkdir(path.join(localeOutDir, getRouteSlug("projects", code)), {
      recursive: true
    });

    for (const route of nllbRoutes) {
      const pageDir = route.key
        ? path.join(localeOutDir, getRouteSlug(route.key, code))
        : localeOutDir;
      await mkdir(pageDir, { recursive: true });
      await writeFile(path.join(pageDir, "index.html"), route.render());
    }

    for (const project of projects) {
      const projectDir = path.join(
        localeOutDir,
        getRouteSlug("projects", code),
        project.slug
      );
      await mkdir(projectDir, { recursive: true });
      await writeFile(
        path.join(projectDir, "index.html"),
        renderProjectPage(project)
      );
    }

    await writeFile(path.join(localeOutDir, "404.html"), renderNotFoundPage());
  }
}

currentRouteMode = "public";
currentNllbCode = "";
currentNllbSlug = "";
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
await writeFile(
  path.join(outDir, buildMetaFile),
  `${JSON.stringify(buildMeta, null, 2)}\n`
);
const reusePaths = [
  ...(reuseExistingPublic ? reusablePublicOutputPaths : []),
  ...(reuseExistingNllb ? ["nllb"] : [])
];
if (reuseExistingPublic) {
  console.log("[dev-fast] Reusing existing public HTML output.");
} else if (canSelectivelyBuildPublic) {
  const selectiveTargetLabel =
    selectivePublicBuildPlan.kind === "default-page"
      ? `fallback public routes for ${selectivePublicBuildPlan.pageName}`
      : selectivePublicBuildPlan.kind === "default-strings"
        ? "default string dependents"
      : selectivePublicBuildPlan.code;
  console.log(
    `[dev-fast] Rebuilding ${selectiveTargetLabel} for ${selectivePublicBuildPlan.changedPath}.`
  );
}
if (reuseExistingNllb) {
  console.log("[dev-fast] Reusing existing NLLB output.");
} else if (canSelectivelyBuildNllb) {
  console.log(
    `[dev-fast] Rebuilding ${selectiveNllbBuildPlan.codes.length} NLLB locale(s) for ${selectiveNllbBuildPlan.changedPath}.`
  );
}
if (canUpdateLiveOutDirInPlace) {
  console.log("[dev-fast] Updating live dist in place.");
  await syncLiveOutDirInPlace({
    managedFiles: [
      ...liveManagedFiles,
      ...selectivePublicManagedPaths,
      ...selectiveNllbManagedPaths
    ]
  });
} else {
  await replaceLiveOutDir({ reusePaths });
}

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

function renderProjectPage(project) {
  const meta = [
    [strings["project.detail.field.status"] || "Status", localizeProjectStatus(project.status)],
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

function renderSitemapPage() {
  const c = content.sitemap;
  const languagesItem = {
    label: getLanguagePageTitle(),
    href: "/languages/"
  };
  const sectionsWithLanguages = (c.sections || []).map((section, index) =>
    index === 0 && section.items?.length
      ? { ...section, items: [...section.items, languagesItem] }
      : section
  );
  const projectItems = projects.map((project) => ({
    label: project.title,
    href: `/projects/${project.slug}/`
  }));
  const projectsSection = projectItems.length
    ? {
        title: c.projectsTitle || "Projects",
        items: projectItems
      }
    : {
        title: c.projectsTitle || "Projects",
        emptyMessage: c.projectsEmpty || "No projects published yet."
      };
  const sections =
    sectionsWithLanguages.length > 0
      ? [...sectionsWithLanguages, projectsSection]
      : [
          {
            title: getLanguagePageTitle(),
            items: [languagesItem]
          },
          projectsSection
        ];
  return renderDocument({
    pageData: c,
    body: `
      ${renderHero(c.hero)}
      ${renderSitemapSections(sections)}
    `
  });
}

function renderLanguagesPage() {
  const pageTitle = getLanguagePageTitle();
  const heroLead = getLanguageBrowserCopy("languages.page.lead");
  const heroSupport = getLanguageBrowserCopy("languages.page.support");
  const overviewIntro = getLanguageBrowserCopy("languages.overview.intro");
  const directoryIntro = getLanguageBrowserCopy("languages.directory.intro");
  const pageData = {
    meta: {
      currentPath: "/languages/",
      title: pageTitle
    }
  };
  const entries = sortLanguageEntries(
    getLanguageBrowserEntriesForPage(),
    getFeaturedDraftCodes(enabledLanguages)
  );
  const draftEntries = entries.filter(
    (entry) => !isReviewedLanguageStatus(entry.status)
  );
  const sourceCount = entries.filter((entry) => entry.status === "source").length;
  const reviewedCount = entries.filter(
    (entry) => entry.status === "human-reviewed"
  ).length;
  const draftCount = draftEntries.length;
  const groups = getLanguageBrowserGroupsForPage(entries);

  return renderDocument({
    pageData,
    description: getLanguageBrowserCopy("meta.languages.description") || site.description,
    body: `
      ${renderHero({
        eyebrow:
          getLanguageBrowserCopy("languages.hero.eyebrow", "") ||
          pageTitle,
        title: pageTitle,
        lead: heroLead,
        support: heroSupport ? [heroSupport] : []
      })}
      <section class="section section--intro" aria-labelledby="languages-overview-heading">
        ${renderSectionHeader(
          {
            kicker: getLanguageBrowserCopy("languages.overview.kicker"),
            title: getLanguageBrowserCopy("languages.overview.title") || pageTitle,
            intro: overviewIntro
          },
          "languages-overview-heading"
        )}
        <div class="split split--3">
          ${renderLanguageOverviewCard(
            getLanguageStatusLabel("source"),
            sourceCount,
            getLanguageBrowserCopy("languages.overview.sourceBody")
          )}
          ${renderLanguageOverviewCard(
            getLanguageStatusLabel("human-reviewed"),
            reviewedCount,
            getLanguageBrowserCopy("languages.overview.reviewedBody")
          )}
          ${renderLanguageOverviewCard(
            getLanguageStatusLabel("machine-assisted"),
            draftCount,
            getLanguageBrowserCopy("languages.overview.draftBody")
          )}
        </div>
      </section>
      <section class="section" aria-labelledby="languages-directory-heading">
        ${renderSectionHeader(
          {
            kicker: getLanguageBrowserCopy("languages.directory.kicker"),
            title:
              getLanguageBrowserCopy("languages.directory.title") ||
              strings["nav.languageSearch"] ||
              pageTitle,
            intro: directoryIntro
          },
          "languages-directory-heading"
        )}
        <div class="language-browser" data-language-browser>
          <label class="language-browser__search">
            <span class="visually-hidden">${escapeHtml(
              getLanguageBrowserCopy("languages.search.label", "") ||
                strings["nav.languageSearch"] ||
                "Search languages"
            )}</span>
            <input
              type="search"
              placeholder="${escapeHtml(
                getLanguageBrowserCopy("languages.search.placeholder", "") ||
                  strings["nav.languageSearch"] ||
                  "Search languages"
              )}"
              data-language-browser-input
              autocomplete="off"
              spellcheck="false"
            />
          </label>
          <div class="language-browser__groups">
            ${groups
              .map(
                (group) => `<section
                  class="language-browser__group"
                  data-language-browser-group
                  aria-labelledby="language-group-${escapeHtml(group.key)}"
                >
                  <h3 id="language-group-${escapeHtml(group.key)}">${escapeHtml(group.title)}</h3>
                  ${renderLanguageBrowserList(group.entries)}
                </section>`
              )
              .join("")}
          </div>
          <p
            class="language-browser__empty"
            data-language-browser-empty
            hidden
          >${escapeHtml(
            getLanguageBrowserCopy("languages.search.empty", "") ||
              strings["nav.languageNoMatch"] ||
              "No matches"
          )}</p>
        </div>
      </section>
    `
  });
}

function renderSitemapSections(sections) {
  return sections
    .map(
      (section, index) => `
        <section class="section" aria-labelledby="sitemap-section-${index}">
          <header class="section-header">
            <h2 id="sitemap-section-${index}">${escapeHtml(section.title)}</h2>
          </header>
          ${
            section.items?.length
              ? `<ul class="link-list">${section.items
                  .map(
                    (item) =>
                      `<li><a href="${escapeHtml(localizeHref(item.href))}">${escapeHtml(item.label)}</a></li>`
                  )
                  .join("")}</ul>`
              : `<p class="note">${escapeHtml(section.emptyMessage || "")}</p>`
          }
        </section>
      `
    )
    .join("");
}

function renderLanguageOverviewCard(title, count, body) {
  return `<article class="panel panel--language-summary">
    <p class="language-browser__summary-count">${escapeHtml(String(count))}</p>
    <h3>${escapeHtml(title)}</h3>
    ${body ? `<p>${escapeHtml(body)}</p>` : ""}
  </article>`;
}

function renderLanguageBrowserPanel(title, entries, panelKind) {
  if (!entries.length) return "";
  return `<article
    class="panel panel--language-browser panel--language-browser-${escapeHtml(panelKind)}"
    data-language-browser-group
  >
    <h3>${escapeHtml(title)}</h3>
    ${renderLanguageBrowserList(entries)}
  </article>`;
}

function renderLanguageBrowserList(entries) {
  if (!entries.length) return "";
  return `<ul class="language-browser__list">
    ${entries
      .map((entry) => {
        const currentAttr = entry.code === lang ? ' data-language-current="true"' : "";
        const searchKey = escapeHtml(
          `${entry.nativeName} ${entry.englishName} ${entry.code} ${getLanguageStatusLabel(entry.status)}`.toLowerCase()
        );
        const englishLabel =
          entry.englishName && entry.englishName !== entry.nativeName
            ? `<span class="language-browser__english" lang="en" dir="ltr">${escapeHtml(entry.englishName)}</span>`
            : "";
        const currentLabel =
          entry.code === lang
            ? `<span class="language-browser__status language-browser__status--current">${escapeHtml(
                getLanguageBrowserLabel("languages.status.current", "Current")
              )}</span>`
            : "";
        return `<li
          class="language-browser__item"
          data-language-browser-item
          data-lang-search="${searchKey}"${currentAttr}
        >
          <a
            class="language-browser__link"
            href="${escapeHtml(entry.href)}"
            lang="${escapeHtml(entry.langTag)}"
            dir="${escapeHtml(entry.direction)}"
          >
            <span class="language-browser__copy">
              <span class="language-browser__name">${escapeHtml(entry.nativeName)}</span>
              ${englishLabel}
            </span>
            <span class="language-browser__meta">
              ${currentLabel}
              <span class="language-browser__status language-browser__status--${escapeHtml(
                getLanguageStatusTone(entry.status)
              )}">${escapeHtml(getLanguageStatusLabel(entry.status))}</span>
            </span>
          </a>
        </li>`;
      })
      .join("")}
  </ul>`;
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
            <p>${escapeHtml(localizeProjectStatus(project.status))}</p>
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
  const directionAttr = ` dir="auto"`;
  switch (field.kind) {
    case "textarea":
      return `<div class="${textareaClass}" data-field-name="${escapeHtml(field.name)}">
        ${renderFieldLabel(field, requirement)}
        ${renderFieldHelper(field)}
        <textarea id="${field.name}" name="${field.name}"${
          field.placeholder
            ? ` placeholder="${escapeHtml(field.placeholder)}"`
            : ""
        }${directionAttr}${requiredAttr}></textarea>
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
        }${directionAttr}${requiredAttr} />
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
  const htmlLang = getHtmlLangTag(lang);
  const htmlDir = getLanguageDirection(lang);
  const pagePathForAlternates =
    currentRouteMode === "nllb" || currentPath === "/404.html"
      ? null
      : currentPath;
  const robotsTag = renderRobotsTag(lang);
  const alternateTags = renderAlternateLinkTags(pagePathForAlternates);
  const translationStatusHtml = renderTranslationStatus(lang);
  const showsTranslationStatus =
    translationStatusHtml && getTranslationStatus(lang) !== "source";
  const mainClass = showsTranslationStatus
    ? "site-main site-main--has-translation-status"
    : "site-main";
  const navHtml = renderNav(currentPath);

  return `<!doctype html>
<html lang="${escapeHtml(htmlLang)}" dir="${escapeHtml(htmlDir)}">
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
        <div class="site-header__top">
          <a class="brand" href="${escapeHtml(localizePathname("/"))}" aria-label="${escapeHtml(strings["site.title"])}">
            <span class="brand__mark">${escapeHtml(strings["site.short"])}.cc</span>
            <span class="brand__meta">${escapeHtml(strings["site.title"])}</span>
          </a>
          <div class="site-header__menu">
            <button
              class="site-nav-toggle"
              type="button"
              aria-controls="site-primary-nav-mobile"
              aria-expanded="false"
              data-mobile-nav-toggle
              hidden
            >
              <span class="site-nav-toggle__label">${escapeHtml(strings["nav.menu"] || "Menu")}</span>
              <span class="site-nav-toggle__icon" aria-hidden="true">
                <span></span>
                <span></span>
                <span></span>
              </span>
            </button>
            <nav
              id="site-primary-nav-mobile"
              class="site-nav site-nav--mobile"
              aria-label="${escapeHtml(strings["nav.label"])}"
              data-mobile-nav
              hidden
            >
              <ul class="site-nav__list">
                ${navHtml}
              </ul>
            </nav>
          </div>
        </div>
        <div class="site-header__controls">
          <nav class="site-nav site-nav--desktop" aria-label="${escapeHtml(strings["nav.label"])}">
            <ul class="site-nav__list">
              ${navHtml}
            </ul>
          </nav>
          <div class="site-header__language">
            ${renderLanguageSwitcher(currentPath)}
          </div>
        </div>
      </header>

      <main id="content" class="${mainClass}" tabindex="-1">
        ${translationStatusHtml}
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
          <a href="${escapeHtml(localizePathname("/sitemap/"))}">${escapeHtml(strings["footer.sitemap"] || "Sitemap")}</a>
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
  const tone =
    status === "source" || status === "human-reviewed" ? "info" : "warning";
  const role = tone === "warning" ? "status" : "note";
  const reportMessage = status !== "source" ? strings["translation.report"] : "";
  const reportHtml = reportMessage ? ` ${expand(reportMessage)}` : "";
  return `<aside class="translation-status translation-status--${escapeHtml(status)} translation-status--${escapeHtml(tone)}" role="${role}" aria-label="${escapeHtml(label)}">
    <p><strong>${escapeHtml(label)}:</strong> ${expand(message)}${reportHtml}</p>
  </aside>`;
}

function renderRobotsTag(code) {
  const indexable = !noindex && isIndexableLocale(code);
  if (indexable) return "";
  if (noindex) return `<meta name="robots" content="noindex,nofollow,noarchive" />`;
  return `<meta name="robots" content="noindex,follow" />`;
}

function renderAlternateLinkTags(pathname) {
  if (!pathname || currentRouteMode === "nllb") return "";
  const indexable = indexableLanguages;
  if (indexable.length < 2) return "";
  const lines = indexable.map((code) => {
    const href = `${site.siteUrl}${localizePublicPathname(pathname, code)}`;
    const hreflang = languages[code]?.ietfBcp47 || code;
    return `<link rel="alternate" hreflang="${escapeHtml(hreflang)}" href="${escapeHtml(href)}" />`;
  });
  const defaultHref = `${site.siteUrl}${localizePublicPathname(pathname, defaultLang)}`;
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

function renderLanguageSwitcherList(entries, options = {}) {
  if (!entries.length) return "";
  const searchResultAttr = options.searchResult === true ? " data-lang-search-result" : "";
  return `<ul class="lang-switcher__list">
    ${entries
      .map((entry) => {
        const current = entry.code === lang ? ' aria-current="true"' : "";
        const searchKey = escapeHtml(
          `${entry.nativeName} ${entry.englishName} ${entry.code} ${getLanguageStatusLabel(entry.status)}`.toLowerCase()
        );
        const currentPill =
          entry.code === lang
            ? `<span class="language-browser__status language-browser__status--current">${escapeHtml(
                getLanguageBrowserLabel("languages.status.current", "Current")
              )}</span>`
            : "";
        const statusTone = escapeHtml(getLanguageStatusTone(entry.status));
        const statusLabel = escapeHtml(getLanguageStatusLabel(entry.status));
        return `<li data-lang-search="${searchKey}"${searchResultAttr}>
          <a href="${escapeHtml(entry.href)}" lang="${escapeHtml(entry.langTag)}" dir="${escapeHtml(entry.direction)}"${current}>
            <span class="lang-switcher__copy">
              <span class="lang-switcher__native">${escapeHtml(entry.nativeName)}</span>
            </span>
            <span class="lang-switcher__meta">
              ${currentPill}
              <span class="language-browser__status language-browser__status--${statusTone}">${statusLabel}</span>
            </span>
          </a>
        </li>`;
      })
      .join("")}
  </ul>`;
}

function renderLanguageSwitcherSection(title, entries) {
  if (!entries.length) return "";
  return `<section class="lang-switcher__section" aria-label="${escapeHtml(title)}">
    ${renderLanguageSwitcherList(entries)}
  </section>`;
}

function renderLanguageSwitcher(currentPath) {
  const enabled = Object.entries(languages).filter(([, l]) => l.enabled);
  if (enabled.length < 2) return "";

  const stripped = getPublicSwitchPath(currentPath);
  const publicEntries = sortLanguageEntries(
    getEnabledLanguageEntriesForPath(stripped),
    getFeaturedDraftCodes(enabledLanguages)
  );
  const searchEntries = sortLanguageEntries(
    [...publicEntries, ...getLongTailLanguageEntriesForPath(stripped)],
    getFeaturedDraftCodes(enabledLanguages)
  );
  const currentEntry =
    currentRouteMode === "nllb"
      ? getLanguageEntry(currentNllbCode, currentPath)
      : publicEntries.find((entry) => entry.code === lang) || null;
  const reviewedEntries = publicEntries.filter(
    (entry) =>
      entry.code !== lang && isReviewedLanguageStatus(entry.status)
  );
  const draftEntries = publicEntries.filter(
    (entry) =>
      entry.code !== lang && !isReviewedLanguageStatus(entry.status)
  );
  const featuredDraftEntries = sortLanguageEntries(
    draftEntries,
    getFeaturedDraftCodes(draftEntries.map((entry) => entry.code))
  ).slice(0, 20);

  const menuLabel = strings["nav.language"] || "Language";
  const switcherCount = searchEntries.length;
  const countWord =
    switcherCount === 1
      ? strings["nav.languageSingular"] || "language"
      : strings["nav.languagePlural"] || "languages";
  const countLabel = `${switcherCount} ${countWord}`;
  const searchLabel = strings["nav.languageSearch"] || "Search languages";
  const noMatchLabel = strings["nav.languageNoMatch"] || "No matches";
  const currentLabel = getLanguageBrowserLabel(
    "languages.switcher.current",
    "Current language"
  );
  const reviewedLabel = getLanguageBrowserLabel(
    "languages.switcher.reviewed",
    "Reviewed and source"
  );
  const draftsLabel = getLanguageBrowserLabel(
    "languages.switcher.drafts",
    "Draft translations"
  );
  const resultsLabel = getLanguageBrowserLabel(
    "languages.switcher.results",
    "Search results"
  );
  const browseLabel = getLanguageBrowserLabel(
    "languages.switcher.browseAll",
    "Browse all languages"
  );
  const defaultVisibleCount = new Set([
    ...(currentEntry ? [currentEntry.code] : []),
    ...reviewedEntries.map((entry) => entry.code),
    ...featuredDraftEntries.map((entry) => entry.code)
  ]).size;
  const hiddenLanguageCount = Math.max(0, switcherCount - defaultVisibleCount);
  const browseLabelWithCount =
    hiddenLanguageCount > 0 ? `${browseLabel} (+${hiddenLanguageCount})` : browseLabel;

  return `<details class="lang-switcher" data-lang-switcher>
    <summary aria-label="${escapeHtml(menuLabel)}: ${escapeHtml(countLabel)}">
      <img class="lang-switcher__icon" src="/language-icon.svg" alt="" width="24" height="24" />
      <span class="lang-switcher__label">${escapeHtml(countLabel)}</span>
    </summary>
    <div class="lang-switcher__panel" role="dialog" aria-label="${escapeHtml(menuLabel)}">
      <label class="lang-switcher__search">
        <span class="visually-hidden">${escapeHtml(searchLabel)}</span>
        <input type="search" placeholder="${escapeHtml(searchLabel)}" data-lang-search-input autocomplete="off" spellcheck="false" />
      </label>
      <div class="lang-switcher__sections" data-lang-default-view>
        ${currentEntry ? renderLanguageSwitcherSection(currentLabel, [currentEntry]) : ""}
        ${renderLanguageSwitcherSection(reviewedLabel, reviewedEntries)}
        ${renderLanguageSwitcherSection(draftsLabel, featuredDraftEntries)}
      </div>
      <section class="lang-switcher__results" data-lang-results hidden aria-label="${escapeHtml(resultsLabel)}">
        ${renderLanguageSwitcherList(searchEntries, { searchResult: true })}
      </section>
      <p class="lang-switcher__empty" data-lang-empty hidden>${escapeHtml(noMatchLabel)}</p>
      <div class="lang-switcher__footer">
        <a class="lang-switcher__browse" href="${escapeHtml(getLanguageBrowserPageHref())}">${escapeHtml(browseLabelWithCount)}</a>
      </div>
    </div>
  </details>`;
}

function stripLangPrefix(pathname, codes) {
  return stripLanguagePrefix(pathname, codes, defaultLang).pathname;
}

function stripNllbPrefix(pathname) {
  if (!pathname || !pathname.startsWith(NLLB_ROUTE_PREFIX)) {
    return pathname;
  }

  const trimmed = pathname.slice(NLLB_ROUTE_PREFIX.length);
  const slashIndex = trimmed.indexOf("/");
  if (slashIndex < 0) {
    return "/";
  }

  const rest = trimmed.slice(slashIndex);
  return rest || "/";
}

function getPublicSwitchPath(pathname) {
  if (currentRouteMode === "nllb") {
    return stripNllbPrefix(pathname) || "/";
  }

  return stripLangPrefix(pathname, languageCodes);
}

function localizePublicPathname(pathname, code = lang) {
  return localizeRoutePathname(pathname, code, {
    languageCodes,
    defaultLanguage: defaultLang
  });
}

function localizeNllbPathname(pathname, slug = currentNllbSlug) {
  if (!pathname || !pathname.startsWith("/")) {
    return pathname;
  }

  if (pathname.startsWith(NLLB_ROUTE_PREFIX)) {
    return pathname;
  }

  if (pathname === "/404.html") {
    return `${NLLB_ROUTE_PREFIX}${slug}/404.html`;
  }

  const stripped = stripLangPrefix(pathname, languageCodes);
  const publicPath = localizePublicPathname(stripped, defaultLang);
  if (publicPath === "/languages/") {
    return localizePublicPathname("/languages/", defaultLang);
  }

  return publicPath === "/"
    ? `${NLLB_ROUTE_PREFIX}${slug}/`
    : `${NLLB_ROUTE_PREFIX}${slug}${publicPath}`;
}

function getLanguageBrowserPageHref() {
  return currentRouteMode === "nllb"
    ? localizePublicPathname("/languages/", defaultLang)
    : localizePathname("/languages/");
}

function getNllbRootPath(code) {
  const slug = nllbLanguages[code]?.slug || String(code).toLowerCase().replaceAll("_", "-");
  return `${NLLB_ROUTE_PREFIX}${slug}/`;
}

function localizePathname(pathname, code = lang) {
  if (currentRouteMode === "nllb" && pathname && pathname.startsWith("/")) {
    return localizeNllbPathname(pathname, currentNllbSlug);
  }
  return localizePublicPathname(pathname, code);
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
    "/propose/",
    "/governance/",
    "/join/",
    "/accessibility/",
    "/transparency/",
    "/languages/",
    "/sitemap/",
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
  if (code === defaultLang) {
    return {
      values: defaults,
      localizedKeys: new Set(Object.keys(defaults))
    };
  }

  try {
    const localized = await readJson(
      path.join(root, "content", "strings", `${code}.json`)
    );
    return {
      values: { ...defaults, ...localized },
      localizedKeys: new Set(Object.keys(localized))
    };
  } catch (error) {
    if (error?.code === "ENOENT") {
      return {
        values: defaults,
        localizedKeys: new Set()
      };
    }
    throw error;
  }
}

async function loadNllbStrings(code) {
  const defaultFile = path.join(root, "content", "strings", `${defaultLang}.json`);
  const defaults = await readJson(defaultFile);
  const localized = await readJson(
    path.join(root, "content", "nllb", "strings", `${code}.json`)
  );
  return {
    values: { ...defaults, ...localized },
    localizedKeys: new Set(Object.keys(localized))
  };
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
    notFound: await readJsonWithFallback(
      path.join(contentDir, "not-found.json"),
      path.join(defaultDir, "not-found.json")
    ),
    sitemap: await readJsonWithFallback(
      path.join(contentDir, "sitemap.json"),
      path.join(defaultDir, "sitemap.json")
    )
  };
}

async function loadNllbContent(code) {
  const contentDir = path.join(root, "content", "nllb", "pages", code);
  const defaultDir = path.join(root, "content", "pages", defaultLang);

  return {
    home: await readJsonWithFallback(path.join(contentDir, "home.json"), path.join(defaultDir, "home.json")),
    projects: await readJsonWithFallback(path.join(contentDir, "projects.json"), path.join(defaultDir, "projects.json")),
    propose: await readJsonWithFallback(path.join(contentDir, "propose.json"), path.join(defaultDir, "propose.json")),
    governance: await readJsonWithFallback(path.join(contentDir, "governance.json"), path.join(defaultDir, "governance.json")),
    join: await readJsonWithFallback(path.join(contentDir, "join.json"), path.join(defaultDir, "join.json")),
    accessibility: await readJsonWithFallback(path.join(contentDir, "accessibility.json"), path.join(defaultDir, "accessibility.json")),
    transparency: await readJsonWithFallback(path.join(contentDir, "transparency.json"), path.join(defaultDir, "transparency.json")),
    notFound: await readJsonWithFallback(
      path.join(contentDir, "not-found.json"),
      path.join(defaultDir, "not-found.json")
    ),
    sitemap: await readJsonWithFallback(
      path.join(contentDir, "sitemap.json"),
      path.join(defaultDir, "sitemap.json")
    )
  };
}

function getLocaleOutDir(code) {
  return code === defaultLang ? outDir : path.join(outDir, code);
}

async function loadNllbProjects(code) {
  const overlayPath = path.join(root, "data", "nllb", "projects", `${code}.json`);
  const overlay = await readJson(overlayPath);
  const overlayBySlug = Object.fromEntries(
    overlay.map((entry) => [entry.slug, entry])
  );

  return baseProjects.map((project) => {
    const entry = overlayBySlug[project.slug];
    if (!entry) return project;
    const merged = { ...project };
    for (const field of TRANSLATABLE_PROJECT_FIELDS) {
      if (Object.prototype.hasOwnProperty.call(entry, field)) {
        merged[field] = entry[field];
      }
    }
    return merged;
  });
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
