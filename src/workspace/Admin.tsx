import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import type { Official } from "../../packages/shared/types";
import { api } from "./api";
import { reduced } from "./Motion";
import EmailSettings from "./EmailSettings";
import type { MailConfig } from "./EmailSettings";
import CreateAccount from "./CreateAccount";
import ITHelp from "./ITHelp";
import { bureauName } from "../../packages/shared/catalog";
import OfficialPicker, { clearOfficialSearchCache } from "./OfficialPicker";
interface Config {
  runtime: MailConfig;
  secrets: { name: string; last_four: string }[];
  units: {
    code: string;
    name: string;
    unit_type: string;
    active: number;
    verification: string;
  }[];
  logs: { action: string; detail: string; created_at: string }[];
  account_email: string;
  is_demo: number;
  encryption_ready: boolean;
  current_id: string;
  officials: Official[];
  current_database: { name: string; type: string };
}
export default function Admin({
  refresh,
  version,
  section,
}: {
  refresh: () => void;
  version: number;
  section: string;
}) {
  const [accountView, setAccountView] = useState("directory");
  const [setupAvailable, setSetupAvailable] = useState(false);
  useEffect(() => {
    if (section !== "Server") return;
    let current = true;
    api<{ available: boolean }>("/auth/setup-status")
      .then((result) => {
        if (current) setSetupAvailable(result.available);
      })
      .catch(() => {});
    return () => {
      current = false;
    };
  }, [section]);
  const [account, setAccount] = useState<Official | null>(null),
    [accountRole, setAccountRole] = useState("official");
  const [data, setData] = useState<Config | null>(null),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    setData(null);
    Promise.all([
      api<Config>("/admin?section=" + encodeURIComponent(section)),
      new Promise((resolve) => setTimeout(resolve, reduced() ? 0 : 1000)),
    ])
      .then(([value]) => {
        if (active) setData(value);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [version, section]);
  useEffect(() => {
    if (!account?.id) return;
    let current = true;
    api<{ official: Official }>(
      "/admin/account?id=" + encodeURIComponent(account.id),
    )
      .then((result) => {
        if (current) {
          setAccount(result.official);
          setAccountRole(result.official.role);
        }
      })
      .catch((e) => {
        if (current) setError(e.message);
      });
    return () => {
      current = false;
    };
  }, [account?.id]);
  async function save(e: FormEvent<HTMLFormElement>, action: string) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await api("/admin", {
        ...Object.fromEntries(new FormData(e.currentTarget)),
        action,
      });
      if (action === "reporting") clearOfficialSearchCache();
      setMessage("Saved");
      refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (!data)
    return error ? (
      <p role="alert" className="ws-error">
        {error}
      </p>
    ) : (
      <div className="ws-skeleton" role="status" aria-label="Loading">
        <i />
        <i />
        <i />
        <i />
      </div>
    );
  return (
    <div className="ws-admin">
      <ITHelp section={section} />
      {error && (
        <p role="alert" className="ws-error">
          {error}
        </p>
      )}
      {message && <p role="status">{message}</p>}
      {section === "Accounts" && (
        <div className="ws-tabs">
          <button
            className={accountView === "directory" ? "active" : ""}
            onClick={() => setAccountView("directory")}
          >
            Directory
          </button>
          <button
            className={accountView === "create" ? "active" : ""}
            onClick={() => setAccountView("create")}
          >
            Create
          </button>
        </div>
      )}
      {section === "Accounts" && accountView === "create" && (
        <CreateAccount
          units={data.units}
          officials={data.officials}
          demo={!!data.is_demo}
          onSaved={() => {
            setMessage("Created");
            setAccountView("directory");
            refresh();
          }}
        />
      )}
      {section === "Accounts" && accountView === "directory" && (
        <div className="ws-admin-grid">
          <section className="ws-card">
            <h2>Account access</h2>
            <p className="ws-description">
              Select an existing account to change its access and reporting
              line. Designation is the job title; the reporting manager reviews
              this person’s work.
            </p>
            <form onSubmit={(e) => void save(e, "reporting")}>
              <OfficialPicker
                name="official_id"
                kind="account"
                label="Find official"
                officials={data.officials}
                required
                onSelect={(o) => {
                  setAccount(o);
                  setAccountRole(o?.role || "official");
                }}
              />
              {account && (
                <>
                  <label title="Managers review officials in their configured reporting tree.">
                    Access level
                    <select
                      name="role"
                      value={accountRole}
                      onChange={(e) => setAccountRole(e.target.value)}
                    >
                      <option value="official">Official</option>
                      <option value="manager">Manager</option>
                    </select>
                  </label>
                  <label>
                    Report access
                    <select
                      key={(account?.id || "") + accountRole}
                      name="report_scope"
                      disabled={accountRole === "official"}
                      defaultValue={
                        account?.report_scope === "bureau" ? "bureau" : "team"
                      }
                    >
                      {accountRole === "official" ? (
                        <option value="personal">Personal workload</option>
                      ) : (
                        <>
                          <option value="team">Reporting team</option>
                          <option value="bureau">
                            Bureau Head / Cell In-charge
                          </option>
                        </>
                      )}
                    </select>
                  </label>
                  <OfficialPicker
                    key={account?.id || "manager"}
                    name="manager_id"
                    label="Reporting manager"
                    excludeId={account?.id || ""}
                    officials={data.officials}
                    role="manager"
                    bureau={account?.bureau || ""}
                    value={account?.manager_id || ""}
                  />
                  <button disabled={busy} className="ws-primary">
                    Save
                  </button>
                </>
              )}
            </form>
            {account && (
              <form
                className="ws-account-email"
                onSubmit={(e) => void save(e, "account_email")}
              >
                <input type="hidden" name="official_id" value={account.id} />
                <label>
                  Email
                  <input
                    name="email"
                    type="email"
                    required
                    defaultValue={account.email || ""}
                    key={account.id}
                  />
                </label>
                <button disabled={busy}>Save email</button>
              </form>
            )}
          </section>
          <section className="ws-card ws-accounts-list">
            <h2>Official directory</h2>
            <div className="ws-table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Official</th>
                    <th>Bureau</th>
                    <th>Role</th>
                    <th>Manager</th>
                  </tr>
                </thead>
                <tbody>
                  {data.officials.map((o) => (
                    <tr key={o.id}>
                      <td>
                        {o.name}
                        <small>{o.id}</small>
                      </td>
                      <td>{bureauName(o.bureau)}</td>
                      <td>{o.role}</td>
                      <td>
                        {data.officials.find((m) => m.id === o.manager_id)
                          ?.name || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}
      {section === "Institutions" && (
        <section className="ws-card ws-admin-form">
          <h2>Register institution</h2>
          <form onSubmit={(e) => void save(e, "institution")}>
            {[
              ["name", "Institution name"],
              ["permanent_id", "Permanent ID"],
              ["city", "City"],
              ["state", "State"],
              ["region", "Region"],
            ].map(([key, label]) => (
              <label key={key}>
                {label}
                <input
                  name={key}
                  required
                  maxLength={key === "name" ? 180 : 80}
                />
              </label>
            ))}
            <button disabled={busy} className="ws-primary">
              Register
            </button>
          </form>
        </section>
      )}
      {section === "Email" && (
        <EmailSettings
          key={version}
          config={data.runtime}
          secrets={data.secrets}
          demo={!!data.is_demo}
          accountEmail={data.account_email}
          onSaved={refresh}
        />
      )}
      {section === "Server" && (
        <div className="ws-admin-grid">
          <section className="ws-card">
            <h2>Portal settings</h2>
            <form onSubmit={(e) => void save(e, "server")}>
              <label>
                Portal name
                <input
                  name="site_name"
                  defaultValue={data.runtime.site_name}
                  required
                  maxLength={80}
                />
              </label>
              <label title="Public HTTPS URL used in recovery and case-update links.">
                Public address
                <input
                  name="public_url"
                  type="url"
                  defaultValue={data.runtime.public_url}
                  required
                />
              </label>
              <label title="Session lifetime after sign-in. Changing this affects new sessions.">
                Session duration (hours)
                <input
                  name="session_hours"
                  type="number"
                  min={1}
                  max={24}
                  defaultValue={data.runtime.session_hours}
                  required
                />
              </label>
              <label title="Days before each case-specific due date to begin reminders. This does not impose a universal case deadline.">
                Reminder lead time (days)
                <input
                  name="reminder_days"
                  type="number"
                  min={1}
                  max={30}
                  defaultValue={data.runtime.reminder_days}
                  required
                />
              </label>
              <button className="ws-primary" disabled={busy}>
                Save
              </button>
            </form>
          </section>
          <section className="ws-card">
            <h2>Setup status</h2>
            <dl>
              <dt>Database</dt>
              <dd>{data.current_database.name}</dd>
              <dt>Encryption</dt>
              <dd>{data.encryption_ready ? "Configured" : "Unavailable"}</dd>
              <dt>Recovery</dt>
              <dd>{data.runtime.recovery_enabled ? "Enabled" : "Disabled"}</dd>
              <dt>Updates</dt>
              <dd>{data.runtime.updates_enabled ? "Enabled" : "Disabled"}</dd>
              <dt>Reminders</dt>
              <dd>{data.runtime.reminders_enabled ? "Enabled" : "Disabled"}</dd>
            </dl>
            {setupAvailable && (
              <a href="/it/setup">Create administrator account →</a>
            )}
            <h3>Recent changes</h3>
            {data.logs.map((r, i) => (
              <p key={i}>
                <b>{r.action.replaceAll("_", " ")}</b>
                <small>
                  {r.detail} · {new Date(r.created_at).toLocaleString("en-IN")}
                </small>
              </p>
            ))}
          </section>
        </div>
      )}
      {section === "Bureaus" && (
        <section className="ws-card">
          <h2>Bureau catalogue</h2>
          <div className="ws-table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Name</th>
                  <th>Type</th>
                  <th>Verification</th>
                </tr>
              </thead>
              <tbody>
                {data.units.map((u) => (
                  <tr key={u.code}>
                    <td>{u.code}</td>
                    <td>{u.name}</td>
                    <td>{u.unit_type}</td>
                    <td>{u.verification}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <form
            className="ws-admin-form"
            onSubmit={(e) => void save(e, "unit")}
          >
            <label>
              Code
              <input name="code" required maxLength={30} list="unit-codes" />
              <datalist id="unit-codes">
                {data.units.map((u) => (
                  <option key={u.code} value={u.code}>
                    {u.name}
                  </option>
                ))}
              </datalist>
            </label>
            <label>
              Name
              <input name="name" required maxLength={150} />
            </label>
            <label>
              Type
              <select name="unit_type">
                <option>Bureau</option>
                <option>Cell</option>
                <option>Programme</option>
              </select>
            </label>
            <label className="ws-checkbox">
              <input name="active" type="checkbox" defaultChecked />
              Active
            </label>
            <label className="ws-checkbox">
              <input name="verification" type="checkbox" value="verified" />
              Verified
            </label>
            <button disabled={busy || !!data.is_demo}>Save</button>
          </form>
        </section>
      )}
    </div>
  );
}
