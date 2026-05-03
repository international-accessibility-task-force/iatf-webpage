<div align="center">

<img src="./assets/iatf-people.svg" alt="International Accessibility Task Force" width="220" />

International Accessibility Task Force
[iatf.cc](https://iatf.cc)

[![discord](https://img.shields.io/discord/1014599739230130267?label=discord&logo=discord&logoColor=white&color=5865F2)](https://iatf.cc/discord) | [![llicència](https://img.shields.io/badge/llic%C3%A8ncia-AGPL--3.0%20%26%20CC%20BY--SA%204.0-blue)](./LICENSE)

[English](./README.md) | [Català](./README.ca.md)

</div>

Lloc estàtic multipàgina per a `iatf.cc`, generat a partir de contingut JSON i
desplegat amb Cloudflare Workers Static Assets, més un petit Worker per a
l'admissió de sol·licituds i les redireccions del domini canònic.

> [!NOTE]
> La majoria de contribucions només necessiten `npm install && npm run build`.
> Sense compte de Cloudflare, sense variables d'entorn. Edita el JSON,
> reconstrueix, obre `dist/index.html`.

## Estructura

- `build/build.mjs`: construeix el lloc dins de `dist/`
- `content/site.json`, `content/languages.json`: configuració del lloc i metadades d'idioma
- `content/pages/<lang>/`: contingut de pàgina per idioma
- `content/strings/<lang>.json`: cadenes d'interfície per idioma
- `data/projects.json`: registre públic de projectes
- `client/app.js`, `client/css/`: JS i CSS del navegador
- `assets/icons/`, `assets/site.webmanifest`: icones i manifest web
- `worker/index.js`: API d'admissió de sol·licituds i redirecció de host canònic
- `wrangler.jsonc`: configuració del Worker i actius estàtics de Cloudflare

## Ordres

```bash
npm install
npm run build       # regenera dist/
npm run dev         # reconstrueix en desar canvis
npm run dev:worker  # executa el Worker localment contra dist/
npm run deploy      # desplega el Worker i els actius amb Wrangler
```

Defineix `NOINDEX=1` en construir un entorn fora de producció per generar un
`robots.txt` que ho prohibeix tot, etiquetes `noindex`, i ometre el
`sitemap.xml`.

## Configuració de l'admissió de sol·licituds

> [!TIP]
> Pots saltar-te aquesta secció si no estàs depurant el camí de formulari en
> viu. Sense aquestes variables, el formulari recau en un esborrany `mailto:`
> i tot continua funcionant en local.

El formulari públic envia a `POST /api/request` quan el Worker està
configurat. El Worker també redirigeix `www.iatf.cc` i el host antic
`internationalaccessibilitytaskforce.com` cap a `iatf.cc`.

Un compte gratuït de Cloudflare (per a claus de Turnstile i hosting del
Worker) i un compte gratuït de GitHub (per al repositori d'admissió) són
suficients.

| Variable | On s'executa | Sensibilitat | Propòsit |
| --- | --- | --- | --- |
| `TURNSTILE_SITE_KEY` | Worker (pública) | Pública | Clau pública de Turnstile, retornada al client. |
| `TURNSTILE_SECRET_KEY` | Worker | **Secret** | Verifica els tokens de Turnstile al servidor. |
| `GITHUB_TOKEN` | Worker | **Secret** | Crea la incidència d'admissió. |
| `GITHUB_INTAKE_REPO` | Worker | Pública | `propietari/nom` del repositori d'admissió. |
| `GITHUB_INTAKE_LABELS` | Worker (opcional) | Pública | Per defecte `request,status: received`. |
| `GITHUB_INTAKE_SHOW_ISSUE_LINK` | Worker (opcional) | Pública | Posa-ho a `1` per mostrar l'URL de la incidència en l'èxit. |
| `DISCORD_WEBHOOK_URL` | Worker (opcional) | **Secret** | Publica una notificació quan es crea una incidència. |
| `TURNSTILE_EXPECTED_HOSTNAME` | Worker (opcional) | Pública | Fixa la validació de Turnstile a un host concret. |
| `NOINDEX` | Build (opcional) | Pública | Quan val `1`, la construcció emet un lloc noindex. |

> [!WARNING]
> Només `TURNSTILE_SECRET_KEY`, `GITHUB_TOKEN` i `DISCORD_WEBHOOK_URL` són
> secrets. Desa-los amb `wrangler secret put`. No els posis mai a
> `wrangler.jsonc` ni en fitxers `.env` confirmats al repositori.

Les variables del Worker no secretes poden viure a `wrangler.jsonc` sota
`vars` o a `.env` localment. Per al desenvolupament local, copia
`.env.example` a `.env` i emplena els valors que necessitis.

## Llicències

- Codi: `AGPL-3.0`
- Contingut i documentació: `CC BY-SA 4.0`
