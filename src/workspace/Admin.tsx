import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import type { Official } from "../../packages/shared/types";
import { api } from "./api";
interface Config {
  settings: { support_email: string; sender_email: string };
  officials: Official[];
}
export default function Admin({
  refresh,
  version,
}: {
  refresh: () => void;
  version: number;
}) {
  const [data, setData] = useState<Config | null>(null),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    api<Config>("/admin")
      .then(setData)
      .catch((e) => setError(e.message));
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
      setMessage("Saved.");
      refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (!data) return <p role="status">{error || "Loading administration…"}</p>;
  return (
    <>
      {error && (
        <p className="ws-error" role="alert">
          {error}
        </p>
      )}
      {message && <p role="status">{message}</p>}
      <div className="ws-board">
        <div>
          <section className="ws-card">
            <h2>Reporting and authority</h2>
            <p>
              Assign managers explicitly. Designations on the login page never
              grant access.
            </p>
            <form onSubmit={(e) => void save(e, "reporting")}>
              <label>
                Official
                <select name="official_id" required>
                  <option value="">Choose official</option>
                  {data.officials
                    .filter((o) => o.role !== "it" && o.id !== "0000")
                    .map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.name} · {o.id} · {o.role}
                      </option>
                    ))}
                </select>
              </label>
              <label title="Managers can review work submitted by officials in their reporting tree.">
                Authority
                <select name="role">
                  <option value="official">Official</option>
                  <option value="manager">Manager</option>
                </select>
              </label>
              <label title="Choose a manager within the same Bureau. Reporting cycles are blocked.">
                Reports to
                <select name="manager_id">
                  <option value="">No reporting manager</option>
                  {data.officials
                    .filter((o) => o.role === "manager")
                    .map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.name} · {o.bureau} · {o.id}
                      </option>
                    ))}
                </select>
              </label>
              <button disabled={busy} className="ws-primary">
                Save authority
              </button>
            </form>
            <table>
              <thead>
                <tr>
                  <th>Official</th>
                  <th>Authority</th>
                  <th>Reports to</th>
                </tr>
              </thead>
              <tbody>
                {data.officials.map((o) => (
                  <tr key={o.id}>
                    <td>
                      {o.name}
                      <small>{o.id}</small>
                    </td>
                    <td>{o.role}</td>
                    <td>
                      {data.officials.find((m) => m.id === o.manager_id)
                        ?.name || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
          <section className="ws-card">
            <h2>Add institution</h2>
            <p>
              Officials can view institution records. Only IT can maintain this
              directory.
            </p>
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
              <button disabled={busy}>Add institution</button>
            </form>
          </section>
        </div>
        <aside>
          <section className="ws-card">
            <h2>Contact settings</h2>
            <form onSubmit={(e) => void save(e, "settings")}>
              <label title="Address officials should contact for account help.">
                Support email
                <input
                  name="support_email"
                  type="email"
                  defaultValue={data.settings.support_email}
                />
              </label>
              <label title="The sender must be verified by your mail provider before password recovery can be enabled.">
                Sender email
                <input
                  name="sender_email"
                  type="email"
                  defaultValue={data.settings.sender_email}
                />
              </label>
              <button disabled={busy}>Save settings</button>
            </form>
          </section>
          <section className="ws-card">
            <h2>Infrastructure</h2>
            <dl>
              <dt>Database</dt>
              <dd>Cloudflare D1</dd>
              <dt>Services</dt>
              <dd>Web · Casework · Relevance</dd>
            </dl>
            <p className="ws-hint">
              Service credentials are held in Cloudflare secrets. Public demo
              accounts cannot invoke AI. Each official has a daily suggestion
              limit, with cached results.
            </p>
            <p className="ws-hint">
              Email delivery and translation need production provider
              configuration. Contact settings alone do not enable them.
            </p>
          </section>
        </aside>
      </div>
    </>
  );
}
