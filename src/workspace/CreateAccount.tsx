import { useState } from "react";
import type { FormEvent } from "react";
import type { Official } from "../../packages/shared/types";
import { api } from "./api";
import OfficialPicker from "./OfficialPicker";
import SecretField from "./SecretField";
export default function CreateAccount({
  units,
  officials,
  demo,
  onSaved,
}: {
  units: { code: string; name: string; active: number }[];
  officials: Official[];
  demo: boolean;
  onSaved: () => void;
}) {
  const [bureau, setBureau] = useState(""),
    [role, setRole] = useState("official"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("/admin", {
        ...Object.fromEntries(new FormData(e.currentTarget)),
        action: "create_account",
      });
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="ws-card ws-admin-form">
      <h2>Create account</h2>
      <form onSubmit={submit}>
        <label>
          Official ID
          <input name="id" required maxLength={80} />
        </label>
        <label>
          Full name
          <input name="name" required maxLength={120} />
        </label>
        <label>
          Email
          <input name="email" type="email" required={!demo} maxLength={254} />
        </label>
        <label>
          Designation
          <input
            name="designation"
            list="designation-list"
            required
            maxLength={80}
          />
          <datalist id="designation-list">
            {[
              "Member Secretary",
              "Adviser-I",
              "Adviser-II",
              "Director",
              "Deputy Director",
              "Assistant Director",
              "Regional Officer",
              "Supporting Official",
              "Technical Official",
              "Other",
            ].map((d) => (
              <option key={d}>{d}</option>
            ))}
          </datalist>
        </label>
        <label>
          Bureau
          <select
            name="bureau"
            required
            value={bureau}
            onChange={(e) => setBureau(e.target.value)}
          >
            <option value="">Select</option>
            {units
              .filter((u) => u.active)
              .map((u) => (
                <option key={u.code} value={u.code}>
                  {u.name}
                </option>
              ))}
          </select>
        </label>
        <label>
          Role
          <select
            name="role"
            value={role}
            onChange={(e) => setRole(e.target.value)}
          >
            <option value="official">Official</option>
            <option value="manager">Manager</option>
            <option value="it">IT</option>
          </select>
        </label>
        <label title="Personal covers assigned work. Team includes the reporting tree. Bureau Head / Cell In-charge covers the full assigned bureau.">
          Report access
          <select
            name="report_scope"
            key={role}
            defaultValue={role === "manager" ? "team" : "personal"}
            disabled={role !== "manager"}
          >
            {role !== "manager" ? (
              <option value="personal">Personal workload</option>
            ) : (
              <>
                <option value="team">Reporting team</option>
                <option value="bureau">Bureau Head / Cell In-charge</option>
              </>
            )}
          </select>
        </label>
        <OfficialPicker
          name="manager_id"
          label="Reporting manager"
          officials={officials}
          role="manager"
          bureau={bureau}
        />
        <SecretField
          name="password"
          label="Password"
          required={!demo}
          disabled={demo}
          minLength={12}
        />
        {error && (
          <p role="alert" className="ws-error">
            {error}
          </p>
        )}
        <button className="ws-primary" disabled={busy}>
          Create
        </button>
      </form>
    </section>
  );
}
