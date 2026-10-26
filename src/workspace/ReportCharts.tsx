import { useId, useState } from "react";
import { bureauName } from "../../packages/shared/catalog";
interface Row {
  bureau: string;
  region: string;
  status: string;
  intake: string;
  received_at: string;
  due_at: string;
  updated_at: string;
}
const colours = ["#2b6cbe", "#e76b30", "#879aa9", "#82977e"];
const format = (n: number) => String(n).padStart(2, "0");
function Panel({
  title,
  children,
  className = "",
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={"ws-chart " + className}>
      <header>
        <h2>{title}</h2>
        <p>
          {
            (
              {
                "Weekly intake":
                  "Cases received each week, including submissions awaiting review.",
                "Case status":
                  "Current processing status of approved cases in this report.",
                "Bureau workload": "Active and disposed assignments, grouped by bureau.",
                "Pending ageing":
                  "Days since receipt for active approved cases. This measures age, not lateness.",
                "Regional spread":
                  "Approved cases grouped by the institution’s AICTE region.",
              } as Record<string, string>
            )[title]
          }
        </p>
      </header>
      {children}
    </section>
  );
}
export default function ReportCharts({ rows }: { rows: Row[] }) {
  const approved = rows.filter((r) => r.intake === "Approved"),
    active = approved.filter((r) => r.status !== "Disposed");
  const [hover, setHover] = useState<number | null>(null),
    [segment, setSegment] = useState<number | null>(null);
  const graphId = useId();
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  today.setUTCDate(today.getUTCDate() - ((today.getUTCDay() + 6) % 7));
  const weeks = Array.from({ length: 8 }, (_, i) => {
    const start = new Date(today.getTime() - (7 - i) * 7 * 86400000),
      end = new Date(start.getTime() + 7 * 86400000);
    return {
      label: start.toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        timeZone: "UTC",
      }),
      count: rows.filter(
        (r) =>
          Date.parse(r.received_at) >= +start &&
          Date.parse(r.received_at) < +end,
      ).length,
    };
  });
  const max = Math.max(4, ...weeks.map((w) => w.count)),
    points = weeks.map((w, i) => ({
      x: 48 + i * (590 / 7),
      y: 218 - (w.count / max) * 170,
      ...w,
    }));
  const line = points
    .map((p, i) => (i ? "L" : "M") + p.x + "," + p.y)
    .join(" ");
  const statuses = [
    "Pending",
    "Under process",
    "Awaiting information",
    "Disposed",
  ].map((label, i) => ({
    label,
    count: approved.filter((r) => r.status === label).length,
    colour: colours[i],
  }));
  const total = approved.length;
  let offset = 0;
  const arcs = statuses.map((s) => {
    const length = total ? (s.count / total) * 100 : 0;
    const arc = { ...s, length, offset };
    offset += length;
    return arc;
  });
  const bureaus = [...new Set(approved.map((r) => r.bureau))]
    .map((name) => ({
      name,
      active: active.filter((r) => r.bureau === name).length,
      disposed: approved.filter(
        (r) => r.bureau === name && r.status === "Disposed",
      ).length,
    }))
    .sort((a, b) => b.active + b.disposed - (a.active + a.disposed));
  const maxBureau = Math.max(1, ...bureaus.map((b) => b.active + b.disposed));
  const ages = [
    [0, 7],
    [8, 30],
    [31, 90],
    [91, Infinity],
  ].map(([lo, hi]) => ({
    label: hi === Infinity ? "91+" : `${lo}–${hi}`,
    count: active.filter((r) => {
      const age = Math.max(
        0,
        Math.floor((Date.now() - Date.parse(r.received_at)) / 86400000),
      );
      return age >= lo && age <= hi;
    }).length,
  }));
  const maxAge = Math.max(1, ...ages.map((a) => a.count));
  const regions = [...new Set(approved.map((r) => r.region))]
    .map((name) => ({
      name,
      count: approved.filter((r) => r.region === name).length,
    }))
    .sort((a, b) => b.count - a.count);
  return (
    <div className="ws-chart-grid">
      <Panel title="Weekly intake" className="ws-chart-wide">
        <div className="ws-chart-summary">
          <strong>
            {hover === null
              ? weeks.reduce((sum, w) => sum + w.count, 0)
              : weeks[hover].count}
          </strong>
          <span>{hover === null ? "Records" : weeks[hover].label}</span>
          <span className="ws-chart-period">8 weeks</span>
        </div>
        <svg
          className="ws-line-chart"
          viewBox="0 0 680 270"
          role="img"
          aria-label="Cases received each week over the last eight weeks"
        >
          <defs>
            <pattern
              id={graphId}
              width="7"
              height="7"
              patternUnits="userSpaceOnUse"
            >
              <circle cx="1" cy="1" r=".7" fill="currentColor" opacity=".2" />
            </pattern>
          </defs>
          {[0, 1, 2, 3, 4].map((i) => (
            <g key={i}>
              <line
                x1="48"
                x2="638"
                y1={218 - i * 42.5}
                y2={218 - i * 42.5}
                className="ws-chart-gridline"
              />
              <text x="30" y={222 - i * 42.5} textAnchor="end">
                {Math.round((max * i) / 4)}
              </text>
            </g>
          ))}
          <path
            d={line + " L638,218 L48,218 Z"}
            fill={`url(#${graphId})`}
            className="ws-chart-area"
          />
          <path
            d={line}
            fill="none"
            stroke="var(--blue)"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            pathLength="1"
            className="ws-chart-line"
          />
          {points.map((p, i) => (
            <g key={i}>
              <text x={p.x} y="248" textAnchor="middle">
                {p.label}
              </text>
              <circle
                cx={p.x}
                cy={p.y}
                r={hover === i ? 6 : 3.5}
                fill="var(--input)"
                stroke="var(--blue)"
                strokeWidth="2"
              />
              <rect
                x={p.x - 35}
                y="38"
                width="70"
                height="185"
                fill="transparent"
                tabIndex={0}
                aria-label={`${p.label}: ${p.count} received`}
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
                onFocus={() => setHover(i)}
                onBlur={() => setHover(null)}
              >
                <title>
                  {p.label}: {p.count}
                </title>
              </rect>
              {hover === i && (
                <g pointerEvents="none">
                  <line
                    x1={p.x}
                    x2={p.x}
                    y1="40"
                    y2="218"
                    className="ws-chart-guide"
                  />
                  <rect
                    x={Math.min(600, Math.max(48, p.x - 24))}
                    y={Math.max(10, p.y - 35)}
                    width="48"
                    height="25"
                    fill="var(--blue)"
                    rx="2"
                  />
                  <text
                    x={Math.min(600, Math.max(48, p.x - 24)) + 24}
                    y={Math.max(10, p.y - 35) + 17}
                    textAnchor="middle"
                    className="ws-chart-tooltip"
                  >
                    {p.count}
                  </text>
                </g>
              )}
            </g>
          ))}
        </svg>
      </Panel>
      <Panel title="Case status">
        <div className="ws-donut-wrap">
          <svg
            viewBox="0 0 220 220"
            role="img"
            aria-label="Case status distribution"
          >
            <circle
              cx="110"
              cy="110"
              r="80"
              fill="none"
              stroke="var(--subtle)"
              strokeWidth="18"
            />
            {arcs
              .filter((a) => a.count > 0)
              .map((a) => {
                const i = statuses.findIndex((s) => s.label === a.label);
                return (
                  <circle
                    key={a.label}
                    cx="110"
                    cy="110"
                    r="80"
                    fill="none"
                    stroke={a.colour}
                    strokeWidth={segment === i ? 23 : 18}
                    pathLength="100"
                    strokeDasharray={`${Math.max(0, a.length - 1)} ${100 - Math.max(0, a.length - 1)}`}
                    strokeDashoffset={-a.offset}
                    transform="rotate(-90 110 110)"
                    className="ws-donut-arc"
                    tabIndex={0}
                    onMouseEnter={() => setSegment(i)}
                    onMouseLeave={() => setSegment(null)}
                    onFocus={() => setSegment(i)}
                    onBlur={() => setSegment(null)}
                    aria-label={`${a.label}: ${a.count}`}
                  >
                    <title>
                      {a.label}: {a.count}
                    </title>
                  </circle>
                );
              })}
            <text
              x="110"
              y="111"
              textAnchor="middle"
              className="ws-donut-count"
            >
              {segment === null ? total : statuses[segment].count}
            </text>
            <text x="110" y="134" textAnchor="middle">
              {segment === null
                ? "Cases"
                : statuses[segment].label === "Awaiting information"
                  ? "Awaiting"
                  : statuses[segment].label === "Under process"
                    ? "Processing"
                    : statuses[segment].label}
            </text>
          </svg>
        </div>
        <div className="ws-chart-legend">
          {statuses.map((s, i) => (
            <button
              key={s.label}
              onMouseEnter={() => setSegment(i)}
              onMouseLeave={() => setSegment(null)}
              onFocus={() => setSegment(i)}
              onBlur={() => setSegment(null)}
            >
              <i style={{ background: s.colour }} />
              <span>
                {s.label === "Awaiting information"
                  ? "Awaiting"
                  : s.label === "Under process"
                    ? "Processing"
                    : s.label}
              </span>
              <b>{format(s.count)}</b>
            </button>
          ))}
        </div>
      </Panel>
      <Panel title="Bureau workload">
        <div className="ws-bar-legend">
          <span>
            <i style={{ background: colours[0] }} />
            Active
          </span>
          <span>
            <i style={{ background: colours[1] }} />
            Disposed
          </span>
        </div>
        <div className="ws-bureau-bars">
          {bureaus.length ? (
            bureaus.map((b, i) => (
              <div key={bureauName(b.name)}>
                <div>
                  <span>{bureauName(b.name)}</span>
                  <b>{b.active + b.disposed}</b>
                </div>
                <div
                  className="ws-stacked-bar"
                  aria-label={`${bureauName(b.name)}: ${b.active} active, ${b.disposed} disposed`}
                >
                  <span
                    style={{
                      width: (b.active / maxBureau) * 100 + "%",
                      background: colours[0],
                      animationDelay: i * 100 + "ms",
                    }}
                    title={`${b.active} active`}
                  />
                  <span
                    style={{
                      width: (b.disposed / maxBureau) * 100 + "%",
                      background: colours[1],
                      animationDelay: i * 100 + 80 + "ms",
                    }}
                    title={`${b.disposed} disposed`}
                  />
                </div>
                <small>
                  {b.active} active · {b.disposed} disposed
                </small>
              </div>
            ))
          ) : (
            <div className="ws-empty">No cases</div>
          )}
        </div>
      </Panel>
      <Panel title="Pending ageing">
        <svg
          viewBox="0 0 400 240"
          className="ws-age-chart"
          role="img"
          aria-label="Age of active cases in days"
        >
          <line
            x1="24"
            x2="380"
            y1="190"
            y2="190"
            className="ws-chart-gridline"
          />
          {ages.map((a, i) => {
            const height = (a.count / maxAge) * 135;
            return (
              <g key={a.label}>
                <rect
                  x={45 + i * 90}
                  y={190 - height}
                  width="45"
                  height={height || 2}
                  fill={i > 1 ? colours[1] : colours[0]}
                  className="ws-age-bar"
                  style={{ animationDelay: i * 100 + "ms" }}
                >
                  <title>
                    {a.label} days: {a.count}
                  </title>
                </rect>
                <text
                  x={67.5 + i * 90}
                  y={175 - height}
                  textAnchor="middle"
                  className="ws-age-value"
                >
                  {a.count}
                </text>
                <text x={67.5 + i * 90} y="215" textAnchor="middle">
                  {a.label}
                </text>
              </g>
            );
          })}
        </svg>
        <span className="ws-chart-caption">Days</span>
      </Panel>
      <Panel title="Regional spread" className="ws-chart-full">
        <div className="ws-region-list">
          {regions.length ? (
            regions.map((r, i) => (
              <div key={r.name}>
                <span>{r.name}</span>
                <div>
                  <i
                    style={{
                      width: (r.count / Math.max(1, total)) * 100 + "%",
                      animationDelay: i * 80 + "ms",
                    }}
                  />
                </div>
                <b>{r.count}</b>
              </div>
            ))
          ) : (
            <div className="ws-empty">No cases</div>
          )}
        </div>
      </Panel>
    </div>
  );
}
