import { useEffect, useState } from "react";
import { api } from "./api";
interface Notice {
  id: string;
  case_id: string | null;
  kind: string;
  body: string;
  created_at: string;
  read_at: string | null;
}
export default function CaseNotices({
  version,
  open,
  refresh,
}: {
  version: number;
  open: (id: string) => void;
  refresh: () => void;
}) {
  const [data, setData] = useState<{
      notices: Notice[];
      next: string | null;
    } | null>(null),
    [cursor, setCursor] = useState(""),
    [error, setError] = useState("");
  useEffect(() => {
    let current = true;
    api<{ notices: Notice[]; next: string | null }>(
      "/notices?cursor=" + encodeURIComponent(cursor),
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
  }, [version, cursor]);
  return (
    <section className="ws-card">
      <h2>Case notices</h2>
      {error && (
        <p role="alert" className="ws-error">
          {error}
        </p>
      )}
      {!data && !error && (
        <div className="ws-skeleton">
          <i />
          <i />
        </div>
      )}
      {data?.notices.map((notice) => (
        <article className="ws-message" key={notice.id}>
          <div>
            <b>
              {notice.kind.replaceAll("_", " ")}
              {!notice.read_at ? " · New" : ""}
            </b>
            <time>{new Date(notice.created_at).toLocaleString("en-IN")}</time>
          </div>
          <p>{notice.body}</p>
          {notice.case_id ? (
            <button
              onClick={async () => {
                try {
                  await api("/notices", { id: notice.id });
                  refresh();
                  open(notice.case_id!);
                } catch (error) {
                  setError((error as Error).message);
                }
              }}
            >
              Open case {notice.case_id}
            </button>
          ) : (
            !notice.read_at && (
              <button
                onClick={async () => {
                  await api("/notices", { id: notice.id });
                  refresh();
                }}
              >
                Mark as read
              </button>
            )
          )}
        </article>
      ))}
      {data && !data.notices.length && <p>No case notices.</p>}
      <div className="ws-pagination">
        {cursor && <button onClick={() => setCursor("")}>First page</button>}
        {data?.next && (
          <button onClick={() => setCursor(data.next!)}>Older notices</button>
        )}
      </div>
    </section>
  );
}
