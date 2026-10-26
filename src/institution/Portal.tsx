import useLiveUpdates from "../workspace/useLiveUpdates";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { BrandMark } from "../Icons";
import ThemeToggle from "../ThemeToggle";
import { SlidingNav, NavIcon } from "../workspace/Motion";
import { api } from "../workspace/api";
import { FolderField } from "../workspace/Documents";
import type { Institution, Official, Tag } from "../../packages/shared/types";
import "../workspace/workspace.css";
interface Boot {
  user: Official;
  institution: Institution;
  tags: Tag[];
  routes: { bureau: string; name: string }[];
}
interface Case {
  id: string;
  subject: string;
  description?: string;
  bureau: string;
  bureau_name: string;
  status: string;
  intake: string;
  escalated: number;
  received_at: string;
  due_at: string;
  cancellation_state: string;
  institution_escalation: string;
}
interface Event {
  id: string;
  kind: string;
  body: string;
  created_at: string;
  actor_name: string;
  rating: number | null;
}
const stamp = (date: string) =>
  new Date(date).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
function Loading() {
  return (
    <div className="ws-skeleton" role="status" aria-label="Loading cases">
      <i />
      <i />
      <i />
    </div>
  );
}
export default function Portal() {
  const [boot, setBoot] = useState<Boot | null>(null),
    [error, setError] = useState(""),
    [page, setPage] = useState("cases"),
    [selected, setSelected] = useState(""),
    [version, setVersion] = useState(0),
    [theme, setTheme] = useState(
      () => document.documentElement.dataset.theme || "light",
    );
  const refresh = useCallback(() => setVersion((v) => v + 1), []);
  useLiveUpdates(refresh);
  useEffect(() => {
    api<Boot>("/institution/bootstrap")
      .then(setBoot)
      .catch((error) => setError(error.message));
  }, [version]);
  function toggle() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("aicte-theme", next);
    } catch {}
  }
  if (!boot)
    return (
      <div className="workspace">
        <main className="ws-content">
          {error ? <p role="alert">{error}</p> : <Loading />}
        </main>
      </div>
    );
  return (
    <div className="workspace">
      <aside className="ws-sidebar">
        <a className="ws-brand" href="/">
          <BrandMark />
          <b>AICTE</b>
        </a>
        <span className="ws-portal-badge">Institution Portal</span>
        <SlidingNav selected={page}>
          <button
            className={page === "cases" ? "active" : ""}
            aria-current={page === "cases" ? "page" : undefined}
            onClick={() => {
              setPage("cases");
              setSelected("");
            }}
          >
            <span aria-hidden="true">
              <NavIcon name="Cases" />
            </span>
            My cases
          </button>
          <button
            className={page === "register" ? "active" : ""}
            aria-current={page === "register" ? "page" : undefined}
            onClick={() => {
              setPage("register");
              setSelected("");
            }}
          >
            <span aria-hidden="true">
              <NavIcon name="Guide" />
            </span>
            Register case
          </button>
        </SlidingNav>
        <div className="ws-sidebar-bottom">
          <b>{boot.institution.name}</b>
          <small>{boot.institution.permanent_id}</small>
          <p>{boot.user.name}</p>
          <button
            onClick={async () => {
              await api("/auth/logout", {});
              location.assign("/?portal=institution");
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
              ? "Case details"
              : page === "register"
                ? "Register case"
                : "My cases"}
          </span>
          <ThemeToggle theme={theme} onToggle={toggle} />
        </header>
        <main className="ws-content">
          <div className="ws-heading">
            <div>
              <h1>
                {selected
                  ? "Case details"
                  : page === "register"
                    ? "Register case"
                    : "My cases"}
              </h1>
              <p>
                {boot.institution.name} · {boot.institution.permanent_id}
              </p>
            </div>
          </div>
          {selected ? (
            <Detail
              key={selected + version}
              id={selected}
              back={() => setSelected("")}
              refresh={() => setVersion((v) => v + 1)}
            />
          ) : page === "register" ? (
            <Register
              boot={boot}
              done={(id) => {
                setPage("cases");
                setSelected(id);
                setVersion((v) => v + 1);
              }}
            />
          ) : (
            <Cases key={version} open={setSelected} />
          )}
        </main>
      </div>
    </div>
  );
}
function Cases({ open }: { open: (id: string) => void }) {
  const [data, setData] = useState<{
      cases: Case[];
      next: string | null;
    } | null>(null),
    [cursor, setCursor] = useState(""),
    [error, setError] = useState("");
  useEffect(() => {
    let current = true;
    setData(null);
    api<{ cases: Case[]; next: string | null }>(
      "/institution/cases?cursor=" + encodeURIComponent(cursor),
    )
      .then((value) => {
        if (current) setData(value);
      })
      .catch((error) => {
        if (current) setError(error.message);
      });
    return () => {
      current = false;
    };
  }, [cursor]);
  if (error)
    return (
      <p role="alert" className="ws-error">
        {error}
      </p>
    );
  if (!data) return <Loading />;
  return (
    <>
      <div className="ws-institution-case-list">
        {data.cases.map((c) => (
          <button className="ws-card" key={c.id} onClick={() => open(c.id)}>
            <span className="ws-eyebrow">{c.id}</span>
            <h2>{c.subject}</h2>
            <p>{c.bureau_name}</p>
            <span className="ws-badge">
              {c.intake === "Approved" ? c.status : c.intake}
            </span>
            {c.escalated === 1 && (
              <span className="ws-badge ws-escalated">Escalated</span>
            )}
            <small>
              Received {stamp(c.received_at)}
              {c.due_at
                ? " · Due " + new Date(c.due_at).toLocaleDateString("en-IN")
                : " · Awaiting review"}
            </small>
          </button>
        ))}
      </div>
      {!data.cases.length && (
        <section className="ws-card">
          <h2>No cases submitted</h2>
          <p>Use Register case to send a complaint to the relevant bureau.</p>
        </section>
      )}
      <div className="ws-pagination">
        {cursor && <button onClick={() => setCursor("")}>First page</button>}
        {data.next && (
          <button onClick={() => setCursor(data.next!)}>Next cases</button>
        )}
      </div>
    </>
  );
}
function Register({ boot, done }: { boot: Boot; done: (id: string) => void }) {
  const [tags, setTags] = useState<string[]>([]),
    [folder, setFolder] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [query, setQuery] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await api<{ id: string }>("/institution/cases", {
        ...Object.fromEntries(new FormData(event.currentTarget)),
        tags,
        folder_url: folder,
      });
      done(result.id);
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="ws-card ws-intake" onSubmit={submit}>
      <label>
        Institution
        <input readOnly value={boot.institution.name} />
      </label>
      <label>
        Receiving bureau
        <select name="bureau" required defaultValue="">
          <option value="" disabled>
            Choose a bureau
          </option>
          {boot.routes.map((route) => (
            <option key={route.bureau} value={route.bureau}>
              {route.name}
            </option>
          ))}
        </select>
      </label>
      {!boot.routes.length && (
        <p className="ws-error">
          No receiving bureau is configured yet. Contact your administrator.
        </p>
      )}
      <label>
        Subject
        <input name="subject" required minLength={5} maxLength={160} />
      </label>
      <label>
        Complaint details
        <textarea
          name="description"
          required
          minLength={20}
          maxLength={5000}
          rows={6}
        />
      </label>
      <fieldset>
        <legend>Case tags</legend>
        <input
          aria-label="Find case tags"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Find a tag"
        />
        <div className="ws-check-tags">
          {boot.tags
            .filter((tag) =>
              tag.label.toLowerCase().includes(query.toLowerCase()),
            )
            .map((tag) => (
              <label key={tag.code}>
                <input
                  type="checkbox"
                  checked={tags.includes(tag.code)}
                  disabled={!tags.includes(tag.code) && tags.length >= 8}
                  onChange={(event) =>
                    setTags(
                      event.target.checked
                        ? [...tags, tag.code]
                        : tags.filter((code) => code !== tag.code),
                    )
                  }
                />
                {tag.label}
              </label>
            ))}
        </div>
        <p className="ws-hint">
          Choose up to 8 tags. An official will review the submission.
        </p>
      </fieldset>
      <FolderField value={folder} onChange={setFolder} busy={busy} />
      <p className="ws-hint">
        Share supporting documents only with the handling officials. Case access
        does not grant Google Drive access.
      </p>
      {error && (
        <p role="alert" className="ws-error">
          {error}
        </p>
      )}
      <button
        className="ws-primary"
        disabled={busy || !boot.routes.length}
        aria-busy={busy}
      >
        {busy ? "Submitting…" : "Submit case"}
      </button>
    </form>
  );
}
function Detail({
  id,
  back,
  refresh,
}: {
  id: string;
  back: () => void;
  refresh: () => void;
}) {
  const [data, setData] = useState<{
      case: Case;
      folder: { drive_url: string } | null;
    } | null>(null),
    [events, setEvents] = useState<Event[]>([]),
    [next, setNext] = useState<string | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [action, setAction] = useState("");
  async function history(cursor = "") {
    const result = await api<{ events: Event[]; next: string | null }>(
      "/institution/cases/" +
        encodeURIComponent(id) +
        "/history?cursor=" +
        encodeURIComponent(cursor),
    );
    setEvents((previous) =>
      cursor ? [...previous, ...result.events] : result.events,
    );
    setNext(result.next);
  }
  useEffect(() => {
    api<{ case: Case; folder: { drive_url: string } | null }>(
      "/institution/cases/" + encodeURIComponent(id),
    )
      .then(setData)
      .catch((error) => setError(error.message));
    void history().catch((error) => setError(error.message));
  }, [id]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api(
        "/institution/cases/" + encodeURIComponent(id) + "/" + action,
        Object.fromEntries(new FormData(event.currentTarget)),
      );
      refresh();
    } catch (error) {
      setError((error as Error).message);
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
      <Loading />
    );
  const c = data.case,
    closed = c.status === "Disposed" || c.intake === "Rejected";
  return (
    <>
      <button className="ws-back" onClick={back}>
        ← All cases
      </button>
      <div className="ws-board">
        <div>
          <section className="ws-card">
            <span className="ws-eyebrow">{c.id}</span>
            <h2>{c.subject}</h2>
            <span className="ws-badge">
              {c.intake === "Approved" ? c.status : c.intake}
            </span>
            {c.escalated === 1 && (
              <span className="ws-badge ws-escalated">Escalated</span>
            )}
            <p className="ws-pre">{c.description}</p>
            <dl>
              <dt>Handling bureau</dt>
              <dd>{c.bureau_name}</dd>
              <dt>Received</dt>
              <dd>{stamp(c.received_at)}</dd>
              <dt>Expected disposal</dt>
              <dd>
                {c.due_at
                  ? new Date(c.due_at).toLocaleDateString("en-IN")
                  : "Set after intake review"}
              </dd>
            </dl>
            {data.folder && (
              <a href={data.folder.drive_url} target="_blank" rel="noreferrer">
                Open shared documents ↗
              </a>
            )}
          </section>
          <section className="ws-card">
            <h2>Case history</h2>
            <div className="ws-timeline">
              {events.map((event) => (
                <article key={event.id} className="formal">
                  <div>
                    <b>{event.kind.replaceAll("_", " ")}</b>
                    <time>{stamp(event.created_at)}</time>
                  </div>
                  <small>
                    {event.actor_name}
                    {event.rating ? " · " + event.rating + "/5" : ""}
                  </small>
                  <p className="ws-pre">{event.body}</p>
                </article>
              ))}
            </div>
            {next && (
              <button
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await history(next);
                  } catch (error) {
                    setError((error as Error).message);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Load older updates
              </button>
            )}
          </section>
        </div>
        <aside>
          <section className="ws-card">
            <h2>Case requests</h2>
            {c.cancellation_state && (
              <p>Cancellation: {c.cancellation_state}</p>
            )}
            {c.institution_escalation && (
              <p>Escalation: {c.institution_escalation}</p>
            )}
            <div className="ws-form-actions">
              {!closed && c.institution_escalation !== "Awaiting review" && (
                <button onClick={() => setAction("escalation")}>
                  Request escalation
                </button>
              )}
              {!closed && c.cancellation_state !== "Awaiting review" && (
                <button onClick={() => setAction("cancellation")}>
                  Request cancellation
                </button>
              )}
              {c.intake === "Returned" && (
                <button onClick={() => setAction("resubmit")}>
                  Revise submission
                </button>
              )}
              {c.status === "Disposed" && (
                <button onClick={() => setAction("review")}>
                  Review outcome
                </button>
              )}
            </div>
            {action && (
              <form onSubmit={submit}>
                <h3>
                  {action === "review"
                    ? "Review outcome"
                    : action === "resubmit"
                      ? "Revise submission"
                      : "Request " + action}
                </h3>
                {action === "review" && (
                  <label>
                    Rating
                    <select name="rating" defaultValue="5">
                      {[5, 4, 3, 2, 1].map((r) => (
                        <option key={r} value={r}>
                          {r} / 5
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <label>
                  {action === "resubmit"
                    ? "Updated complaint details"
                    : action === "review"
                      ? "Your review"
                      : "Reason"}
                  <textarea
                    name={
                      action === "review"
                        ? "body"
                        : action === "resubmit"
                          ? "description"
                          : "reason"
                    }
                    defaultValue={action === "resubmit" ? c.description : ""}
                    key={action}
                    required
                    minLength={action === "resubmit" ? 20 : 5}
                    maxLength={action === "resubmit" ? 5000 : 2000}
                  />
                </label>
                <button className="ws-primary" disabled={busy} aria-busy={busy}>
                  {busy ? "Sending…" : "Send request"}
                </button>
                <button type="button" onClick={() => setAction("")}>
                  Cancel
                </button>
              </form>
            )}
            {error && (
              <p className="ws-error" role="alert">
                {error}
              </p>
            )}
          </section>
        </aside>
      </div>
    </>
  );
}
