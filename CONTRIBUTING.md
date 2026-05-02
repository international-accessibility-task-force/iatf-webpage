# Contributing to iatf-website

This is the public source of `iatf.cc`. The site is intentionally small,
static, and easy to read so that anyone can fix copy, improve accessibility,
or add a translation without a heavy toolchain.

## Quick start

```bash
npm install
npm run build      # one-shot build into dist/
npm run dev        # rebuild on file changes
```

Most contributions only need that. You can edit:

- Page content under `content/pages/<lang>/`
- UI strings under `content/strings/<lang>.json`
- Project registry under `data/projects.json`
- Styles under `client/css/`
- Build output (rendering, layout, sitemap) under `build/build.mjs`
- Browser logic under `client/app.js`

After your change, run `npm run build` and open `dist/index.html` (or the
relevant page) in a browser to confirm the result.

## Working on the request form

The intake form has two paths: a live API submission backed by Cloudflare
Turnstile and GitHub Issues, and a `mailto:` fallback. The fallback path is
what runs locally by default — no environment setup required.

To exercise the live path end-to-end you need:

1. A free Cloudflare account with a Turnstile site/secret pair.
2. A free GitHub account with a personal access token that can open issues
   on the intake repository (`international-accessibility-task-force/iatf-intake`
   in production, or any repo you control for testing).

Copy `.env.example` to `.env`, fill in the values you need, then run:

```bash
npm run dev:worker  # runs the Worker locally against dist/
```

See the env var table in [README.md](./README.md) for which variables are
build-time, runtime, public, or secret.

## Languages and translations

English is the editorial source. Other languages live in parallel under
`content/pages/<lang>/` and `content/strings/<lang>.json`. Missing keys fall
back to English at build time, so partial translations are fine — but please
do not leave dead keys behind when a page or UI element is removed.

To enable a new language, set its entry to `"enabled": true` in
`content/languages.json`. The build only emits routes for enabled languages.

## Accessibility

Accessibility is the point of this project. If you change the rendered
markup, please make sure that:

- Headings stay in order and describe their section.
- Interactive elements have accessible names and are reachable by keyboard.
- Color, contrast, and focus state changes do not regress against
  [W3C WAI](https://www.w3.org/WAI/) baseline guidance.

Reports about accessibility barriers on `iatf.cc` go to
<accessibility@iatf.cc> or the
[`/accessibility/`](https://iatf.cc/accessibility/) page.

## Pull requests

- Keep changes focused. One concern per PR makes review easier.
- Run `npm run build` before opening the PR. The build is the only check.
- Reference the related issue or request when relevant.
- Update `data/projects.json` if your change adds or retires a public project.

## Asking for help

If you are not sure where to start, or you would rather discuss a change
before opening a PR:

- Email: <contact@iatf.cc>
- Discord: <https://iatf.cc/discord>

## License

By contributing, you agree that:

- Code contributions are licensed under [AGPL-3.0](./LICENSE).
- Content and documentation contributions are licensed under
  [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/).
