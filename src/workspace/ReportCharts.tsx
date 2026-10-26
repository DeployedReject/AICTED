import ReportPanel, { usePlotSize } from "./ReportPanel";
import { useId, useState, type CSSProperties } from "react";
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
  const descriptions: Record<string, string> = {
    "Weekly intake":
      "Cases received each week, including submissions awaiting review.",
    "Case status":
      "Current processing status of approved cases in this report.",
    "Bureau workload": "Active and disposed assignments, grouped by bureau.",
    "Pending ageing":
      "Days since receipt for active approved cases; this measures age, not lateness.",
    "Regional spread":
      "Approved cases grouped by the institution’s AICTE region.",
  };
  return (
    <ReportPanel
      title={title}
      description={descriptions[title]}
      className={className}
    >
      {children}
    </ReportPanel>
  );
}

export default function ReportCharts({ rows }: { rows: Row[] }) {
  const approved = rows.filter((r) => r.intake === "Approved"),
    active = approved.filter((r) => r.status !== "Disposed");
  const [hover, setHover] = useState<number | null>(null),
    [segment, setSegment] = useState<number | null>(null);
  const graphId = useId();
  const plot = usePlotSize(680, 240),
    agePlot = usePlotSize(400, 240);
  const right = plot.width - 20,
    bottom = plot.height - 30,
    plotHeight = plot.height - 56;
  const ageBottom = agePlot.height - 28,
    ageHeight = agePlot.height - 56,
    ageStep = (agePlot.width - 32) / 4;
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
      x: 36 + i * ((right - 36) / 7),
      y: bottom - (w.count / max) * plotHeight,
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
    <>
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
          ref={plot.ref}
          viewBox={`0 0 ${plot.width} ${plot.height}`}
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
                x1="36"
                x2={right}
                y1={bottom - (i * plotHeight) / 4}
                y2={bottom - (i * plotHeight) / 4}
                className="ws-chart-gridline"
              />
              <text
                x="25"
                y={bottom + 4 - (i * plotHeight) / 4}
                textAnchor="end"
              >
                {Math.round((max * i) / 4)}
              </text>
            </g>
          ))}
          <path
            d={line + ` L${right},${bottom} L36,${bottom} Z`}
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
            <g
              key={i}
              className="ws-chart-point"
              style={{ animationDelay: `${i * 140}ms` }}
            >
              <text x={p.x} y={plot.height - 8} textAnchor="middle">
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
                x={p.x - (right - 36) / 14}
                y="14"
                width={(right - 36) / 7}
                height={bottom - 14}
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
                    y1="14"
                    y2={bottom}
                    className="ws-chart-guide"
                  />
                  <rect
                    x={Math.min(right - 48, Math.max(36, p.x - 24))}
                    y={Math.max(10, p.y - 35)}
                    width="48"
                    height="25"
                    fill="var(--blue)"
                    rx="2"
                  />
                  <text
                    x={Math.min(right - 48, Math.max(36, p.x - 24)) + 24}
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
      <Panel title="Case status" className="ws-status-tile">
        <div className="ws-donut-wrap">
          <svg
            viewBox="18 18 184 184"
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
                    style={
                      {
                        "--arc-length": Math.max(0, a.length - 1),
                        "--arc-gap": 100 - Math.max(0, a.length - 1),
                        animationDuration: `${a.length * 12}ms`,
                        animationDelay: `${a.offset * 12}ms`,
                      } as CSSProperties
                    }
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
          ref={agePlot.ref}
          viewBox={`0 0 ${agePlot.width} ${agePlot.height}`}
          className="ws-age-chart"
          role="img"
          aria-label="Age of active cases in days"
        >
          <line
            x1="24"
            x2={agePlot.width - 8}
            y1={ageBottom}
            y2={ageBottom}
            className="ws-chart-gridline"
          />
          {ages.map((a, i) => {
            const height = (a.count / maxAge) * ageHeight;
            return (
              <g key={a.label}>
                <rect
                  x={16 + i * ageStep + ageStep * 0.2}
                  y={ageBottom - height}
                  width={ageStep * 0.6}
                  height={height}
                  fill={i > 1 ? colours[1] : colours[0]}
                  className="ws-age-bar"
                  style={{ animationDelay: i * 100 + "ms" }}
                >
                  <title>
                    {a.label} days: {a.count}
                  </title>
                </rect>
                <text
                  x={16 + (i + 0.5) * ageStep}
                  y={ageBottom - 8 - height}
                  textAnchor="middle"
                  className="ws-age-value"
                >
                  {a.count}
                </text>
                <text
                  x={16 + (i + 0.5) * ageStep}
                  y={agePlot.height - 7}
                  textAnchor="middle"
                >
                  {a.label}
                </text>
              </g>
            );
          })}
        </svg>
        <span className="ws-chart-caption">Days</span>
      </Panel>
      <Panel title="Regional spread" className="ws-regions-tile">
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
    </>
  );
}
