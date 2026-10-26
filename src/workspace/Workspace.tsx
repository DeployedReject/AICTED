import Documents, {
  FileSelection,
  useUploads,
  type StorageConfig,
} from "./Documents";
import InstitutionPicker from "./InstitutionPicker";
import TagSettings from "./TagSettings";
import AssignCase from "./AssignCase";
import ManagerHome from "./ManagerHome";
import DatabaseSettings from "./DatabaseSettings";
import { SetupGuide } from "./ITHelp";
import { Fragment, useEffect, useState } from "react";
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
import ThemeToggle from "../ThemeToggle";
import { api } from "./api";
import "./workspace.css";
import Admin from "./Admin";
import Overlaps from "./Overlaps";
import OfficialPicker from "./OfficialPicker";
import { bureauName, registerUnits } from "../../packages/shared/catalog";
import { Scene, SlidingNav, Counter, reduced, NavIcon } from "./Motion";
import ReportCharts from "./ReportCharts";
import ReportPeriods from "./ReportPeriods";
import caseGlyph from "../../Assets/glyphs/file-svgrepo-com.svg";
import mailGlyph from "../../Assets/glyphs/mail-svgrepo-com.svg";

type Page =
  | "Tags"
  | "Guide"
  | "My Work"
  | "Cases"
  | "Institutions"
  | "Messages"
  | "Reports"
  | "Administration"
  | "Team"
  | "Accounts"
  | "Email"
  | "Database"
  | "Server"
  | "Bureaus"
  | "Overlaps";
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
    if (path !== "/bootstrap") setData(null);
    setError("");
    const wait = new Promise((resolve) =>
      setTimeout(resolve, reduced() || path === "/bootstrap" ? 0 : 1000),
    );
    Promise.all([api<T>(path), wait])
      .then(([r]) => {
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
  assign,
}: {
  assign?: (record: CaseRecord) => void;
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
                <small>{bureauName(c.bureau)}</small>
                {assign &&
                  c.intake === "Approved" &&
                  c.status !== "Disposed" && (
                    <button
                      className="ws-assign-button"
                      onClick={() => assign(c)}
                    >
                      Assign case
                    </button>
                  )}
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
  const isIT = location.pathname.startsWith("/it/workspace");
  const [theme, setTheme] = useState(
    () => document.documentElement.dataset.theme || "light",
  );
  const [version, setVersion] = useState(0),
    [page, setPage] = useState<Page>(isIT ? "Server" : "My Work"),
    [selected, setSelectedState] = useState<string | null>(() =>
      new URLSearchParams(location.search).get("case"),
    ),
    [creating, setCreating] = useState(false);
  const { data: boot, error } = useLoad<Bootstrap>("/bootstrap", version);
  const [casesView, setCasesView] = useState("all");
  const [managerTab, setManagerTab] = useState("overview"),
    [approvalView, setApprovalView] = useState("proposed");
  const pageLabel = (p: string) =>
    (
      ({
        Server: "Server setup",
        Accounts: "Manage accounts",
        Bureaus: "Bureau directory",
        Email: "Email delivery",
        Database: "Database settings",
        Guide: "Setup guide",
        Tags: "Case tags",
        Team: "Team workload",
      }) as Record<string, string>
    )[p] || p;
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
  registerUnits(boot.units || []);
  if ((user.role === "it") !== isIT) {
    location.replace(user.role === "it" ? "/it/workspace" : "/workspace");
    return null;
  }
  return (
    <div className="workspace">
      <aside className="ws-sidebar">
        <a className="ws-brand" href="/">
          <BrandMark />
          <span>
            <b>AICTE</b>
          </span>
        </a>

        <SlidingNav selected={page === "Cases" ? "Cases-" + casesView : page}>
          {(
            (isIT
              ? [
                  "Server",
                  "Accounts",
                  "Bureaus",
                  "Tags",
                  "Institutions",
                  "Email",
                  "Database",
                  "Guide",
                ]
              : [
                  "My Work",
                  "Cases",
                  ...(user.role === "manager" ? ["Team"] : []),
                  "Institutions",
                  "Messages",
                  "Reports",
                ]) as Page[]
          ).map((p) => (
            <Fragment key={p}>
              <button
                className={p === page && !selected ? "active" : ""}
                aria-current={p === page && p !== "Cases" ? "page" : undefined}
                aria-expanded={p === "Cases" ? page === "Cases" : undefined}
                key={p}
                onClick={() => {
                  setPage(p);
                  if (p === "Cases") setCasesView("all");
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
                    <NavIcon name={p} />
                  )}
                </span>
                {p === "My Work"
                  ? user.role === "manager"
                    ? "Team overview"
                    : "My work"
                  : p === "Administration"
                    ? "Settings"
                    : pageLabel(p)}
              </button>
              {p === "Cases" && page === "Cases" && (
                <div
                  className="ws-cases-submenu"
                  role="group"
                  aria-label="Case views"
                >
                  {[
                    ["all", "Case register"],
                    ["assigned", "Assigned cases"],
                    [
                      "proposed",
                      user.role === "manager"
                        ? "Intake review"
                        : "My submissions",
                    ],
                    ["coordination", "Coordination requests"],
                    ["overlaps", "Bureau overlaps"],
                  ].map(([view, label]) => (
                    <button
                      key={view}
                      aria-current={casesView === view ? "page" : undefined}
                      className={casesView === view ? "active" : ""}
                      onClick={() => {
                        setCasesView(view);
                        setSelected(null);
                        setCreating(false);
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              )}
            </Fragment>
          ))}
        </SlidingNav>
        <div className="ws-sidebar-bottom">
          <span>{bureauName(user.bureau)}</span>
          <b>{user.name}</b>
          <small>
            {user.designation} · {user.id}
          </small>
          <button
            onClick={async () => {
              await api("/auth/logout", {});
              sessionStorage.removeItem("demo-actor");
              location.assign(isIT ? "/it" : "/");
            }}
          >
            Sign out ↗
          </button>
        </div>
      </aside>
      <div className="ws-body">
        <header className="ws-topbar">
          <span>
            {selected
              ? "Case"
              : page === "My Work"
                ? user.role === "manager"
                  ? "Team overview"
                  : "My work"
                : page === "Administration"
                  ? "Settings"
                  : pageLabel(page)}
          </span>
          <div>
            <ThemeToggle
              theme={theme}
              onToggle={() => {
                const next = theme === "dark" ? "light" : "dark";
                setTheme(next);
                document.documentElement.dataset.theme = next;
                try {
                  localStorage.setItem("aicte-theme", next);
                } catch {
                  /* Theme remains usable without storage. */
                }
              }}
            />
          </div>
        </header>
        <main className="ws-content">
          <Scene
            scene={
              selected
                ? "case-" + selected
                : creating
                  ? "intake"
                  : page === "Cases"
                    ? "Cases-" + casesView
                    : page
            }
          >
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
                    <div className="ws-eyebrow">
                      {user.bureau.toUpperCase()}
                    </div>
                    <h1>
                      {page === "My Work"
                        ? user.role === "manager"
                          ? "Team overview"
                          : "My work"
                        : page === "Administration"
                          ? "Settings"
                          : (
                              {
                                Server: "Server setup",
                                Accounts: "Manage accounts",
                                Bureaus: "Bureau directory",
                                Email: "Email delivery",
                                Database: "Database settings",
                                Guide: "Setup guide",
                                Tags: "Case tags",
                                Team: "Team workload",
                              } as Record<string, string>
                            )[page] || page}
                    </h1>
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
                {page === "My Work" && user.role === "official" && (
                  <div className="ws-attention">
                    <button
                      onClick={() => {
                        setPage("Cases");
                        setCasesView("overlaps");
                      }}
                    >
                      <span>Overlaps</span>
                      <b>{boot.summary.overlaps}</b>
                    </button>
                    <span className="ws-due-count">
                      <span>Due soon</span>
                      <b>{boot.summary.due_soon}</b>
                    </span>
                  </div>
                )}
                {page === "My Work" && user.role === "official" && (
                  <div className="ws-metrics">
                    {[
                      ["Assigned cases", boot.summary.total],
                      ["In progress", boot.summary.processing],
                      ["Overdue", boot.summary.overdue],
                      ["Escalated", boot.summary.escalated],
                    ].map(([label, n]) => (
                      <div key={label}>
                        <span>{label}</span>
                        <Counter value={Number(n)} />
                      </div>
                    ))}
                  </div>
                )}
                {(page === "My Work" || page === "Team") &&
                  user.role === "manager" && (
                    <ManagerHome
                      version={version}
                      open={setSelected}
                      tab={page === "Team" ? "team" : managerTab}
                      onTab={(tab) => {
                        if (tab === "team") setPage("Team");
                        else {
                          setManagerTab(tab);
                          setPage("My Work");
                        }
                      }}
                      review={(view) => {
                        setApprovalView(view);
                        setManagerTab("approvals");
                        setPage("My Work");
                      }}
                      team={() => setPage("Team")}
                    >
                      {page === "Team" ? (
                        <>
                          <Team version={version} />
                          <CaseList
                            boot={boot}
                            version={version}
                            open={setSelected}
                            all={false}
                            refresh={refresh}
                            initialView="team"
                          />
                        </>
                      ) : managerTab === "approvals" ? (
                        <>
                          <div
                            className="ws-tabs"
                            role="group"
                            aria-label="Approval type"
                          >
                            {[
                              ["proposed", "Intake review"],
                              ["coordination", "Coordination requests"],
                            ].map(([view, label]) => (
                              <button
                                key={view}
                                className={
                                  approvalView === view ? "active" : ""
                                }
                                onClick={() => setApprovalView(view)}
                              >
                                {label}
                              </button>
                            ))}
                          </div>
                          <CaseList
                            key={approvalView}
                            boot={boot}
                            version={version}
                            open={setSelected}
                            all={false}
                            refresh={refresh}
                            initialView={approvalView}
                          />
                        </>
                      ) : managerTab === "assigned" ? (
                        <CaseList
                          boot={boot}
                          version={version}
                          open={setSelected}
                          all={false}
                          refresh={refresh}
                          initialView="assigned"
                        />
                      ) : null}
                    </ManagerHome>
                  )}
                {((page === "My Work" && user.role !== "manager") ||
                  (page === "Cases" && casesView !== "overlaps")) && (
                  <CaseList
                    key={page + casesView}
                    initialView={page === "My Work" ? "assigned" : casesView}
                    boot={boot}
                    version={version}
                    open={setSelected}
                    all={page === "Cases"}
                    refresh={refresh}
                  />
                )}
                {page === "Institutions" && !isIT && (
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
                {page === "Cases" && casesView === "overlaps" && (
                  <Overlaps version={version} open={setSelected} />
                )}
                {page === "Reports" && <Reports version={version} />}
                {isIT && page === "Database" && <DatabaseSettings />}
                {isIT && page === "Guide" && <SetupGuide />}
                {isIT && page === "Tags" && <TagSettings onSaved={() => {}} />}
                {isIT &&
                  page !== "Database" &&
                  page !== "Guide" &&
                  page !== "Tags" && (
                    <Admin version={version} refresh={refresh} section={page} />
                  )}
              </>
            )}
          </Scene>
        </main>
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
  initialView,
}: {
  initialView?: string;
  boot: Bootstrap;
  version: number;
  open: (id: string) => void;
  all: boolean;
  refresh: () => void;
}) {
  const [assignment, setAssignment] = useState<CaseRecord | null>(null);
  const view = initialView || (all ? "all" : "assigned");
  const [q, setQ] = useState(""),
    [search, setSearch] = useState(""),
    [tag, setTag] = useState(""),
    [institution, setInstitution] = useState(""),
    [status, setStatus] = useState(""),
    [bureau, setBureau] = useState(""),
    [region, setRegion] = useState(""),
    [from, setFrom] = useState(""),
    [to, setTo] = useState(""),
    [cursor, setCursor] = useState(""),
    [attention, setAttention] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setSearch(q), 350);
    return () => clearTimeout(timer);
  }, [q]);
  useEffect(
    () => setCursor(""),
    [search, tag, institution, status, bureau, region, from, to, view],
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
    attention,
  });
  const { data, error } = useLoad<{ cases: CaseRecord[]; next: string | null }>(
    "/cases?" + params,
    version,
  );
  return (
    <>
      {assignment && (
        <AssignCase
          record={assignment}
          officials={boot.officials}
          cancel={() => setAssignment(null)}
          done={() => {
            setAssignment(null);
            refresh();
          }}
        />
      )}
      <p className="ws-description">
        {view === "assigned"
          ? "Approved, open cases assigned to you."
          : view === "proposed"
            ? boot.user.role === "manager"
              ? "Team submissions awaiting a decision, returned for changes, or rejected. Your own submissions need your reporting manager’s approval."
              : "Your submissions awaiting approval, returned for changes, or rejected. Approved cases move to Assigned cases."
            : view === "team"
              ? "Approved cases assigned to officials in your reporting team."
              : view === "coordination"
                ? "Requests to share a case with an official in another bureau. Both approvals are needed before access is granted."
                : "Approved cases you can access, including closed cases."}
      </p>
      {view === "coordination" ? (
        <CoordinationList version={version} refresh={refresh} open={open} />
      ) : (
        <>
          <div className="ws-quick-filters" id="attention-cases">
            {[
              ["", "All"],
              ["overdue", "Overdue"],
              ["due-soon", "Due soon"],
              ["escalated", "Escalated"],
            ].map(([key, label]) => (
              <button
                key={key}
                className={attention === key ? "active" : ""}
                onClick={() => {
                  setAttention(key);
                  setCursor("");
                }}
              >
                {label}
              </button>
            ))}
          </div>
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
            <InstitutionPicker
              label="Filter institution"
              name="filter_institution"
              onSelect={(item) => setInstitution(item?.id || "")}
            />
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
                  {boot.units
                    .map((unit) => unit.code)
                    .map((b) => (
                      <option key={b} value={b}>
                        {bureauName(b)}
                      </option>
                    ))}
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
              <CaseTable
                rows={data.cases}
                open={open}
                assign={
                  boot.user.role === "manager" &&
                  ["assigned", "team"].includes(view)
                    ? setAssignment
                    : undefined
                }
              />
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
      <h2>Officials</h2>
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
              <small>{bureauName(o.bureau)}</small>
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
                Selected official: {r.target_name} ·{" "}
                {bureauName(r.target_bureau)}
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
            <h2>Details</h2>
            <p className="ws-pre">{c.description}</p>
            <div className="ws-tags">
              {c.tags.map((t) => (
                <span key={t}>
                  {boot.tags.find((x) => x.code === t)?.label || t}
                </span>
              ))}
            </div>
            <h3>Next</h3>
            <p>{c.next_action}</p>
            {c.approval_reason && <p>Review note: {c.approval_reason}</p>}
          </section>
          <Documents record={c} userId={boot.user.id} onChange={refresh} />
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
            <h2>Updates</h2>
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
                    {e.actor_name} · {e.designation} · {bureauName(e.bureau)}
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
              <dd>{bureauName(c.bureau)}</dd>
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
                          <option value="assign">Assign to team member</option>
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
                    {action === "assign" && (
                      <OfficialPicker
                        name="official_id"
                        label="Team member"
                        officials={boot.officials}
                        bureau={c.bureau}
                        kind="team"
                        required
                        excludeId={c.assigned_to}
                      />
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
            <h2>Relations</h2>
            {data.relations?.map((r, i) => (
              <div className="ws-coord-item" key={i}>
                <Badge>{r.kind}</Badge>
                {r.related_id ? (
                  <a
                    href={"/workspace?case=" + encodeURIComponent(r.related_id)}
                  >
                    {r.subject}
                  </a>
                ) : (
                  <span>Restricted case</span>
                )}
                <small>{stamp(r.created_at)}</small>
              </div>
            ))}
            {c.can_act && c.intake === "Approved" && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void send(
                    "/relations",
                    Object.fromEntries(new FormData(e.currentTarget)),
                  );
                }}
              >
                <label>
                  Case ID
                  <input name="related_case_id" required maxLength={100} />
                </label>
                <label>
                  Relation
                  <select name="kind">
                    <option>Related</option>
                    {boot.user.role === "manager" && <option>Duplicate</option>}
                    <option>Unrelated</option>
                  </select>
                </label>
                <label>
                  Reason
                  <textarea
                    name="reason"
                    required
                    minLength={3}
                    maxLength={1000}
                  />
                </label>
                <button disabled={busy}>Link</button>
              </form>
            )}
          </section>
          <section className="ws-card">
            <h2>Coordination</h2>
            {data.candidates.map((b) => (
              <p key={bureauName(b.bureau)}>
                Coordination with {bureauName(b.bureau)} possible: matching
                institution and tags.
              </p>
            ))}
            {data.coordination.map((r) => (
              <div className="ws-coord-item" key={r.id}>
                <b>
                  {r.target_name} · {bureauName(r.target_bureau)}
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
                <OfficialPicker
                  name="target_official_id"
                  label="Official"
                  officials={boot.officials}
                  excludeBureau={c.bureau}
                  required

                  onSelect={(o) => setTarget(o?.id || "")}
                />
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
  const [tags, setTags] = useState<string[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [language, setLanguage] = useState("english"),
    [translation, setTranslation] = useState("");
  const [storage, setStorage] = useState<StorageConfig>({
    available: false,
    max_file_bytes: 5 * 1024 * 1024,
  });
  const [createdId, setCreatedId] = useState("");
  const uploads = useUploads(storage.max_file_bytes);
  useEffect(() => {
    api<StorageConfig>("/documents/config")
      .then(setStorage)
      .catch(() => {});
  }, []);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError("");
    try {
      let caseId = createdId;
      if (!caseId) {
        const r = await api<{ id: string }>("/cases", {
          ...Object.fromEntries(f),
          tags,
        });
        caseId = r.id;
        setCreatedId(caseId);
      }
      await uploads.upload(caseId);
      done(caseId);
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
          <h1>Register case</h1>
        </div>
      </div>
      <form className="ws-card ws-intake" onSubmit={submit}>
        {error && <ErrorBox text={error} />}
        <fieldset className="ws-intake-fields" disabled={busy || !!createdId}>
          <label>
            Subject
            <input name="subject" required minLength={5} maxLength={160} />
          </label>
          <InstitutionPicker required />
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
            <p className="ws-hint">Choose up to 8 tags.</p>
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
        </fieldset>
        <FileSelection
          uploads={uploads}
          available={storage.available}
          maxBytes={storage.max_file_bytes}
          busy={busy}
        />
        {createdId && (
          <p>
            Case registered. Retry any unfinished uploads, or{" "}
            <button type="button" onClick={() => done(createdId)}>
              Open case
            </button>
            .
          </p>
        )}
        <button className="ws-primary" disabled={busy}>
          {busy
            ? "Submitting…"
            : createdId
              ? "Finish uploads"
              : "Submit for review"}
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
    [busy, setBusy] = useState(false);
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
          <OfficialPicker
            name="recipient_id"
            label="To"
            officials={boot.officials}
            required
            excludeId={boot.user.id}
          />
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
  disposed_at?: string | null;
  transfers: number;
  overlaps: number;
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
    scope: string;
  }>("/reports", version);
  if (error) return <ErrorBox text={error} />;
  if (!data) return <Skeleton />;
  const approved = data.rows.filter((r) => r.intake === "Approved"),
    active = approved.filter((r) => r.status !== "Disposed"),
    now = new Date().toISOString();
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
      <div className="ws-report-toolbar">
        <span>
          {data.scope} · {stamp(data.as_of)} · {data.rows.length} records
          {data.limited ? " · Partial" : ""}
        </span>
        <button onClick={download}>Export</button>
      </div>
      <div className="ws-metrics ws-report-metrics">
        {[
          ["Active", active.length],
          ["Disposed", approved.length - active.length],
          ["Overdue", active.filter((r) => r.due_at < now).length],
          ["Transferred", data.rows.filter((r) => r.transfers > 0).length],
          ["Overlaps", data.rows.filter((r) => r.overlaps).length],
          ["Review", data.rows.filter((r) => r.intake === "Submitted").length],
        ].map(([label, n]) => (
          <div key={label}>
            <span>{label}</span>
            <Counter value={Number(n)} />
            <small>
              {
                (
                  {
                    Active: "Approved cases still open.",
                    Disposed: "Approved cases with a recorded disposal.",
                    Overdue: "Active cases past their due date.",
                    Transferred: "Cases with at least one recorded transfer.",
                    Overlaps:
                      "Active cases at institutions with work in another bureau.",
                    Review: "Submissions awaiting an intake decision.",
                  } as Record<string, string>
                )[String(label)]
              }
            </small>
          </div>
        ))}
      </div>
      <div className="ws-report-note">
        <span title="Disposed approved cases divided by all approved cases in this report. This is a snapshot, not a monthly resolution rate.">
          Disposal rate
        </span>
        <b>
          {approved.length
            ? Math.round(
                ((approved.length - active.length) / approved.length) * 100,
              )
            : 0}
          %
        </b>
        <span title="Elapsed days from the original received date for cases still active. Overdue separately compares the due date.">
          Ageing = days since receipt
        </span>
      </div>
      <ReportCharts rows={data.rows} />
      <ReportPeriods rows={data.rows} />
    </>
  );
}
