import Select from "../Select";
import { useEffect, useState } from "react";
import type { Bootstrap, CaseRecord } from "../../packages/shared/types";
import OfficialPicker from "./OfficialPicker";
import { api } from "./api";
import { bureauName } from "../../packages/shared/catalog";
interface Request {
  id: string;
  case_id: string;
  requester_id: string;
  target_id: string;
  target_name: string;
  requester_name: string;
  source_bureau: string;
  target_bureau: string;
  reason: string;
  status: string;
  created_at: string;
}
export function CaseHandoff({
  record,
  boot,
  refresh,
}: {
  record: CaseRecord;
  boot: Bootstrap;
  refresh: () => void;
}) {
  const [requests, setRequests] = useState<Request[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    api<{ requests: Request[] }>(
      "/cases/" + encodeURIComponent(record.id) + "/handoff",
    )
      .then((result) => setRequests(result.requests))
      .catch((error) => setError(error.message));
  }, [record.id]);
  return (
    <section className="ws-card">
      <h2>Transfer to another bureau</h2>
      <p className="ws-description">
        The receiving manager must accept the handoff before ownership changes.
        Coordination shares access without transferring ownership.
      </p>
      {requests.map((request) => (
        <p key={request.id}>
          {bureauName(request.target_bureau)} · {request.target_name} ·{" "}
          {request.status}
        </p>
      ))}
      {!requests.some(
        (request) => request.status === "Awaiting receiving manager",
      ) && (
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            setBusy(true);
            setError("");
            try {
              await api(
                "/cases/" + encodeURIComponent(record.id) + "/handoff",
                Object.fromEntries(new FormData(event.currentTarget)),
              );
              refresh();
            } catch (error) {
              setError((error as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <OfficialPicker
            name="official_id"
            label="Receiving official"
            officials={boot.officials}
            excludeBureau={record.bureau}
            required
          />
          <label>
            Handoff reason
            <textarea name="reason" required minLength={5} maxLength={1000} />
          </label>
          <button className="ws-primary" disabled={busy} aria-busy={busy}>
            {busy ? "Requesting handoff…" : "Request handoff"}
          </button>
        </form>
      )}
      {error && (
        <p role="alert" className="ws-error">
          {error}
        </p>
      )}
    </section>
  );
}
export default function Handoffs({
  boot,
  version,
  open,
}: {
  boot: Bootstrap;
  version: number;
  open: (id: string) => void;
}) {
  const [data, setData] = useState<{
      requests: Request[];
      next: string | null;
    } | null>(null),
    [cursor, setCursor] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [revision, setRevision] = useState(0);
  useEffect(() => {
    let current = true;
    setData(null);
    api<{ requests: Request[]; next: string | null }>(
      "/handoffs?cursor=" + encodeURIComponent(cursor),
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
  }, [version, revision, cursor]);
  return (
    <>
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
      <div className="ws-overlap-list">
        {data?.requests.map((request) => (
          <section className="ws-card" key={request.id}>
            <h2>{request.case_id}</h2>
            <p>
              {bureauName(request.source_bureau)} →{" "}
              {bureauName(request.target_bureau)}
            </p>
            <p>Receiving official: {request.target_name}</p>
            <span className="ws-badge">{request.status}</span>
            <p className="ws-pre">{request.reason}</p>
            <small>
              {new Date(request.created_at).toLocaleString("en-IN")}
            </small>
            {request.status === "Approved" && (
              <button onClick={() => open(request.case_id)}>
                Open transferred case
              </button>
            )}
            {request.status === "Awaiting receiving manager" && (
              <form
                onSubmit={async (event) => {
                  event.preventDefault();
                  setBusy(true);
                  setError("");
                  try {
                    await api(
                      "/handoffs/" + encodeURIComponent(request.id),
                      Object.fromEntries(new FormData(event.currentTarget)),
                    );
                    setRevision((v) => v + 1);
                  } catch (error) {
                    setError((error as Error).message);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                <label>
                  Decision
                  <Select name="decision">
                    {request.target_bureau === boot.user.bureau ? (
                      <>
                        <option>Approved</option>
                        <option>Rejected</option>
                      </>
                    ) : (
                      <option>Cancelled</option>
                    )}
                  </Select>
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
                <button disabled={busy} className="ws-primary">
                  Save decision
                </button>
              </form>
            )}
          </section>
        ))}
      </div>
      {data && !data.requests.length && <p>No handoff requests.</p>}
      <div className="ws-pagination">
        {cursor && <button onClick={() => setCursor("")}>First page</button>}
        {data?.next && (
          <button onClick={() => setCursor(data.next!)}>Next requests</button>
        )}
      </div>
    </>
  );
}
