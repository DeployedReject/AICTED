const help: Record<
  string,
  { title: string; intro: string; steps: string[]; fields: [string, string][] }
> = {
  Server: {
    title: "Server setup",
    intro:
      "Start by setting your portal’s public address, session duration and reminder lead time. Configure email delivery before enabling notifications.",
    steps: [
      "Set the portal name and public HTTPS address.",
      "Choose how long new sign-in sessions last.",
      "Set the number of days before a case deadline to start reminders.",
      "Configure email delivery, then create accounts and reporting lines.",
      "Documents use Google Drive folder links. Create a restricted folder for each case, share it with the relevant Google accounts, and paste its link into the case. No Google API key or R2 setup is required. Portal access does not grant Drive access; update Drive sharing separately when cases are assigned or coordinated.",
    ],
    fields: [
      [
        "Public address",
        "The website address users open. Password-reset and case links use this address.",
      ],
      [
        "Session duration",
        "Changing this affects new sessions. It does not log everyone out immediately.",
      ],
      [
        "Reminder lead time",
        "Reminders use each case’s due date. This does not set a universal resolution deadline.",
      ],
    ],
  },
  Accounts: {
    title: "Account management",
    intro:
      "A designation describes a person’s job. Access level and reporting lines determine what they can do in this portal.",
    steps: [
      "Create an account with a unique official ID and verified email.",
      "Assign their designation and bureau. For a job title outside the login list, the account holder selects Other.",
      "Choose Official or Manager. A manager reviews work belonging to their reporting team.",
      "Set a reporting manager from the same bureau. Leave it empty only for the top of a reporting chain.",
      "Grant bureau-wide reports only to the designated Bureau Head or Cell In-charge.",
    ],
    fields: [
      [
        "Designation",
        "Job title shown with the account. Selecting a title does not grant permissions.",
      ],
      [
        "Reporting manager",
        "The person who supervises this account and reviews its proposed cases. Reporting cycles and self-approval are blocked.",
      ],
      [
        "Report access",
        "Officials see their own assigned work; managers see their reporting team. Bureau heads can receive bureau-wide reports. Shared cases are separate from workload metrics.",
      ],
      [
        "Initial password",
        "Share it privately with the account holder. Production passwords require at least 12 characters.",
      ],
    ],
  },
  Bureaus: {
    title: "Bureau directory",
    intro:
      "Maintain the bureau and cell names used for accounts, cases and reports. Check these names against your current organisation record.",
    steps: [
      "Check the current official office order before changing names or authority.",
      "Keep the code stable when renaming a bureau so existing case history remains connected.",
      "Deactivate a unit only after checking its accounts and active cases.",
    ],
    fields: [
      [
        "Unit code",
        "Stable identifier, such as RB or PGRC. A new code creates a separate unit.",
      ],
      [
        "Verified entry",
        "Mark this only after checking the current organisation record.",
      ],
    ],
  },
  Tags: {
    title: "Case tags",
    intro: "Add or edit the tags officials use to classify cases.",
    steps: [
      "Choose a tag from the catalogue to change its display name or category group.",
      "Keep an existing tag’s code unchanged so older cases retain their classification.",
      "Turn off Available for new cases to retire a tag. Existing case history keeps it.",
    ],
    fields: [
      [
        "Tag code",
        "Stable identifier such as FEE_REFUND. Use a different code when creating a separate classification.",
      ],
      [
        "Category group",
        "Related tags appear together when registering a case.",
      ],
      [
        "Available for new cases",
        "Only active tags are offered for new cases and automatic suggestions.",
      ],
    ],
  },
  Institutions: {
    title: "Institution records",
    intro: "Register each institution once using its AICTE Permanent ID.",
    steps: [
      "Check whether the institution already exists by name and Permanent ID.",
      "Enter its official name, AICTE Permanent ID, full address, district, postal code, state and region. Record an AISHE code separately when available.",
      "Use the same Permanent ID for later case intake. Select a record to edit it instead of creating a duplicate.",
      "Open Portal accounts to create a representative account tied to that institution. Share its initial password privately. Disabling or changing the account ends its existing sessions.",
      "Open Intake routing and choose a verified manager for each receiving bureau. Only configured bureaus appear on the institution’s case form.",
      "Representatives see their institution’s submitted cases, formal updates, and comments explicitly shared with them. Internal investigations and private staff comments stay hidden.",
      "Escalation and cancellation requests go to the responsible manager. A disposed case accepts one outcome review per representative. Google Drive permissions must be granted separately.",
    ],
    fields: [
      [
        "Permanent ID",
        "AICTE’s institution identifier. It must be unique; it is not an officer ID or an AISHE code.",
      ],
      [
        "Region",
        "The AICTE regional grouping, separate from the institution’s state.",
      ],
    ],
  },
  Email: {
    title: "Email delivery",
    intro:
      "Choose a provider and configure verified sender addresses. Delivery is disabled until explicitly enabled.",
    steps: [
      "Create a Resend or SendGrid account and verify a domain with that provider.",
      "Create a sending API key with your provider and paste it into the API key field.",
      "Set the password-recovery sender and case-update sender; they can be the same verified address.",
      "Set reply-to and support addresses, then save.",
      "Send a verification message to your IT account. Provider acceptance does not guarantee inbox delivery.",
      "Enable the delivery types you need and choose a daily limit.",
    ],
    fields: [
      [
        "Recovery sender",
        "The From address on password-reset messages. Account holders need a saved email address to recover passwords.",
      ],
      [
        "Updates sender",
        "The From address on formal case updates and deadline reminders.",
      ],
      [
        "Reply-to",
        "Replies go here; this portal does not receive or process email replies.",
      ],
      [
        "Daily send limit",
        "Maximum provider requests per UTC day, including failures and verification messages. Demo accounts cannot send email.",
      ],
    ],
  },
  Database: {
    title: "Database connections",
    intro:
      "Add the connection that will store your case records. Save and test it before activating it.",
    steps: [
      "Create an empty D1 database or a PostgreSQL 16+ database with a public TLS endpoint.",
      "Save a connection. For D1, use an API token with D1 read/write access to the chosen account. For PostgreSQL, provide a database user and password.",
      "Initialize the schema only on an empty destination. No existing tables are overwritten.",
      "Test the connection to check schema version and read/write permissions.",
      "Choose Copy current data or Use prepared database. Copy requires an empty application dataset; prepared mode must contain your production IT account ID.",
      "Type the connection name and activate. Workspace access pauses while records are copied and verified. Keep this panel open or return later; transfer continues on the server.",
      "If verification fails, the source remains active. Partial destination records are retained for inspection.",
      "Case folder links move with the database. Documents stay in Google Drive; a SQL export does not include their contents or sharing settings. Keep access to the Google accounts that own the folders.",
      "To revert later, select the previous connection and use prepared mode. This restores its earlier dataset; it does not copy newer changes back.",
    ],
    fields: [
      [
        "Cloudflare account ID",
        "Account identifier shown in the Cloudflare dashboard. It is not a zone ID.",
      ],
      [
        "D1 API token",
        "Create a scoped token at Cloudflare → My Profile → API Tokens. It needs Account D1 Read and Write. Do not use a global API key.",
      ],
      [
        "PostgreSQL host",
        "Public database or pooler hostname, without a scheme. TLS is required. Private-only hosts need a reachable pooler endpoint.",
      ],
      [
        "Database user",
        "For initialization, this user must create tables, indexes, functions and triggers. The running portal needs SELECT, INSERT, UPDATE and DELETE on application tables.",
      ],
      [
        "Recovery store",
        "Keep the original D1 binding and CONFIG_KEY when redeploying. Losing the encryption key makes saved credentials unreadable.",
      ],
    ],
  },
};
export default function ITHelp({
  section,
  expanded = false,
}: {
  section: string;
  expanded?: boolean;
}) {
  const entry = help[section];
  if (!entry) return null;
  return (
    <details className="ws-admin-help" open={expanded || undefined}>
      <summary>{entry.title} guide</summary>
      <p>{entry.intro}</p>
      <ol>
        {entry.steps.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
      <dl>
        {entry.fields.map(([name, text]) => (
          <div key={name}>
            <dt>{name}</dt>
            <dd>{text}</dd>
          </div>
        ))}
      </dl>
      {section === "Database" && (
        <p>
          <a href="/postgres-spec.html" target="_blank" rel="noreferrer">
            Detailed database specification ↗
          </a>{" "}
          ·{" "}
          <a href="/postgres/schema.sql" download>
            PostgreSQL schema
          </a>
        </p>
      )}
    </details>
  );
}
export function SetupGuide() {
  return (
    <div className="ws-setup-guide">
      <p>
        Use this guide to configure your portal. Start with portal settings and
        email delivery, then add accounts and reporting lines.
      </p>
      {Object.keys(help).map((section) => (
        <ITHelp key={section} section={section} expanded />
      ))}
    </div>
  );
}
