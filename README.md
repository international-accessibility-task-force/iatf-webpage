# IATF Website

Static multi-page site for `iatf.cc`, generated from JSON content and deployed
with Cloudflare Workers Static Assets plus a small Worker for request intake
and canonical-domain redirects.

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
npm run build
npm run dev
npm run dev:worker
npm run deploy
```

- `npm run build`: regenerate `dist/`
- `npm run dev`: rebuild static output while editing
- `npm run dev:worker`: run the Worker locally against `dist/`
- `npm run deploy`: deploy the Worker and static assets with Wrangler

Set `NOINDEX=1` when building a non-production environment to emit a
disallow-all `robots.txt` and `noindex` meta tags, and to skip `sitemap.xml`.

## Manual Cloudflare Deploy

1. Build the site with `npm run build`.
2. Authenticate Wrangler or provide `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`.
3. Deploy with `npm run deploy`.

## Request Intake Configuration

Most edits to the source, content, or styles do not require any environment
variables. Run `npm install && npm run build` and you are good to go.

The public request form posts to `POST /api/request` when the Worker is
configured. Otherwise it falls back to a `mailto:` draft. The Worker also
redirects `www.iatf.cc` and the legacy `internationalaccessibilitytaskforce.com`
hosts to `iatf.cc`.

Env vars only matter when you want to debug the live submission path
end-to-end. A free Cloudflare account (for Turnstile keys and Worker hosting)
and a free GitHub account (for the intake repository) are enough.

| Variable                       | Where it runs        | Sensitivity | Purpose                                           |
| ------------------------------ | -------------------- | ----------- | ------------------------------------------------- |
| `TURNSTILE_SITE_KEY`           | Worker (public)      | Public      | Turnstile site key, returned to the client.       |
| `TURNSTILE_SECRET_KEY`         | Worker               | **Secret**  | Verifies Turnstile tokens server-side.            |
| `GITHUB_TOKEN`                 | Worker               | **Secret**  | Creates the intake issue.                         |
| `GITHUB_INTAKE_REPO`           | Worker               | Public      | `owner/name` of the intake repository.            |
| `GITHUB_INTAKE_LABELS`         | Worker (optional)    | Public      | Defaults to `request,status: received`.           |
| `GITHUB_INTAKE_SHOW_ISSUE_LINK`| Worker (optional)    | Public      | Set to `1` to surface the issue URL on success.   |
| `DISCORD_WEBHOOK_URL`          | Worker (optional)    | **Secret**  | Posts a notification when an issue is created.    |
| `TURNSTILE_EXPECTED_HOSTNAME`  | Worker (optional)    | Public      | Pins Turnstile validation to a specific hostname. |
| `NOINDEX`                      | Build (optional)     | Public      | When `1`, the build emits a noindex site.         |

Only `TURNSTILE_SECRET_KEY`, `GITHUB_TOKEN`, and `DISCORD_WEBHOOK_URL` are
secrets. Store them with `wrangler secret put` for the deployed Worker. The
non-secret Worker vars can live in `wrangler.jsonc` under `vars` or in `.env`
locally. For local development, copy `.env.example` to `.env` and fill in the
values you need.

## Licensing

- Code: `AGPL-3.0`
- Content and documentation: `CC BY-SA 4.0`
