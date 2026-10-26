import { useEffect, useState } from "react";
import { api } from "./api";
import type { ReactNode } from "react";
import type { CaseRecord } from "../../packages/shared/types";
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
  tab,
  onTab,
  children,
}: {
  version: number;
  open: (id: string) => void;
  review: (view: string) => void;
  team: () => void;
  tab: string;
  onTab: (tab: string) => void;
  children?: ReactNode;
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
      <div className="ws-tabs" role="tablist" aria-label="Manager work views">
        {[
          ["overview", "Overview"],
          ["approvals", "Approvals"],
          ["team", "Team workload"],
          ["assigned", "My cases"],
        ].map(([key, label]) => (
          <button
            key={key}
            role="tab"
            aria-selected={tab === key}
            className={tab === key ? "active" : ""}
            onClick={() => onTab(key)}
          >
            {label}
          </button>
        ))}
      </div>
      {tab !== "overview" ? (
        <section role="tabpanel">{children}</section>
      ) : (
        <>
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
          <div className="ws-manager-review">
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
          </div>
        </>
      )}
    </div>
  );
}
