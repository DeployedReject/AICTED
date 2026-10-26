import { useEffect, useState } from "react";
import { api } from "./api";
interface Tag {
  code: string;
  label: string;
  group_name: string;
  active: number;
  source: string;
}
export default function TagSettings({ onSaved }: { onSaved: () => void }) {
  const [tags, setTags] = useState<Tag[]>([]),
    [selected, setSelected] = useState<Tag | null>(null),
    [query, setQuery] = useState(""),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  async function load() {
    try {
      const result = await api<{ tags: Tag[] }>("/admin/tags");
      setTags(result.tags);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
  }, []);
  const visible = tags.filter((tag) =>
    `${tag.code} ${tag.label} ${tag.group_name}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  return (
    <div className="ws-admin-grid">
      <section className="ws-card">
        <h2>{selected ? "Edit case tag" : "Add case tag"}</h2>
        <p className="ws-description">
          Deactivate a tag to remove it from new cases. Its code remains in
          existing case history.
        </p>
        <form
          key={selected?.code || "new"}
          onSubmit={async (event) => {
            event.preventDefault();
            const values = Object.fromEntries(
              new FormData(event.currentTarget),
            );
            setBusy(true);
            setError("");
            setNotice("");
            try {
              await api("/admin/tags", { ...values, action: "save" });
              setNotice("Tag saved.");
              await load();
              onSaved();
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <label>
            Tag code
            <input
              name="code"
              required
              pattern="[A-Za-z][A-Za-z0-9_-]*"
              maxLength={40}
              readOnly={!!selected}
              defaultValue={selected?.code || ""}
              placeholder="FEE_REFUND"
            />
          </label>
          <label>
            Display name
            <input
              name="label"
              required
              maxLength={120}
              defaultValue={selected?.label || ""}
            />
          </label>
          <label>
            Category group
            <input
              name="group_name"
              required
              maxLength={80}
              defaultValue={selected?.group_name || ""}
            />
          </label>
          <label className="ws-checkbox">
            <input
              type="checkbox"
              name="active"
              value="1"
              defaultChecked={selected ? !!selected.active : true}
            />
            Available for new cases
          </label>
          {error && (
            <p role="alert" className="ws-error">
              {error}
            </p>
          )}
          {notice && <p role="status">{notice}</p>}
          <div className="ws-form-actions">
            <button className="ws-primary" disabled={busy}>
              Save tag
            </button>
            {selected && (
              <button
                type="button"
                onClick={() => {
                  setSelected(null);
                  setNotice("");
                  setError("");
                }}
              >
                Add another tag
              </button>
            )}
          </div>
        </form>
      </section>
      <section className="ws-card">
        <h2>Case tag catalogue</h2>
        <label>
          Find a tag
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Name, code or group"
          />
        </label>
        {loading ? (
          <div
            className="ws-skeleton"
            role="status"
            aria-label="Loading case tags"
          >
            <i />
            <i />
          </div>
        ) : (
          <div className="ws-tag-list">
            {visible.map((tag) => (
              <button
                key={tag.code}
                className={selected?.code === tag.code ? "selected" : ""}
                onClick={() => {
                  setSelected(tag);
                  setNotice("");
                  setError("");
                }}
              >
                <span>
                  {tag.label}
                  <small>
                    {tag.code} · {tag.group_name}
                  </small>
                </span>
                <span className="ws-badge">
                  {tag.active ? "Active" : "Inactive"}
                </span>
              </button>
            ))}
            {!visible.length && <p>No matching tags.</p>}
          </div>
        )}
      </section>
    </div>
  );
}
