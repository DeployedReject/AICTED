import { useEffect, useId, useState } from "react";
import type { FormEvent } from "react";
import type { Official } from "../../packages/shared/types";
import { api } from "./api";
import { reduced } from "./Motion";
import OfficialPicker, { clearOfficialSearchCache } from "./OfficialPicker";
interface Config {
  settings: { support_email: string; sender_email: string };
  officials: Official[];
  current_database: { name: string; type: string };
  migration: {
    source: string;
    d1_database_id: string;
    host: string;
    port: number;
    database_name: string;
    username: string;
    ssl_mode: string;
  };
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
  const helpId = useId();
  const [source, setSource] = useState("");
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
      api<Config>("/admin"),
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
  }, [version]);
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
      {error && (
        <p role="alert" className="ws-error">
          {error}
        </p>
      )}
      {message && <p role="status">{message}</p>}
      {section === "Accounts" && (
        <div className="ws-admin-grid">
          <section className="ws-card">
            <h2>Authority</h2>
            <form onSubmit={(e) => void save(e, "reporting")}>
              <OfficialPicker
                name="official_id"
                label="Official"
                officials={data.officials}
                required
                onSelect={(o) => {
                  setAccount(o);
                  setAccountRole(o?.role || "official");
                }}
              />
              <label title="Managers review officials in their configured reporting tree.">
                Role
                <select
                  name="role"
                  value={accountRole}
                  onChange={(e) => setAccountRole(e.target.value)}
                >
                  <option value="official">Official</option>
                  <option value="manager">Manager</option>
                </select>
              </label>
              <OfficialPicker
                key={account?.id || "manager"}
                name="manager_id"
                label="Manager"
                officials={data.officials}
                role="manager"
                bureau={account?.bureau || ""}
                value={account?.manager_id || ""}
              />
              <button disabled={busy} className="ws-primary">
                Save
              </button>
            </form>
          </section>
          <section className="ws-card ws-accounts-list">
            <h2>Officials</h2>
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
                      <td>{o.bureau}</td>
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
          <h2>Register</h2>
          <form onSubmit={(e) => void save(e, "institution")}>
            {[
              ["name", "Name"],
              ["permanent_id", "ID"],
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
        <section className="ws-card ws-admin-form">
          <h2>Addresses</h2>
          <form onSubmit={(e) => void save(e, "settings")}>
            <label title="Contact for account help.">
              Support
              <input
                name="support_email"
                type="email"
                defaultValue={data.settings.support_email}
              />
            </label>
            <label title="Sender address for recovery mail. The mail provider must verify it before delivery is enabled.">
              Sender
              <input
                name="sender_email"
                type="email"
                defaultValue={data.settings.sender_email}
              />
            </label>
            <button disabled={busy} className="ws-primary">
              Save
            </button>
          </form>
        </section>
      )}
      {section === "Database" && (
        <section className="ws-card ws-admin-form ws-database">
          <form onSubmit={(e) => void save(e, "migration")}>
            <div className="ws-current-db">
              <div>
                <span>Current Database</span>
                <strong>{data.current_database.name}</strong>
              </div>
              <div>
                <span>Type</span>
                <strong>{data.current_database.type}</strong>
              </div>
            </div>
            <div className="ws-source-label">
              <label htmlFor={helpId + "source"}>Source</label>
              <details
                className="ws-help"
                onKeyDown={(e) => {
                  if (e.key === "Escape") e.currentTarget.open = false;
                }}
              >
                <summary
                  aria-label="Database configuration help"
                  aria-controls={helpId}
                >
                  ?
                </summary>
                <div id={helpId} role="note">
                  <strong>
                    {source === "d1" ? "Cloudflare D1" : "PostgreSQL"}
                  </strong>
                  <p>
                    Configure the database to use after migration. D1 stays
                    active until the new connection and data are verified.
                  </p>
                  <a
                    href="/postgres-spec.html"
                    target="_blank"
                    rel="noreferrer"
                  >
                    More details ↗
                  </a>
                </div>
              </details>
            </div>
            <select
              id={helpId + "source"}
              aria-label="Database source"
              name="source"
              required
              value={source}
              onChange={(e) => setSource(e.target.value)}
            >
              <option value="" disabled>
                Select
              </option>
              <option value="d1">Cloudflare D1</option>
              <option value="postgres">PostgreSQL</option>
            </select>
            {source === "d1" && (
              <>
                <label>
                  Database
                  <input
                    name="database_name"
                    defaultValue={
                      data.migration.source === "d1"
                        ? data.migration.database_name
                        : ""
                    }
                    required
                    maxLength={80}
                  />
                </label>
                <label title="Database UUID from Cloudflare. A matching Worker binding must be provisioned and the data verified before switching.">
                  ID
                  <input
                    name="d1_database_id"
                    defaultValue={data.migration.d1_database_id}
                    placeholder="Database UUID"
                    required
                    maxLength={36}
                  />
                </label>
              </>
            )}
            {source === "postgres" && (
              <>
                <div className="ws-db-fields">
                  <label>
                    Host
                    <input
                      name="host"
                      defaultValue={data.migration.host}
                      placeholder="db.example.org"
                      required
                      maxLength={253}
                    />
                  </label>
                  <label>
                    Port
                    <input
                      name="port"
                      type="number"
                      defaultValue={data.migration.port}
                      min={1}
                      max={65535}
                      required
                    />
                  </label>
                </div>
                <label>
                  Database
                  <input
                    name="database_name"
                    defaultValue={
                      data.migration.source === "postgres"
                        ? data.migration.database_name
                        : ""
                    }
                    required
                    maxLength={80}
                  />
                </label>
                <label title="Restricted application role. Configure its password as a Cloudflare/Hyperdrive secret during provisioning.">
                  User
                  <input
                    name="username"
                    defaultValue={data.migration.username}
                    required
                    maxLength={80}
                  />
                </label>
                <label title="TLS is required. Verify full validates the server certificate and hostname.">
                  TLS
                  <select
                    name="ssl_mode"
                    defaultValue={data.migration.ssl_mode}
                  >
                    <option value="verify-full">Verify full</option>
                    <option value="require">Required</option>
                  </select>
                </label>
              </>
            )}
            {source && (
              <button className="ws-primary" disabled={busy}>
                Save
              </button>
            )}
          </form>
        </section>
      )}
    </div>
  );
}
