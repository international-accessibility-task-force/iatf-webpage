# IATF Website

[![discord](https://img.shields.io/discord/1014599739230130267?label=discord&logo=discord&logoColor=white&color=5865F2)](https://iatf.cc/discord)
[![license](https://img.shields.io/badge/license-AGPL--3.0%20%26%20CC%20BY--SA%204.0-blue)](./LICENSE)

[English](./README.md) · [Català](./README.ca.md)

Static multi-page site for `iatf.cc`, generated from JSON content and deployed
with Cloudflare Workers Static Assets plus a small Worker for request intake
and canonical-domain redirects.

> [!NOTE]
> Most contributions only need `npm install && npm run build`. No Cloudflare
> account, no env vars. Edit JSON, rebuild, open `dist/index.html`.

## Layout

- `build/build.mjs`: builds the site into `dist/`
- `content/site.json`, `content/languages.json`: site config and language metadata
- `content/pages/<lang>/`: per-language page content
- `content/strings/<lang>.json`: per-language UI strings
- `data/projects.json`: public project registry
- `client/app.js`, `client/css/`: browser JS and CSS source
- `assets/icons/`, `assets/site.webmanifest`: favicons, icons, web manifest
- `worker/index.js`: request intake API and canonical-host redirect
- `wrangler.jsonc`: Cloudflare Worker + static assets configuration

## Commands

```bash
npm install
npm run build       # regenerate dist/
npm run dev         # rebuild on file changes
npm run dev:worker  # run the Worker locally against dist/
npm run deploy      # deploy Worker + static assets via Wrangler
```

Set `NOINDEX=1` when building a non-production environment to emit a
disallow-all `robots.txt` and `noindex` meta tags, and to skip `sitemap.xml`.

## Request Intake Configuration

> [!TIP]
> Skip this section unless you are debugging the live form path end-to-end.
> Without these vars, the form falls back to a `mailto:` draft and everything
> still works locally.

The public request form posts to `POST /api/request` when the Worker is
configured. The Worker also redirects `www.iatf.cc` and the legacy
`internationalaccessibilitytaskforce.com` hosts to `iatf.cc`.

A free Cloudflare account (for Turnstile keys and Worker hosting) and a free
GitHub account (for the intake repository) are enough.

| Variable | Where it runs | Sensitivity | Purpose |
| --- | --- | --- | --- |
| `TURNSTILE_SITE_KEY` | Worker (public) | Public | Turnstile site key, returned to the client. |
| `TURNSTILE_SECRET_KEY` | Worker | **Secret** | Verifies Turnstile tokens server-side. |
| `GITHUB_TOKEN` | Worker | **Secret** | Creates the intake issue. |
| `GITHUB_INTAKE_REPO` | Worker | Public | `owner/name` of the intake repository. |
| `GITHUB_INTAKE_LABELS` | Worker (optional) | Public | Defaults to `request,status: received`. |
| `GITHUB_INTAKE_SHOW_ISSUE_LINK` | Worker (optional) | Public | Set to `1` to surface the issue URL on success. |
| `DISCORD_WEBHOOK_URL` | Worker (optional) | **Secret** | Posts a notification when an issue is created. |
| `TURNSTILE_EXPECTED_HOSTNAME` | Worker (optional) | Public | Pins Turnstile validation to a specific hostname. |
| `NOINDEX` | Build (optional) | Public | When `1`, the build emits a noindex site. |

> [!WARNING]
> Only `TURNSTILE_SECRET_KEY`, `GITHUB_TOKEN`, and `DISCORD_WEBHOOK_URL` are
> secrets. Store them with `wrangler secret put`. Never put them in
> `wrangler.jsonc` or in committed `.env` files.

Non-secret Worker vars can live in `wrangler.jsonc` under `vars` or in `.env`
locally. For local development, copy `.env.example` to `.env` and fill in the
values you need.

## Licensing

- Code: `AGPL-3.0`
- Content and documentation: `CC BY-SA 4.0`
