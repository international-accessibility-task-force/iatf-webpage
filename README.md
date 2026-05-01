# IATF Website

Static multi-page site for `iatf.cc`, generated from JSON content and deployed
with Cloudflare Workers Static Assets plus a small Worker for request intake.

## Files That Matter

- `build/build.mjs`: builds the site into `dist/`
- `content/`: site config, page content, strings, and language metadata
- `data/`: structured project registry data
- `client/`: browser JS and CSS source files
- `assets/`: favicons, icons, and manifest source files
- `worker/index.js`: request intake API
- `wrangler.jsonc`: Cloudflare Worker + assets configuration

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

## Manual Cloudflare Deploy

1. Build the site with `npm run build`.
2. Authenticate Wrangler or provide `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`.
3. Deploy with `npm run deploy`.

## Request Intake Configuration

The public request form uses `POST /api/request` when the Worker is configured.
Otherwise it falls back to a `mailto:` draft.

Required Worker vars:

- `TURNSTILE_SITE_KEY`
- `TURNSTILE_SECRET_KEY`
- `GITHUB_TOKEN`
- `GITHUB_INTAKE_REPO`

Optional Worker vars:

- `GITHUB_INTAKE_LABELS`
- `GITHUB_INTAKE_SHOW_ISSUE_LINK`
- `DISCORD_WEBHOOK_URL`
- `TURNSTILE_EXPECTED_HOSTNAME`

For local development, copy `.env.example` to `.env` and fill in the values.

## Licensing

- Code: `AGPL-3.0`
- Content and documentation: `CC BY-SA 4.0`
