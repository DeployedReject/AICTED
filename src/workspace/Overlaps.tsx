import { useEffect, useState } from "react";
import { api } from "./api";
import { bureauName } from "../../packages/shared/catalog";
interface Match {
  case_id: string;
  subject: string;
  institution_name: string;
  permanent_id: string;
  bureau: string;
  other_bureau: string;
  other_cases: number;
  matching_categories: number;
}
export default function Overlaps({
  version,
  open,
}: {
  version: number;
  open: (id: string) => void;
}) {
  const [data, setData] = useState<Match[] | null>(null),
    [error, setError] = useState(""),
    [cursor, setCursor] = useState(""),
    [next, setNext] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    Promise.all([
      api<{ overlaps: Match[]; next: string | null }>(
        "/overlaps?cursor=" + encodeURIComponent(cursor),
      ),
      new Promise((resolve) =>
        setTimeout(
          resolve,
          matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 1000,
        ),
      ),
    ])
      .then(([r]) => {
        if (active) {
          setData(r.overlaps);
          setNext(r.next);
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [version, cursor]);
  if (error)
    return (
      <p role="alert" className="ws-error">
        {error}
      </p>
    );
  if (!data)
    return (
      <div className="ws-skeleton" role="status" aria-label="Loading">
        <i />
        <i />
        <i />
      </div>
    );
  return (
    <>
      <div className="ws-overlap-intro">
        <b>Potential bureau overlaps</b>
        <span>
          Cases at the same institution in different bureaus. Open your case to
          request coordination.
        </span>
      </div>
      {data.length ? (
        <div className="ws-overlap-list">
          {data.map((m) => (
            <article className="ws-card" key={m.case_id + m.other_bureau}>
              <div>
                <span className="ws-badge">
                  {m.matching_categories
                    ? "Institution + category"
                    : "Institution"}
                </span>
                <h2>{m.institution_name}</h2>
                <small>{m.permanent_id}</small>
              </div>
              <div className="ws-bureau-pair">
                <span>{bureauName(m.bureau)}</span>
                <i aria-hidden="true">↔</i>
                <span>{bureauName(m.other_bureau)}</span>
              </div>
              <p>{m.subject}</p>
              <small>
                {m.other_cases} active {m.other_cases === 1 ? "case" : "cases"}{" "}
                in {bureauName(m.other_bureau)}. Details require approved
                access.
              </small>
              <button onClick={() => open(m.case_id)}>Review case</button>
            </article>
          ))}
        </div>
      ) : (
        <div className="ws-empty">No active cross-Bureau overlaps.</div>
      )}
      {(cursor || next) && (
        <div className="ws-pagination">
          {cursor && <button onClick={() => setCursor("")}>First page</button>}
          {next && <button onClick={() => setCursor(next)}>Next page</button>}
        </div>
      )}
    </>
  );
}
