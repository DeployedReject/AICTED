import { useEffect, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import type {
  Bootstrap,
  CaseDetail,
  CaseRecord,
  Coordination,
  Institution,
  Message,
  Official,
} from "../../packages/shared/types";
import { BrandMark } from "../Icons";
import { api } from "./api";
import "./workspace.css";
import Admin from "./Admin";
import caseGlyph from "../../Assets/glyphs/file-svgrepo-com.svg";
import mailGlyph from "../../Assets/glyphs/mail-svgrepo-com.svg";

type Page =
  | "My Work"
  | "Cases"
  | "Institutions"
  | "Messages"
  | "Reports"
  | "Administration";
const date = (s: string) =>
  new Date(s).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
const stamp = (s: string) =>
  new Date(s).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
function useDebounced(value: string) {
  const [result, setResult] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setResult(value), 300);
    return () => clearTimeout(t);
  }, [value]);
  return result;
}
function Skeleton() {
  return (
    <div className="ws-skeleton" role="status" aria-label="Loading">
      <i />
      <i />
      <i />
      <i />
    </div>
  );
}
function Empty({ children }: { children: ReactNode }) {
  return <div className="ws-empty">{children}</div>;
}
function Badge({
  children,
  red = false,
}: {
  children: ReactNode;
  red?: boolean;
}) {
  return (
    <span className={"ws-badge" + (red ? " danger" : "")}>{children}</span>
  );
}
function useLoad<T>(path: string, version = 0) {
  const [data, setData] = useState<T | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    setData(null);
    setError("");
    api<T>(path)
      .then((r) => {
        if (active) setData(r);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [path, version]);
  return { data, error };
}
function ErrorBox({ text }: { text: string }) {
  return (
    <div className="ws-error" role="alert">
      {text} <button onClick={() => location.reload()}>Reload</button>
    </div>
  );
}
function CaseTable({
  rows,
  open,
}: {
  rows: CaseRecord[];
  open: (id: string) => void;
}) {
  return rows.length ? (
    <div className="ws-table-scroll">
      <table>
        <thead>
          <tr>
            <th>Case / institution</th>
            <th>Status</th>
            <th>Assigned to</th>
            <th>Due</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((c) => (
            <tr key={c.id} className={c.escalated ? "escalated" : ""}>
              <td>
                <button className="ws-case-link" onClick={() => open(c.id)}>
                  {c.subject}
                </button>
                <small>
                  {c.id} · {c.institution_name}
                </small>
                <div className="ws-tags">
                  {c.tags.map((t) => (
                    <span key={t}>{t}</span>
                  ))}
                </div>
              </td>
              <td>
                {c.escalated === 1 && <Badge red>Escalated</Badge>}
                <Badge>{c.intake === "Approved" ? c.status : c.intake}</Badge>
              </td>
              <td>
                {c.assigned_name}
                <small>{c.bureau}</small>
              </td>
              <td
                className={
                  c.status !== "Disposed" && c.due_at < new Date().toISOString()
                    ? "ws-overdue"
                    : ""
                }
              >
                {date(c.due_at)}
                <small>Received {date(c.received_at)}</small>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  ) : (
    <Empty>No cases match these filters.</Empty>
  );
}

export default function Workspace() {
  const [version, setVersion] = useState(0),
    [page, setPage] = useState<Page>("My Work"),
    [selected, setSelectedState] = useState<string | null>(() =>
      new URLSearchParams(location.search).get("case"),
    ),
    [creating, setCreating] = useState(false);
  const { data: boot, error } = useLoad<Bootstrap>("/bootstrap", version);
  const refresh = () => setVersion((v) => v + 1);
  function setSelected(value: string | null) {
    const url = new URL(location.href);
    if (value) url.searchParams.set("case", value);
    else url.searchParams.delete("case");
    history.pushState(null, "", url);
    setSelectedState(value);
  }
  useEffect(() => {
    const onBack = () => {
      setSelectedState(new URLSearchParams(location.search).get("case"));
      setCreating(false);
    };
    window.addEventListener("popstate", onBack);
    return () => window.removeEventListener("popstate", onBack);
  }, []);

  useEffect(() => {
    document.title = "Workspace · AICTE";
    const saved = localStorage.getItem("aicte-theme");
    if (saved) document.documentElement.dataset.theme = saved;
  }, []);
  if (error)
    return (
      <div className="workspace">
        <ErrorBox text={error} />
      </div>
    );
  if (!boot)
    return (
      <div className="workspace">
        <Skeleton />
      </div>
    );
  const user = boot.user;
  return (
    <div className="workspace">
      <aside className="ws-sidebar">
        <a className="ws-brand" href="/">
          <BrandMark />
          <span>
            <b>AICTE</b>
            <small>Case workspace</small>
          </span>
        </a>
        <div className="ws-nav-label">WORKSPACE</div>
        <nav>
          {(
            [
              "My Work",
              "Cases",
              "Institutions",
              "Messages",
              "Reports",
              ...(user.role === "it" ? ["Administration"] : []),
            ] as Page[]
          ).map((p, i) => (
            <button
              className={p === page && !selected ? "active" : ""}
              key={p}
              onClick={() => {
                setPage(p);
                setSelected(null);
                setCreating(false);
              }}
            >
              <span aria-hidden="true">
                {p === "Cases" || p === "Messages" ? (
                  <i
                    className="ws-nav-glyph"
                    style={{
                      maskImage: `url(${p === "Cases" ? caseGlyph : mailGlyph})`,
                    }}
                  />
                ) : (
                  ["◫", "▤", "▥", "✉", "▦", "⚙"][i]
                )}
              </span>
              {p}
            </button>
          ))}
        </nav>
        <div className="ws-sidebar-bottom">
          <span>{user.bureau}</span>
          <b>{user.name}</b>
          <small>
            {user.designation} · {user.id}
          </small>
          <button
            onClick={async () => {
              await api("/auth/logout", {});
              sessionStorage.removeItem("demo-actor");
              location.assign("/");
            }}
          >
            Sign out ↗
          </button>
        </div>
      </aside>
      <div className="ws-body">
        <header className="ws-topbar">
          <span>{selected ? "Cases / Case board" : page}</span>
          <div>
            {user.is_demo === 1 && <Badge>DEMO WORKSPACE</Badge>}
            <button
              aria-label="Toggle colour theme"
              onClick={() => {
                const next =
                  document.documentElement.dataset.theme === "dark"
                    ? "light"
                    : "dark";
                document.documentElement.dataset.theme = next;
                localStorage.setItem("aicte-theme", next);
              }}
            >
              ◐
            </button>
          </div>
        </header>
        {user.is_demo === 1 && (
          <div className="ws-demo">
            <span>
              <b>Demo data.</b> Fictional institutions and cases. Changes are
              shared with other testers.
            </span>
            <label>
              View as{" "}
              <select
                aria-label="Demo official"
                value={user.id}
                onChange={(e) => {
                  sessionStorage.setItem("demo-actor", e.target.value);
                  setSelected(null);
                  setCreating(false);
                  refresh();
                }}
              >
                {boot.officials.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name} · {o.designation} · {o.bureau}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}
        <main className="ws-content">
          {selected ? (
            <Board
              id={selected}
              boot={boot}
              version={version}
              refresh={refresh}
              back={() => setSelected(null)}
            />
          ) : creating ? (
            <NewCase
              boot={boot}
              done={(id) => {
                setCreating(false);
                setSelected(id);
                refresh();
              }}
              cancel={() => setCreating(false)}
            />
          ) : (
            <>
              <div className="ws-heading">
                <div>
                  <div className="ws-eyebrow">{user.bureau.toUpperCase()}</div>
                  <h1>{page}</h1>
                  <p>
                    {
                      {
                        "My Work": "Your cases, reviews and next steps.",
                        Cases: "Find cases shared with you and your team.",
                        Institutions: "Case history by institution.",
                        Messages: "Contact an official by designation and ID.",
                        Reports: "A snapshot of the cases you can access.",
                        Administration:
                          "Account authority and workspace configuration.",
                      }[page]
                    }
                  </p>
                </div>
                {(page === "My Work" || page === "Cases") && (
                  <button
                    className="ws-primary"
                    onClick={() => setCreating(true)}
                  >
                    + Register case
                  </button>
                )}
              </div>
              {page === "My Work" && (
                <div className="ws-metrics">
                  {[
                    ["Cases in your scope", boot.summary.total],
                    ["In progress", boot.summary.processing],
                    ["Overdue", boot.summary.overdue],
                    ["Escalated", boot.summary.escalated],
                  ].map(([label, n]) => (
                    <div key={label}>
                      <span>{label}</span>
                      <strong>{n}</strong>
                    </div>
                  ))}
                </div>
              )}
              {(page === "My Work" || page === "Cases") && (
                <CaseList
                  key={page}
                  boot={boot}
                  version={version}
                  open={setSelected}
                  all={page === "Cases"}
                  refresh={refresh}
                />
              )}
              {page === "Institutions" && (
                <Institutions open={setSelected} version={version} />
              )}
              {page === "Messages" && (
                <Messages
                  boot={boot}
                  version={version}
                  refresh={refresh}
                  open={setSelected}
                />
              )}
              {page === "Reports" && <Reports version={version} />}
              {page === "Administration" && (
                <Admin version={version} refresh={refresh} />
              )}
            </>
          )}
        </main>
        <footer className="ws-footer">
          © {new Date().getFullYear()} DeployedReject
        </footer>
      </div>
    </div>
  );
}

function CaseList({
  boot,
  version,
  open,
  all,
  refresh,
}: {
  boot: Bootstrap;
  version: number;
  open: (id: string) => void;
  all: boolean;
  refresh: () => void;
}) {
  const [view, setView] = useState(all ? "all" : "assigned"),
    [q, setQ] = useState(""),
    [search, setSearch] = useState(""),
    [tag, setTag] = useState(""),
    [institution, setInstitution] = useState(""),
    [status, setStatus] = useState(""),
    [bureau, setBureau] = useState(""),
    [region, setRegion] = useState(""),
    [from, setFrom] = useState(""),
    [to, setTo] = useState(""),
    [cursor, setCursor] = useState("");
  const [instSearch, setInstSearch] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setSearch(q), 350);
    return () => clearTimeout(timer);
  }, [q]);
  useEffect(
    () => setCursor(""),
    [search, tag, institution, status, bureau, region, from, to, view],
  );
  const institutions = useLoad<{ institutions: Institution[] }>(
    "/institutions?q=" + encodeURIComponent(useDebounced(instSearch)),
  );
  const params = new URLSearchParams({
    view,
    q: search,
    tag,
    institution,
    status,
    bureau,
    region,
    from,
    to,
    cursor,
  });
  const { data, error } = useLoad<{ cases: CaseRecord[]; next: string | null }>(
    "/cases?" + params,
    version,
  );
  return (
    <>
      <div className="ws-tabs" role="group" aria-label="Case view">
        {(all
          ? ["all"]
          : [
              "assigned",
              ...(boot.user.role === "manager"
                ? ["team", "proposed"]
                : ["proposed"]),
              "coordination",
            ]
        ).map((v) => (
          <button
            key={v}
            className={view === v ? "active" : ""}
            onClick={() => {
              setCursor("");
              setView(v);
            }}
          >
            {
              {
                all: "All accessible",
                assigned: "Assigned to me",
                team: "My team",
                proposed: "Intake review",
                coordination: "Coordination",
              }[v]
            }
          </button>
        ))}
      </div>
      {view === "coordination" ? (
        <CoordinationList version={version} refresh={refresh} open={open} />
      ) : (
        <>
          <div className="ws-filters">
            <input
              aria-label="Search cases"
              placeholder="Search case title or ID"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            <select
              aria-label="Tag filter"
              value={tag}
              onChange={(e) => setTag(e.target.value)}
            >
              <option value="">All tags</option>
              {boot.tags.map((t) => (
                <option key={t.code} value={t.code}>
                  {t.label}
                </option>
              ))}
            </select>
            <details className="ws-institution-filter">
              <summary>
                {institution
                  ? institutions.data?.institutions.find(
                      (i) => i.id === institution,
                    )?.name || "Institution selected"
                  : "All institutions"}
              </summary>
              <div>
                <input
                  aria-label="Find institution"
                  placeholder="Name or Permanent ID"
                  value={instSearch}
                  onChange={(e) => setInstSearch(e.target.value)}
                />
                <button onClick={() => setInstitution("")}>
                  All institutions
                </button>
                {institutions.data?.institutions.map((i) => (
                  <button
                    key={i.id}
                    onClick={(e) => {
                      setInstitution(i.id);
                      e.currentTarget
                        .closest("details")
                        ?.removeAttribute("open");
                    }}
                  >
                    {i.name}
                    <small>{i.permanent_id}</small>
                  </button>
                ))}
              </div>
            </details>
            {all && (
              <>
                <select
                  aria-label="Status filter"
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                >
                  <option value="">All statuses</option>
                  {[
                    "Pending",
                    "Under process",
                    "Awaiting information",
                    "Disposed",
                  ].map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
                <select
                  aria-label="Bureau filter"
                  value={bureau}
                  onChange={(e) => setBureau(e.target.value)}
                >
                  <option value="">All Bureaus</option>
                  {[...new Set(boot.officials.map((o) => o.bureau))].map(
                    (b) => (
                      <option key={b}>{b}</option>
                    ),
                  )}
                </select>
                <input
                  aria-label="Region filter"
                  placeholder="Region"
                  value={region}
                  onChange={(e) => setRegion(e.target.value)}
                />
                <label>
                  From
                  <input
                    aria-label="Received from"
                    type="date"
                    value={from}
                    onChange={(e) => setFrom(e.target.value)}
                  />
                </label>
                <label>
                  To
                  <input
                    aria-label="Received until"
                    type="date"
                    value={to}
                    onChange={(e) => setTo(e.target.value)}
                  />
                </label>
              </>
            )}
          </div>
          {error ? (
            <ErrorBox text={error} />
          ) : !data ? (
            <Skeleton />
          ) : (
            <>
              <CaseTable rows={data.cases} open={open} />
              <div className="ws-pagination">
                <span>Up to 25 cases per page</span>
                {cursor && (
                  <button onClick={() => setCursor("")}>First page</button>
                )}
                {data.next && (
                  <button onClick={() => setCursor(data.next!)}>
                    Next page →
                  </button>
                )}
              </div>
            </>
          )}
        </>
      )}
      {view === "team" && <Team version={version} />}
    </>
  );
}
function Team({ version }: { version: number }) {
  const { data, error } = useLoad<{
    officials: (Official & { active_cases: number })[];
  }>("/team", version);
  if (error) return <ErrorBox text={error} />;
  return (
    <section className="ws-section">
      <h2>Team workload</h2>
      {!data ? (
        <Skeleton />
      ) : (
        <div className="ws-team">
          {data.officials.map((o) => (
            <div key={o.id}>
              <b>{o.name}</b>
              <small>
                {o.designation} · {o.id}
              </small>
              <span>{o.active_cases} active cases</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
function CoordinationList({
  version,
  refresh,
  open,
}: {
  version: number;
  refresh: () => void;
  open: (id: string) => void;
}) {
  const { data, error } = useLoad<{
    requests: (Coordination & {
      subject: string | null;
      institution_name: string | null;
      can_open: number;
    })[];
  }>("/coordination", version);
  const [failure, setFailure] = useState(""),
    [busy, setBusy] = useState(false);
  async function decide(r: Coordination, decision: string) {
    const reason = prompt("Decision note");
    if (!reason) return;
    setBusy(true);
    try {
      await api("/coordination/" + r.id, { decision, reason });
      refresh();
    } catch (e) {
      setFailure((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (error) return <ErrorBox text={error} />;
  if (!data) return <Skeleton />;
  return (
    <>
      {failure && <ErrorBox text={failure} />}
      <div className="ws-coordination">
        {data.requests.length ? (
          data.requests.map((r) => (
            <article key={r.id}>
              <Badge>{r.status}</Badge>
              <h3>
                {r.can_open ? (
                  <button
                    className="ws-case-link"
                    onClick={() => open(r.case_id)}
                  >
                    {r.subject}
                  </button>
                ) : (
                  "Case details restricted"
                )}
              </h3>
              <p>
                Selected official: {r.target_name} · {r.target_bureau}
              </p>
              <small>
                Requested {stamp(r.created_at)}
                {r.manager_approved_at &&
                  " · Manager approved " + stamp(r.manager_approved_at)}
                {r.bureau_approved_at &&
                  " · Bureau approved " + stamp(r.bureau_approved_at)}
              </small>
              {r.can_approve && (
                <div className="ws-actions">
                  <button disabled={busy} onClick={() => decide(r, "approve")}>
                    Approve coordination
                  </button>
                  <button disabled={busy} onClick={() => decide(r, "reject")}>
                    Reject
                  </button>
                </div>
              )}
            </article>
          ))
        ) : (
          <Empty>No coordination requests.</Empty>
        )}
      </div>
    </>
  );
}

function Board({
  id,
  boot,
  version,
  refresh,
  back,
}: {
  id: string;
  boot: Bootstrap;
  version: number;
  refresh: () => void;
  back: () => void;
}) {
  const { data, error } = useLoad<CaseDetail>(
    "/cases/" + encodeURIComponent(id),
    version,
  );
  const [failure, setFailure] = useState(""),
    [busy, setBusy] = useState(false),
    [action, setAction] = useState(""),
    [target, setTarget] = useState("");
  async function send(path: string, payload: unknown) {
    setFailure("");
    setBusy(true);
    try {
      await api("/cases/" + encodeURIComponent(id) + path, payload);
      setAction("");
      refresh();
      return true;
    } catch (e) {
      setFailure((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }
  if (error)
    return (
      <>
        <button onClick={back}>← Back</button>
        <ErrorBox text={error} />
      </>
    );
  if (!data) return <Skeleton />;
  const c = data.case,
    canReview =
      boot.user.role === "manager" &&
      c.created_by !== boot.user.id &&
      c.intake === "Submitted";
  return (
    <>
      <button className="ws-back" onClick={back}>
        ← Back to cases
      </button>
      <div className="ws-heading">
        <div>
          <div className="ws-eyebrow">
            {c.id} {c.is_demo === 1 && " / DEMO CASE"}
          </div>
          <h1>{c.subject}</h1>
          <p>
            {c.institution_name} · {c.permanent_id}
          </p>
        </div>
        <div>
          {c.escalated === 1 && <Badge red>Escalated</Badge>}
          <Badge>{c.intake === "Approved" ? c.status : c.intake}</Badge>
        </div>
      </div>
      {failure && <ErrorBox text={failure} />}
      <div className="ws-board">
        <div>
          <section className="ws-card">
            <h2>Case details</h2>
            <p className="ws-pre">{c.description}</p>
            <div className="ws-tags">
              {c.tags.map((t) => (
                <span key={t}>
                  {boot.tags.find((x) => x.code === t)?.label || t}
                </span>
              ))}
            </div>
            <h3>Next action</h3>
            <p>{c.next_action}</p>
            {c.approval_reason && <p>Review note: {c.approval_reason}</p>}
          </section>
          {canReview && (
            <section className="ws-card">
              <h2>Review proposed case</h2>
              <p>
                Accept for processing, return for changes, or reject with a
                reason.
              </p>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  void send("/decision", {
                    decision: f.get("decision"),
                    reason: f.get("reason"),
                  });
                }}
              >
                <label>
                  Decision
                  <select name="decision">
                    <option>Approved</option>
                    <option>Returned</option>
                    <option>Rejected</option>
                  </select>
                </label>
                <label>
                  Decision note
                  <textarea
                    name="reason"
                    required
                    minLength={3}
                    maxLength={1000}
                  />
                </label>
                <button className="ws-primary" disabled={busy}>
                  Save decision
                </button>
              </form>
            </section>
          )}
          {c.intake === "Returned" && c.created_by === boot.user.id && (
            <section className="ws-card">
              <h2>Update returned proposal</h2>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  void send("/resubmit", {
                    description: f.get("description"),
                    next_action: f.get("next_action"),
                  });
                }}
              >
                <label>
                  Description
                  <textarea
                    name="description"
                    defaultValue={c.description}
                    required
                    minLength={20}
                    maxLength={5000}
                  />
                </label>
                <label>
                  Next action
                  <input
                    name="next_action"
                    defaultValue={c.next_action}
                    required
                    minLength={3}
                    maxLength={300}
                  />
                </label>
                <button className="ws-primary" disabled={busy}>
                  Resubmit for review
                </button>
              </form>
            </section>
          )}
          <section className="ws-card">
            <h2>Case board</h2>
            <p className="ws-hint">
              Comments and formal updates, in time order. History cannot be
              edited.
            </p>
            <div className="ws-timeline">
              {[...data.events].reverse().map((e) => (
                <article
                  className={e.kind === "comment" ? "comment" : "formal"}
                  key={e.id}
                >
                  <div>
                    <b>
                      {e.kind === "comment"
                        ? e.actor_name
                        : e.kind.replaceAll("_", " ")}
                    </b>
                    <time>{stamp(e.created_at)}</time>
                  </div>
                  <small>
                    {e.actor_name} · {e.designation} · {e.bureau}
                  </small>
                  <p className="ws-pre">{e.body}</p>
                </article>
              ))}
            </div>
            {data.events.length === 60 && <p>Showing the latest 60 updates.</p>}
            {c.can_comment && (
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  const form = e.currentTarget;
                  if (
                    await send("/comments", {
                      body: new FormData(form).get("body"),
                    })
                  )
                    form.reset();
                }}
              >
                <label>
                  Add an update
                  <textarea
                    name="body"
                    required
                    maxLength={3000}
                    placeholder="What changed? What happens next?"
                  />
                </label>
                <button disabled={busy} className="ws-primary">
                  Post update
                </button>
              </form>
            )}
          </section>
        </div>
        <aside>
          <section className="ws-card">
            <h2>Ownership</h2>
            <dl>
              <dt>Assigned official</dt>
              <dd>{c.assigned_name}</dd>
              <dt>Bureau</dt>
              <dd>{c.bureau}</dd>
              <dt>Received</dt>
              <dd>{date(c.received_at)}</dd>
              <dt>Due</dt>
              <dd>{date(c.due_at)}</dd>
              <dt>Priority</dt>
              <dd>{c.priority}</dd>
            </dl>
            {c.can_act && c.intake === "Approved" && (
              <>
                <label>
                  Update case
                  <select
                    aria-label="Case action"
                    value={action}
                    onChange={(e) => setAction(e.target.value)}
                  >
                    <option value="">Choose an action</option>
                    {c.status === "Disposed" ? (
                      <option value="reopen">Reopen</option>
                    ) : (
                      <>
                        <option value="status">Update status</option>
                        {!c.escalated && (
                          <option value="escalate">Escalate</option>
                        )}
                        <option value="dispose">Mark disposed</option>
                        {boot.user.role === "manager" && (
                          <option value="transfer">Transfer within team</option>
                        )}
                      </>
                    )}
                  </select>
                </label>
                {action && (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      const f = new FormData(e.currentTarget);
                      void send("/action", {
                        action,
                        reason: f.get("reason"),
                        status: f.get("status"),
                        next_action: f.get("next_action"),
                        official_id: f.get("official_id"),
                      });
                    }}
                  >
                    {action === "status" && (
                      <>
                        <label>
                          Status
                          <select name="status" defaultValue={c.status}>
                            {[
                              "Pending",
                              "Under process",
                              "Awaiting information",
                            ].map((s) => (
                              <option key={s}>{s}</option>
                            ))}
                          </select>
                        </label>
                        <label>
                          Next action
                          <input
                            name="next_action"
                            defaultValue={c.next_action}
                            required
                            maxLength={300}
                          />
                        </label>
                      </>
                    )}
                    {action === "transfer" && (
                      <label>
                        Official
                        <select name="official_id" required>
                          <option value="">Select official</option>
                          {boot.officials
                            .filter(
                              (o) =>
                                o.bureau === c.bureau && o.id !== c.assigned_to,
                            )
                            .map((o) => (
                              <option key={o.id} value={o.id}>
                                {o.name} · {o.id}
                              </option>
                            ))}
                        </select>
                      </label>
                    )}
                    <label>
                      Update note
                      <textarea
                        name="reason"
                        required
                        minLength={3}
                        maxLength={1000}
                      />
                    </label>
                    <button disabled={busy} className="ws-primary">
                      Save update
                    </button>
                  </form>
                )}
              </>
            )}
          </section>
          <section className="ws-card">
            <h2>Coordination</h2>
            {data.candidates.map((b) => (
              <p key={b.bureau}>
                Coordination with {b.bureau} possible: matching institution and
                tags.
              </p>
            ))}
            {data.coordination.map((r) => (
              <div className="ws-coord-item" key={r.id}>
                <b>
                  {r.target_name} · {r.target_bureau}
                </b>
                <Badge>{r.status}</Badge>
                <small>{stamp(r.created_at)}</small>
                {r.status === "Approved" && c.can_act && (
                  <button
                    disabled={busy}
                    onClick={async () => {
                      const reason = prompt("Reason for revoking access");
                      if (!reason) return;
                      try {
                        await api("/coordination/" + r.id, {
                          decision: "revoke",
                          reason,
                        });
                        refresh();
                      } catch (e) {
                        setFailure((e as Error).message);
                      }
                    }}
                  >
                    Revoke access
                  </button>
                )}
              </div>
            ))}
            {!data.coordination.length && (
              <p className="ws-hint">
                No details are shared across Bureaus until both approvals are
                complete.
              </p>
            )}
            {c.can_act && c.intake === "Approved" && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void send("/coordination", {
                    target_official_id: target,
                    reason: new FormData(e.currentTarget).get("reason"),
                  });
                }}
              >
                <label>
                  Selected official
                  <select
                    required
                    value={target}
                    onChange={(e) => setTarget(e.target.value)}
                  >
                    <option value="">Choose another Bureau’s official</option>
                    {boot.officials
                      .filter((o) => o.bureau !== c.bureau)
                      .map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.name} · {o.designation} · {o.id}
                        </option>
                      ))}
                  </select>
                </label>
                <label>
                  Why coordinate?
                  <textarea
                    name="reason"
                    required
                    minLength={5}
                    maxLength={1000}
                  />
                </label>
                <button disabled={busy}>Request approval</button>
              </form>
            )}
          </section>
        </aside>
      </div>
    </>
  );
}

function NewCase({
  boot,
  done,
  cancel,
}: {
  boot: Bootstrap;
  done: (id: string) => void;
  cancel: () => void;
}) {
  const [query, setQuery] = useState(""),
    [tags, setTags] = useState<string[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [language, setLanguage] = useState("english"),
    [translation, setTranslation] = useState("");
  const institutions = useLoad<{ institutions: Institution[] }>(
    "/institutions?q=" + encodeURIComponent(useDebounced(query)),
  );
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError("");
    try {
      const r = await api<{ id: string }>("/cases", {
        ...Object.fromEntries(f),
        tags,
      });
      done(r.id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <button className="ws-back" onClick={cancel}>
        ← Cancel
      </button>
      <div className="ws-heading">
        <div>
          <h1>Register a case</h1>
          <p>Your manager reviews it before processing begins.</p>
        </div>
        <Badge>{boot.user.is_demo ? "DEMO CASE" : "New proposal"}</Badge>
      </div>
      <form className="ws-card ws-intake" onSubmit={submit}>
        {error && <ErrorBox text={error} />}
        <label>
          Subject
          <input name="subject" required minLength={5} maxLength={160} />
        </label>
        <label>
          Find institution
          <input
            placeholder="Institution name or Permanent ID"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <label>
          Institution
          <select name="institution_id" required>
            <option value="">Choose an institution</option>
            {institutions.data?.institutions.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name} · {i.permanent_id}
              </option>
            ))}
          </select>
        </label>
        <div className="ws-form-row">
          <label>
            Received date
            <input
              name="received_at"
              type="date"
              defaultValue={new Date().toISOString().slice(0, 10)}
              max={new Date().toISOString().slice(0, 10)}
              required
            />
          </label>
          <label>
            Due date
            <input name="due_at" type="date" required />
          </label>
          <label>
            Priority
            <select name="priority">
              <option>Routine</option>
              <option>High</option>
              <option>Urgent</option>
            </select>
          </label>
        </div>
        <label>
          Complaint / description
          <textarea
            name="description"
            required
            minLength={20}
            maxLength={5000}
            rows={5}
          />
        </label>
        <label>
          Original language
          <select
            value={language}
            onChange={(e) => {
              setLanguage(e.target.value);
              setTranslation("");
            }}
          >
            {[
              "english",
              "hindi",
              "tamil",
              "telugu",
              "bengali",
              "marathi",
              "kannada",
              "gujarati",
              "malayalam",
              "punjabi",
              "urdu",
            ].map((l) => (
              <option key={l} value={l}>
                {l[0].toUpperCase() + l.slice(1)}
              </option>
            ))}
          </select>
        </label>
        {translation && (
          <div className="ws-card">
            <b>Machine translation · English</b>
            <p className="ws-pre">{translation}</p>
            <small>The original description remains unchanged.</small>
          </div>
        )}
        <fieldset>
          <legend>Tags</legend>
          <div className="ws-check-tags">
            {boot.tags.map((t) => (
              <label key={t.code}>
                <input
                  type="checkbox"
                  checked={tags.includes(t.code)}
                  onChange={(e) =>
                    setTags(
                      e.target.checked
                        ? [...tags, t.code].slice(0, 8)
                        : tags.filter((x) => x !== t.code),
                    )
                  }
                />
                {t.label}
              </label>
            ))}
          </div>
          <p className="ws-hint">
            Choose up to 8 tags.
            {boot.user.is_demo === 1
              ? " Automatic suggestions are disabled for demo accounts."
              : " Non-English text is translated before suggesting tags. Confirm tags before submitting."}
          </p>
          {boot.user.is_demo === 0 && (
            <button
              type="button"
              disabled={busy}
              onClick={async (e) => {
                const form = e.currentTarget.form!;
                const content = String(new FormData(form).get("description"));
                setBusy(true);
                try {
                  const result = await api<{
                    suggestions: { code: string }[];
                    translation: string | null;
                  }>("/tags/suggest", { text: content, language });
                  setTranslation(result.translation || "");
                  setTags(result.suggestions.slice(0, 5).map((t) => t.code));
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              Suggest tags
            </button>
          )}
        </fieldset>
        <label>
          Next action
          <input name="next_action" required minLength={3} maxLength={300} />
        </label>
        <button className="ws-primary" disabled={busy}>
          {busy ? "Submitting…" : "Submit for review"}
        </button>
      </form>
    </>
  );
}
function Institutions({
  open,
  version,
}: {
  open: (id: string) => void;
  version: number;
}) {
  const [query, setQuery] = useState(""),
    [search, setSearch] = useState(""),
    [selected, setSelected] = useState<Institution | null>(null);
  useEffect(() => {
    const t = setTimeout(() => setSearch(query), 350);
    return () => clearTimeout(t);
  }, [query]);
  const { data, error } = useLoad<{ institutions: Institution[] }>(
    "/institutions?q=" + encodeURIComponent(search),
    version,
  );
  return (
    <>
      <div className="ws-filters">
        <input
          aria-label="Search institutions"
          placeholder="Search name or Permanent ID"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <span>Read-only directory · up to 30 results</span>
      </div>
      {error ? (
        <ErrorBox text={error} />
      ) : !data ? (
        <Skeleton />
      ) : (
        <div className="ws-institutions">
          {data.institutions.map((i) => (
            <button
              className={selected?.id === i.id ? "selected" : ""}
              key={i.id}
              onClick={() => setSelected(i)}
            >
              <b>{i.name}</b>
              <small>
                {i.permanent_id} · {i.city}, {i.state}
              </small>
              <span>
                {i.active_cases} active · {i.past_cases} disposed
              </span>
            </button>
          ))}
        </div>
      )}
      {selected && (
        <InstitutionHistory
          institution={selected}
          version={version}
          open={open}
        />
      )}
      <p className="ws-hint">
        Counts and history include only cases you are authorised to view. Open a
        case for handling officials, coordination decisions and timestamps.
      </p>
    </>
  );
}
function InstitutionHistory({
  institution,
  version,
  open,
}: {
  institution: Institution;
  version: number;
  open: (id: string) => void;
}) {
  const [cursor, setCursor] = useState("");
  useEffect(() => setCursor(""), [institution.id]);
  const { data, error } = useLoad<{ cases: CaseRecord[]; next: string | null }>(
    "/cases?view=all&institution=" +
      encodeURIComponent(institution.id) +
      "&cursor=" +
      cursor,
    version,
  );
  return (
    <section className="ws-section">
      <h2>{institution.name}</h2>
      <p>Active and past cases · {institution.permanent_id}</p>
      {error ? (
        <ErrorBox text={error} />
      ) : !data ? (
        <Skeleton />
      ) : (
        <>
          <CaseTable rows={data.cases} open={open} />
          <div className="ws-pagination">
            {cursor && (
              <button onClick={() => setCursor("")}>First page</button>
            )}
            {data.next && (
              <button onClick={() => setCursor(data.next!)}>
                Next history page →
              </button>
            )}
          </div>
        </>
      )}
    </section>
  );
}
function Messages({
  boot,
  version,
  refresh,
  open,
}: {
  boot: Bootstrap;
  version: number;
  refresh: () => void;
  open: (id: string) => void;
}) {
  const { data, error } = useLoad<{ messages: Message[] }>(
    "/messages",
    version,
  );
  const [failure, setFailure] = useState(""),
    [busy, setBusy] = useState(false),
    [query, setQuery] = useState("");
  async function send(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    setBusy(true);
    setFailure("");
    try {
      await api("/messages", Object.fromEntries(new FormData(form)));
      form.reset();
      refresh();
    } catch (e) {
      setFailure((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="ws-board">
      <section className="ws-card">
        <h2>Conversations</h2>
        {error ? (
          <ErrorBox text={error} />
        ) : !data ? (
          <Skeleton />
        ) : data.messages.length ? (
          data.messages.map((m) => (
            <article className="ws-message" key={m.id}>
              <div>
                <b>
                  {m.sender_name} → {m.recipient_name}
                </b>
                <time>{stamp(m.created_at)}</time>
              </div>
              <p className="ws-pre">{m.body}</p>
              {m.case_id && (
                <button
                  className="ws-case-link"
                  onClick={() => open(m.case_id!)}
                >
                  {m.case_id} ↗
                </button>
              )}
            </article>
          ))
        ) : (
          <Empty>No messages yet.</Empty>
        )}
        <p className="ws-hint">
          Latest 50 messages. Case references are checked for access when sent.
        </p>
      </section>
      <aside className="ws-card">
        <h2>New message</h2>
        {failure && <ErrorBox text={failure} />}
        <form onSubmit={send}>
          <label>
            Find official
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Designation, name or ID"
            />
          </label>
          <label>
            To
            <select name="recipient_id" required>
              <option value="">Select official</option>
              {boot.officials
                .filter(
                  (o) =>
                    o.id !== boot.user.id &&
                    `${o.name} ${o.id} ${o.designation} ${o.bureau}`
                      .toLowerCase()
                      .includes(query.toLowerCase()),
                )
                .map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name} · {o.designation} · {o.id} · {o.bureau}
                  </option>
                ))}
            </select>
          </label>
          <label>
            Case ID (optional)
            <input
              name="case_id"
              placeholder="Recipient must already have access"
              maxLength={100}
            />
          </label>
          <label>
            Message
            <textarea name="body" required maxLength={3000} />
          </label>
          <button disabled={busy} className="ws-primary">
            Send message
          </button>
        </form>
      </aside>
    </div>
  );
}
interface ReportRow {
  bureau: string;
  region: string;
  status: string;
  intake: string;
  escalated: number;
  received_at: string;
  due_at: string;
  updated_at: string;
}
function Reports({ version }: { version: number }) {
  const { data, error } = useLoad<{
    rows: ReportRow[];
    as_of: string;
    limited: boolean;
  }>("/reports", version);
  if (error) return <ErrorBox text={error} />;
  if (!data) return <Skeleton />;
  const approved = data.rows.filter((r) => r.intake === "Approved"),
    active = approved.filter((r) => r.status !== "Disposed"),
    now = new Date().toISOString();
  const groups = [...new Set(approved.map((r) => r.bureau))].map((b) => ({
    bureau: b,
    total: approved.filter((r) => r.bureau === b).length,
    active: active.filter((r) => r.bureau === b).length,
    disposed: approved.filter((r) => r.bureau === b && r.status === "Disposed")
      .length,
  }));
  function download() {
    const fields = [
      "bureau",
      "region",
      "status",
      "intake",
      "escalated",
      "received_at",
      "due_at",
      "updated_at",
    ] as const;
    const csv = [
      fields.join(","),
      ...data!.rows.map((r) =>
        fields
          .map(
            (f) =>
              '"' +
              String(r[f])
                .replace(/^[=+@-]/, "'")
                .replaceAll('"', '""') +
              '"',
          )
          .join(","),
      ),
    ].join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "aicte-scoped-report.csv";
    a.click();
    URL.revokeObjectURL(url);
  }
  return (
    <>
      <div className="ws-metrics">
        {[
          ["Active", active.length],
          ["Disposed", approved.length - active.length],
          ["Overdue", active.filter((r) => r.due_at < now).length],
          [
            "Awaiting review",
            data.rows.filter((r) => r.intake === "Submitted").length,
          ],
        ].map(([label, n]) => (
          <div key={label}>
            <span>{label}</span>
            <strong>{n}</strong>
          </div>
        ))}
      </div>
      <section className="ws-card">
        <div className="ws-heading">
          <div>
            <h2>Bureau workload</h2>
            <p>
              As of {stamp(data.as_of)} · {data.rows.length} accessible records
            </p>
          </div>
          <button onClick={download}>Export CSV</button>
        </div>
        {groups.length ? (
          <table>
            <thead>
              <tr>
                <th>Bureau</th>
                <th>Active</th>
                <th>Disposed</th>
                <th>Distribution</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => (
                <tr key={g.bureau}>
                  <td>{g.bureau}</td>
                  <td>{g.active}</td>
                  <td>{g.disposed}</td>
                  <td>
                    <div
                      className="ws-bar"
                      aria-label={`${g.active} active of ${g.total}`}
                    >
                      <span
                        style={{ width: (g.active / g.total) * 100 + "%" }}
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <Empty>No approved cases in this scope.</Empty>
        )}
      </section>
      <section className="ws-card">
        <h2>Age of active cases</h2>
        <div className="ws-metrics">
          {[
            [0, 7],
            [8, 30],
            [31, 90],
            [91, Infinity],
          ].map(([lo, hi]) => (
            <div key={lo}>
              <span>{hi === Infinity ? "91+" : `${lo}–${hi}`} days</span>
              <strong>
                {
                  active.filter((r) => {
                    const age = Math.floor(
                      (Date.now() - Date.parse(r.received_at)) / 86400000,
                    );
                    return age >= lo && age <= hi;
                  }).length
                }
              </strong>
            </div>
          ))}
        </div>
      </section>
      <p className="ws-hint">
        {data.limited
          ? "Limited to the latest 500 accessible records; this is a partial report."
          : "All records in your current access scope."}{" "}
        Intake approval and final disposal are counted separately.
      </p>
    </>
  );
}
