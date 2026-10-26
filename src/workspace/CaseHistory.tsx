import { useState } from "react";
import type { CaseEvent } from "../../packages/shared/types";
import { api } from "./api";
import { bureauName } from "../../packages/shared/catalog";
export default function CaseHistory({
  caseId,
  initial,
  next: initialNext,
}: {
  caseId: string;
  initial: CaseEvent[];
  next?: string | null;
}) {
  const [events, setEvents] = useState(initial),
    [next, setNext] = useState(initialNext),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <>
      {next && (
        <button
          disabled={busy}
          aria-busy={busy}
          onClick={async () => {
            setBusy(true);
            setError("");
            try {
              const page = await api<{
                results: CaseEvent[];
                next: string | null;
              }>(
                "/cases/" +
                  encodeURIComponent(caseId) +
                  "/history?cursor=" +
                  encodeURIComponent(next),
              );
              setEvents((old) => [...old, ...page.results]);
              setNext(page.next);
            } catch (error) {
              setError((error as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? "Loading older updates…" : "Load older updates"}
        </button>
      )}
      {error && (
        <p role="alert" className="ws-error">
          {error}
        </p>
      )}
      <div className="ws-timeline">
        {[...events].reverse().map((event) => (
          <article
            key={event.id}
            className={event.kind === "comment" ? "comment" : "formal"}
          >
            <div>
              <b>
                {event.kind === "comment"
                  ? event.actor_name
                  : event.kind.replaceAll("_", " ")}
              </b>
              <time>{new Date(event.created_at).toLocaleString("en-IN")}</time>
            </div>
            <small>
              {event.actor_name} · {event.designation} ·{" "}
              {bureauName(event.bureau)}
              {event.is_public === 1 ? " · Shared with institution" : ""}
            </small>
            <p className="ws-pre">{event.body}</p>
          </article>
        ))}
      </div>
    </>
  );
}
