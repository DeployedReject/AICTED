import Select from "../Select";
import { useEffect, useState } from "react";
import type { Institution, Official } from "../../packages/shared/types";
import { api } from "./api";
import InstitutionPicker from "./InstitutionPicker";
import OfficialPicker from "./OfficialPicker";
import SecretField from "./SecretField";
interface Account {
  id: string;
  institution_id: string;
  name: string;
  email: string;
  active: number;
  institution_name: string;
  permanent_id: string;
}
export default function InstitutionAdmin({
  units,
  officials,
}: {
  units: { code: string; name: string }[];
  officials: Official[];
}) {
  const [tab, setTab] = useState("records"),
    [query, setQuery] = useState(""),
    [records, setRecords] = useState<Institution[]>([]),
    [accounts, setAccounts] = useState<Account[]>([]),
    [selected, setSelected] = useState<Institution | null>(null),
    [account, setAccount] = useState<Account | null>(null),
    [version, setVersion] = useState(0),
    [bureau, setBureau] = useState(units[0]?.code || ""),
    [routes, setRoutes] = useState<
      {
        bureau: string;
        approver_id: string;
        approver_name: string;
        bureau_name: string;
      }[]
    >([]),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [more, setMore] = useState(false);
  useEffect(() => {
    let current = true;
    const timer = setTimeout(
      () => {
        const path =
          tab === "records"
            ? "/admin/institution-records?q=" + encodeURIComponent(query)
            : tab === "accounts"
              ? "/admin/institution-accounts?q=" + encodeURIComponent(query)
              : "/admin/institution-routing";
        api<{
          institutions?: Institution[];
          accounts?: Account[];
          routes?: typeof routes;
          more?: boolean;
        }>(path)
          .then((data) => {
            if (current) {
              setRecords(data.institutions || []);
              setAccounts(data.accounts || []);
              setRoutes(data.routes || []);
              setMore(!!data.more);
            }
          })
          .catch((error) => {
            if (current) setError(error.message);
          });
      },
      query ? 500 : 0,
    );
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [tab, query, version]);
  async function save(event: React.FormEvent<HTMLFormElement>, path: string) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await api(path, Object.fromEntries(new FormData(event.currentTarget)));
      setNotice("Saved.");
      setVersion((v) => v + 1);
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="ws-tabs">
        {[
          ["records", "Institution records"],
          ["accounts", "Portal accounts"],
          ["routing", "Intake routing"],
        ].map(([key, label]) => (
          <button
            key={key}
            className={key === tab ? "active" : ""}
            onClick={() => {
              setTab(key);
              setQuery("");
              setError("");
              setNotice("");
            }}
          >
            {label}
          </button>
        ))}
      </div>
      {error && (
        <p className="ws-error" role="alert">
          {error}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      <div className="ws-admin-grid">
        <section className="ws-card">
          {tab === "records" ? (
            <>
              <h2>{selected ? "Edit institution" : "Register institution"}</h2>
              <form
                key={selected?.id || "new"}
                onSubmit={(event) =>
                  void save(event, "/admin/institution-records")
                }
              >
                <input type="hidden" name="id" value={selected?.id || ""} />
                {[
                  ["name", "Institution name"],
                  ["permanent_id", "AICTE Permanent ID"],
                  ["address", "Full address"],
                  ["city", "City"],
                  ["district", "District"],
                  ["state", "State / Union Territory"],
                  ["postal_code", "Postal code"],
                  ["region", "AICTE region"],
                  ["aishe_code", "AISHE code"],
                ].map(([key, label]) => (
                  <label key={key}>
                    {label}
                    <input
                      name={key}
                      defaultValue={String(
                        (selected as unknown as Record<string, unknown>)?.[
                          key
                        ] || "",
                      )}
                      required={[
                        "name",
                        "permanent_id",
                        "address",
                        "city",
                        "state",
                        "region",
                      ].includes(key)}
                      maxLength={
                        key === "address" ? 500 : key === "name" ? 180 : 80
                      }
                    />
                  </label>
                ))}
                <label>
                  Record availability
                  <Select
                    name="active"
                    defaultValue={String(selected?.active ?? 1)}
                  >
                    <option value="1">Active</option>
                    <option value="0">Inactive</option>
                  </Select>
                </label>
                <div className="ws-form-actions">
                  <button className="ws-primary" disabled={busy}>
                    Save institution
                  </button>
                  {selected && (
                    <button type="button" onClick={() => setSelected(null)}>
                      Register another
                    </button>
                  )}
                </div>
              </form>
            </>
          ) : tab === "accounts" ? (
            <>
              <h2>
                {account ? "Edit portal account" : "Create portal account"}
              </h2>
              <p className="ws-description">
                Each account is bound to one institution. Saving changes signs
                the account out. An empty password leaves an existing password
                unchanged.
              </p>
              <form
                key={account?.id || "new"}
                onSubmit={(event) =>
                  void save(event, "/admin/institution-accounts")
                }
              >
                <label>
                  Account ID
                  <input
                    name="id"
                    readOnly={!!account}
                    defaultValue={account?.id || ""}
                    required
                    maxLength={80}
                  />
                </label>
                {account ? (
                  <>
                    <input
                      type="hidden"
                      name="institution_id"
                      value={account.institution_id}
                    />
                    <label>
                      Institution
                      <input readOnly value={account.institution_name} />
                    </label>
                  </>
                ) : (
                  <InstitutionPicker required />
                )}
                <label>
                  Representative name
                  <input
                    name="name"
                    defaultValue={account?.name || ""}
                    required
                    maxLength={120}
                  />
                </label>
                <label>
                  Contact email
                  <input
                    type="email"
                    name="email"
                    defaultValue={account?.email || ""}
                    required
                    maxLength={254}
                  />
                </label>
                <SecretField
                  name="password"
                  label={
                    account ? "New password (optional)" : "Initial password"
                  }
                  minLength={12}
                  required={!account}
                />
                <label>
                  Account access
                  <Select
                    name="active"
                    defaultValue={String(account?.active ?? 1)}
                  >
                    <option value="1">Active</option>
                    <option value="0">Disabled</option>
                  </Select>
                </label>
                {account?.id === "0002" && (
                  <p>The shared test account cannot be changed.</p>
                )}
                <div className="ws-form-actions">
                  <button
                    disabled={busy || account?.id === "0002"}
                    className="ws-primary"
                  >
                    Save account
                  </button>
                  {account && (
                    <button type="button" onClick={() => setAccount(null)}>
                      Create another account
                    </button>
                  )}
                </div>
              </form>
            </>
          ) : (
            <>
              <h2>Institution intake routing</h2>
              <p className="ws-description">
                Choose the manager who reviews new institution submissions for
                each bureau. Only configured bureaus appear in the institution
                registration form.
              </p>
              <form
                onSubmit={(event) =>
                  void save(event, "/admin/institution-routing")
                }
              >
                <label>
                  Receiving bureau
                  <Select
                    name="bureau"
                    value={bureau}
                    onChange={(event) => setBureau(event.target.value)}
                  >
                    {units.map((unit) => (
                      <option key={unit.code} value={unit.code}>
                        {unit.name}
                      </option>
                    ))}
                  </Select>
                </label>
                <OfficialPicker
                  key={bureau}
                  name="approver_id"
                  label="Intake manager"
                  role="manager"
                  bureau={bureau}
                  officials={officials}
                  required
                />
                <button disabled={busy} className="ws-primary">
                  Save intake routing
                </button>
              </form>
            </>
          )}
        </section>
        <section className="ws-card">
          <h2>
            {tab === "records"
              ? "Institution directory"
              : tab === "accounts"
                ? "Institution accounts"
                : "Configured intake managers"}
          </h2>
          {tab !== "routing" && (
            <label>
              Search directory
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={
                  tab === "records"
                    ? "Institution name or Permanent ID"
                    : "Account ID, name or institution"
                }
              />
            </label>
          )}
          <div className="ws-tag-list">
            {tab === "records"
              ? records.map((record) => (
                  <button key={record.id} onClick={() => setSelected(record)}>
                    <span>
                      {record.name}
                      <small>
                        {record.permanent_id} · {record.city}
                      </small>
                    </span>
                  </button>
                ))
              : tab === "accounts"
                ? accounts.map((value) => (
                    <button key={value.id} onClick={() => setAccount(value)}>
                      <span>
                        {value.name}
                        <small>
                          {value.id} · {value.institution_name} ·{" "}
                          {value.active ? "Active" : "Disabled"}
                        </small>
                      </span>
                    </button>
                  ))
                : routes.map((route) => (
                    <div key={route.bureau}>
                      <b>{route.bureau_name}</b>
                      <p>
                        {route.approver_name} · {route.approver_id}
                      </p>
                    </div>
                  ))}
          </div>
          {more && (
            <p className="ws-hint">
              Showing 20 results. Refine the search for more.
            </p>
          )}
        </section>
      </div>
    </>
  );
}
