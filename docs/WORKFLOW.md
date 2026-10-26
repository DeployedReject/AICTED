# Complaint portal workflow plan

Status: the core workspace and D1 permission model are implemented. Production
authority mappings still need verified office orders; demo identities are fictional.
Institutional self-service intake is implemented. Effective-dated temporary delegated approvers remain outside the current scope. Email delivery and reminders are configurable through IT.

## Navigation

My Work, Cases, Institutions, Messages, Reports. Administration appears for IT.
Search belongs in the relevant case/institution list, not the global header.

Institutions is a read-only directory for officials: searchable name/Permanent ID,
active and historical cases, handling Bureaus/Cells, ownership changes, coordinated
case links, and timestamps. Existing case permissions still govern detail access.
IT manages institution master records.

## Authority and reporting lines

- IT links an official ID to its verified designation, Bureau/Cell, manager, and
  authorised scope. The login dropdown never assigns permissions.
- IT may designate an official as a manager and maintain their reporting tree.
- Managers see team members, their assigned work, pending proposals, and permitted
  case details within that scope. Lower designation alone does not imply access.
- Case admission, assignment, transfer, escalation, disposal, and coordination
  approval are separate capabilities. A manager flag does not imply every power.
- Coordination shares approved information with selected officials. Such grants
  do not automatically spread to their whole Bureau or reporting tree.
- Official self-approval is blocked. A manager’s own official submission requires a higher configured manager. Institution submissions are routed to a configured intake manager, with their actual submitter recorded separately. Reporting cycles are blocked.

## Case intake

Official draft → Submitted for review → Approved for processing / Returned for
changes / Rejected with reason. Approval activates the internal processing queue.
The received date, submitted date, approval date, and decision author are separate
records. Preserve rejected submissions and decisions; approval must not erase or
reset the original receipt date. Intake-review state is separate from the active
case lifecycle and is reported separately.

Internal admission approval is not a substitute for an applicable AICTE committee
process or an official decision on the merits of a complaint.

## Case board and coordination

The chronological board combines timestamped comments with distinct formal
events. Selected approved participants may comment; formal actions require the
corresponding capability. Escalation has a red label/accent and an explicit text
status. Event history and ownership history remain available.

Potential coordination → requesting manager approval → receiving Bureau's
designated approver approval → scoped access for named officials. Rejection and
revocation are timestamped. Show coordination outcomes as No request / Awaiting
approval / Approved / Rejected / Revoked, not an ambiguous yes/no flag.

## Tagging and messages

Institution IDs and current ownership are structured authoritative fields.
Subject/type tags may be suggested by an English embedding model. Non-English
text may be translated first; preserve the original and mark machine translation.
An official confirms tags. Similar tags suggest relationships, not final duplicates.
Inference is server-to-server, privately bound, authenticated, cached, and bounded.

Messages address verified official IDs, with designation/Bureau shown in the
directory. Include direct conversations, approval requests, and system reminders.
Messages and institution summaries do not bypass case-sharing permissions.

## Research basis and limits

AICTE's 2022 roles/work-allocation document assigns work allocation and periodic
review to Bureau Heads/Cell In-charges and calls for compliance with office orders
and delegated powers. This is a historical document, not a certified 2026 roster:
https://fliphtml5.com/jfjx/elln/Roles_and_Responsibilities_21_03_2022_Combined/

AICTE Approval Process Handbook 2024–2027, clause 7.10, describes PGRC processing,
Standing Complaint Scrutiny Committee review of verified complaints, and further
Regulation Bureau/Expert Visit/Standing Hearing Committee stages as applicable:
https://aicte.gov.in/sites/default/files/APH%20Final.pdf
AICTE-published readable copy:
https://fliphtml5.com/jfjx/nawh/APH-2024-27/85/

A complete current delegation/reporting chart has not been verified. The app's
manager/intake workflow is a product proposal. Production approval mappings need
the applicable office orders, effective dates, and named authorised officials.

## Report and IT scopes

The report dataset is separate from the case-access dataset. Ordinary officials
measure assigned cases; managers measure their reporting tree. A manager explicitly
marked as Bureau Head / Cell In-charge receives bureau-wide aggregates. This does
not automatically grant every case detail or any cross-bureau approval powers.
Chairman and Vice Chairman are outside this portal’s selectable sign-in titles.

IT maintains identities, reporting lines, report access, institution master records,
bureau labels, delivery credentials and server settings through guided forms. Its
recovery sign-in stays on the original D1. Live database switching is coordinated
by a private database Worker and a serialized Durable Object; prepared destinations
and copied destinations both require explicit activation. See the in-app guide.

## Institution portal and public history

Institution accounts are tied to one verified institution. Only institution-originated cases at that institution are exposed; internal investigations stay private. Major processing events appear in a paginated history with sanitized text. Ordinary comments and Drive links are hidden unless their author explicitly marks them institution-visible. Escalation and cancellation are requests requiring the responsible manager’s decision. Returned submissions can be revised without changing their original receipt. Disposed cases accept a recorded outcome review.

## Ownership handoff and historical reporting

The responsible manager requests another bureau’s selected official as owner. The receiving official’s manager approves or rejects before any ownership or detail access changes. Approval records outgoing and incoming events, then retains read-only access for the previous owner and source manager. Shared coordination grants never imply ownership authority.

Reports use complete server aggregates rather than a limited client case list. Current workload follows current assignment; historical disposal and transfer totals use event-time actor, assignee and bureau snapshots. Pre-snapshot history is retained with recorded legacy values, without guessing a previous name or owner. Date filters select receipt dates; period performance also places disposal/transfer events in their actual UTC periods.

Targeted WebSocket signals contain no case contents. Clients refetch their authorized data; private comments do not refresh institution subscribers. Normal operation uses no repeated database polling.
