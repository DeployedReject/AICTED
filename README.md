# AICTED

React / TypeScript complaint workspace backed by Cloudflare D1/PostgreSQL and focused Cloudflare Workers.

## Run locally

Requires Node 22.12+ and authenticated Wrangler (installed globally on this machine).

```sh
npm ci
npm run dev
```

Vite serves the frontend on port 5173 (or the next available port) and proxies
`/api` to the local Worker on 8787. The web, casework, relevance, notification and database Workers run together.
`npm run dev` applies local migrations. This checkout already has local secrets
and demo records. No remote database is used by local development.

For a fresh checkout, create the same random `INTERNAL_SECRET` in `.dev.vars`,
`workers/casework/.dev.vars`, and `workers/relevance/.dev.vars`. These files are
ignored. Demo seeds (including `seed/separate-test-logins.sql`) and provisioning tools are deliberately local and ignored;
obtain them from the project maintainer if you need another development database.
Never copy production records into the public demo dataset.

```sh
npm run build
```

This checks both frontend and Worker TypeScript and produces the static `dist/`.
`npm run preview` previews frontend assets only; use `npm run dev` for the API.

## Test login

| Test designation | ID | Password |
| --- | --- | --- |
| Test Official | 0000 | 111111 |
| Test Manager | 0001 | 111111 |

These fixed identities authenticate only the demo dataset. The manager has a
reporting team, review queues and team workload; the official has personal assignments.
Other demo officials have no passwords and cannot log in directly. There is no
impersonation or workspace identity switch. IT is separated at `/it`, reached by
the footer link, and uses ID 0000 / password 111111 for its isolated demo.
Workspace HTML routes and API requests both require a server-validated HttpOnly
session cookie; portal roles are enforced server-side.
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
- Database configuration shows the active name/type and allows configuration
  of another D1 or PostgreSQL connection, with schema setup, connection checks, data transfer and activation.
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
The application starts on `aicted-workspace`. IT can configure and activate another
D1 database or a public TLS PostgreSQL 16+ connection through Database settings.
See the on-site Setup guide and `/postgres-spec.html`. A saved connection is inactive
until explicitly activated. The original D1 remains the control/recovery store.

## Cloudflare architecture and deployment

| Worker             | Responsibility                                             | Exposure             |
| ------------------ | ---------------------------------------------------------- | -------------------- |
| `aicted`           | React assets, sessions, same-origin API entry, rate limits | Public               |
| `aicted-casework`  | Scoped D1 cases, sharing, messages and IT operations       | Service binding only |
| `aicted-relevance` | Translation and embedding inference                        | Service binding only |
| `aicted-notifications` | Recovery mail, case updates and scheduled reminders | Service binding only |
| `aicted-database` | Database adapters, serialized routing and verified transfers | Service binding + one SQLite Durable Object |

All private calls use the same `INTERNAL_SECRET`, stored as a Cloudflare secret; never
use a `VITE_` variable for it. Secrets are not committed. Private Workers have
`workers_dev` and preview URLs disabled. Public requests cannot pass their own actor
or internal secret through the web Worker. Sessions are opaque hashed tokens,
HttpOnly / SameSite=Lax cookies, eight-hour expiry, and Secure on HTTPS.

Dedicated database: `aicted-workspace`. Migrations are versioned under
`database/migrations`; helper/seed files are intentionally ignored.

```sh
wrangler d1 migrations apply DB --remote
wrangler deploy --config workers/relevance/wrangler.jsonc
wrangler deploy --config workers/database/wrangler.jsonc
wrangler deploy --config workers/notifications/wrangler.jsonc
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

No background polling during normal use. Database transfer status refreshes every five seconds only while a job is active. Search requests are debounced; case pages contain at most 25 records,
institution results 30, directory 100, recent case events 60, messages 50, and reports 500. Mutations use D1 batches where history/access must change together. Indexed
assignment, institution, team, grants and event lookups reduce scans. Larger production
directories, report exports and complete event archives will need additional paging.

The current update was compiled with `npm run build`. Browser/API testing is left
to the owner, as requested. Earlier runtime checks do not verify this update.

## Production setup

Open `/it/setup` and use the locally stored, ignored `seed/bootstrap-token.txt`
setup code to create the first production IT account. Setup is one-time and atomic.
Do not publish that code. Cloudflare's `BOOTSTRAP_TOKEN` can be removed afterward.
IT can create official/manager accounts, assign reporting lines and email addresses,
configure the canonical bureau catalogue, site URL, session duration and reminders.
Accounts are active only after IT creates them; choosing a designation grants no authority.

Email settings support Resend and SendGrid, separate recovery/update senders,
reply-to and support addresses, opt-in delivery and daily attempt caps. Verify sender
domains with the chosen provider, paste its API key, save settings, then send a
verification message to the signed-in IT account. Keys are encrypted with AES-GCM
and the Cloudflare `CONFIG_KEY` secret. Normal settings responses contain only
metadata; revealing a key requires an explicit audited request. Demo accounts cannot
store production credentials, reveal secrets, or send mail. Do not rotate CONFIG_KEY
without decrypting/re-encrypting stored secrets first.

The private `aicted-notifications` Worker handles recovery and queued case updates;
a 15-minute cron schedules bounded reminders. Accepted means accepted by the email
provider, not guaranteed inbox delivery. Database connections support real activation; saving alone does not switch traffic.

Official autocomplete uses two-character minimum, 500 ms debounce, five-minute
bounded client cache, concurrent-request deduplication, and indexed FTS results limited
to 20. The workspace no longer loads the entire official directory at startup.

The login map remains entirely local SVG/vector data, hidden on phones, with reduced
motion support. The new AICTE mark is a transparent minimalist SVG adaptation.
Asset sources and licences: [docs/ASSETS.md](docs/ASSETS.md).
Workflow authority assumptions: [docs/WORKFLOW.md](docs/WORKFLOW.md).

## Live database switching

The database Worker owns a singleton SQLite-backed Durable Object. Active routing
is loaded once per object activation; application queries do not poll the D1 control
registry. It serializes database batches and pauses application access during a
transfer. Request generation checks prevent a request that read the old database
from writing to the new one. Transactions use native D1 batches or PostgreSQL
transactions; values remain bound parameters. Alternate D1 databases use scoped
Cloudflare API credentials, avoiding manual Worker binding changes.

Copy uses indexed keyset pages of 20 rows, resumable alarms, canonical row hashes,
and deferred restoration of reporting managers. A destination must be initialized
and empty (apart from reference catalogues). Failed copies leave the source active
and allow explicit removal of only the incomplete destination application schema.
Prepared mode uses existing destination records and requires the current IT account.
The previous connection is retained; reverting does not merge post-switch writes.

IT sessions, recovery identities, delivery settings, encrypted connection credentials
and routing history remain in the original D1. Retain its binding and CONFIG_KEY.
The demo IT login cannot alter real connections or inspect production connection
metadata. Test accounts cannot consume inference or email delivery.

Officials’ reports measure their own assigned cases. Managers’ reports measure their
reporting team. IT can explicitly grant bureau-wide reports to a Bureau Head / Cell
In-charge. Designations never automatically grant access. Shared case access and
personal submissions are not silently counted as another official’s workload.

Current validation: TypeScript and production build only. Browser/API tests and live
switch exercises are left to the owner. No destination database was activated as
part of deployment. Server-maintained schemas live in `workers/database/schema.ts`;
the corresponding PostgreSQL download is `public/postgres/schema.sql`.
