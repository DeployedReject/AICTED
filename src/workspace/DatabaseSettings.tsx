import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { api } from "./api";
import { Icon } from "../Icons";
import SecretField from "./SecretField";
import ITHelp from "./ITHelp";
interface Profile {
  id: string;
  name: string;
  source: string;
  database_name: string;
  host: string;
  username: string;
  port: number;
  account_id: string;
  database_id: string;
  checked_ok: number;
  checked_at: string;
  check_message: string;
  has_credential: boolean;
}
interface State {
  active: Profile;
  previous_id: string | null;
  maintenance: boolean;
  profiles: Profile[];
  job: {
    phase: string;
    message: string;
    copied: number;
    target: string;
  } | null;
  is_demo: boolean;
  logs: { action: string; detail: string; created_at: string }[];
}
export default function DatabaseSettings() {
  const [data, setData] = useState<State | null>(null),
    [source, setSource] = useState("d1"),
    [selected, setSelected] = useState(""),
    [mode, setMode] = useState("copy"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [visible, setVisible] = useState(false),
    [credential, setCredential] = useState("");
  async function refresh() {
    try {
      const value = await api<State>("/database");
      setData(value);
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    void refresh();
  }, []);
  useEffect(() => {
    if (!data?.maintenance) return;
    const timer = setInterval(() => void refresh(), 5000);
    return () => clearInterval(timer);
  }, [data?.maintenance]);
  const target = data?.profiles.find((p) => p.id === selected);
  async function action(action: string, extra: Record<string, unknown> = {}) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await api<{ message?: string; ok: boolean; id?: string }>(
        "/database",
        { action, id: selected, ...extra },
      );
      if (result.id) setSelected(result.id);
      setNotice(result.message || "Saved");
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function submit(event: FormEvent<HTMLFormElement>, operation: string) {
    event.preventDefault();
    void action(
      operation,
      Object.fromEntries(new FormData(event.currentTarget)),
    );
  }
  async function reveal() {
    if (visible) {
      setVisible(false);
      setCredential("");
      return;
    }
    setBusy(true);
    try {
      const result = await api<{ value: string }>("/database", {
        action: "reveal",
        id: selected,
      });
      setCredential(result.value);
      setVisible(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (!data)
    return (
      <>
        {error ? (
          <p role="alert" className="ws-error">
            {error}
          </p>
        ) : (
          <div
            className="ws-skeleton"
            aria-label="Loading database settings"
            role="status"
          >
            <i />
            <i />
            <i />
          </div>
        )}
      </>
    );
  const disabled = busy || data.is_demo;
  return (
    <div className="ws-database-settings">
      <ITHelp section="Database" />
      {data.is_demo && (
        <p className="ws-description">
          Production IT sign-in is required to manage connections.
        </p>
      )}
      {error && (
        <p role="alert" className="ws-error">
          {error}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      <section className="ws-card ws-current-db">
        <div>
          <span>Current database</span>
          <strong>{data.active.name}</strong>
        </div>
        <div>
          <span>Database type</span>
          <strong>
            {data.active.source === "postgres"
              ? "PostgreSQL"
              : "SQLite · Cloudflare D1"}
          </strong>
        </div>
        <div>
          <span>Connection status</span>
          <strong>
            {data.maintenance ? "Transfer in progress" : "Active connection"}
          </strong>
        </div>
        <button onClick={() => void refresh()} disabled={busy}>
          Refresh status
        </button>
      </section>
      {data.job && (
        <section className="ws-card ws-transfer-status" role="status">
          <h2>
            {data.job.phase === "complete"
              ? "Activation complete"
              : data.job.phase === "failed"
                ? "Transfer stopped"
                : "Database transfer"}
          </h2>
          <p>{data.job.message}</p>
          {data.maintenance && (
            <>
              <p>
                Workspace access is paused. Transfer continues if you close this
                page.
              </p>
              <button
                disabled={disabled}
                onClick={() => void action("cancel", { id: data.job!.target })}
              >
                Cancel transfer
              </button>
            </>
          )}
        </section>
      )}
      <div className="ws-admin-grid">
        <section className="ws-card">
          <h2>Add connection</h2>
          <p className="ws-description">
            Saving a connection does not change the active database.
          </p>
          <form onSubmit={(e) => submit(e, "save")}>
            <label>
              Connection name
              <input name="name" required maxLength={80} />
            </label>
            <label>
              <span className="ws-field-heading">
                Database type
                <span
                  className="ws-field-help"
                  tabIndex={0}
                  role="note"
                  aria-label="Database connection help"
                >
                  ?
                  <span>
                    Choose where application records are stored. PostgreSQL
                    needs the supplied schema and a reachable TLS endpoint.{" "}
                    <a
                      href="/postgres-spec.html"
                      target="_blank"
                      rel="noreferrer"
                    >
                      More details ↗
                    </a>
                  </span>
                </span>
              </span>
              <select
                name="source"
                value={source}
                onChange={(e) => setSource(e.target.value)}
              >
                <option value="d1">Cloudflare D1</option>
                <option value="postgres">PostgreSQL</option>
              </select>
            </label>
            <label>
              Database name
              <input name="database_name" required maxLength={80} />
            </label>
            {source === "d1" ? (
              <>
                <label>
                  Cloudflare account ID
                  <input
                    name="account_id"
                    required
                    pattern="[a-fA-F0-9]{32}"
                    maxLength={32}
                  />
                </label>
                <label>
                  D1 database ID
                  <input name="database_id" required maxLength={36} />
                </label>
              </>
            ) : (
              <>
                <label>
                  Database host
                  <input
                    name="host"
                    required
                    placeholder="db.example.org"
                    maxLength={253}
                  />
                </label>
                <div className="ws-form-row">
                  <label>
                    Database port
                    <input
                      type="number"
                      name="port"
                      min={1}
                      max={65535}
                      defaultValue={5432}
                      required
                    />
                  </label>
                  <label>
                    Database user
                    <input name="username" required maxLength={80} />
                  </label>
                </div>
                <p className="ws-description">
                  Connections use TLS. A provider’s public pooler endpoint is
                  supported.
                </p>
              </>
            )}
            <SecretField
              key={source}
              name="credential"
              label={source === "d1" ? "D1 API token" : "Database password"}
              required
              disabled={data.is_demo}
            />
            <button
              className="ws-primary"
              disabled={disabled || data.maintenance}
            >
              Save connection
            </button>
          </form>
        </section>
        <section className="ws-card">
          <h2>Switch database</h2>
          <label>
            Saved connection
            <select
              value={selected}
              onChange={(e) => {
                setSelected(e.target.value);
                setVisible(false);
                setCredential("");
                setNotice("");
              }}
            >
              <option value="">Choose a connection</option>
              {data.profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {p.id === data.active.id
                    ? " · Active"
                    : p.id === data.previous_id
                      ? " · Previous"
                      : ""}
                </option>
              ))}
            </select>
          </label>
          {target && (
            <>
              <dl className="ws-connection-details">
                <dt>Database</dt>
                <dd>{target.database_name}</dd>
                <dt>Endpoint</dt>
                <dd>
                  {target.source === "bound"
                    ? "Original D1 binding"
                    : target.source === "d1"
                      ? target.database_id
                      : target.host + ":" + target.port}
                </dd>
                <dt>Last check</dt>
                <dd>
                  {target.checked_at
                    ? new Date(target.checked_at).toLocaleString("en-IN")
                    : "No connection check yet"}
                </dd>
              </dl>
              {target.check_message && (
                <p className="ws-description">{target.check_message}</p>
              )}
              {target.has_credential && (
                <div
                  className="ws-secret"
                  onBlur={(e) => {
                    if (
                      !e.currentTarget.contains(e.relatedTarget as Node | null)
                    ) {
                      setVisible(false);
                      setCredential("");
                    }
                  }}
                >
                  <label htmlFor="saved-database-credential">
                    Saved credential
                  </label>
                  <div>
                    <input
                      id="saved-database-credential"
                      readOnly
                      type={visible ? "text" : "password"}
                      value={visible ? credential : "••••••••••••"}
                    />
                    <button
                      type="button"
                      aria-label={
                        visible
                          ? "Hide saved credential"
                          : "Reveal saved credential"
                      }
                      aria-pressed={visible}
                      disabled={disabled}
                      onClick={() => void reveal()}
                    >
                      <Icon name={visible ? "eyeOff" : "eye"} size={17} />
                    </button>
                  </div>
                </div>
              )}
              <div className="ws-form-actions">
                <button
                  disabled={disabled || data.maintenance}
                  onClick={() => void action("check")}
                >
                  Test connection
                </button>
                {target.id !== data.active.id && target.id !== "original" && (
                  <button
                    disabled={disabled || data.maintenance}
                    onClick={() => void action("initialize")}
                  >
                    Initialize empty database
                  </button>
                )}
              </div>
              {target.id !== data.active.id && (
                <form onSubmit={(e) => submit(e, "activate")}>
                  <label>
                    Existing data
                    <select
                      name="mode"
                      value={mode}
                      onChange={(e) => setMode(e.target.value)}
                    >
                      <option value="copy">Copy current data</option>
                      <option value="prepared">Use prepared database</option>
                    </select>
                  </label>
                  <p className="ws-description">
                    {mode === "copy"
                      ? "Copies and verifies the current records. Destination application tables must be empty."
                      : "Uses the destination’s existing records as they are. Your current dataset is not merged. Reverting to a previous database does not include newer changes."}
                  </p>
                  <label>
                    Confirm connection name
                    <input
                      name="confirm"
                      required
                      autoComplete="off"
                      placeholder={target.name}
                    />
                  </label>
                  <button
                    className="ws-primary"
                    disabled={disabled || data.maintenance}
                  >
                    Activate database
                  </button>
                </form>
              )}
              {data.job?.phase === "failed" &&
                data.job.target === target.id &&
                data.job.target !== data.previous_id && (
                  <form onSubmit={(e) => submit(e, "reset_incomplete")}>
                    <h3>Reset incomplete copy</h3>
                    <p className="ws-description">
                      Removes application tables and records from this failed
                      destination so you can initialize and retry. The active
                      database is untouched.
                    </p>
                    <label>
                      Confirm destination name
                      <input
                        name="confirm"
                        required
                        placeholder={target.name}
                      />
                    </label>
                    <button disabled={disabled || data.maintenance}>
                      Discard incomplete copy
                    </button>
                  </form>
                )}
            </>
          )}
        </section>
      </div>
      <section className="ws-card">
        <h2>Connection history</h2>
        {data.logs.length ? (
          data.logs.map((log, i) => (
            <p key={i}>
              <b>{log.action.replaceAll("_", " ")}</b> · {log.detail}
              <small>{new Date(log.created_at).toLocaleString("en-IN")}</small>
            </p>
          ))
        ) : (
          <p>No connection changes recorded.</p>
        )}
      </section>
    </div>
  );
}
