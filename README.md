# AICTED

AICTE Institution Complaint Portal. The first scene is a responsive React login
screen with official/institution tabs and a locally prepared SVG India network.

## Development

Requires Node.js 22.12+ (or 20.19+).

```sh
npm ci
npm run dev
```

```sh
npm run build
npm run preview
```

## Cloudflare Workers deployment

For the existing Git-connected Cloudflare project:

- Framework: React / Vite
- Build command: `npm run build`
- Deploy command: `npx wrangler deploy`
- Output directory: `dist`
- Root directory: repository root

`wrangler.jsonc` configures the `aicted` Worker to serve `dist` with native SPA
fallback. Do not add a catch-all `_redirects` rule: it conflicts with Workers'
static asset routing. The `_headers` file is copied into the build automatically.
No backend Worker code or database bindings are needed for this scene.

## Current scope

Implemented: account tabs, designation selection, password visibility, recovery
view, keyboard navigation, theme persistence, responsive layout, and an SVG map
that continuously follows a marker through close local views and partial pullbacks.
Street/building vectors and real labels are prepared from OpenStreetMap and
served locally. The map is hidden on phones and respects reduced-motion
preferences. The official logo uses the supplied PNG. There are no remote fonts.

Authentication, recovery mail, institution registration, and IT administration
are not connected. Submitting a form explains this; credentials are never sent,
logged, or stored. The public designation selector does not assign permissions.

Map sources, attribution, coordinate precision, and reproduction notes are in
[docs/ASSETS.md](docs/ASSETS.md). Local helpers, seed files, agent metadata,
credentials, build output, and dependencies are ignored by Git.
