# AICTED

React / TypeScript complaint workspace backed by Cloudflare D1 and three focused Workers.

## Run locally

Requires Node 22.12+ and authenticated Wrangler (installed globally on this machine).

```sh
npm ci
npm run dev
```

Vite serves the frontend on port 5173 (or the next available port) and proxies
`/api` to the local Worker on 8787. All three Workers run together with local D1.
`npm run dev` applies local migrations. This checkout already has local secrets
and demo records. No remote database is used by local development.

For a fresh checkout, create the same random `INTERNAL_SECRET` in `.dev.vars`,
`workers/casework/.dev.vars`, and `workers/relevance/.dev.vars`. These files are
ignored. Demo seeds and provisioning tools are deliberately local and ignored;
obtain them from the project maintainer if you need another development database.
Never copy production records into the public demo dataset.

```sh
npm run build
```

This checks both frontend and Worker TypeScript and produces the static `dist/`.
`npm run preview` previews frontend assets only; use `npm run dev` for the API.

## Test login

Select **Test** and enter ID **0000**,
password **111111**. These credentials authenticate only the demo dataset.
Other demo officials have no passwords and cannot log in directly. The authenticated
0000 session can preview the preconfigured official/manager personas with the
header selector. IT is separated at `/it`, reached by the footer link, and uses ID
0000 / password 111111 for its demo without a designation dropdown. IT sessions
cannot be entered by previewing an IT persona from the official portal. Every
preview remains within `is_demo=1` records.
AI inference is blocked for all demo personas. Demo case, comment and message
limits prevent unbounded storage growth. Changes persist and are visible to other testers.

## Implemented workflow

- My Work, searchable/filterable Cases, manager team workload and intake review.
- Proposed case registration; manager approval, return, rejection and resubmission.
  No self-approval; receipt dates survive review.
- Timestamped append-only case boards with comments, status updates, escalation,
  disposal, reopening and permitted transfers. Escalation has a red text badge.
- Two-stage cross-Bureau coordination: requester’s manager, then receiving manager.
  Only the selected official gains access. Pending details remain restricted;
  access can be revoked. Shared access does not grant disposal/transfer authority.
- Searchable read-only institution directory for officials; active and past scoped
  cases, handling Bureaus and detailed ownership/coordination history in each board.
- Messages addressed by official ID/designation. Case references require access
  on both sides; revoked references are redacted on subsequent reads.
- Scoped reports, ageing, Bureau workload and CSV export. Partial reports are labelled.
- Separate IT portal with Accounts, Institutions, Email and Database sections.
  Officials and managers use their own workspace; managers have a Team sidebar entry.
- Searchable official/manager fields use loaded results, a 500ms debounce, bounded
  full-text directory searches and five-minute browser caches. No polling.
- Database configuration shows the active D1 name/SQLite type and allows preparation
  of another D1 source or PostgreSQL profile. Saving does not switch the live backend.
  The help tooltip links to `/postgres-spec.html` and downloadable target SQL.
- Private English embedding suggestions for production officials, optional translation
  to English first, seven-day cache and ten uncached requests per official/day.
  Original case text stays unchanged; translation is shown separately for review.
  The public demo cannot exercise AI; no paid inference was run during verification.

Production accounts and reporting lines must be provisioned using verified office
orders. The ignored `scripts/provision-official.py` prepares password-hashed SQL
for review, including the initial IT account. No production identities are invented.
Email recovery delivery and institution self-service accounts are not enabled;
the UI explains this. Contact email settings alone do not activate a mail provider.
D1 remains the active database. Switching a source requires verified data, bindings
and an adapter; the configuration form prepares a destination only.

## Presentation

Local Adwaita Sans supports forms/tables, Liberation Serif headings and Adwaita Mono
IDs/timestamps. Font licences are bundled in `public/fonts`. Theme selection runs
before React and the application stylesheet, avoiding a light first paint in dark mode.
The login and workspace use the same theme toggle.

Login spacing and sidebar density scale fluidly with available width/height; the
footer intentionally follows the login viewport. Sidebar selection slides between
items. Content transitions erase/redraw, and component data appears after a minimum
one-second rectangular placeholder without adding API calls. Reduced-motion users
skip these delays and animations. Reports include SVG intake, status, Bureau, ageing
and regional charts based on the existing scoped report response.

## Cloudflare architecture and deployment

| Worker             | Responsibility                                             | Exposure             |
| ------------------ | ---------------------------------------------------------- | -------------------- |
| `aicted`           | React assets, sessions, same-origin API entry, rate limits | Public               |
| `aicted-casework`  | Scoped D1 cases, sharing, messages and IT operations       | Service binding only |
| `aicted-relevance` | Translation and embedding inference                        | Service binding only |

All three use the same `INTERNAL_SECRET`, stored as a Cloudflare secret; never
use a `VITE_` variable for it. Secrets are not committed. Private Workers have
`workers_dev` and preview URLs disabled. Public requests cannot pass their own actor
or internal secret through the web Worker. Sessions are opaque hashed tokens,
HttpOnly / SameSite=Lax cookies, eight-hour expiry, and Secure on HTTPS.

Dedicated database: `aicted-workspace`. Migrations are versioned under
`database/migrations`; helper/seed files are intentionally ignored.

```sh
wrangler d1 migrations apply DB --remote
wrangler deploy --config workers/relevance/wrangler.jsonc
wrangler deploy --config workers/casework/wrangler.jsonc
npm run build
wrangler deploy
```

Configure `INTERNAL_SECRET` on each Worker before deploying, using Wrangler secret
input or the Cloudflare dashboard. Deploy private services before the web entry.
The Git-connected main project can keep build command `npm run build` and deploy
command `npx wrangler deploy`. Changes to private Workers require their separate
deploy commands above; the main project's build does not deploy them automatically.

Native SPA fallback is in `wrangler.jsonc`. Do not restore `/* /index.html 200`
in `_redirects`; it creates a redirect loop with Workers static asset routing.

## Query budget and verification

No polling. Search requests are debounced; case pages contain at most 25 records,
institution results 30, directory 100, recent case events 60, messages 50, and reports 500. Mutations use D1 batches where history/access must change together. Indexed
assignment, institution, team, grants and event lookups reduce scans. Larger production
directories, report exports and complete event archives will need additional paging.

Build and browser/API integration checks cover exact test credentials, demo scoping,
unauthorised reads/actions, intake decisions, returned-case resubmission, comments,
both coordination approvals, selected-user sharing, revocation, case-linked messages,
IT restrictions, cycle checks, desktop/mobile navigation and logout.

The login map remains entirely local SVG/vector data, hidden on phones, with reduced
motion support. The new AICTE mark is a transparent minimalist SVG adaptation.
Asset sources and licences: [docs/ASSETS.md](docs/ASSETS.md).
Workflow authority assumptions: [docs/WORKFLOW.md](docs/WORKFLOW.md).
