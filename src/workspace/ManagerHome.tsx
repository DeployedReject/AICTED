import { useEffect, useState } from "react";
import { api } from "./api";
import type { CaseRecord } from "../../packages/shared/types";
import { bureauName } from "../../packages/shared/catalog";
interface Overview {
  team: {
    id: string;
    name: string;
    designation: string;
    bureau: string;
    active_cases: number;
    overdue: number;
  }[];
  proposals: CaseRecord[];
  approvals: number;
  team_count: number;
  coordination: number;
}
export default function ManagerHome({
  version,
  open,
  review,
  team,
}: {
  version: number;
  open: (id: string) => void;
  review: (view: string) => void;
  team: () => void;
}) {
  const [data, setData] = useState<Overview | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    let current = true;
    api<Overview>("/manager-overview")
      .then((value) => {
        if (current) setData(value);
      })
      .catch((e) => {
        if (current) setError(e.message);
      });
    return () => {
      current = false;
    };
  }, [version]);
  if (error)
    return (
      <p role="alert" className="ws-error">
        {error}
      </p>
    );
  if (!data)
    return (
      <div
        className="ws-skeleton"
        role="status"
        aria-label="Loading team overview"
      >
        <i />
        <i />
        <i />
      </div>
    );
  return (
    <div className="ws-manager-home">
      <section className="ws-manager-priorities">
        <button onClick={() => review("proposed")}>
          <span>Intake approvals</span>
          <strong>{data.approvals}</strong>
          <small>Team submissions awaiting your review</small>
        </button>
        <button onClick={() => review("coordination")}>
          <span>Coordination approvals</span>
          <strong>{data.coordination}</strong>
          <small>Requests awaiting manager or bureau approval</small>
        </button>
        <button onClick={team}>
          <span>Team members</span>
          <strong>{data.team_count}</strong>
          <small>Officials in your reporting tree</small>
        </button>
      </section>
      <div className="ws-admin-grid">
        <section className="ws-card">
          <h2>Awaiting your review</h2>
          <p className="ws-description">
            Proposed cases from your team. Your own submissions go to your
            reporting manager.
          </p>
          {data.proposals.length ? (
            data.proposals.map((c) => (
              <button
                className="ws-review-case"
                key={c.id}
                onClick={() => open(c.id)}
              >
                <span>
                  <b>{c.subject}</b>
                  <small>
                    {c.institution_name} · {c.id}
                  </small>
                </span>
                <span>Review case →</span>
              </button>
            ))
          ) : (
            <p>No team submissions awaiting review.</p>
          )}
        </section>
        <section className="ws-card">
          <h2>Team workload</h2>
          <p className="ws-description">
            Active assignments by official. Overdue means the case due date has
            passed.
          </p>
          {data.team_count > data.team.length && (
            <p className="ws-description">
              Showing the first {data.team.length} of {data.team_count}{" "}
              officials.
            </p>
          )}
          {data.team.length ? (
            <div className="ws-table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Official</th>
                    <th>Active cases</th>
                    <th>Overdue</th>
                  </tr>
                </thead>
                <tbody>
                  {data.team.map((o) => (
                    <tr key={o.id}>
                      <td>
                        {o.name}
                        <small>
                          {o.designation} · {o.id} · {bureauName(o.bureau)}
                        </small>
                      </td>
                      <td>{o.active_cases}</td>
                      <td className={o.overdue ? "ws-error" : ""}>
                        {o.overdue}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p>
              No officials report to you yet. IT can configure reporting lines.
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
