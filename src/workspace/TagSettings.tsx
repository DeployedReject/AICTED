import TagCases, { type TagSelection } from "./TagCases";
import { useEffect, useRef, useState } from "react";
import { api } from "./api";
interface Tag {
  code: string;
  label: string;
  group_name: string;
  active: number;
  source: string;
  case_count: number;
}
export default function TagSettings({ onSaved }: { onSaved: () => void }) {
  const institutionCache = useRef(
    new Map<
      string,
      {
        at: number;
        institutions: {
          id: string;
          name: string;
          permanent_id: string;
          case_count: number;
        }[];
        more: boolean;
      }
    >(),
  );
  const [viewing, setViewing] = useState<TagSelection | null>(null);
  const [kind, setKind] = useState("case"),
    [institutionQuery, setInstitutionQuery] = useState(""),
    [institutions, setInstitutions] = useState<
      { id: string; name: string; permanent_id: string; case_count: number }[]
    >([]),
    [institutionBusy, setInstitutionBusy] = useState(false),
    [institutionError, setInstitutionError] = useState(""),
    [more, setMore] = useState(false);
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
  useEffect(() => {
    if (kind !== "institution") return;
    let current = true;
    if (institutionQuery.trim().length === 1) {
      setInstitutionBusy(false);
      setInstitutionError("");
      setInstitutions([]);
      setMore(false);
      return;
    }
    const timer = setTimeout(() => {
      const key = institutionQuery.trim().toLowerCase(),
        cached = institutionCache.current.get(key);
      if (cached && Date.now() - cached.at < 300000) {
        setInstitutions(cached.institutions);
        setMore(cached.more);
        setInstitutionBusy(false);
        setInstitutionError("");
        return;
      }
      setInstitutionBusy(true);
      setInstitutionError("");
      api<{ institutions: typeof institutions; more: boolean }>(
        "/admin/tag-institutions?q=" +
          encodeURIComponent(institutionQuery.trim()),
      )
        .then((result) => {
          institutionCache.current.set(key, { ...result, at: Date.now() });
          if (institutionCache.current.size > 40)
            institutionCache.current.delete(
              institutionCache.current.keys().next().value!,
            );
          if (current) {
            setInstitutions(result.institutions);
            setMore(result.more);
          }
        })
        .catch((error) => {
          if (current) setInstitutionError(error.message);
        })
        .finally(() => {
          if (current) setInstitutionBusy(false);
        });
    }, 500);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [kind, institutionQuery]);
  const visible = tags.filter((tag) =>
    `${tag.code} ${tag.label} ${tag.group_name}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  return (
    <div className="ws-tag-columns">
      <div className="ws-tag-stack">
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
        <section className="ws-card ws-tag-usage">
          <h2>Cases by tag</h2>
          <p className="ws-description">
            Counts include submissions, open cases and past cases in this
            dataset. A case can have more than one tag.
          </p>
          {viewing ? (
            <TagCases
              key={viewing.kind + viewing.id}
              selection={viewing}
              back={() => setViewing(null)}
            />
          ) : (
            <>
              <div className="ws-tabs" role="group" aria-label="Tag type">
                <button
                  type="button"
                  className={kind === "case" ? "active" : ""}
                  onClick={() => setKind("case")}
                >
                  Case tags
                </button>
                <button
                  type="button"
                  className={kind === "institution" ? "active" : ""}
                  onClick={() => setKind("institution")}
                >
                  Institutions
                </button>
              </div>
              {kind === "case" ? (
                <div className="ws-tag-counts">
                  {loading ? (
                    <p role="status">Loading counts…</p>
                  ) : (
                    visible.map((tag) => (
                      <button
                        type="button"
                        key={tag.code}
                        onClick={() =>
                          setViewing({
                            kind: "case",
                            id: tag.code,
                            label: tag.label,
                            count: tag.case_count,
                          })
                        }
                      >
                        <span>
                          {tag.label}
                          <small>{tag.group_name}</small>
                        </span>
                        <b>{tag.case_count}</b>
                      </button>
                    ))
                  )}
                  {!loading && !visible.length && <p>No matching tags.</p>}
                </div>
              ) : (
                <>
                  <label>
                    Find an institution
                    <input
                      value={institutionQuery}
                      onChange={(event) =>
                        setInstitutionQuery(event.target.value)
                      }
                      placeholder="Institution name or Permanent ID"
                    />
                  </label>
                  <p className="ws-hint">
                    Institutions count as tags through the institution linked to
                    each case. Edit their records in Institutions.
                  </p>
                  {institutionError && (
                    <p role="alert" className="ws-error">
                      {institutionError}
                    </p>
                  )}
                  {institutionBusy ? (
                    <p role="status">Loading institutions…</p>
                  ) : (
                    <div className="ws-tag-counts">
                      {institutions.map((institution) => (
                        <button
                          type="button"
                          key={institution.id}
                          onClick={() =>
                            setViewing({
                              kind: "institution",
                              id: institution.id,
                              label: institution.name,
                              count: institution.case_count,
                            })
                          }
                        >
                          <span>
                            {institution.name}
                            <small>{institution.permanent_id}</small>
                          </span>
                          <b>{institution.case_count}</b>
                        </button>
                      ))}
                    </div>
                  )}
                  {institutionQuery.trim().length === 1 ? (
                    <p>Type at least two characters.</p>
                  ) : (
                    !institutionBusy &&
                    !institutions.length &&
                    !institutionError && <p>No matching institutions.</p>
                  )}
                  {more && (
                    <p className="ws-hint">
                      Showing 20 institutions. Search by name or Permanent ID to
                      narrow the results.
                    </p>
                  )}
                </>
              )}
            </>
          )}
        </section>
      </div>
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
