export const DEFAULT_LANGUAGE = "en";

export const STATIC_ROUTE_KEYS = [
  "projects",
  "propose",
  "governance",
  "join",
  "accessibility",
  "transparency",
  "sitemap",
  "languages"
];

export const ROUTE_SLUGS = {
  en: {
    projects: "projects",
    propose: "propose",
    governance: "governance",
    join: "join",
    accessibility: "accessibility",
    transparency: "transparency",
    sitemap: "sitemap",
    languages: "languages"
  },
  ca: {
    projects: "projectes",
    propose: "sollicitud",
    governance: "governanca",
    join: "uneix-te",
    accessibility: "accessibilitat",
    transparency: "transparencia",
    sitemap: "mapa-del-lloc",
    languages: "llengues"
  },
  es: {
    projects: "proyectos",
    propose: "solicitud",
    governance: "gobernanza",
    join: "unirse",
    accessibility: "accesibilidad",
    transparency: "transparencia",
    sitemap: "mapa-del-sitio",
    languages: "idiomas"
  },
  fr: {
    projects: "projets",
    propose: "demande",
    governance: "gouvernance",
    join: "participer",
    accessibility: "accessibilite",
    transparency: "transparence",
    sitemap: "plan-du-site",
    languages: "langues"
  },
  de: {
    projects: "projekte",
    propose: "anfrage",
    governance: "governance",
    join: "mitmachen",
    accessibility: "barrierefreiheit",
    transparency: "transparenz",
    sitemap: "seitenverzeichnis",
    languages: "sprachen"
  },
  it: {
    projects: "progetti",
    propose: "richiesta",
    governance: "governance",
    join: "partecipa",
    accessibility: "accessibilita",
    transparency: "trasparenza",
    sitemap: "mappa-del-sito",
    languages: "lingue"
  },
  pt: {
    projects: "projetos",
    propose: "pedido",
    governance: "governanca",
    join: "participar",
    accessibility: "acessibilidade",
    transparency: "transparencia",
    sitemap: "mapa-do-site",
    languages: "linguas"
  },
  ar: {
    projects: "المشاريع",
    propose: "طلب",
    governance: "الحوكمة",
    join: "انضم",
    accessibility: "إمكانية-الوصول",
    transparency: "الشفافية",
    sitemap: "خريطة-الموقع",
    languages: "اللغات"
  },
  he: {
    projects: "פרויקטים",
    propose: "בקשה",
    governance: "ניהול",
    join: "הצטרפות",
    accessibility: "נגישות",
    transparency: "שקיפות",
    sitemap: "מפת-האתר",
    languages: "שפות"
  },
  ja: {
    projects: "プロジェクト",
    propose: "リクエスト",
    governance: "ガバナンス",
    join: "参加",
    accessibility: "アクセシビリティ",
    transparency: "透明性",
    sitemap: "サイトマップ",
    languages: "言語"
  },
  zh: {
    projects: "项目",
    propose: "请求",
    governance: "治理",
    join: "参与",
    accessibility: "可访问性",
    transparency: "透明度",
    sitemap: "网站地图",
    languages: "语言"
  }
};

const DEFAULT_ROUTE_SLUGS = ROUTE_SLUGS[DEFAULT_LANGUAGE];
const KNOWN_ROUTE_LANGUAGES = Object.keys(ROUTE_SLUGS);

function getOrderedLanguageCodes(languageCodes, defaultLanguage) {
  return [...new Set(languageCodes || KNOWN_ROUTE_LANGUAGES)]
    .filter((code) => code && code !== defaultLanguage)
    .sort((a, b) => b.length - a.length);
}

function splitPathSuffix(pathname) {
  const queryIndex = pathname.indexOf("?");
  const hashIndex = pathname.indexOf("#");
  const candidates = [queryIndex, hashIndex].filter((index) => index >= 0);
  if (!candidates.length) {
    return { pathname, suffix: "" };
  }
  const splitIndex = Math.min(...candidates);
  return {
    pathname: pathname.slice(0, splitIndex),
    suffix: pathname.slice(splitIndex)
  };
}

function resolveRouteKey(segment, preferredLanguage = DEFAULT_LANGUAGE) {
  if (!segment) return "";

  const preferredSlugs = ROUTE_SLUGS[preferredLanguage];
  for (const routeKey of STATIC_ROUTE_KEYS) {
    if (
      preferredSlugs?.[routeKey] === segment ||
      DEFAULT_ROUTE_SLUGS[routeKey] === segment
    ) {
      return routeKey;
    }
  }

  for (const languageCode of KNOWN_ROUTE_LANGUAGES) {
    for (const routeKey of STATIC_ROUTE_KEYS) {
      if (ROUTE_SLUGS[languageCode]?.[routeKey] === segment) {
        return routeKey;
      }
    }
  }

  return "";
}

function canonicalizeStrippedPathname(pathname, preferredLanguage) {
  if (pathname === "/" || pathname === "/404.html") {
    return pathname;
  }

  const { pathname: basePath, suffix } = splitPathSuffix(pathname);
  const hasTrailingSlash = basePath.endsWith("/");
  const segments = basePath.split("/").filter(Boolean);

  if (!segments.length) {
    return `/${suffix}`;
  }

  const routeKey = resolveRouteKey(segments[0], preferredLanguage);
  if (!routeKey) {
    return `${basePath}${suffix}`;
  }

  const canonicalSegments = [
    DEFAULT_ROUTE_SLUGS[routeKey],
    ...segments.slice(1)
  ];
  const canonicalPath = `/${canonicalSegments.join("/")}${
    hasTrailingSlash ? "/" : ""
  }`;
  return `${canonicalPath}${suffix}`;
}

export function getRouteSlug(
  routeKey,
  languageCode = DEFAULT_LANGUAGE
) {
  return (
    ROUTE_SLUGS[languageCode]?.[routeKey] ||
    DEFAULT_ROUTE_SLUGS[routeKey] ||
    routeKey
  );
}

export function stripLanguagePrefix(
  pathname,
  languageCodes = KNOWN_ROUTE_LANGUAGES,
  defaultLanguage = DEFAULT_LANGUAGE
) {
  if (!pathname || !pathname.startsWith("/")) {
    return { languageCode: defaultLanguage, pathname };
  }

  for (const code of getOrderedLanguageCodes(languageCodes, defaultLanguage)) {
    if (pathname === `/${code}` || pathname === `/${code}/`) {
      return { languageCode: code, pathname: "/" };
    }
    if (pathname.startsWith(`/${code}/`)) {
      return {
        languageCode: code,
        pathname: pathname.slice(code.length + 1)
      };
    }
  }

  return { languageCode: defaultLanguage, pathname };
}

export function canonicalizeRoutePathname(
  pathname,
  {
    languageCodes = KNOWN_ROUTE_LANGUAGES,
    defaultLanguage = DEFAULT_LANGUAGE
  } = {}
) {
  if (!pathname || !pathname.startsWith("/")) {
    return pathname;
  }

  const stripped = stripLanguagePrefix(pathname, languageCodes, defaultLanguage);
  return canonicalizeStrippedPathname(stripped.pathname, stripped.languageCode);
}

export function localizeRoutePathname(
  pathname,
  languageCode = DEFAULT_LANGUAGE,
  {
    languageCodes = KNOWN_ROUTE_LANGUAGES,
    defaultLanguage = DEFAULT_LANGUAGE
  } = {}
) {
  if (!pathname || !pathname.startsWith("/") || pathname.startsWith("//")) {
    return pathname;
  }

  const { pathname: basePath, suffix } = splitPathSuffix(pathname);

  if (basePath === "/404.html") {
    return `${
      languageCode === defaultLanguage
        ? "/404.html"
        : `/${languageCode}/404.html`
    }${suffix}`;
  }

  const canonicalPath = canonicalizeRoutePathname(basePath, {
    languageCodes,
    defaultLanguage
  });
  const stripped = stripLanguagePrefix(
    canonicalPath,
    languageCodes,
    defaultLanguage
  );

  if (stripped.pathname === "/") {
    return `${languageCode === defaultLanguage ? "/" : `/${languageCode}/`}${
      suffix
    }`;
  }

  const hasTrailingSlash = stripped.pathname.endsWith("/");
  const segments = stripped.pathname.split("/").filter(Boolean);
  const routeKey = resolveRouteKey(segments[0], defaultLanguage);

  if (routeKey) {
    segments[0] = getRouteSlug(routeKey, languageCode);
  }

  const localizedPath = `/${segments.join("/")}${hasTrailingSlash ? "/" : ""}`;
  return `${
    languageCode === defaultLanguage
      ? localizedPath
      : `/${languageCode}${localizedPath}`
  }${suffix}`;
}
