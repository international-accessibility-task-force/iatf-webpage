# Security policy

This repository powers the public site at `iatf.cc`. Most issues here are
about copy, accessibility, or build output — not classic application security
findings. That said, we still want to know if something is wrong.

## Reporting a vulnerability

Please **do not** open a public GitHub issue for security reports.

Email <contact@iatf.cc> with:

- A short description of the issue.
- The page, route, or endpoint where you saw it.
- Steps to reproduce, if possible.
- Whether the issue exposes user data or only affects the deployment.

We aim to acknowledge reports within a few days. If you do not get a reply,
ping again on Discord at <https://iatf.cc/discord>.

## Scope

In scope:

- The deployed site at `https://iatf.cc` and any of its language subpaths.
- The Cloudflare Worker at `/api/*`, including the request intake endpoint.
- The static build output produced by this repository.

Out of scope:

- Findings that depend on a victim configuring their own deployment in an
  insecure way (e.g. leaking their own `GITHUB_TOKEN`).
- Volumetric attacks against Cloudflare itself.
- Reports from automated scanners with no demonstrated impact.

## Coordinated disclosure

If a fix is non-trivial, we will coordinate a disclosure window with you
before publishing details. We prefer to credit reporters publicly unless you
ask us not to.

## Accessibility issues

Accessibility barriers on the site are tracked in public — those go to
<accessibility@iatf.cc> or the
[`/accessibility/`](https://iatf.cc/accessibility/) page, not here.
