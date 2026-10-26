import { useEffect, useState } from "react";
import { api } from "./api";
export interface TagSelection {
  kind: string;
  id: string;
  label: string;
  count: number;
}
interface Result {
  cases: { id: string; subject: string; status: string; intake: string }[];
  next: string | null;
}
export default function TagCases({
  selection,
  back,
}: {
  selection: TagSelection;
  back: () => void;
}) {
  const [cursor, setCursor] = useState(""),
    [data, setData] = useState<Result | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    let current = true;
    setData(null);
    setError("");
    if (!selection.count) {
      setData({ cases: [], next: null });
      return;
    }
    api<Result>(
      "/admin/tag-cases?" +
        new URLSearchParams({ kind: selection.kind, id: selection.id, cursor }),
    )
      .then((result) => {
        if (current) setData(result);
      })
      .catch((error) => {
        if (current) setError(error.message);
      });
    return () => {
      current = false;
    };
  }, [selection.kind, selection.id, selection.count, cursor]);
  return (
    <div>
      <button type="button" onClick={back}>
        ← All tag counts
      </button>
      <h3>{selection.label}</h3>
      {error && (
        <p role="alert" className="ws-error">
          {error}
        </p>
      )}
      {!data && !error && <p role="status">Loading cases…</p>}
      {data && (
        <>
          <div className="ws-tag-cases">
            {data.cases.map((record) => (
              <article key={record.id}>
                <b>{record.id}</b>
                <span>{record.subject}</span>
                <small>
                  {record.intake === "Approved" ? record.status : record.intake}
                </small>
              </article>
            ))}
          </div>
          {!data.cases.length && <p>No cases with this tag.</p>}
          <div className="ws-form-actions">
            {cursor && (
              <button type="button" onClick={() => setCursor("")}>
                First page
              </button>
            )}
            {data.next && (
              <button type="button" onClick={() => setCursor(data.next!)}>
                Next 20 cases
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
